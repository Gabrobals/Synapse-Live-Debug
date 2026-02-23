@echo off
title Synapse Live Debug
echo =======================================
echo   Synapse Live Debug - Starting...
echo =======================================
echo.

cd /d "%~dp0backend"

echo [1/2] Installing Python dependencies...
pip install -r requirements.txt --quiet 2>nul
if errorlevel 1 (
    echo WARNING: pip install had issues. Trying with python -m pip...
    python -m pip install -r requirements.txt --quiet 2>nul
)

echo.
echo [2/2] Starting Synapse Live Debug framework...
echo.
echo   Dashboard UI:  http://localhost:8421
echo   API Docs:      http://localhost:8421/docs
echo.
echo   Usage:
echo     python main.py                                Start (debug this project)
echo     python main.py --project-root C:\my\project    Debug another project
echo     python main.py --port 9000 --open              Custom port + open browser
echo     python main.py --no-watch                      Disable file watcher
echo.
echo Press Ctrl+C to stop.
echo =======================================
echo.

python main.py --open

pause
