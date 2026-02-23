#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "======================================="
echo "  Synapse Live Debug - Starting..."
echo "======================================="
echo

cd "$SCRIPT_DIR/backend"

echo "[1/2] Installing Python dependencies..."
pip install -r requirements.txt --quiet 2>/dev/null || python3 -m pip install -r requirements.txt --quiet

echo
echo "[2/2] Starting Synapse Live Debug framework..."
echo
echo "  Dashboard UI:  http://localhost:8421"
echo "  API Docs:      http://localhost:8421/docs"
echo
echo "  Usage:"
echo "    python main.py                                Start (debug this project)"
echo "    python main.py --project-root /path/to/proj   Debug another project"
echo "    python main.py --port 9000 --open              Custom port + open browser"
echo "    python main.py --no-watch                      Disable file watcher"
echo
echo "Press Ctrl+C to stop."
echo "======================================="
echo

python3 main.py --open
