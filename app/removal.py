from __future__ import annotations

import io
import time

import numpy as np
from PIL import Image, ImageFilter

from .models import SPECS, get_session

MAX_PIXELS = 60_000_000
U2NET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
U2NET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def decode_image(data: bytes) -> Image.Image:
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception as exc:
        raise ValueError("Файл не похож на изображение") from exc
    if image.width * image.height > MAX_PIXELS:
        raise ValueError("Слишком большое изображение (больше 60 мегапикселей)")
    return image.convert("RGB")


def _prepare(image: Image.Image, model_id: str, input_size: int) -> np.ndarray:
    resized = image.resize((input_size, input_size), Image.Resampling.LANCZOS)
    array = np.asarray(resized, dtype=np.float32)
    if model_id == "u2net":
        # U2-Net reference preprocessing scales by the image maximum, not by 255.
        array = array / max(float(array.max()), 1e-6)
        array = (array - U2NET_MEAN) / U2NET_STD
    else:
        array = array / 255.0
        array = (array - 0.5) / 0.5
    return array.transpose(2, 0, 1)[None].astype(np.float32)


def _mask_from_output(output: np.ndarray, model_id: str) -> np.ndarray:
    mask = np.asarray(output, dtype=np.float32).squeeze()
    while mask.ndim > 2:
        mask = mask[0]
    if mask.ndim != 2:
        raise RuntimeError(f"Unexpected mask shape: {output.shape}")
    if model_id == "modnet":
        if float(mask.min()) < -0.01 or float(mask.max()) > 1.01:
            mask = 1.0 / (1.0 + np.exp(-mask))
        return np.clip(mask, 0.0, 1.0)
    low = float(mask.min())
    high = float(mask.max())
    return np.clip((mask - low) / max(high - low, 1e-6), 0.0, 1.0)


def remove_background(image: Image.Image, model_id: str, feather: int = 0) -> tuple[bytes, dict]:
    spec = SPECS[model_id]
    session, device = get_session(model_id)
    started = time.perf_counter()
    tensor = _prepare(image, model_id, spec.input_size)
    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: tensor})
    mask = _mask_from_output(outputs[0], model_id)
    alpha = Image.fromarray((mask * 255.0).astype(np.uint8), mode="L")
    alpha = alpha.resize(image.size, Image.Resampling.LANCZOS)
    if feather > 0:
        alpha = alpha.filter(ImageFilter.GaussianBlur(radius=feather))
    result = image.convert("RGBA")
    result.putalpha(alpha)
    buffer = io.BytesIO()
    result.save(buffer, format="PNG")
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    meta = {
        "model": model_id,
        "modelLabel": spec.label,
        "device": device,
        "elapsedMs": elapsed_ms,
        "width": image.width,
        "height": image.height,
    }
    return buffer.getvalue(), meta
