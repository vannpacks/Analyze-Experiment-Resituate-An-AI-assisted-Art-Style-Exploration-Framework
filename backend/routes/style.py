from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import base64
import uuid
import json
from pathlib import Path
import mimetypes
import asyncio
import io
import warnings
from PIL import Image, ImageFile, UnidentifiedImageError
# Import core services
from core.style_analyzer import StyleAnalyzerService
from core.image_generator import ImageGeneratorService
from utils.project import Project
import shared
from utils.helper import extract_json_from_string
from utils.messages_type import EvaluationResult, ImageEvaluationTask, UserResponse
from autogen_core import TopicId as TopicID
from core.registor_agent import register_evaluation_agents, PROFESSIONAL_ARTIST_TOPIC, TRENDING_ARTIST_TOPIC, FANS_AGENT_TOPIC
from dataclasses import asdict
from shared import model_general
from config import Config
from utils.request_log_db import log_request_call

router = APIRouter(prefix="/style", tags=["Style"])

# Reject truncated images instead of trying to load them.
ImageFile.LOAD_TRUNCATED_IMAGES = False

# Upload hard limits (server-side enforcement)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB decoded bytes
MAX_IMAGE_PIXELS = 50_000_000  # 50 megapixels (DoS/decompression-bomb guard)
ALLOWED_MIME_TYPES = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/webp": "WEBP",
}
MIME_ALIASES = {
    "image/jpg": "image/jpeg",
    "image/pjpeg": "image/jpeg",
    "image/x-png": "image/png",
}
PERMISSIVE_DECLARED_MIME_TYPES = {
    "application/octet-stream",
    "binary/octet-stream",
}

# Initialize core services
style_analyzer = StyleAnalyzerService(model_name=model_general)
image_generator = ImageGeneratorService()

# Pydantic models for request/response
class Base64Image(BaseModel):
    name: str
    data: str  # base64 data URL

class UploadImagesRequest(BaseModel):
    reference_image: Base64Image
    user_image: Base64Image
    project_id: Optional[str] = None

class ReplaceImagesRequest(BaseModel):
    reference_image: Optional[Base64Image | int] = None
    user_image: Optional[Base64Image | int] = None
    project_id: str = ""
    iteration_id: int = 0
    reference_image_iteration_id: Optional[int] = None
    user_image_iteration_id: Optional[int] = None
    replace_type: Optional[str] = None

class GenerationRequest(BaseModel):
    data: Dict[str, Any]

class FeedbackRequest(BaseModel):
    generated_image_id: int
    user_image_id: int
    project_id: str
    timestamp: Optional[str] = None

class CommentRequest(BaseModel):
    project_id: str
    iteration_id: int
    image_id: Optional[int] = None
    source: str
    comment_type: str
    content: Any

class BaseGenerationRequest(BaseModel):
    project_id: Optional[str] = None
    user_image: Optional[Base64Image] = None
    reference_image: Optional[Base64Image] = None
    base_user_prompt: str = ""
    user_image_id: Optional[int] = None
    reference_image_id: Optional[int] = None

async def event_generator(session_id: str):
    """Yields events from the queue for the SSE response."""
    queue = shared.response_queues.get(session_id)
    if not queue:
        return

    try:
        while True:
            event = await queue.get()
            # print(f"[{session_id}] Received event: {event}")

            # ADD A WAY TO SIGNAL THE END OF A TASK STREAM
            # For example, if the CoreAgent sends a final "DONE" message as a simple string
            
            if isinstance(event, EvaluationResult) and event.message == "[DONE]":
                event_data = json.dumps(asdict(event))
                yield f"data: {event_data}\n\n"
                print(f"[{session_id}] End of task stream detected. Closing this connection.")
                break # Exit the loop to close this specific stream

            if event is None:
                print(f"[{session_id}] Received None sentinel. Closing stream.")
                break

            event_data = json.dumps(asdict(event))

            yield f"data: {event_data}\n\n"
            
    finally:
        # Clean up the queue from the shared context
        shared.response_queues.pop(session_id, None)
        print(f"Stream closed and queue cleaned up for session: {session_id}")


def save_base64_image(
    base64_data: str,
    filename: str,
    project: "Project",
    subfolder: str = "",
    image_id: Optional[int] = None,
    shrink: Optional[bool] = False,
    long_edge_threshold: int = 1920,   # 4K UHD width
) -> Path:
    """Save base64 image data to project structure as PNG.
    If `shrink` is True and the image's longer edge > `long_edge_threshold`,
    resize proportionally so the longer edge == `long_edge_threshold`.
    """
    def _extract_data_url(encoded_data: str) -> tuple[Optional[str], str]:
        """Return (mime, base64_payload). mime is None when not a data URL."""
        if not encoded_data.startswith("data:"):
            return None, encoded_data

        header, payload = encoded_data.split(",", 1)

        # header example: data:image/png;base64
        if ";base64" not in header:
            raise HTTPException(status_code=400, detail="Invalid data URL: missing ';base64'")

        mime = header[5:].split(";", 1)[0].strip().lower()
        if not mime:
            raise HTTPException(status_code=400, detail="Invalid data URL: missing mime type")

        mime = MIME_ALIASES.get(mime, mime)

        return mime, payload

    def _decode_b64(payload: str) -> bytes:
        # Remove whitespace to be tolerant of line breaks.
        compact = "".join(payload.split())

        # Rough pre-check to fail fast on huge payloads before decoding.
        max_encoded_len = int(MAX_UPLOAD_BYTES * 4 / 3) + 16
        if len(compact) > max_encoded_len:
            raise HTTPException(status_code=413, detail="Image payload too large")

        try:
            decoded = base64.b64decode(compact, validate=True)
        except Exception:
            try:
                padded = compact + ("=" * (-len(compact) % 4))
                decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid base64 payload")

        if len(decoded) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Image too large")
        return decoded

    def _detect_signature_format(data: bytes) -> Optional[str]:
        if len(data) >= 8 and data.startswith(b"\x89PNG\r\n\x1a\n"):
            return "PNG"
        if len(data) >= 3 and data[:3] == b"\xff\xd8\xff":
            return "JPEG"
        return None

    # Extract data URL header (if present) and decode.
    declared_mime, encoded = _extract_data_url(base64_data)
    if declared_mime in PERMISSIVE_DECLARED_MIME_TYPES:
        declared_mime = None

    if declared_mime is not None and declared_mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {declared_mime}")

    image_bytes = _decode_b64(encoded)

    # Load with PIL to inspect/optionally resize.
    try:
        # Treat decompression bomb warnings as errors.
        Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(image_bytes)) as im:
                im.load()  # force decode to trigger bomb/truncation issues

                detected_format = (im.format or "").upper()
                if detected_format == "JPG":
                    detected_format = "JPEG"

                signature_format = _detect_signature_format(image_bytes)
                if detected_format not in ("PNG", "JPEG", "WEBP") and signature_format in ("PNG", "JPEG"):
                    print(
                        f"save_base64_image: PIL detected '{detected_format}', "
                        f"but signature indicates '{signature_format}'. Using signature format."
                    )
                    detected_format = signature_format

                if detected_format not in ("PNG", "JPEG", "WEBP"):
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Only PNG/JPG/WEBP images are allowed "
                            f"(detected: {detected_format or 'unknown'})"
                        ),
                    )

                if declared_mime is not None:
                    expected = ALLOWED_MIME_TYPES[declared_mime]
                    if detected_format != expected:
                        print(
                            "save_base64_image: declared mime/content mismatch "
                            f"(declared: {declared_mime}, detected: {detected_format}); "
                            "continuing with detected content."
                        )

                # Ensure a concrete mode for PNG (preserve alpha if present)
                if im.mode not in ("RGB", "RGBA"):
                    im = im.convert("RGBA" if "A" in im.getbands() else "RGB")

                width, height = im.size
                longer_edge = max(width, height)

                # Optional shrink if over threshold
                if shrink and longer_edge > long_edge_threshold:
                    scale = long_edge_threshold / float(longer_edge)
                    new_w = max(1, int(round(width * scale)))
                    new_h = max(1, int(round(height * scale)))
                    im = im.resize((new_w, new_h), Image.Resampling.LANCZOS)

                # Build filename (always .png)
                extension = ".png"
                if image_id is not None:
                    safe_filename = f"{image_id:03d}{extension}"
                else:
                    base_name = Path(filename).stem
                    safe_filename = f"{base_name}{extension}"

                # Prepare save dir
                save_dir = (project.get_project_path() / subfolder) if subfolder else project.get_project_path()
                save_dir.mkdir(parents=True, exist_ok=True)

                # Save as PNG
                file_path = save_dir / safe_filename
                im.save(file_path, format="PNG")

        return file_path
    except HTTPException as e:
        print(f"save_base64_image HTTPException: {e.detail}")
        raise
    except Image.DecompressionBombError:
        raise HTTPException(status_code=413, detail="Image is too large to process")
    except Image.DecompressionBombWarning:
        raise HTTPException(status_code=413, detail="Image is too large to process")
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Unrecognized image format")
    except OSError:
        raise HTTPException(status_code=400, detail="Invalid or corrupted image")



# Global project storage (in production, use proper database)
active_projects: Dict[str, Project] = {}


def get_or_load_project(project_id: str, create_if_missing: bool = False) -> Optional[Project]:
    project = active_projects.get(project_id)
    if project is not None:
        return project

    project_path = Config.DATA_DIR / project_id
    if project_path.exists() or create_if_missing:
        project = Project(project_id)
        active_projects[project_id] = project
        return project

    return None

# Endpoint: /style/upload_base64 (for base64 data, compatible with server.py)
@router.post("/upload_base64")
async def upload_images_base64(request: UploadImagesRequest):
    """
    Upload and analyze images using the actual StyleAnalyzerService
    Compatible with server.py's /api/upload_image endpoint
    """
    try:
        # Create or get existing project with meaningful project ID
        project_id = request.project_id or str(uuid.uuid4())
        
        # Ensure project ID is meaningful (not random UUID from frontend)
        # The frontend passes project IDs like "lxyz123abc" which are more readable
        project = get_or_load_project(project_id, create_if_missing=True)
        
        # Set current project in shared state for session management
        shared.current_project = project
        
        # Initialize response queue for this project/session
        if project_id not in shared.response_queues:
            print(f"Creating NEW response queue for session: {project_id}")
            shared.response_queues[project_id] = asyncio.Queue()
        
        # Add a new iteration for this upload
        with shared.lock:
            before_disk_max_iteration = project.get_disk_max_iteration_id()
            project.add_iteration()
            iteration_id = project.get_current_iteration_id()
            after_disk_max_iteration = project.get_disk_max_iteration_id()
            print(
                "[Upload Iteration Debug] "
                f"project_id={project_id}, "
                f"disk_max_before={before_disk_max_iteration}, "
                f"allocated_iteration_id={iteration_id}, "
                f"disk_max_after={after_disk_max_iteration}"
            )
        
        # Add user image and reference image to project
        project.add_user_image(iteration_id)
        user_image_id = project.current_user_image_id
        
        project.add_reference_image(iteration_id)
        reference_image_id = project.current_reference_image_id
        
        # Save images to project structure with proper ID-based naming
        user_image_folder = f"{iteration_id:03d}/user_images"
        reference_image_folder = f"{iteration_id:03d}/reference_images"
        
        user_image_path = save_base64_image(
            request.user_image.data, 
            request.user_image.name, 
            project, 
            user_image_folder,
            image_id=user_image_id,  # Save as 001.png, 002.png, etc.
            shrink=True,  # Shrink if over threshold
        )
        
        reference_image_path = save_base64_image(
            request.reference_image.data, 
            request.reference_image.name, 
            project, 
            reference_image_folder,
            image_id=reference_image_id,  # Save as 001.png, 002.png, etc.
            shrink=True,  # Shrink if over threshold
        )
        
        # Analyze the reference image using StyleAnalyzerService
        style_task = asyncio.create_task(
            style_analyzer.analyze_style_async(
                reference_image_path, iteration_id, reference_image_id, project
            )
        )
        content_task = asyncio.create_task(
            style_analyzer.analyze_content_async(
                user_image_path, iteration_id, user_image_id, project
            )
        )

        style_result, content_result = await asyncio.gather(style_task, content_task)

        log_params = {
            "iteration_id": iteration_id,
            "user_image_id": user_image_id,
            "reference_image_id": reference_image_id,
            "style_result": style_result,
            "content_result": content_result
        }
        log_request_call(Config.REQUEST_LOG_DB, project_id, iteration_id, "/style/upload_base64", log=json.dumps(log_params, indent=4, ensure_ascii=False))
        
        # Return response in same format as server.py
        return JSONResponse(content={
            "iteration_id": iteration_id,
            "reference_image_id": reference_image_id,
            "user_image_id": user_image_id,
            "project_id": project_id,
            "technical_analysis": style_result.get("technical_aspect", {}),
            "conceptual_analysis": style_result.get("conceptual_aspect", {})
        })

    except HTTPException as e:
        print(f"upload_images_base64 HTTPException: {e.detail}")
        raise
    except Exception as e:
        print(f"Error in upload_images: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing images: {str(e)}")


# Endpoint: /style/replace
@router.post("/replace")
async def replace_reference_image(request: ReplaceImagesRequest):
    """
    Replace reference image or User image and re-analyze style.
    """
    try:
        project_id = request.project_id
        project = get_or_load_project(project_id)
        if project is None:
            raise HTTPException(status_code=404, detail=f"Project {project_id} not found")

        iteration_id = request.iteration_id
        if iteration_id not in project.iteration_id:
            raise HTTPException(status_code=400, detail="Invalid iteration ID")

        # check if user image or reference image is provided
        if request.user_image is None and request.reference_image is None:
            raise HTTPException(status_code=400, detail="No image provided for replacement")
    
        reference_image_ids = project.reference_image_ids.get(iteration_id, [])
        user_image_ids = project.user_image_ids.get(iteration_id, [])
        reference_image_id = max(reference_image_ids) if reference_image_ids else 0
        user_image_id = max(user_image_ids) if user_image_ids else 0
        requested_replace_type = request.replace_type

        print(
            "[Replace Debug] "
            f"project_id={project_id}, iteration_id={iteration_id}, "
            f"resolved_user_image_id={user_image_id}, resolved_reference_image_id={reference_image_id}, "
            f"user_image_source_iteration_id={request.user_image_iteration_id}, "
            f"reference_image_source_iteration_id={request.reference_image_iteration_id}, "
            f"replace_type={requested_replace_type or 'replace'}"
        )
        
        # Process new user image if provided
        if request.user_image is not None:
            project.add_user_image(iteration_id)
            user_image_id = project.current_user_image_id
            user_image_folder = f"{iteration_id:03d}/user_images"
            
            # check if user image is a number or base64
            if isinstance(request.user_image, int):
                # if is int, read from generated image folder
                source_iteration_id = request.user_image_iteration_id or iteration_id
                if source_iteration_id not in project.iteration_id:
                    raise HTTPException(status_code=400, detail="Invalid user_image_iteration_id")

                project.copy_to_user_image(
                    request.user_image,
                    user_image_id,
                    iteration_id,
                    source_iteration_id=source_iteration_id,
                )
                user_image_path = project.read_user_image(iteration_id, user_image_id)

            elif isinstance(request.user_image, Base64Image):
                user_image_path = save_base64_image(
                    request.user_image.data,
                    request.user_image.name,
                    project,
                    user_image_folder,
                    image_id=user_image_id,  # Save as 001.png, 002.png, etc.
                    shrink=True,  # Shrink if over threshold
                )
            else:
                raise HTTPException(status_code=400, detail="Invalid user image format")

            content_task = asyncio.create_task(
                style_analyzer.analyze_content_async(
                    user_image_path, iteration_id, user_image_id, project
                )
            )
        # Process new reference image if provided
        if request.reference_image is not None:
            project.add_reference_image(iteration_id)
            reference_image_id = project.current_reference_image_id
            reference_image_folder = f"{iteration_id:03d}/reference_images"
            
            if isinstance(request.reference_image, int):
                source_iteration_id = request.reference_image_iteration_id or iteration_id
                if source_iteration_id not in project.iteration_id:
                    raise HTTPException(status_code=400, detail="Invalid reference_image_iteration_id")

                project.copy_to_reference_image(
                    request.reference_image,
                    reference_image_id,
                    iteration_id,
                    source_iteration_id=source_iteration_id,
                )
                reference_image_path = project.read_reference_image(iteration_id, reference_image_id)
            
            elif isinstance(request.reference_image, Base64Image):
                reference_image_path = save_base64_image(
                    request.reference_image.data,
                    request.reference_image.name,
                    project,
                    reference_image_folder,
                    image_id=reference_image_id,  # Save with proper ID
                    shrink=True,  # Shrink if over threshold
                )
            else:
                raise HTTPException(status_code=400, detail="Invalid reference image format")
            
            style_task = asyncio.create_task(
                style_analyzer.analyze_style_async(
                    reference_image_path, iteration_id, reference_image_id, project
                )
            )
        if request.user_image is not None and request.reference_image is not None:
            style_result, content_result = await asyncio.gather(style_task, content_task)
        elif request.user_image is not None:
            # style result read from the existing analysis
            style_result = project.read_style_analysis(iteration_id, reference_image_id)
            content_result = await content_task
        else:  # only reference image replaced
            style_result = await style_task
            content_result = project.read_content_analysis(iteration_id, user_image_id)
        
        log_params = {
                "replace_type": requested_replace_type or "replace",
                "iteration_id": iteration_id,
                "user_image_id": user_image_id,
                "reference_image_id": reference_image_id,
                "style_result": style_result,
                "content_result": content_result
        }
        log_request_call(Config.REQUEST_LOG_DB, project_id, iteration_id, "/style/replace", log=json.dumps(log_params, indent=4, ensure_ascii=False))

        # Return response in same format as server.py
        return JSONResponse(content={
            "iteration_id": iteration_id,
            "reference_image_id": reference_image_id,
            "user_image_id": user_image_id,
            "project_id": project_id,
            "technical_analysis": style_result.get("technical_aspect", {}),
            "conceptual_analysis": style_result.get("conceptual_aspect", {})
        })

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in upload_images: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing images: {str(e)}")


# Endpoint: /style/analyze
@router.post("/analyze")
async def analyze_style(payload: dict):
    """
    Analyze style for compatibility with existing frontend calls
    """
    try:
        reference_image_id = payload.get("reference_image_id")
        iteration_id = payload.get("iteration_id")
        project_id = payload.get("project_id")
        
        if not project_id:
            raise HTTPException(status_code=404, detail="Project not found")

        project = get_or_load_project(project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Read existing analysis from project structure
        analysis_file = project.get_project_path() / f"{iteration_id:03d}" / "style_analysis" / f"{reference_image_id:03d}.json"
        
        if analysis_file.exists():
            with open(analysis_file, 'r') as f:
                analysis_result = json.load(f)
            return JSONResponse(content=analysis_result)
        else:
            raise HTTPException(status_code=404, detail="Analysis not found")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving analysis: {str(e)}")


@router.post("/comment")
async def submit_comment(payload: CommentRequest):
    """
    Receive user feedback from analysis panel detail boxes and persist as request log.
    """
    if not payload.project_id:
        raise HTTPException(status_code=400, detail="Missing project_id")
    if payload.iteration_id is None:
        raise HTTPException(status_code=400, detail="Missing iteration_id")
    if payload.iteration_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid iteration_id")
    project = get_or_load_project(payload.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    log_payload = {
        "project_id": payload.project_id,
        "iteration_id": payload.iteration_id,
        "image_id": payload.image_id,
        "source": payload.source,
        "comment_type": payload.comment_type,
        "content": payload.content,
    }
    log_request_call(
        Config.REQUEST_LOG_DB,
        payload.project_id,
        payload.iteration_id,
        "/style/comment",
        log=json.dumps(log_payload, indent=4, ensure_ascii=False),
    )

    return JSONResponse(content={"status": "ok"})


@router.post("/generation")
async def generate_variants(request: GenerationRequest):
    """
    Stream image variants one by one using Server-Sent Events (SSE).
    """
    try:
        # 1. Setup Request Data (Same as before)
        prompt_data = request.data
        project_id = prompt_data.get("project_id")
        iteration_id = prompt_data.get("iteration_id")
        user_image_id = prompt_data.get("user_image_id")
        reference_image_id = prompt_data.get("reference_image_id")
        base_user_prompt = prompt_data.get("userPrompt", "")
        references = prompt_data.get("references", [])
        keep_structure = prompt_data.get("keep_structure", False)
        
        user_prompt = build_comprehensive_prompt(base_user_prompt, references)
        
        if not project_id:
            raise HTTPException(status_code=404, detail="Project not found")

        project = get_or_load_project(project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        shared.current_project = project
        
        # Get paths
        user_image_path = project.read_user_image(iteration_id, user_image_id)
        reference_image_path = project.read_reference_image(iteration_id, reference_image_id)

        # join user_image_id, reference_image_id and references into a json string name log parameter and print it
        log_params = {
            "iteration_id": iteration_id,
            "user_image_id": user_image_id,
            "reference_image_id": reference_image_id,
            "base_user_prompt": base_user_prompt,
            "references": references
        }
        log_request_call(Config.REQUEST_LOG_DB, project_id, iteration_id, "/style/generation", log=json.dumps(log_params, indent=4, ensure_ascii=False))

        # 2. Define the Stream Generator
        # This function iterates over your style generator and yields formatted data chunks
        async def event_generator():
            # Call your NEW generator method
            # Note: We iterate directly. FastAPI runs this in a threadpool automatically.
            count = 0
            style_iterator = image_generator.generate_style_variations_stream(
                user_prompt, 
                user_image_path, 
                reference_image_path, 
                iteration_id,
                user_image_id, 
                reference_image_id, 
                log_params,
                keep_structure=keep_structure
            )

            for result in style_iterator:
                count += 1
                # Extract raw data from the generator result
                image_path = result.get("image_path")
                status = result.get("status")
                generated_image_id = result.get("generated_image_id") # Ensure your generator yields this!
                
                # Prepare description fields
                description = result.get("description", "")
                focus = result.get("focus", "")
                target_effect = result.get("target_effect", "")

                # 3. Handle Image Encoding (Inside the loop now)
                image_data = ""
                if status == "success" and image_path and Path(image_path).exists():
                    try:
                        with open(image_path, 'rb') as f:
                            image_b64 = base64.b64encode(f.read()).decode("utf-8")
                        image_data = f"data:image/png;base64,{image_b64}"
                    except Exception as read_err:
                        print(f"Error reading generated image: {read_err}")
                        image_data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
                else:
                    # Use placeholder or error indicator
                    image_data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

                # 4. Format the Response Object
                # Matches your original structure exactly
                response_chunk = {
                    "type": "image_result",
                    "description": {
                        "focus": focus,
                        "target_effect": target_effect,
                        "description": description
                    },
                    "images": image_data,
                    "iteration_id": iteration_id,
                    "user_image_id": user_image_id,
                    "generated_image_id": generated_image_id,
                    "status": status  # Helpful for frontend to know if it failed
                }

                # 5. Yield as Server-Sent Event (SSE)
                # Format: "data: {json}\n\n"
                yield f"data: {json.dumps(response_chunk)}\n\n"
                
                # Optional: Yield a small sleep to ensure buffer flushes if needed, 
                # though usually not required with StreamingResponse
                await asyncio.sleep(0.01)

        # 2. SEND THE "DONE" SIGNAL
            # This runs only after the loop above is 100% finished
            final_message = {
                "type": "completed",
                "total_generated": count,
                "message": "DONE"
            }
            yield f"data: {json.dumps(final_message, indent=4, ensure_ascii=False)}\n\n"
        
        # 6. Return StreamingResponse
        print(f"Starting stream for project {project_id}")
        return StreamingResponse(event_generator(), media_type="text/event-stream")

    except Exception as e:
        print(f"Error in generate_variants: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating variants: {str(e)}")


# Endpoint: /style/gen_feedback (moved from server.py)
@router.post("/agent-feedback")
async def generate_feedback(request: Request):
    """
    Generate feedback from multiple AI agents, aggregate the results,
    and return them as a single JSON object.
    """
    data = await request.json()
    project_id = data.get("project_id")
    print(f"Received project_id: {project_id}")
    iteration_id=data.get("iteration_id", 0)
    user_image_id=data.get("user_image_id", 0)
    generated_image_id=data.get("generated_image_id", 0)
    print(f"Received project_id: {project_id}, iteration_id: {iteration_id}, user_image_id: {user_image_id}, generated_image_id: {generated_image_id}")
    description=data.get("description", "")
    print(f"Received description: {description}")

    if not project_id:
        raise HTTPException(status_code=400, detail="Missing project_id")

    project = get_or_load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # --- Setup project and response queue ---
    shared.current_project = project
    if project_id not in shared.response_queues:
        shared.response_queues[project_id] = asyncio.Queue()
    response_queue = shared.response_queues[project_id]

    # --- Create and publish task to all agents ---
    evaluation_task = ImageEvaluationTask(
        iteration_id=iteration_id,
        user_image_id=user_image_id,
        generated_image_id=generated_image_id,
        content=f"# To do: Please provide feedback on the generated image.",
    )
    
    agent_topics = [PROFESSIONAL_ARTIST_TOPIC, TRENDING_ARTIST_TOPIC, FANS_AGENT_TOPIC]
    for topic in agent_topics:
        await shared.runtime.publish_message(
            evaluation_task,
            topic_id=TopicID(topic, source=project_id)
        )
        print(f"Published UserTask to {topic} with session_id {project_id}")

    # --- Wait for and aggregate responses ---
    aggregated_feedback = {}
    responses_to_collect = len(agent_topics)
    try:
        for _ in range(responses_to_collect):
            # Wait for a response for up to 60 seconds
            # The item from the queue is an 'EvaluationResult' object
            result_event = await asyncio.wait_for(response_queue.get(), timeout=60.0)

            try:
                # The 'evaluation' attribute holds the string with the JSON payload
                if hasattr(result_event, 'evaluation') and isinstance(result_event.evaluation, str):
                    feedback_str = result_event.evaluation
                    # The feedback is already a JSON string, so we parse it
                    feedback_json = json.loads(extract_json_from_string(feedback_str))
                    aggregated_feedback.update(feedback_json)
                else:
                    print(f"Skipping response with invalid 'evaluation' attribute: {result_event}")
            except (json.JSONDecodeError, AttributeError, TypeError) as e:
                print(f"Error processing agent response: {e}. Response object: {result_event}")

    except asyncio.TimeoutError:
        print(f"Warning: Timed out waiting for all agent responses for session {project_id}.")
        if not aggregated_feedback:
             raise HTTPException(status_code=408, detail="Request timed out. No agents responded.")
    finally:
        # Clean up the queue for this session
        if project_id in shared.response_queues:
            del shared.response_queues[project_id]
            print(f"Queue cleaned up for session: {project_id}")

    if not aggregated_feedback:
        raise HTTPException(status_code=500, detail="Failed to process any agent feedback.")

    # --- Save aggregated feedback to project structure ---
    log_params = {
        "user_image_id": user_image_id,
        "generated_image_id": generated_image_id,
        "aggregated_feedback": aggregated_feedback
    }
    log_request_call(Config.REQUEST_LOG_DB, project_id, iteration_id, "/style/agent-feedback", log=json.dumps(log_params, indent=4, ensure_ascii=False))


    generated_image = project.get_generated_images_path(iteration_id)
    generated_feedback_file = generated_image / f"{generated_image_id:03d}" / "feedback.json"
    # Ensure directory exists
    generated_feedback_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(generated_feedback_file, 'w', encoding='utf-8') as f:
        json.dump(aggregated_feedback, f, indent=4, ensure_ascii=False)

    return JSONResponse(content=aggregated_feedback)



def build_comprehensive_prompt(base_prompt: str, references: list) -> str:
    """
    Build a comprehensive prompt by combining user prompt and references
    
    Args:
        base_prompt (str): The original user prompt
        references (list): List of reference objects with aspectName, description, etc.
    
    Returns:
        str: Combined prompt for image generation
    """
    # Start with the base user prompt
    prompt_parts = []

    if base_prompt.strip():
        prompt_parts.append(f"### User Request: {base_prompt.strip()}")
    
    # Add references if they exist
    if references:
        prompt_parts.append("\n### User's stated modify intention: ")

        for ref in references:
            aspect_name = ref.get("aspectName", "")
            description = ref.get("description", "")
            technical_aspects = ref.get("relatedTechnicalAspects", [])
            
            if aspect_name and description:
                if technical_aspects:
                    ref_text = f" (#### Focus: {', '.join(technical_aspects)})"
                ref_text += f"- {aspect_name}: {description}"                
                prompt_parts.append(ref_text)
    
    return "\n".join(prompt_parts)


@router.post("/base_gen")
async def base_generation(request: BaseGenerationRequest):
    """
    Combined endpoint that uploads images and generates variants in a single call.
    Reduces API calls by combining upload_base64 and generation functionality.
    
    Args:
        request: Contains project_id, user_image, reference_image, base_user_prompt,
                user_image_id (optional), reference_image_id (optional)
    
    Returns:
        List of generated image variants with descriptions
        
    Modes:
        1. Full mode: When project_id is not in active_projects OR when image_ids are null
        2. Generation-only mode: When project_id exists and both image_ids are provided
    """
    try:
        # Validate project_id is provided
        if not request.project_id:
            raise HTTPException(status_code=400, detail="project_id is required")
        
        # Create project if it doesn't exist
        project = get_or_load_project(request.project_id, create_if_missing=True)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        shared.current_project = project
        
        # Initialize response queue for this project/session
        if request.project_id not in shared.response_queues:
            print(f"Creating NEW response queue for session: {request.project_id}")
            shared.response_queues[request.project_id] = asyncio.Queue()
        
        # Determine mode based on project existence and image IDs
        # Full mode if: project is new OR image IDs are null
        # Generation-only mode if: project exists AND both image IDs are provided
        if (request.user_image_id is not None and 
            request.reference_image_id is not None and 
            request.project_id in active_projects):
            
            # Generation-only mode: Skip steps 1 and 2, go directly to step 3
            print(f"Generation-only mode: using existing user_image_id={request.user_image_id}, reference_image_id={request.reference_image_id}")
            
            # Get existing image paths from project
            user_image_path = project.read_user_image(request.user_image_id)
            reference_image_path = project.read_reference_image(request.user_image_id, request.reference_image_id)
            
            user_image_id = request.user_image_id
            reference_image_id = request.reference_image_id
            
        else:
            # Full mode: Perform upload and analysis (steps 1 and 2)
            print("Full mode: performing upload and analysis")
            
            # Validate required images for full mode
            if not request.user_image or not request.reference_image:
                raise HTTPException(status_code=400, detail="user_image and reference_image are required for full mode")
            
            # Step 1: Handle project creation and image upload (from upload_base64)
            # Add user image and reference image to project
            project.add_user_image()
            user_image_id = project.current_user_image_id
            
            project.add_reference_image(user_image_id)
            reference_image_id = project.current_reference_image_id
            
            # Save images to project structure with proper ID-based naming
            user_image_folder = f"{user_image_id:03d}/user_images"
            reference_image_folder = f"{user_image_id:03d}/reference_images"
            
            user_image_path = save_base64_image(
                request.user_image.data, 
                request.user_image.name, 
                project, 
                user_image_folder,
                image_id=user_image_id
            )
            
            reference_image_path = save_base64_image(
                request.reference_image.data, 
                request.reference_image.name, 
                project, 
                reference_image_folder,
                image_id=reference_image_id
            )
            
            # Step 2: Analyze the images (from upload_base64)
            style_task = asyncio.create_task(
                style_analyzer.analyze_style_async(
                    reference_image_path, user_image_id, reference_image_id, project
                )
            )
            content_task = asyncio.create_task(
                style_analyzer.analyze_content_async(
                    user_image_path, user_image_id, project
                )
            )

            style_result, content_result = await asyncio.gather(style_task, content_task)
        
        # Step 3: Generate image variants (common for both modes)
        # Build user prompt (no references in this case, just the base prompt)
        user_prompt = f"### User Request: {request.base_user_prompt.strip()}" if request.base_user_prompt.strip() else ""
        
        # Generate style variations using ImageGeneratorService
        generated_results = image_generator.generate_style_variations(
            user_prompt, 
            user_image_path, 
            reference_image_path, 
            user_image_id, 
            reference_image_id
        )

        # Step 4: Format response data (common for both modes)
        response_data = []
        for idx, result in enumerate(generated_results):
            image_path = result["image_path"]
            description = result["description"]
            focus = result["focus"]
            target_effect = result["target_effect"]
            
            # Read generated image and convert to base64
            if Path(image_path).exists():
                with open(image_path, 'rb') as f:
                    image_b64 = base64.b64encode(f.read()).decode("utf-8")
                image_data = f"data:image/png;base64,{image_b64}"
            else:
                # Use placeholder if image doesn't exist
                image_data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
           
            # Extract generated_image_id from the path
            path_parts = Path(image_path).parts
            generated_image_id = int(path_parts[-2])
           
            response_data.append({
                "description": {
                    "focus": focus,
                    "target_effect": target_effect,
                    "description": description
                },
                "images": image_data,
                "user_image_id": user_image_id,
                "reference_image_id": reference_image_id,
                "generated_image_id": generated_image_id
            })
       
        return JSONResponse(content=response_data)
        
    except Exception as e:
        print(f"Error in base_generation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error in base generation: {str(e)}")