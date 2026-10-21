FROM python:3.12-slim

# libgl/glib are needed by OpenCV, which Ultralytics depends on
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# PyTorch is installed first from its own index, so the CUDA build matches the GPU
# (CUDA 12.8 supports Blackwell GPUs). Pass https://download.pytorch.org/whl/cpu for a CPU-only image.
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cu128
RUN pip install --no-cache-dir --timeout 120 --retries 10 \
    --index-url ${TORCH_INDEX_URL} torch torchvision

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --timeout 120 --retries 10 -r requirements.txt

COPY server.py .

# YOLO_AUTOINSTALL: never pip-install packages at runtime when a model needs something missing
ENV BOX_ASSIST_MODELS_DIR=/models \
    YOLO_CONFIG_DIR=/tmp/ultralytics \
    YOLO_AUTOINSTALL=false
EXPOSE 8765
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8765"]
