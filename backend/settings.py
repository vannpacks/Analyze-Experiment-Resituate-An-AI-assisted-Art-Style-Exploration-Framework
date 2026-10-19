"""Persistent provider settings stored outside the application bundle."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from paths import config_path


SETTINGS_PATH = config_path("settings.json")
SETTINGS_VERSION = 1
KNOWN_KEYS = {"openai_api_key", "bfl_api_key_1", "bfl_api_key_2"}


class SettingsError(RuntimeError):
    """Raised when provider settings cannot be read or written."""


def _empty_settings() -> dict[str, Any]:
    return {"version": SETTINGS_VERSION}


def load_settings() -> dict[str, Any]:
    if not SETTINGS_PATH.exists():
        return _empty_settings()
    try:
        raw = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError("settings must be an object")
        return {
            "version": SETTINGS_VERSION,
            **{key: value for key, value in raw.items() if key in KNOWN_KEYS and isinstance(value, str)},
        }
    except (OSError, ValueError, json.JSONDecodeError) as error:
        backup = SETTINGS_PATH.with_suffix(".json.bak")
        try:
            os.replace(SETTINGS_PATH, backup)
        except OSError as backup_error:
            raise SettingsError(f"Cannot back up damaged settings: {SETTINGS_PATH}") from backup_error
        raise SettingsError(f"Settings file was damaged and moved to {backup}") from error


def save_settings(updates: dict[str, Any]) -> dict[str, Any]:
    current = load_settings()
    for key, value in updates.items():
        if key not in KNOWN_KEYS:
            continue
        if value == "":
            current.pop(key, None)
        elif isinstance(value, str):
            current[key] = value
        else:
            raise SettingsError(f"Setting {key} must be a string.")

    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=".settings-", suffix=".tmp", dir=SETTINGS_PATH.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(current, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, SETTINGS_PATH)
        if os.name != "nt":
            SETTINGS_PATH.chmod(0o600)
    except OSError as error:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise SettingsError(f"Cannot save settings to {SETTINGS_PATH}") from error
    return current


def masked(value: str | None) -> str | None:
    if not value:
        return None
    return f"{value[:3]}...{value[-4:]}" if len(value) > 7 else "***"
