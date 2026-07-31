# routes/auth.py (簡化版)
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os
import hashlib
from typing import Optional
import time

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Models
class LoginRequest(BaseModel):
    username: str
    password: str

class AuthConfigResponse(BaseModel):
    auth_required: bool

class AuthVerifyResponse(BaseModel):
    success: bool
    message: str

# Configuration from environment variables
AUTH_ENABLED = os.getenv("ENABLE_AUTH", "false").lower() == "true"
AUTH_USERNAME = os.getenv("AUTH_USERNAME", "admin")
AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "password123")


def parse_usernames(usernames: str) -> set[str]:
    return {username.strip() for username in usernames.split(",") if username.strip()}


AUTH_USERNAMES = parse_usernames(AUTH_USERNAME)

def verify_credentials(username: str, password: str) -> bool:
    """Simple credential verification"""
    return username in AUTH_USERNAMES and password == AUTH_PASSWORD

@router.get("/config")
async def get_auth_config():
    """
    Return whether authentication is required
    Simple endpoint to check if auth is enabled
    """
    return AuthConfigResponse(auth_required=AUTH_ENABLED)

@router.post("/verify")
async def verify_credentials_endpoint(login_request: LoginRequest):
    """
    Simple credential verification endpoint
    No session management, just verify and return success/failure
    """
    if not AUTH_ENABLED:
        return AuthVerifyResponse(
            success=True,
            message="Authentication not required"
        )
    
    # Validate credentials
    if verify_credentials(login_request.username, login_request.password):
        return AuthVerifyResponse(
            success=True,
            message="Authentication successful"
        )
    else:
        return JSONResponse(
            status_code=401,
            content={
                "success": False,
                "message": "Invalid username or password"
            }
        )

@router.get("/health")
async def auth_health():
    """
    Simple health check for auth system
    """
    return {
        "status": "healthy", 
        "auth_enabled": AUTH_ENABLED,
        "timestamp": str(time.time())
    }