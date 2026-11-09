#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
    echo "Ошибка: python3 не найден. Установите Python 3.11+ и пакет python3-venv." >&2
    exit 1
fi
if ! "$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then
    echo "Нужен Python 3.11 или новее." >&2
    exit 1
fi

VENV="${COVER_MAKER_VENV:-.venv}"
if [ -d "$VENV" ] && [ ! -x "$VENV/bin/python" ] && [ -x "$VENV/Scripts/python.exe" ]; then
    VENV=".venv-linux"
fi

if [ ! -x "$VENV/bin/python" ]; then
    echo "Первый запуск: создаю $VENV и устанавливаю зависимости..."
    if ! "$PYTHON" -m venv "$VENV"; then
        echo "Не удалось создать виртуальное окружение. Ubuntu/Debian: sudo apt install python3-venv" >&2
        exit 1
    fi
    "$VENV/bin/python" -m pip install --upgrade pip
    if ! "$VENV/bin/python" -m pip install -r requirements.txt; then
        echo "Не удалось установить зависимости. Проверьте Python 3.11+ и доступ к PyPI." >&2
        exit 1
    fi
fi

if [ "${COVER_MAKER_DEVICE:-auto}" != "cpu" ]; then
    CUDA_LIB="${COVER_MAKER_CUDA_LIB_DIR:-${COVER_MAKER_CUDA_DLL_DIR:-}}"
    if [ -z "$CUDA_LIB" ]; then
        for INTERPRETER in "$VENV/bin/python" "$PYTHON"; do
            CANDIDATE="$("$INTERPRETER" -c 'import os, torch; print(os.path.join(os.path.dirname(torch.__file__), "lib"))' 2>/dev/null || true)"
            if [ -n "$CANDIDATE" ] && compgen -G "$CANDIDATE/libcudnn.so*" >/dev/null; then
                CUDA_LIB="$CANDIDATE"
                break
            fi
        done
    fi
    if [ -z "$CUDA_LIB" ]; then
        for CANDIDATE in /usr/local/cuda/lib64 /usr/local/cuda-*/lib64; do
            if compgen -G "$CANDIDATE/libcudnn.so*" >/dev/null; then
                CUDA_LIB="$CANDIDATE"
                break
            fi
        done
    fi
    if [ -n "$CUDA_LIB" ]; then
        export LD_LIBRARY_PATH="$CUDA_LIB${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
        export COVER_MAKER_CUDA_LIB_DIR="$CUDA_LIB"
        echo "GPU: CUDA/cuDNN библиотеки из $CUDA_LIB"
    fi
fi

if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
    case " $* " in
        *" --no-browser "*)
            ;;
        *)
            echo "Графическая сессия не найдена: откройте адрес из консоли в браузере."
            set -- --no-browser "$@"
            ;;
    esac
fi

exec "$VENV/bin/python" -m app "$@"
