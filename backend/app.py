# app.py
from __future__ import annotations

import argparse
import os
from pathlib import Path
import asyncio
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import uvicorn

from autogen_core import SingleThreadedAgentRuntime
import shared
from config import Config
from routes.settings import router as settings_router
from routes.showall import router as showall_router
from utils.project import Project

from utils.request_log_db import init_request_log_db
from paths import legacy_data_path

APP_VERSION = "0.1.0"


def _allowed_origins(port: int) -> set[str]:
    return {
        f"http://localhost:{port}",
        f"http://127.0.0.1:{port}",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    }


def _origin_is_allowed(origin: str, port: int) -> bool:
    parsed = urlsplit(origin)
    return f"{parsed.scheme}://{parsed.netloc}" in _allowed_origins(port)


def log_project_id_state_on_startup() -> None:
    data_dir = Config.DATA_DIR
    if not data_dir.exists():
        print(f"[Startup ID Log] Data directory does not exist yet: {data_dir}")
        return

    project_dirs = sorted([p for p in data_dir.iterdir() if p.is_dir()])
    if not project_dirs:
        print(f"[Startup ID Log] No existing projects found in: {data_dir}")
        return

    print(f"[Startup ID Log] Found {len(project_dirs)} project(s) in {data_dir}")
    for project_dir in project_dirs:
        project_id = project_dir.name
        try:
            project = Project(project_id)
            current_iteration_id = project.get_current_iteration_id()
            current_user_image_id = project.current_user_image_id
            current_reference_image_id = project.current_reference_image_id
            current_generated_image_id = project.current_generated_image_id

            next_iteration_id = current_iteration_id + 1 if current_iteration_id > 0 else 1
            next_user_image_id = current_user_image_id + 1 if current_user_image_id > 0 else 1
            next_reference_image_id = current_reference_image_id + 1 if current_reference_image_id > 0 else 1
            next_generated_image_id = current_generated_image_id + 1 if current_generated_image_id >= 0 else 0

            print(
                "[Startup ID Log] "
                f"project_id={project_id}, "
                f"current(iter={current_iteration_id}, user={current_user_image_id}, ref={current_reference_image_id}, gen={current_generated_image_id}), "
                f"next(iter={next_iteration_id}, user={next_user_image_id}, ref={next_reference_image_id}, gen={next_generated_image_id})"
            )
        except Exception as error:
            print(f"[Startup ID Log] Failed to load project_id={project_id}: {error}")


def warn_about_legacy_data() -> None:
    legacy_path = legacy_data_path()
    if not legacy_path.is_dir():
        return
    try:
        has_new_data = any(Config.DATA_DIR.iterdir())
    except OSError as error:
        print(f"[Startup] Failed to inspect data directory {Config.DATA_DIR}: {error}")
        return
    if not has_new_data:
        print(
            "[Startup] Legacy data found at "
            f"{legacy_path}. Copy it manually to {Config.DATA_DIR} if needed; "
            "automatic migration is not enabled."
        )

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    print("Starting up application...")
    warn_about_legacy_data()
    log_project_id_state_on_startup()
    
    # Initialize runtime
    shared.runtime = SingleThreadedAgentRuntime()

    # Set project language
    shared.set_current_project_language(os.environ.get("PROJECT_LANGUAGE", "en"))
    print(f"using project_language {shared.get_current_project_language()}")

    # Register evaluation agents
    shared.reset_clients()
    if shared.model_client is not None:
        from core.registor_agent import register_evaluation_agents
        await register_evaluation_agents(shared.runtime, shared.model_client)
        shared.runtime.start()
        print("AutoGen Runtime started.")
    else:
        print("AutoGen Runtime not started: OpenAI credentials are not configured.")
    
    # Optional: seed mock data if needed
    # from dev_seed import seed_mock_current_project
    # seed_mock_current_project(project_id="123", user_image_id=1, generated_image_id=3)

    # Request log DB
    app.state.request_log_db_path = Config.REQUEST_LOG_DB
    init_request_log_db(app.state.request_log_db_path)
    
    yield
    
    # Shutdown logic
    print("Shutting down application...")
    if shared.runtime:
        await shared.runtime.stop_when_idle()
    print("AutoGen Runtime stopped.")

def create_app(config_class=Config) -> FastAPI:
    # disable_docs = os.getenv("DISABLE_DOCS", "false").lower() == "true"
    app = FastAPI(
        lifespan=lifespan,
        docs_url=None, redoc_url=None, openapi_url=None
        # docs_url="/docs" if not disable_docs else None,
        # redoc_url="/redoc" if not disable_docs else None,
        # openapi_url="/openapi.json" if not disable_docs else None,
    )
    app.state.config = config_class
    app.state.allowed_origins = _allowed_origins(config_class.PORT)

    @app.middleware("http")
    async def request_security(request: Request, call_next):
        host = request.headers.get("host", "")
        parsed_host = urlsplit(f"//{host}")
        if parsed_host.hostname not in {"localhost", "127.0.0.1"} or parsed_host.port != config_class.PORT:
            return JSONResponse(status_code=400, content={
                "error": {"code": "invalid_host", "message": "Request host is not allowed."}
            })

        if request.method not in {"GET", "HEAD"}:
            origin = request.headers.get("origin")
            fetch_site = request.headers.get("sec-fetch-site")
            if origin and not _origin_is_allowed(origin, config_class.PORT):
                return JSONResponse(status_code=403, content={
                    "error": {"code": "origin_not_allowed", "message": "Request origin is not allowed."}
                })
            if not origin and fetch_site and fetch_site not in {"same-origin", "same-site", "none"}:
                return JSONResponse(status_code=403, content={
                    "error": {"code": "origin_not_allowed", "message": "Request origin is not allowed."}
                })
        return await call_next(request)

    # --- CORS middleware -------------------------------------------------- #
    # Development frontend runs on port 3000 while the backend runs on port
    # 5000. Keep this limited to loopback origins; the launcher uses a
    # different port and remains same-origin without CORS.
    if config_class.DEBUG or config_class.PORT == 5000:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=sorted(app.state.allowed_origins),
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["Content-Type"],
        )

    # --- Ensure folders exist --------------------------------------------- #
    # for key in ("DATA_DIR", "OUTPUT_FOLDER"):
    for key in ("DATA_DIR",):
        print(f"Data directory for {key}: {getattr(config_class, key)}")
        Path(getattr(config_class, key)).mkdir(parents=True, exist_ok=True)

    setattr(config_class, "METADATA_FILE", getattr(config_class, "METADATA_FILE", "metadata.json"))

    # --- Register routers ------------------------------------------------- #
    from routes.style import router as style_router
    app.include_router(style_router, prefix="/api")
    app.include_router(showall_router, prefix="/api")

    @app.get("/api/health")
    async def health():
        return {"app": "styleagent", "version": APP_VERSION, "status": "ok"}

    @app.get("/api/setup/status")
    async def setup_status():
        from providers import provider_status
        status = provider_status()
        return {
            "configured": status["openai"]["configured"] and status["bfl"]["configured"],
            "providers": status,
        }

    app.include_router(settings_router, prefix="/api")

    @app.api_route(
        "/api/{path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    )
    async def api_not_found(path: str):
        return JSONResponse(status_code=404, content={
            "error": {"code": "not_found", "message": "API endpoint not found."}
        })

    @app.exception_handler(404)
    async def not_found(request: Request, exc):
        if request.url.path.startswith("/api/"):
            return JSONResponse(status_code=404, content={
                "error": {"code": "not_found", "message": "API endpoint not found."}
            })
        return JSONResponse(status_code=404, content={"detail": "Not found"})

    static_dir = Path(__file__).resolve().parent.parent / "frontend" / "out"
    if static_dir.is_dir():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")

    return app

app = create_app()

if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host=app.state.config.HOST,
        port=app.state.config.PORT,
        reload=app.state.config.DEBUG
    )