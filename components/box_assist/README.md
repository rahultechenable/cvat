# Box Assist inference service

Box Assist suggests bounding boxes in the CVAT annotation view: a detection model runs on the
current frame, its boxes appear as dashed suggestions, and the annotator accepts or rejects them
instead of drawing every box.

```
cvat-ui (Box Assist control + suggestion layer)
  -> CVAT server  POST /api/box_assist/suggest   (cvat/apps/box_assist: permissions, frame, label mapping)
    -> this service  POST /models/<id>/predict   (runs the model, stores nothing)
```

## Models

Every `.pt` / `.onnx` [Ultralytics](https://docs.ultralytics.com) detection model in the models
directory is offered in the UI (`models/` here, or `BOX_ASSIST_MODELS_DIR`). The model id is the
file name without the extension. Replacing a file reloads it on the next request.

The model's class names are matched to the job's labels by name (case-insensitive, `_`, `-` and
spaces are equivalent). Only labels of type *rectangle* or *any* are used. Classes that have no
matching label are skipped, and the UI shows them.

## Running locally (macOS)

```bash
python3.12 -m venv components/box_assist/.venv
components/box_assist/.venv/bin/pip install -r components/box_assist/requirements.txt
```

`./dev.sh start` starts the service on `127.0.0.1:8765` once `.venv` exists. To run it alone:

```bash
components/box_assist/.venv/bin/uvicorn --app-dir components/box_assist server:app --port 8765
```

The CVAT server finds it with `CVAT_BOX_ASSIST_URL` (default `http://localhost:8765`).

Settings: `BOX_ASSIST_MODELS_DIR`, `BOX_ASSIST_DEVICE` (`cpu`, `mps`, `0` for the first GPU;
detected automatically when unset).

## Running in Docker

Add `docker-compose.box_assist.yml` to the compose files, plus `docker-compose.box_assist.gpu.yml`
for an NVIDIA GPU. The models directory is mounted read-only from `components/box_assist/models`
(or `CVAT_BOX_ASSIST_MODELS_DIR`). The service is only reachable from the CVAT containers.

## Annotating with it

1. In a job with rectangle labels, open **Box Assist** (lightning icon in the left toolbar),
   turn it on and pick a model.
2. Suggestions appear on each frame. Change the confidence threshold to show more or fewer.
3. Click a suggestion to select it, then click it again (or press `A`) to accept it.
   `A` with nothing selected accepts the most confident one. `Shift+A` accepts all,
   `Shift+X` rejects, and `W` runs the model again.

Accepted boxes are saved with source `auto`. If an annotator edits one, it becomes `semi-auto`.
