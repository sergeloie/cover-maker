from __future__ import annotations

import logging
import os
import shutil
import threading
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import onnxruntime as ort

log = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = Path(os.environ.get("COVER_MAKER_MODEL_DIR", BASE_DIR / "models"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)

DEVICE_PREFERENCE = os.environ.get("COVER_MAKER_DEVICE", "auto").lower()


@dataclass(frozen=True)
class ModelSpec:
    id: str
    label: str
    description: str
    filename: str
    urls: tuple[str, ...]
    input_size: int
    approx_mb: int


SPECS: dict[str, ModelSpec] = {
    "u2net": ModelSpec(
        id="u2net",
        label="U\u00b2-Net",
        description="\u0423\u043d\u0438\u0432\u0435\u0440\u0441\u0430\u043b\u044c\u043d\u043e\u0435 \u0432\u044b\u0440\u0435\u0437\u0430\u043d\u0438\u0435: \u043b\u044e\u0434\u0438, \u0442\u043e\u0432\u0430\u0440\u044b, \u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u0438, \u0436\u0438\u0432\u043e\u0442\u043d\u044b\u0435.",
        filename="u2net.onnx",
        urls=(
            "https://huggingface.co/tomjackson2023/rembg/resolve/main/u2net.onnx",
            "https://huggingface.co/fofr/comfyui/resolve/main/rembg/u2net.onnx",
        ),
        input_size=320,
        approx_mb=176,
    ),
    "modnet": ModelSpec(
        id="modnet",
        label="MODNet",
        description="\u041f\u043e\u0440\u0442\u0440\u0435\u0442\u043d\u0430\u044f \u043c\u0430\u0442\u0438\u0440\u043e\u0432\u043a\u0430: \u043b\u0443\u0447\u0448\u0435 \u0434\u043b\u044f \u0444\u043e\u0442\u043e \u043b\u044e\u0434\u0435\u0439, \u043c\u044f\u0433\u043a\u0438\u0435 \u043a\u0440\u0430\u044f \u0432\u043e\u043b\u043e\u0441.",
        filename="modnet.onnx",
        urls=(
            "https://huggingface.co/Xenova/modnet/resolve/main/onnx/model.onnx",
            "https://huggingface.co/DavG25/modnet-pretrained-models/resolve/main/models/modnet_photographic_portrait_matting.onnx",
        ),
        input_size=512,
        approx_mb=26,
    ),
}

_download_lock = threading.Lock()
_session_lock = threading.Lock()
_dll_handles: list = []
_cuda_dlls_ready = False
_download_state: dict[str, str] = {}
_download_error: dict[str, str] = {}
_sessions: dict[str, tuple[ort.InferenceSession, str]] = {}


class ModelDownloadError(RuntimeError):
    pass


def model_path(model_id: str) -> Path:
    return MODEL_DIR / SPECS[model_id].filename


def is_downloaded(model_id: str) -> bool:
    path = model_path(model_id)
    return path.exists() and path.stat().st_size > 1_000_000


def _download_locked(spec: ModelSpec) -> None:
    target = model_path(spec.id)
    if target.exists() and target.stat().st_size > 1_000_000:
        return
    _download_state[spec.id] = "downloading"
    _download_error.pop(spec.id, None)
    part = target.with_suffix(target.suffix + ".part")
    errors: list[str] = []
    for url in spec.urls:
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "cover-maker/1.0"})
            with urllib.request.urlopen(request, timeout=120) as response, part.open("wb") as out:
                shutil.copyfileobj(response, out, 1024 * 1024)
            if part.stat().st_size < 1_000_000:
                raise RuntimeError("downloaded file is too small")
            part.replace(target)
            _download_state[spec.id] = "ready"
            log.info("model %s downloaded (%s MB)", spec.id, target.stat().st_size // (1024 * 1024))
            return
        except Exception as exc:
            errors.append(f"{url}: {exc}")
            part.unlink(missing_ok=True)
            log.warning("model download attempt failed for %s: %s", spec.id, exc)
    _download_state[spec.id] = "error"
    _download_error[spec.id] = "; ".join(errors)
    raise ModelDownloadError(
        f"Не удалось скачать модель {spec.label}. Проверьте подключение к интернету."
    )


def ensure_downloaded(model_id: str) -> Path:
    if is_downloaded(model_id):
        _download_state[model_id] = "ready"
        return model_path(model_id)
    with _download_lock:
        _download_locked(SPECS[model_id])
    return model_path(model_id)


def start_download(model_id: str) -> None:
    if is_downloaded(model_id):
        _download_state[model_id] = "ready"
        return

    def run() -> None:
        try:
            ensure_downloaded(model_id)
        except ModelDownloadError:
            pass

    threading.Thread(target=run, name=f"download-{model_id}", daemon=True).start()


def _cuda_lib_candidates() -> list[Path]:
    candidates: list[Path] = []
    explicit = os.environ.get("COVER_MAKER_CUDA_LIB_DIR") or os.environ.get(
        "COVER_MAKER_CUDA_DLL_DIR"
    )
    if explicit:
        candidates.append(Path(explicit))
    try:
        import torch

        candidates.append(Path(torch.__file__).parent / "lib")
    except Exception:
        pass
    try:
        import site

        roots = list(site.getsitepackages()) + [site.getusersitepackages()]
    except Exception:
        roots = []
    subdirs = (
        ("nvidia/cudnn/bin", "nvidia/cublas/bin", "nvidia/cuda_runtime/bin")
        if os.name == "nt"
        else ("nvidia/cudnn/lib", "nvidia/cublas/lib", "nvidia/cuda_runtime/lib")
    )
    for root in roots:
        for sub in subdirs:
            candidates.append(Path(root) / sub)
    if os.name == "nt":
        toolkit = Path(r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA")
        if toolkit.exists():
            for version in toolkit.iterdir():
                candidates.append(version / "bin")
    else:
        candidates.append(Path("/usr/local/cuda/lib64"))
        for version in Path("/usr/local").glob("cuda-*"):
            candidates.append(version / "lib64")
    return [path for path in candidates if path.is_dir()]


def _configure_cuda_dlls() -> None:
    global _cuda_dlls_ready
    if _cuda_dlls_ready:
        return
    _cuda_dlls_ready = True
    for directory in _cuda_lib_candidates():
        if os.name != "nt":
            log.info(
                "CUDA libraries found at %s; set LD_LIBRARY_PATH to include it before launching",
                directory,
            )
            continue
        try:
            _dll_handles.append(os.add_dll_directory(str(directory)))
        except (AttributeError, OSError):
            continue
        os.environ["PATH"] = str(directory) + os.pathsep + os.environ.get("PATH", "")
        log.info("added CUDA runtime directory %s", directory)


def _providers() -> list:
    available = ort.get_available_providers()
    if DEVICE_PREFERENCE == "cpu":
        return ["CPUExecutionProvider"]
    if "CUDAExecutionProvider" in available:
        _configure_cuda_dlls()
        return [("CUDAExecutionProvider", {"device_id": 0}), "CPUExecutionProvider"]
    return ["CPUExecutionProvider"]


def active_device() -> str:
    with _session_lock:
        for _session, device in _sessions.values():
            return device
    return ""


def get_session(model_id: str) -> tuple[ort.InferenceSession, str]:
    with _session_lock:
        cached = _sessions.get(model_id)
        if cached:
            return cached
    path = ensure_downloaded(model_id)
    options = ort.SessionOptions()
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    options.intra_op_num_threads = max(1, min(8, os.cpu_count() or 4))
    requested = _providers()
    session = None
    device = "CPU"
    probe_error = None
    if requested[0] != "CPUExecutionProvider":
        try:
            candidate = ort.InferenceSession(str(path), sess_options=options, providers=requested)
            actual = candidate.get_providers()
            if "CUDAExecutionProvider" not in actual:
                raise RuntimeError(
                    "CUDAExecutionProvider is not active; active providers: " + ", ".join(actual)
                )
            candidate.run(None, {candidate.get_inputs()[0].name: _probe_tensor(
                candidate.get_inputs()[0].shape, SPECS[model_id].input_size)})
            session = candidate
            device = "GPU (CUDA)"
        except Exception as exc:
            probe_error = exc
            log.warning("CUDA inference unavailable, falling back to CPU: %s", exc)
    if session is None:
        try:
            session = ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])
            session.run(None, {session.get_inputs()[0].name: _probe_tensor(
                session.get_inputs()[0].shape, SPECS[model_id].input_size)})
        except Exception as exc:
            detail = f"{exc}; CUDA attempt: {probe_error}" if probe_error else str(exc)
            raise RuntimeError(f"Не удалось запустить модель {SPECS[model_id].label}: {detail}") from exc
    with _session_lock:
        _sessions[model_id] = (session, device)
    return session, device


def _probe_tensor(shape, input_size: int):
    import numpy as np

    dims = [dim if isinstance(dim, int) and dim > 0 else None for dim in shape]
    if len(dims) != 4:
        return np.zeros((1, 3, input_size, input_size), dtype=np.float32)
    height = dims[2] or input_size
    width = dims[3] or input_size
    return np.zeros((1, 3, height, width), dtype=np.float32)


def model_statuses() -> list[dict]:
    result = []
    for spec in SPECS.values():
        downloaded = is_downloaded(spec.id)
        if downloaded:
            state = "ready"
        elif _download_state.get(spec.id) == "downloading":
            state = "downloading"
        elif _download_state.get(spec.id) == "error":
            state = "error"
        else:
            state = "missing"
        session_info = _sessions.get(spec.id)
        result.append(
            {
                "id": spec.id,
                "label": spec.label,
                "description": spec.description,
                "inputSize": spec.input_size,
                "approxMb": spec.approx_mb,
                "state": state,
                "downloaded": downloaded,
                "error": _download_error.get(spec.id),
                "loaded": session_info is not None,
                "device": session_info[1] if session_info else None,
            }
        )
    return result


def runtime_info() -> dict:
    return {
        "device": active_device(),
        "providers": ort.get_available_providers(),
        "devicePreference": DEVICE_PREFERENCE,
        "modelDir": str(MODEL_DIR),
    }
