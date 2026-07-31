
# config.py
import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()


# --- Application Configuration ---
class Config:

    HOST = os.getenv("FASTAPI_HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", os.getenv("FASTAPI_PORT", 5000)))
    DEBUG = os.getenv("FASTAPI_DEBUG", "True").lower() == "true"

    BASE_DIR = Path(__file__).resolve().parent
    DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
    REQUEST_LOG_DB = Path(os.getenv("REQUEST_LOG_DB", DATA_DIR / "request_logs.sqlite3"))
    # OUTPUT_FOLDER = Path(os.environ.get('OUTPUT_FOLDER', BASE_DIR / "output"))