from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from settings import SettingsError, load_settings, masked, save_settings


router = APIRouter(prefix="/settings", tags=["Settings"])


class SettingsUpdate(BaseModel):
    openai_api_key: str | None = None
    bfl_api_key_1: str | None = None
    bfl_api_key_2: str | None = None


def _public_settings() -> dict[str, Any]:
    current = load_settings()
    return {
        "openai": {
            "configured": bool(current.get("openai_api_key")),
            "masked": masked(current.get("openai_api_key")),
        },
        "bfl": {
            "configured": bool(current.get("bfl_api_key_1") or current.get("bfl_api_key_2")),
            "masked": masked(current.get("bfl_api_key_1") or current.get("bfl_api_key_2")),
        },
    }


@router.get("")
async def get_settings():
    return _public_settings()


@router.put("")
async def update_settings(update: SettingsUpdate):
    try:
        updates = {
            key: value for key, value in update.model_dump(exclude_unset=True).items()
            if value is not None
        }
        save_settings(updates)
        import shared
        shared.reset_clients()
        return _public_settings()
    except SettingsError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
