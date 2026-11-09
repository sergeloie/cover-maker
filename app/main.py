from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .models import (
    SPECS,
    ModelDownloadError,
    ensure_downloaded,
    model_statuses,
    runtime_info,
    start_download,
)
from .removal import decode_image, remove_background

log = logging.getLogger(__name__)

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
MAX_UPLOAD_BYTES = 40 * 1024 * 1024

app = FastAPI(title="Cover Maker", version="1.0.0", docs_url="/api/docs", redoc_url=None)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", **runtime_info()}


@app.get("/api/models")
def list_models() -> dict:
    return {"models": model_statuses(), **runtime_info()}


@app.post("/api/models/{model_id}/download")
def download_model(model_id: str) -> JSONResponse:
    if model_id not in SPECS:
        raise HTTPException(status_code=404, detail="Неизвестная модель")
    start_download(model_id)
    return JSONResponse({"models": model_statuses()}, status_code=202)


@app.post("/api/remove-background")
async def remove_background_endpoint(
    file: UploadFile = File(...),
    model: str = Form("u2net"),
    feather: int = Form(0),
) -> Response:
    if model not in SPECS:
        raise HTTPException(status_code=400, detail="Выберите модель U²-Net или MODNet")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Файл больше 40 МБ")
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл")
    feather = max(0, min(20, int(feather)))
    try:
        image = decode_image(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        png, meta = await run_in_threadpool(remove_background, image, model, feather)
    except ModelDownloadError as exc:
        log.exception("model download failed")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("background removal failed")
        raise HTTPException(status_code=500, detail=f"Ошибка обработки: {exc}") from exc
    return Response(
        content=png,
        media_type="image/png",
        headers={
            "X-Cover-Model": meta["model"],
            "X-Cover-Device": meta["device"],
            "X-Cover-Duration-Ms": str(meta["elapsedMs"]),
            "Cache-Control": "no-store",
        },
    )


app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
