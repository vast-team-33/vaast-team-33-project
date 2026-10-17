#!/bin/sh
# Container entrypoint (python:3.12-slim). Rebuilds /data from S3, then serves.
set -eu
pip install -q --no-cache-dir boto3 imageio-ffmpeg
export DATA_DIR=/data
python /app/bootstrap/bootstrap.py

# ConfigMaps cannot hold subdirectories: assemble one static tree (index + assets/).
STATIC=/tmp/static
rm -rf "$STATIC"
mkdir -p "$STATIC/assets"
cp -rL /app/frontend-dist/. "$STATIC/" 2>/dev/null || true
if [ -d /app/frontend-assets ]; then
  cp -rL /app/frontend-assets/. "$STATIC/assets/" 2>/dev/null || true
fi

export HOST=0.0.0.0 PORT=8080 STATIC_DIR="$STATIC"
export FEEDBACK_FILE="${FEEDBACK_FILE:-/data/feedback.jsonl}"
exec python /app/backend/server.py
