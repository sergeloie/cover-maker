from __future__ import annotations

import argparse
import socket
import threading
import webbrowser

import uvicorn


def free_port(start: int) -> int:
    for port in range(start, start + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise SystemExit("No free port found")


def main() -> None:
    parser = argparse.ArgumentParser(description="Cover Maker local server")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    port = free_port(args.port) if args.host == "127.0.0.1" else args.port
    url = f"http://{args.host}:{port}"
    print(f"Cover Maker running at {url}")
    if not args.no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    uvicorn.run("app.main:app", host=args.host, port=port, log_level="info")


if __name__ == "__main__":
    main()
