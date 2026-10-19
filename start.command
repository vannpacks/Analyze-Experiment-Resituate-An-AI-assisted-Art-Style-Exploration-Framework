#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$ROOT_DIR"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv was not found. Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

if [ ! -f frontend/out/index.html ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "The frontend is not built and Node.js was not found. Install it from https://nodejs.org/"
    exit 1
  fi
  echo "Building the frontend..."
  (cd frontend && npm ci && npm run build)
fi

uv run styleagent
