"""Lazy provider clients backed by the current settings."""

from __future__ import annotations

from typing import Any

from openai import OpenAI
from autogen_ext.models.openai import OpenAIChatCompletionClient

from settings import load_settings


def get_openai_key() -> str | None:
    return load_settings().get("openai_api_key")


def get_bfl_keys() -> list[str]:
    settings = load_settings()
    return [
        key for key in (
            settings.get("bfl_api_key_1"),
            settings.get("bfl_api_key_2"),
        ) if key
    ]


def get_bfl_key(index: int) -> str | None:
    if index not in {1, 2}:
        raise ValueError("BFL key index must be 1 or 2.")
    return load_settings().get(f"bfl_api_key_{index}")


def get_openai_client() -> OpenAI:
    key = get_openai_key()
    if not key:
        raise RuntimeError("OpenAI is not configured.")
    return OpenAI(api_key=key)


def get_autogen_client(model: str, temperature: float = 1) -> OpenAIChatCompletionClient:
    key = get_openai_key()
    if not key:
        raise RuntimeError("OpenAI is not configured.")
    return OpenAIChatCompletionClient(model=model, temperature=temperature, api_key=key)


def provider_status() -> dict[str, Any]:
    keys = get_bfl_keys()
    return {
        "openai": {"configured": bool(get_openai_key())},
        "bfl": {"configured": bool(keys)},
    }
