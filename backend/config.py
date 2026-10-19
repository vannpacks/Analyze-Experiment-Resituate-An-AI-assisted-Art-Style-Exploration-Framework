
# config.py
import os
from pathlib import Path
from dotenv import load_dotenv
from paths import config_path, data_path, log_path, resource_path

load_dotenv()


# --- Application Configuration ---
class Config:

    HOST = "127.0.0.1"
    PORT = int(os.getenv("PORT", os.getenv("FASTAPI_PORT", 5000)))
    DEBUG = os.getenv("FASTAPI_DEBUG", "True").lower() == "true"
    DEFAULT_PROJECT_ID = "local-workspace"

    BASE_DIR = Path(__file__).resolve().parent
    RESOURCE_DIR = resource_path()
    DATA_DIR = data_path()
    CONFIG_DIR = config_path()
    LOG_DIR = log_path()
    REQUEST_LOG_DB = Path(
        os.getenv("REQUEST_LOG_DB", LOG_DIR / "request_logs.sqlite3")
    ).expanduser()
    # OUTPUT_FOLDER = Path(os.environ.get('OUTPUT_FOLDER', BASE_DIR / "output"))