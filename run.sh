#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "[vision] Installing dependencies..."
npm install --silent

echo "[vision] Starting agent (connects to orchestrator)..."
exec node src/agent-entry.js
