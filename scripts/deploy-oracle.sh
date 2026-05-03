#!/bin/bash
# Deploy script — runs ON the Oracle VM to pull latest and rebuild
# Usage: bash deploy-oracle.sh
set -e

CONTAINER="task-command-center"
REPO_DIR="/opt/codex-mcp-server"
GITHUB_REPO="https://github.com/task0429-dev/codex-mcp-server"

echo "[deploy] Starting Task Enterprise C2 deployment $(date)"

# 1. Pull latest code
if [ -d "$REPO_DIR/.git" ]; then
  echo "[deploy] Pulling latest from GitHub..."
  cd "$REPO_DIR"
  git pull origin main
else
  echo "[deploy] Cloning repo..."
  git clone "$GITHUB_REPO" "$REPO_DIR"
  cd "$REPO_DIR"
fi

# 2. Copy .env if it exists in a known location
if [ -f "/root/.c2.env" ]; then
  cp /root/.c2.env .env
  echo "[deploy] Copied .env from /root/.c2.env"
fi

# 3. Install deps and build TypeScript
echo "[deploy] Installing dependencies..."
npm ci --omit=dev 2>&1 | tail -3

echo "[deploy] Building TypeScript..."
npx tsc --noEmit false 2>&1 | tail -5 || true

# 4. Build frontend
echo "[deploy] Building control UI..."
node scripts/build-control-ui.mjs

# 5. Stop old container
echo "[deploy] Stopping old container..."
docker stop "$CONTAINER" 2>/dev/null || true
docker rm "$CONTAINER" 2>/dev/null || true

# 6. Build Docker image
echo "[deploy] Building Docker image..."
docker build -t task-c2:latest .

# 7. Start new container
echo "[deploy] Starting container..."
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 3010:3000 \
  --env-file .env \
  -e HTTP_HOST=0.0.0.0 \
  -e HTTP_PORT=3000 \
  -e NODE_ENV=production \
  task-c2:latest

echo "[deploy] Waiting for health check..."
sleep 10
curl -sf http://localhost:3000/health && echo "[deploy] Health OK" || echo "[deploy] Health check failed"

echo "[deploy] Done at $(date)"
docker ps --filter name="$CONTAINER"
