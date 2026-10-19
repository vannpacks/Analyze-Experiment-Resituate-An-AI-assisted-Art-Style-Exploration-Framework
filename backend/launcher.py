"""Launch Style-AER as a single local process."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import json
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path


DEFAULT_PORT = 8765
BACKEND_DIR = Path(__file__).resolve().parent


def _health(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=2) as response:
            if response.status != 200:
                return False
            payload = json.loads(response.read().decode("utf-8"))
            return (
                payload.get("app") == "styleagent"
                and payload.get("status") == "ok"
            )
    except (OSError, urllib.error.URLError):
        return False


def _available_port(start: int) -> int:
    for port in range(start, start + 100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError(f"No available port found starting at {start}.")


def main() -> int:
    if _health(DEFAULT_PORT):
        url = f"http://localhost:{DEFAULT_PORT}"
        print(f"Style-AER is already running: {url}")
        webbrowser.open(url)
        return 0

    port = _available_port(DEFAULT_PORT)
    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND_DIR) + os.pathsep + env.get("PYTHONPATH", "")
    # Keep application-level host validation aligned with uvicorn's selected port.
    env["PORT"] = str(port)
    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=BACKEND_DIR,
        env=env,
    )
    url = f"http://localhost:{port}"
    try:
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"Backend exited during startup with code {process.returncode}.")
            if _health(port):
                print(f"Style-AER started at {url}")
                if not webbrowser.open(url):
                    print(f"Open this URL manually: {url}")
                return 0
            time.sleep(0.25)
        raise RuntimeError(f"Backend did not become healthy. Open manually if needed: {url}")
    except Exception as error:
        process.terminate()
        print(f"Failed to start Style-AER: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
