"""Application paths for source and packaged deployments."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from platformdirs import user_config_dir, user_data_dir, user_log_dir


APP_NAME = "StyleAgent"
BACKEND_ROOT = Path(__file__).resolve().parent
REPOSITORY_ROOT = BACKEND_ROOT.parent


def resource_path(*parts: str) -> Path:
    """Return a read-only bundled resource path."""
    bundle_root = Path(getattr(sys, "_MEIPASS", BACKEND_ROOT))
    return bundle_root.joinpath(*parts)


def _project_data_dir() -> Path:
    override = os.getenv("DATA_DIR")
    return Path(override).expanduser() if override else Path(user_data_dir(APP_NAME))


def _ensure_writable_directory(path: Path) -> Path:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".styleagent-write-test"
        probe.touch()
        probe.unlink()
    except OSError as error:
        raise RuntimeError(f"StyleAgent data directory is not writable: {path}") from error
    return path


def data_path(*parts: str) -> Path:
    """Return a path in the user project-data directory."""
    return _ensure_writable_directory(_project_data_dir()).joinpath(*parts)


def config_path(*parts: str) -> Path:
    """Return a path in the user configuration directory."""
    return Path(user_config_dir(APP_NAME)).joinpath(*parts)


def log_path(*parts: str) -> Path:
    """Return a path in the user log directory."""
    return Path(user_log_dir(APP_NAME)).joinpath(*parts)


def legacy_data_path() -> Path:
    """Return the old source-layout data directory, without creating it."""
    return REPOSITORY_ROOT / "backend" / "data"
