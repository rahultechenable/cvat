# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

"""
Box Assist inference service.

Serves the detection models found in BOX_ASSIST_MODELS_DIR (Ultralytics YOLO .pt / .onnx files)
over a small HTTP API. CVAT calls it to get box suggestions for a frame; nothing is stored here.

    GET  /health
    GET  /models                     -> [{"id", "name", "labels"}]
    POST /models/{model_id}/predict  {"image": <base64>, "conf": 0.05, "iou": 0.5, "max_det": 300}
                                     -> {"detections": [{"label", "confidence", "box": [x1, y1, x2, y2]}]}
"""

import base64
import io
import logging
import os
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel, Field

MODEL_EXTENSIONS = (".pt", ".onnx")

MODELS_DIR = Path(os.getenv("BOX_ASSIST_MODELS_DIR", Path(__file__).parent / "models"))
DEVICE = os.getenv("BOX_ASSIST_DEVICE")  # e.g. "cpu", "mps", "0"; autodetected when unset

logger = logging.getLogger("box_assist")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="CVAT Box Assist")


class LoadedModel:
    def __init__(self, path: Path):
        from ultralytics import YOLO

        self.id = path.stem
        self.path = path
        self.mtime = path.stat().st_mtime
        self.model = YOLO(str(path), task="detect")
        self.labels: list[str] = [str(name) for _, name in sorted(self.model.names.items())]
        # Ultralytics models are not safe to call from several threads at once
        self.lock = threading.Lock()


_models: dict[str, LoadedModel] = {}
_models_lock = threading.Lock()


def _discover() -> dict[str, Path]:
    if not MODELS_DIR.is_dir():
        return {}

    return {
        path.stem: path
        for path in sorted(MODELS_DIR.iterdir())
        if path.is_file() and path.suffix.lower() in MODEL_EXTENSIONS
    }


def _get_model(model_id: str) -> LoadedModel:
    path = _discover().get(model_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found in {MODELS_DIR}")

    with _models_lock:
        loaded = _models.get(model_id)
        # reload the model if the file was replaced
        if not loaded or loaded.path != path or loaded.mtime != path.stat().st_mtime:
            logger.info("Loading model %s from %s", model_id, path)
            try:
                loaded = LoadedModel(path)
            except Exception as ex:
                logger.exception("Failed to load model %s", model_id)
                raise HTTPException(
                    status_code=500, detail=f"Could not load model '{model_id}': {ex}"
                ) from ex
            _models[model_id] = loaded

    return loaded


@app.get("/health")
def health():
    return {"status": "ok", "models_dir": str(MODELS_DIR), "device": DEVICE or "auto"}


@app.get("/models")
def list_models():
    result = []
    for model_id in _discover():
        try:
            model = _get_model(model_id)
        except HTTPException as ex:
            logger.warning("Skipping model %s: %s", model_id, ex.detail)
            continue
        result.append({"id": model.id, "name": model.path.name, "labels": model.labels})
    return result


class PredictRequest(BaseModel):
    image: str = Field(description="Base64-encoded image file (JPEG, PNG, ...)")
    conf: float = Field(0.05, ge=0, le=1)
    iou: float = Field(0.5, ge=0, le=1)
    max_det: int = Field(300, ge=1, le=3000)


@app.post("/models/{model_id}/predict")
def predict(model_id: str, request: PredictRequest):
    model = _get_model(model_id)

    try:
        image = Image.open(io.BytesIO(base64.b64decode(request.image))).convert("RGB")
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Invalid image: {ex}") from ex

    kwargs = {"conf": request.conf, "iou": request.iou, "max_det": request.max_det}
    if DEVICE:
        kwargs["device"] = DEVICE

    with model.lock:
        results = model.model.predict(image, verbose=False, **kwargs)

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
