from __future__ import annotations

import hashlib
import json
import mimetypes
import re
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from config import Config

router = APIRouter(tags=["ProjectShowAll"])

PROJECT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


def _safe_project_path(project_id: str) -> Path:
    if not PROJECT_ID_PATTERN.match(project_id):
        raise HTTPException(status_code=400, detail="Invalid project_id format")

    project_path = (Config.DATA_DIR / project_id).resolve()
    data_root = Config.DATA_DIR.resolve()

    if data_root not in project_path.parents:
        raise HTTPException(status_code=400, detail="Invalid project path")

    if not project_path.exists() or not project_path.is_dir():
        raise HTTPException(status_code=404, detail="Project not found")

    return project_path


def _parse_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _find_user_or_reference_image(
    project_path: Path,
    iteration_id: int,
    kind: str,
    image_id: int,
) -> Optional[Path]:
    folder = project_path / f"{iteration_id:03d}" / f"{kind}_images"
    png_path = folder / f"{image_id:03d}.png"
    if png_path.exists():
        return png_path

    jpg_path = folder / f"{image_id:03d}.jpg"
    if jpg_path.exists():
        return jpg_path

    jpeg_path = folder / f"{image_id:03d}.jpeg"
    if jpeg_path.exists():
        return jpeg_path

    return None


def _find_generated_image(project_path: Path, iteration_id: int, generated_image_id: int) -> Optional[Path]:
    image_path = (
        project_path
        / f"{iteration_id:03d}"
        / "generated_images"
        / f"{generated_image_id:03d}"
        / f"{generated_image_id:03d}.png"
    )
    if image_path.exists():
        return image_path
    return None


def _file_url(project_id: str, iteration_id: int, kind: str, image_id: int) -> str:
    return f"/project/{project_id}/file/{iteration_id}/{kind}/{image_id}"


def _read_json_file(file_path: Path) -> Optional[Dict[str, Any]]:
    if not file_path.exists():
        return None

    try:
        loaded = json.loads(file_path.read_text(encoding="utf-8"))
        return loaded if isinstance(loaded, dict) else None
    except json.JSONDecodeError:
        return None


def _read_style_analysis(project_path: Path, iteration_id: int, reference_image_id: Optional[int]) -> Optional[Dict[str, Any]]:
    if reference_image_id is None:
        return None

    analysis_path = (
        project_path
        / f"{iteration_id:03d}"
        / "style_analysis"
        / f"{reference_image_id:03d}.json"
    )
    return _read_json_file(analysis_path)


def _read_generated_style_description(generated_dir: Path) -> Optional[Dict[str, Any]]:
    return _read_json_file(generated_dir / "style_description.json")


def _read_generated_feedback(generated_dir: Path) -> Optional[Dict[str, Any]]:
    return _read_json_file(generated_dir / "feedback.json")


def _extract_numeric_image_ids(folder: Path) -> list[int]:
    if not folder.exists() or not folder.is_dir():
        return []

    ids: list[int] = []
    for path in folder.iterdir():
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
            continue
        if path.stem.isdigit():
            ids.append(int(path.stem))

    return sorted(set(ids))


def _get_latest_image_asset(project_path: Path, project_id: str, iteration_id: int, kind: str) -> Optional[Dict[str, Any]]:
    folder = project_path / f"{iteration_id:03d}" / f"{kind}_images"
    ids = _extract_numeric_image_ids(folder)
    if not ids:
        return None

    latest_id = ids[-1]
    image_path = _find_user_or_reference_image(project_path, iteration_id, kind, latest_id)
    if image_path is None:
        return None

    return {
        "image_id": latest_id,
        "url": _file_url(project_id, iteration_id, kind, latest_id),
    }


def _get_iteration_latest_assets(project_path: Path, project_id: str, iteration_id: int) -> Dict[str, Any]:
    latest_user = _get_latest_image_asset(project_path, project_id, iteration_id, "user")
    latest_reference = _get_latest_image_asset(project_path, project_id, iteration_id, "reference")

    reference_image_id = latest_reference.get("image_id") if latest_reference else None
    style_analysis = _read_style_analysis(project_path, iteration_id, reference_image_id)

    return {
        "user_image": latest_user,
        "reference_image": latest_reference,
        "style_analysis": style_analysis,
    }


def _canonicalize_log(log_payload: Dict[str, Any]) -> str:
    # Stable key order ensures deterministic grouping keys for equivalent logs.
    return json.dumps(log_payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


@router.get("/project/{project_id}/showall")
def get_project_showall(project_id: str):
    project_path = _safe_project_path(project_id)

    iteration_dirs = sorted(
        [p for p in project_path.iterdir() if p.is_dir() and p.name.isdigit()],
        key=lambda p: int(p.name),
    )

    iterations_output = []

    for iteration_dir in iteration_dirs:
        iteration_id = int(iteration_dir.name)
        generated_root = iteration_dir / "generated_images"
        latest_assets = _get_iteration_latest_assets(project_path, project_id, iteration_id)

        if not generated_root.exists() or not generated_root.is_dir():
            iterations_output.append(
                {
                    "iteration_id": iteration_id,
                    "groups": [],
                    "latest_assets": latest_assets,
                }
            )
            continue

        group_map: Dict[str, Dict[str, Any]] = {}

        generated_dirs = sorted(
            [p for p in generated_root.iterdir() if p.is_dir() and p.name.isdigit()],
            key=lambda p: int(p.name),
        )

        for generated_dir in generated_dirs:
            generated_image_id = int(generated_dir.name)
            image_path = _find_generated_image(project_path, iteration_id, generated_image_id)
            if image_path is None:
                # Only include successful generations (PNG exists).
                continue

            log_path = generated_dir / "user_log.txt"
            if not log_path.exists():
                continue

            try:
                user_log = json.loads(log_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                # Skip malformed logs to avoid presenting inconsistent groups.
                continue

            canonical_log = _canonicalize_log(user_log)
            group_key = hashlib.sha1(canonical_log.encode("utf-8")).hexdigest()[:12]

            user_image_id = _parse_int(user_log.get("user_image_id"))
            reference_image_id = _parse_int(user_log.get("reference_image_id"))

            if group_key not in group_map:
                user_image_url = None
                reference_image_url = None

                if user_image_id is not None and _find_user_or_reference_image(project_path, iteration_id, "user", user_image_id):
                    user_image_url = _file_url(project_id, iteration_id, "user", user_image_id)

                if reference_image_id is not None and _find_user_or_reference_image(project_path, iteration_id, "reference", reference_image_id):
                    reference_image_url = _file_url(project_id, iteration_id, "reference", reference_image_id)

                group_map[group_key] = {
                    "group_key": group_key,
                    "user_log": user_log,
                    "user_image": {
                        "image_id": user_image_id,
                        "url": user_image_url,
                    },
                    "reference_image": {
                        "image_id": reference_image_id,
                        "url": reference_image_url,
                    },
                    "style_analysis": _read_style_analysis(project_path, iteration_id, reference_image_id),
                    "generated_images": [],
                }

            file_url = _file_url(project_id, iteration_id, "generated", generated_image_id)
            style_description = _read_generated_style_description(generated_dir)
            feedback = _read_generated_feedback(generated_dir)
            group_map[group_key]["generated_images"].append(
                {
                    "generated_image_id": generated_image_id,
                    "url": file_url,
                    "download_url": file_url,
                    "style_description": style_description,
                    "has_feedback": feedback is not None,
                    "feedback": feedback,
                }
            )

        groups = sorted(
            group_map.values(),
            key=lambda g: min(img["generated_image_id"] for img in g["generated_images"]) if g["generated_images"] else 10**9,
        )

        iterations_output.append(
            {
                "iteration_id": iteration_id,
                "groups": groups,
                "latest_assets": latest_assets,
            }
        )

    return JSONResponse(
        content={
            "project_id": project_id,
            "iterations": iterations_output,
        }
    )


@router.get("/project/{project_id}/file/{iteration_id}/{kind}/{image_id}")
def get_project_file(project_id: str, iteration_id: int, kind: str, image_id: int):
    if iteration_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid iteration_id")

    if image_id < 0:
        raise HTTPException(status_code=400, detail="Invalid image_id")

    if kind not in {"user", "reference", "generated"}:
        raise HTTPException(status_code=400, detail="Invalid file kind")

    project_path = _safe_project_path(project_id)

    if kind in {"user", "reference"}:
        file_path = _find_user_or_reference_image(project_path, iteration_id, kind, image_id)
    else:
        file_path = _find_generated_image(project_path, iteration_id, image_id)

    if file_path is None:
        raise HTTPException(status_code=404, detail="Image not found")

    media_type, _ = mimetypes.guess_type(str(file_path))
    if media_type is None:
        media_type = "application/octet-stream"

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=file_path.name,
        headers={"Cache-Control": "public, max-age=3600"},
    )
