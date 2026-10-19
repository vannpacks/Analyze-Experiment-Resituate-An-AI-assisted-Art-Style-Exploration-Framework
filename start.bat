@echo off
setlocal

set "PROJECT_DIR=%~dp0"
pushd "%PROJECT_DIR%"
if errorlevel 1 (
    echo Failed to open the Style-AER project directory:
    echo %PROJECT_DIR%
    exit /b 1
)

where uv >nul 2>nul
if errorlevel 1 (
    echo uv was not found. Installing uv...
    powershell -NoProfile -ExecutionPolicy ByPass -Command ^
      "$ErrorActionPreference = 'Stop'; irm https://astral.sh/uv/install.ps1 | iex"
    if errorlevel 1 (
        echo Failed to install uv. Please install it from https://docs.astral.sh/uv/
        exit /b 1
    )
)

if not exist "frontend\out\index.html" (
    where npm >nul 2>nul
    if errorlevel 1 (
        echo The frontend is not built and Node.js was not found. Install Node.js from https://nodejs.org/
        popd
        pause
        exit /b 1
    )
    echo Building the frontend...
    pushd frontend
    call npm ci
    if errorlevel 1 goto :build_failed
    call npm run build
    if errorlevel 1 goto :build_failed
    popd
)

set "UV_EXE=%USERPROFILE%\.local\bin\uv.exe"
if exist "%UV_EXE%" (
    "%UV_EXE%" run styleagent
) else (
    uv run styleagent
)

if errorlevel 1 (
    echo Style-AER failed to start. Check the error above and try again.
    popd
    pause
    exit /b 1
)
popd
endlocal
exit /b 0

:build_failed
echo Failed to build the frontend. Check the error above.
popd
popd
pause
exit /b 1
