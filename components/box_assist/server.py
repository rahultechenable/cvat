# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

"""
Box Assist inference service.

Finds model files in the models directory and in any extra scan directories (for example, the
whole home directory of the host, mounted read-only), checks which of them can produce boxes,
and runs them on frames sent by CVAT. Nothing is stored except a cache of the scan results.

    GET  /health
    GET  /models[?refresh=true]      -> {"scanning": bool, "models": [{"id", "name", "path", "task",
                                         "labels", "usable", "reason"}]}
    POST /models/{model_id}/predict  {"image": <base64>, "conf": 0.05, "iou": 0.5, "max_det": 300}
                                     -> {"detections": [{"label", "confidence", "box": [x1, y1, x2, y2]}]}
"""

import ast
import base64
import gc
import hashlib
import io
import json
import logging
import os
import threading
import time
from collections import OrderedDict
from pathlib import Path

from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel, Field

MODELS_DIR = Path(os.getenv("BOX_ASSIST_MODELS_DIR", Path(__file__).parent / "models"))
# extra directories to search recursively, separated by ":"
SCAN_DIRS = [Path(p) for p in os.getenv("BOX_ASSIST_SCAN_DIRS", "").split(":") if p]
# where the host filesystem is mounted in the container, so paths can be shown as host paths
HOST_ROOT = os.getenv("BOX_ASSIST_HOST_ROOT", "")
CACHE_FILE = Path(os.getenv("BOX_ASSIST_CACHE_FILE", Path.home() / ".cache" / "box_assist.json"))
DEVICE = os.getenv("BOX_ASSIST_DEVICE")  # e.g. "cpu", "mps", "0"; autodetected when unset
MAX_LOADED_MODELS = int(os.getenv("BOX_ASSIST_MAX_LOADED_MODELS", 2))
RESCAN_INTERVAL = int(os.getenv("BOX_ASSIST_RESCAN_INTERVAL", 600))

MODEL_EXTENSIONS = {".pt", ".pth", ".onnx", ".engine", ".torchscript"}
MIN_MODEL_SIZE = 100 * 1024  # smaller files are test fixtures, not models
MAX_FILES = 3000
# directories that only hold dependencies or caches of other programs
SKIP_DIRS = {
    "venv",
    ".venv",
    "site-packages",
    "dist-packages",
    "node_modules",
    "__pycache__",
    ".git",
    ".cache",
    ".vscode",
    ".vscode-server",
    ".npm",
    ".local",
    "proc",
    "sys",
}
BOX_TASKS = {"detect", "segment", "pose"}

logger = logging.getLogger("box_assist")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="CVAT Box Assist")


def _display_path(path: Path) -> str:
    text = str(path)
    if HOST_ROOT and text.startswith(HOST_ROOT.rstrip("/") + "/"):
        return text[len(HOST_ROOT.rstrip("/")) :]
    return text


def _model_id(path: Path) -> str:
    return hashlib.sha1(str(path).encode()).hexdigest()[:16]


def _discover() -> list[Path]:
    found: list[Path] = []
    seen: set[tuple[int, int]] = set()  # (device, inode): the same file may be mounted twice

    def add(path: Path):
        try:
            stat = path.stat()
        except OSError:
            return
        key = (stat.st_dev, stat.st_ino)
        if stat.st_size >= MIN_MODEL_SIZE and key not in seen:
            seen.add(key)
            found.append(path)

    for root in [MODELS_DIR, *SCAN_DIRS]:
        if not root.is_dir():
            continue
        for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for filename in filenames:
                if Path(filename).suffix.lower() in MODEL_EXTENSIONS:
                    add(Path(dirpath) / filename)
                    if len(found) >= MAX_FILES:
                        logger.warning("Stopped scanning after %d model files", MAX_FILES)
                        return found
    return found


def _unusable(reason: str, task: str = "") -> dict:
    return {"usable": False, "reason": reason, "task": task, "labels": []}


def _probe_onnx(path: Path) -> dict:
    import onnx

    # only the graph metadata is needed; external weight files are not loaded
    model = onnx.load(str(path), load_external_data=False)
    metadata = {prop.key: prop.value for prop in model.metadata_props}
    del model
    if "names" not in metadata:
        return _unusable("ONNX model without YOLO metadata (not exported by Ultralytics)")

    names = ast.literal_eval(metadata["names"])
    task = metadata.get("task", "detect")
    if task not in BOX_TASKS:
        return _unusable(f"A {task} model, it does not produce boxes", task)
    return {"usable": True, "reason": "", "task": task, "labels": [str(n) for n in names.values()]}


def _probe_pt(path: Path) -> dict:
    from ultralytics import YOLO

    try:
        model = YOLO(str(path))
    except Exception as ex:  # pylint: disable=broad-except
        logger.info("Not an Ultralytics model: %s (%s)", path, ex)
        return _unusable("Not a YOLO model (Ultralytics could not load it)")

    task = model.task
    names = [str(name) for _, name in sorted(model.names.items())]
    del model
    if task not in BOX_TASKS:
        return _unusable(f"A {task} model, it does not produce boxes", task)
    return {"usable": True, "reason": "", "task": task, "labels": names}


def _probe(path: Path) -> dict:
    suffix = path.suffix.lower()
    if suffix == ".pth":
        return _unusable("PyTorch weights without the model code (not a YOLO model)")
    if suffix == ".engine":
        return _unusable("TensorRT engine; use the .pt or .onnx version of this model")
    if suffix == ".torchscript":
        return _unusable("TorchScript models are not supported; use the .pt or .onnx version")

    try:
        return _probe_onnx(path) if suffix == ".onnx" else _probe_pt(path)
    except Exception as ex:  # pylint: disable=broad-except
        logger.warning("Could not read %s: %s", path, ex)
        return _unusable(f"Could not read the model: {ex}")


class ModelRegistry:
    def __init__(self):
        self._lock = threading.Lock()
        self._models: dict[str, dict] = {}
        self._scan_thread: threading.Thread | None = None
        self._probe_cache: dict[str, dict] = self._load_cache()

    @staticmethod
    def _load_cache() -> dict[str, dict]:
        try:
            return json.loads(CACHE_FILE.read_text())
        except (OSError, ValueError):
            return {}

    def _save_cache(self):
        try:
            CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            CACHE_FILE.write_text(json.dumps(self._probe_cache))
        except OSError as ex:
            logger.warning("Could not save the scan cache: %s", ex)

    @property
    def scanning(self) -> bool:
        return bool(self._scan_thread and self._scan_thread.is_alive())

    def start_scan(self):
        with self._lock:
            if self.scanning:
                return
            self._scan_thread = threading.Thread(target=self._scan, daemon=True)
            self._scan_thread.start()

    def _scan(self):
        started = time.monotonic()
        paths = _discover()
        logger.info("Found %d model files, checking them", len(paths))

        models: dict[str, dict] = {}
        live_cache_keys: set[str] = set()
        for path in paths:
            try:
                stat = path.stat()
            except OSError:
                continue

            cache_key = f"{path}:{stat.st_size}:{int(stat.st_mtime)}"
            live_cache_keys.add(cache_key)
            info = self._probe_cache.get(cache_key)
            if info is None:
                info = _probe(path)
                self._probe_cache[cache_key] = info
                gc.collect()

            model_id = _model_id(path)
            models[model_id] = {
                "id": model_id,
                "name": path.name,
                "path": _display_path(path),
                "file": str(path),
                **info,
            }
            # publish results as they come, so the list fills up while the scan runs
            with self._lock:
                self._models = {**self._models, model_id: models[model_id]}

        with self._lock:
            self._models = models
        # forget files that are gone or changed
        self._probe_cache = {k: v for k, v in self._probe_cache.items() if k in live_cache_keys}
        self._save_cache()
        logger.info(
            "Scan finished in %.1fs: %d models, %d usable",
            time.monotonic() - started,
            len(models),
            sum(m["usable"] for m in models.values()),
        )

    def list(self) -> list[dict]:
        with self._lock:
            models = list(self._models.values())
        return sorted(models, key=lambda m: (not m["usable"], m["path"].lower()))

    def get(self, model_id: str) -> dict:
        with self._lock:
            model = self._models.get(model_id)
        if not model or not Path(model["file"]).exists():
            raise HTTPException(status_code=404, detail="Model not found, reload the model list")
        return model


registry = ModelRegistry()


class LoadedModels:
    """Keeps the most recently used models in memory (on the GPU when there is one)"""

    def __init__(self):
        self._lock = threading.Lock()
        self._models: OrderedDict[str, tuple[float, object, threading.Lock]] = OrderedDict()

    def get(self, info: dict):
        from ultralytics import YOLO

        path = Path(info["file"])
        mtime = path.stat().st_mtime
        with self._lock:
            cached = self._models.get(info["id"])
            if cached and cached[0] == mtime:
                self._models.move_to_end(info["id"])
                return cached[1], cached[2]

            logger.info("Loading model %s", info["path"])
            kwargs = {"task": info["task"]} if path.suffix.lower() == ".onnx" else {}
            model = YOLO(str(path), **kwargs)
            self._models[info["id"]] = (mtime, model, threading.Lock())
            while len(self._models) > MAX_LOADED_MODELS:
                self._models.popitem(last=False)
                gc.collect()
            return model, self._models[info["id"]][2]


loaded_models = LoadedModels()


def _rescan_periodically():
    while True:
        time.sleep(RESCAN_INTERVAL)
        registry.start_scan()


@app.on_event("startup")
def on_startup():
    registry.start_scan()
    threading.Thread(target=_rescan_periodically, daemon=True).start()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "models_dir": str(MODELS_DIR),
        "scan_dirs": [str(p) for p in SCAN_DIRS],
        "device": DEVICE or "auto",
        "scanning": registry.scanning,
    }


@app.get("/models")
def list_models(refresh: bool = False):
    if refresh:
        registry.start_scan()
    models = [{k: v for k, v in m.items() if k != "file"} for m in registry.list()]
    return {"scanning": registry.scanning, "models": models}


class PredictRequest(BaseModel):
    image: str = Field(description="Base64-encoded image file (JPEG, PNG, ...)")
    conf: float = Field(0.05, ge=0, le=1)
    iou: float = Field(0.5, ge=0, le=1)
    max_det: int = Field(300, ge=1, le=3000)


@app.post("/models/{model_id}/predict")
def predict(model_id: str, request: PredictRequest):
    info = registry.get(model_id)
    if not info["usable"]:
        raise HTTPException(status_code=400, detail=f"{info['name']}: {info['reason']}")

    try:
        image = Image.open(io.BytesIO(base64.b64decode(request.image))).convert("RGB")
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Invalid image: {ex}") from ex

    try:
        model, model_lock = loaded_models.get(info)
    except Exception as ex:
        logger.exception("Failed to load model %s", info["path"])
        raise HTTPException(status_code=500, detail=f"Could not load {info['name']}: {ex}") from ex

    kwargs = {"conf": request.conf, "iou": request.iou, "max_det": request.max_det}
    if DEVICE:
        kwargs["device"] = DEVICE

    # Ultralytics models are not safe to call from several threads at once
    with model_lock:
        results = model.predict(image, verbose=False, **kwargs)

    detections = []
    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue
        for xyxy, conf, cls in zip(boxes.xyxy.tolist(), boxes.conf.tolist(), boxes.cls.tolist()):
            detections.append(
                {
                    "label": result.names[int(cls)],
                    "confidence": round(float(conf), 4),
                    "box": [round(v, 2) for v in xyxy],
                }
            )

    return {"detections": detections}
