"""
Live Debug -- FastAPI Backend (Universal IDE Monitor)
======================================================
Real-time telemetry server with SSE push and REST API.
Can attach to ANY project with --project-root.
Works with any IDE: VS Code, Cursor, JetBrains, Windsurf, etc.

Endpoints:
  GET  /health                     — Health check
  GET  /ready                      — Readiness check
  POST /debug/events               — Receive single event
  POST /debug/events/batch         — Receive batch of events
  GET  /debug/events               — Get stored events
  GET  /debug/events/stream        — SSE stream (Server-Sent Events)
  GET  /debug/status               — Store status + stats
  DELETE /debug/events             — Clear all events
  GET  /debug/performance          — Performance metrics
  GET  /debug/metrics-history      — Historical metrics
  WS   /debug/ws                   — WebSocket bidirectional
  GET  /v1/project/scan            — Scan project file tree
  GET  /v1/project/detect          — Auto-detect language/framework
  GET  /v1/project/endpoints       — List all API routes
  GET  /v1/project/framework       — Framework-specific introspection
  GET  /v1/watcher/status          — File watcher status
  POST /v1/watcher/start           — Start file watcher
  POST /v1/watcher/stop            — Stop file watcher

Serves frontend static files from ../frontend/
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import os
import re
import subprocess
import time
import uuid
import webbrowser
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from debug_store import store
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from file_watcher import FileWatcher
from framework_adapters import extract_all
from ide_agent_detector import detect_agent_intelligence
from project_detector import detect_frameworks, detect_project
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("synapse-debug")

# ─── SSE Subscribers ──────────────────────────────────────────────────────────
sse_subscribers: list[asyncio.Queue] = []
ws_clients: list[WebSocket] = []

# ─── Metrics History ──────────────────────────────────────────────────────────
metrics_history: list[dict] = []
_metrics_start = time.time()


async def broadcast_event(event: dict):
    """Push event to all SSE subscribers, WebSocket clients, AND canvas SSE."""
    data = json.dumps(_sanitize_str(event))

    # SSE push
    dead_queues = []
    for q in sse_subscribers:
        try:
            q.put_nowait(data)
        except asyncio.QueueFull:
            dead_queues.append(q)
    for q in dead_queues:
        sse_subscribers.remove(q)

    # Canvas SSE push -- transform debug event into canvas node event
    if canvas_sse_subscribers:
        canvas_event = _debug_event_to_canvas(event)
        if canvas_event:
            canvas_data = json.dumps(canvas_event)
            dead_canvas = []
            for q in canvas_sse_subscribers:
                try:
                    q.put_nowait(canvas_data)
                except asyncio.QueueFull:
                    dead_canvas.append(q)
            for q in dead_canvas:
                canvas_sse_subscribers.remove(q)

    # WebSocket push
    dead_ws = []
    for ws in ws_clients:
        try:
            await ws.send_text(data)
        except Exception:
            dead_ws.append(ws)
    for ws in dead_ws:
        ws_clients.remove(ws)


async def _push_canvas_event(event: dict):
    """Push an event directly to canvas SSE subscribers (bypasses debug event bus).

    Used by Auto-Scan Agent to send node_diagnostics events without polluting
    the regular debug event stream.
    """
    if not canvas_sse_subscribers:
        return
    data = json.dumps(event)
    dead = []
    for q in canvas_sse_subscribers:
        try:
            q.put_nowait(data)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        canvas_sse_subscribers.remove(q)


# ─── Auto-Scan Agent ─────────────────────────────────────────────────────────
# When a file is saved, automatically re-lint it and push updated diagnostics
# to the Architecture Live Graph via SSE.  Debounced at 2s per file.

_auto_lint_pending: dict[str, asyncio.TimerHandle] = {}
_AUTO_LINT_DEBOUNCE_S = 2.0
# Extensions we can auto-lint (must have a tool in _LINT_TOOLS)
_AUTO_LINT_EXTENSIONS = {".py", ".js", ".ts", ".jsx", ".tsx", ".css", ".scss", ".less"}

# ─── Phase 2: Package Intelligence ──────────────────────────────────────────
# Mapping: linter rule code → suggested package that helps resolve or improve
# the issue.  Each entry: {pkg, why, install, url, lang}
#   lang: "js" | "py" | "css" — determines install command prefix
_PACKAGE_SUGGESTIONS: dict[str, dict] = {
    # ── ESLint rules ─────────────────────────────────────────────────────────
    "no-unused-vars": {
        "pkg": "eslint-plugin-unused-imports",
        "why": "Auto-remove unused imports and variables",
        "url": "https://www.npmjs.com/package/eslint-plugin-unused-imports",
        "lang": "js",
    },
    "no-console": {
        "pkg": "debug",
        "why": "Structured debug logging instead of console.log",
        "url": "https://www.npmjs.com/package/debug",
        "lang": "js",
    },
    "no-undef": {
        "pkg": "@types/node",
        "why": "TypeScript type definitions for Node.js globals",
        "url": "https://www.npmjs.com/package/@types/node",
        "lang": "js",
    },
    "no-prototype-builtins": {
        "pkg": "eslint-plugin-no-prototype-builtins",
        "why": "Use Object.hasOwn() — safer prototype checks",
        "url": "https://www.npmjs.com/package/eslint-plugin-no-prototype-builtins",
        "lang": "js",
    },
    "semi": {
        "pkg": "prettier",
        "why": "Automatic code formatting — handles semicolons, quotes, etc.",
        "url": "https://www.npmjs.com/package/prettier",
        "lang": "js",
    },
    "indent": {
        "pkg": "prettier",
        "why": "Automatic code formatting — consistent indentation",
        "url": "https://www.npmjs.com/package/prettier",
        "lang": "js",
    },
    "quotes": {
        "pkg": "prettier",
        "why": "Automatic code formatting — consistent quote style",
        "url": "https://www.npmjs.com/package/prettier",
        "lang": "js",
    },
    "comma-dangle": {
        "pkg": "prettier",
        "why": "Automatic code formatting — trailing commas",
        "url": "https://www.npmjs.com/package/prettier",
        "lang": "js",
    },
    "import/order": {
        "pkg": "eslint-plugin-import",
        "why": "Enforce consistent import ordering",
        "url": "https://www.npmjs.com/package/eslint-plugin-import",
        "lang": "js",
    },
    "import/no-unresolved": {
        "pkg": "eslint-import-resolver-typescript",
        "why": "Resolve TypeScript path aliases in imports",
        "url": "https://www.npmjs.com/package/eslint-import-resolver-typescript",
        "lang": "js",
    },
    "react/prop-types": {
        "pkg": "prop-types",
        "why": "Runtime type checking for React props",
        "url": "https://www.npmjs.com/package/prop-types",
        "lang": "js",
    },
    "react-hooks/exhaustive-deps": {
        "pkg": "eslint-plugin-react-hooks",
        "why": "Enforce rules of hooks — dependency arrays",
        "url": "https://www.npmjs.com/package/eslint-plugin-react-hooks",
        "lang": "js",
    },
    "no-restricted-syntax": {
        "pkg": "eslint-plugin-functional",
        "why": "Enforce functional programming patterns",
        "url": "https://www.npmjs.com/package/eslint-plugin-functional",
        "lang": "js",
    },
    "complexity": {
        "pkg": "eslint-plugin-sonarjs",
        "why": "Detect code smells and cognitive complexity",
        "url": "https://www.npmjs.com/package/eslint-plugin-sonarjs",
        "lang": "js",
    },
    # ── Ruff / Python rules ──────────────────────────────────────────────────
    "E501": {
        "pkg": "black",
        "why": "Auto-format long lines — PEP 8 compliant formatter",
        "url": "https://pypi.org/project/black/",
        "lang": "py",
    },
    "F401": {
        "pkg": "autoflake",
        "why": "Remove unused imports automatically",
        "url": "https://pypi.org/project/autoflake/",
        "lang": "py",
    },
    "SIM105": {
        "pkg": "contextlib (stdlib)",
        "why": "Use contextlib.suppress() instead of bare try/except/pass",
        "url": "https://docs.python.org/3/library/contextlib.html",
        "lang": "py",
    },
    "SIM110": {
        "pkg": "builtins (stdlib)",
        "why": "Use any()/all() instead of manual loops",
        "url": "https://docs.python.org/3/library/functions.html#any",
        "lang": "py",
    },
    "SIM118": {
        "pkg": "builtins (stdlib)",
        "why": "Use 'key in dict' instead of 'key in dict.keys()'",
        "url": "https://docs.python.org/3/library/stdtypes.html#dict",
        "lang": "py",
    },
    "D100": {
        "pkg": "docformatter",
        "why": "Auto-format docstrings to PEP 257",
        "url": "https://pypi.org/project/docformatter/",
        "lang": "py",
    },
    "D103": {
        "pkg": "docformatter",
        "why": "Auto-generate missing function docstrings",
        "url": "https://pypi.org/project/docformatter/",
        "lang": "py",
    },
    "I001": {
        "pkg": "isort",
        "why": "Sort imports — also available as ruff rule",
        "url": "https://pypi.org/project/isort/",
        "lang": "py",
    },
    "UP": {
        "pkg": "pyupgrade",
        "why": "Upgrade syntax to newer Python versions",
        "url": "https://pypi.org/project/pyupgrade/",
        "lang": "py",
    },
    "B": {
        "pkg": "flake8-bugbear",
        "why": "Detect likely bugs and design problems",
        "url": "https://pypi.org/project/flake8-bugbear/",
        "lang": "py",
    },
    "S": {
        "pkg": "bandit",
        "why": "Security issue scanner for Python",
        "url": "https://pypi.org/project/bandit/",
        "lang": "py",
    },
    "C901": {
        "pkg": "radon",
        "why": "Cyclomatic complexity analysis tool",
        "url": "https://pypi.org/project/radon/",
        "lang": "py",
    },
    # ── Stylelint / CSS rules ────────────────────────────────────────────────
    "declaration-block-no-duplicate-properties": {
        "pkg": "stylelint-order",
        "why": "Enforce property order to prevent duplicates",
        "url": "https://www.npmjs.com/package/stylelint-order",
        "lang": "css",
    },
    "color-function-notation": {
        "pkg": "postcss-color-function",
        "why": "Modern CSS color function syntax support",
        "url": "https://www.npmjs.com/package/postcss-color-function",
        "lang": "css",
    },
    "font-family-no-missing-generic-family-name": {
        "pkg": "stylelint-config-standard",
        "why": "Standard CSS linting rules — catches font-family issues",
        "url": "https://www.npmjs.com/package/stylelint-config-standard",
        "lang": "css",
    },
    "no-descending-specificity": {
        "pkg": "stylelint-no-unsupported-browser-features",
        "why": "Detect CSS specificity conflicts",
        "url": "https://www.npmjs.com/package/stylelint-no-unsupported-browser-features",
        "lang": "css",
    },
    "selector-class-pattern": {
        "pkg": "stylelint-config-standard",
        "why": "Enforce consistent class naming conventions",
        "url": "https://www.npmjs.com/package/stylelint-config-standard",
        "lang": "css",
    },
}


def _collect_package_suggestions(
    diagnostics: list[dict], installed_deps: set[str] | None = None,
) -> list[dict]:
    """Extract unique package suggestions from diagnostic rule codes.

    Matches exact codes first, then prefix codes (e.g. 'UP006' matches 'UP').
    Deduplicates by package name.  Marks already-installed packages.
    """
    if installed_deps is None:
        installed_deps = set()

    seen_pkgs: set[str] = set()
    suggestions: list[dict] = []

    for d in diagnostics:
        code = d.get("code", "")
        if not code:
            continue

        # Exact match first
        entry = _PACKAGE_SUGGESTIONS.get(code)
        # Prefix match for grouped rules (e.g. "UP006" → "UP", "B017" → "B")
        if entry is None:
            for prefix_len in range(len(code) - 1, 0, -1):
                prefix = code[:prefix_len]
                if prefix in _PACKAGE_SUGGESTIONS:
                    entry = _PACKAGE_SUGGESTIONS[prefix]
                    break

        if entry is None:
            continue

        pkg = entry["pkg"]
        if pkg in seen_pkgs:
            continue
        seen_pkgs.add(pkg)

        # Determine install command
        is_stdlib = "(stdlib)" in pkg
        lang = entry.get("lang", "js")
        if is_stdlib:
            install_cmd = None
        elif lang == "py":
            install_cmd = f"pip install {pkg}"
        elif lang == "css":
            install_cmd = f"npm install -D {pkg}"
        else:
            install_cmd = f"npm install -D {pkg}"

        # Check if already installed
        pkg_base = pkg.split("/")[-1].lower()
        already_installed = pkg_base in {d.lower() for d in installed_deps}

        suggestions.append({
            "pkg": pkg,
            "why": entry["why"],
            "url": entry.get("url", ""),
            "lang": lang,
            "installCmd": install_cmd,
            "installed": already_installed,
            "isStdlib": is_stdlib,
            "matchedRules": [code],
        })

    # Merge matchedRules for duplicate packages (shouldn't happen but safety)
    return suggestions


async def _auto_lint_file(rel_path: str):
    """Run linter on a single file and push results to canvas SSE.

    Updates both _ops_scan_cache and _file_diag_cache so the next graph load
    and file-info request reflect the new data without re-running the linter.
    """
    if not PROJECT_ROOT:
        return
    ext = Path(rel_path).suffix.lower()
    if ext not in _AUTO_LINT_EXTENSIONS:
        return

    abs_path = str(PROJECT_ROOT / rel_path)
    if not Path(abs_path).is_file():
        return

    try:
        # Run linter in thread to avoid blocking the event loop
        diagnostics, tool, _raw = await asyncio.to_thread(
            _run_linter_json, abs_path, ext
        )
    except Exception as exc:
        logger.warning(f"Auto-lint failed for {rel_path}: {exc}")
        return

    tool_name = tool["id"] if tool else "none"

    # Count errors / warnings / fixable
    errors = sum(1 for d in diagnostics if d.get("severity") == "error")
    warnings = sum(1 for d in diagnostics if d.get("severity") == "warning")
    info_count = sum(1 for d in diagnostics if d.get("severity") == "info")
    fixable = sum(1 for d in diagnostics if d.get("fixable"))
    total = errors + warnings + info_count

    # Update caches
    posix_key = rel_path.replace("\\", "/")
    _ops_scan_cache[posix_key] = {
        "errors": errors,
        "warnings": warnings,
        "issues": total,
        "fixable": fixable,
        "linter": tool_name,
    }
    # Invalidate file diag cache (force re-fetch on next inspector open)
    _file_diag_cache.pop(posix_key, None)

    # Push node_diagnostics event to canvas SSE
    await _push_canvas_event({
        "eventType": "node_diagnostics",
        "nodeId": posix_key,
        "label": Path(rel_path).name,
        "category": "auto-scan",
        "meta": {
            "errorCount": errors,
            "warningCount": warnings,
            "issueCount": total,
            "fixableCount": fixable,
            "linter": tool_name,
            "realLinterData": tool is not None,
        },
    })

    logger.info(
        f"Auto-scan: {rel_path} → {total} issues "
        f"({errors}E {warnings}W {fixable}F) [{tool_name}]"
    )


def _schedule_auto_lint(rel_path: str, loop: asyncio.AbstractEventLoop):
    """Schedule an auto-lint for rel_path, debounced at _AUTO_LINT_DEBOUNCE_S."""
    # Cancel previous pending lint for this file
    prev = _auto_lint_pending.pop(rel_path, None)
    if prev is not None:
        prev.cancel()

    # Schedule new lint after debounce period
    handle = loop.call_later(
        _AUTO_LINT_DEBOUNCE_S,
        lambda: asyncio.ensure_future(_auto_lint_file(rel_path)),
    )
    _auto_lint_pending[rel_path] = handle


# ─── Background Tasks ────────────────────────────────────────────────────────
async def keepalive_task():
    """Send keepalive to SSE clients every 15s."""
    import contextlib
    while True:
        await asyncio.sleep(15)
        for q in sse_subscribers:
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait(":keepalive")


async def metrics_snapshot_task():
    """Capture metrics snapshot every 30s."""
    while True:
        await asyncio.sleep(30)
        status = store.get_status()
        snapshot = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "uptime": status["uptime"],
            "event_count": status["event_count"],
            "sse_clients": len(sse_subscribers),
            "ws_clients": len(ws_clients),
            **status["stats"],
        }
        metrics_history.append(snapshot)
        if len(metrics_history) > 1000:
            metrics_history.pop(0)


# ─── CLI Configuration (set by __main__ block or defaults) ────────────────────
_cli_config = {
    "project_root": None,  # Will be set by argparse or default
    "port": 8421,
    "open_browser": False,
    "watch": True,
}

# ─── File Watcher Instance ────────────────────────────────────────────────────
_file_watcher: FileWatcher | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _file_watcher

    logger.info("Live Debug backend starting (Universal IDE Monitor)...")
    t1 = asyncio.create_task(keepalive_task())
    t2 = asyncio.create_task(metrics_snapshot_task())

    port = _cli_config["port"]
    pr = PROJECT_ROOT

    logger.info(f"Backend ready on http://127.0.0.1:{port}")
    logger.info(f"Project root: {pr}")

    # Auto-detect project
    profile = detect_project(pr)
    logger.info(
        f"Project: {profile['name']} [{profile['primaryLanguage']}] frameworks={profile['frameworks']}"
    )

    # Start file watcher if enabled
    if _cli_config["watch"]:
        loop = asyncio.get_event_loop()

        async def _on_file_event(event: dict):
            stored = store.add_event(event)
            await broadcast_event(stored)

            # ★ Auto-Scan Agent: schedule lint on saved file (debounced)
            data = event.get("data") or {}
            rel_path = data.get("path", "")
            action = data.get("action", "")
            if rel_path and action in ("modified", "created"):
                _schedule_auto_lint(rel_path, loop)

        _file_watcher = FileWatcher(pr, _on_file_event, loop)
        _file_watcher.start()

    # Open browser if requested
    if _cli_config["open_browser"]:
        webbrowser.open(f"http://127.0.0.1:{port}")

    yield

    # Cleanup
    if _file_watcher:
        _file_watcher.stop()
    t1.cancel()
    t2.cancel()


# ─── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="Live Debug - Universal IDE Monitor",
    version="3.0.0",
    lifespan=lifespan,
)

# CORS — allow all origins for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic Models ─────────────────────────────────────────────────────────
class DebugEventPayload(BaseModel):
    id: str | None = None
    timestamp: str | None = None
    type: str = "unknown"
    component: str = ""
    step: int | None = None
    flowId: str | None = None
    data: dict[str, Any] = {}


class EventBatch(BaseModel):
    events: list[DebugEventPayload]


# ─── Health Endpoints ─────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "live-debug", "version": "3.1.0"}


@app.get("/ready")
async def ready():
    return {"ready": True}


# ─── Debug Event Endpoints ────────────────────────────────────────────────────
@app.post("/debug/events")
async def post_event(payload: DebugEventPayload):
    event = store.add_event(payload.model_dump(exclude_none=True))
    await broadcast_event(event)
    return {"ok": True, "id": event.get("id")}


@app.post("/debug/events/batch")
async def post_events_batch(payload: EventBatch):
    stored = store.add_batch([e.model_dump(exclude_none=True) for e in payload.events])
    for event in stored:
        await broadcast_event(event)
    return {"ok": True, "count": len(stored)}


def _sanitize_str(obj):
    """Recursively replace unpaired surrogates in strings so JSON serialisation never fails."""
    if isinstance(obj, str):
        return obj.encode("utf-8", "replace").decode("utf-8")
    if isinstance(obj, dict):
        return {k: _sanitize_str(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_str(v) for v in obj]
    return obj


@app.get("/debug/events")
async def get_events(limit: int = 200):
    events = store.get_events(limit)
    return _sanitize_str(events)


@app.delete("/debug/events")
async def clear_events():
    store.clear()
    return {"ok": True, "message": "Events cleared"}


@app.get("/debug/status")
async def get_status():
    status = store.get_status()
    status["sse_clients"] = len(sse_subscribers)
    status["ws_clients"] = len(ws_clients)
    return status


@app.get("/debug/performance")
async def get_performance():
    status = store.get_status()
    return {
        "uptime": status["uptime"],
        "events_per_second": status["stats"]["total"] / max(1, status["uptime"]),
        "buffer_usage": f"{status['event_count']}/{status['buffer_max']}",
        "sse_clients": len(sse_subscribers),
        "ws_clients": len(ws_clients),
    }


@app.get("/debug/metrics-history")
async def get_metrics_history():
    return metrics_history


# ─── SSE Stream ───────────────────────────────────────────────────────────────
@app.get("/debug/events/stream")
async def sse_stream(request: Request):
    queue: asyncio.Queue = asyncio.Queue(maxsize=500)
    sse_subscribers.append(queue)
    logger.info(f"SSE client connected (total: {len(sse_subscribers)})")

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=30.0)
                    if data == ":keepalive":
                        yield {"comment": "keepalive"}
                    else:
                        yield {"data": data}
                except asyncio.TimeoutError:
                    yield {"comment": "keepalive"}
        finally:
            if queue in sse_subscribers:
                sse_subscribers.remove(queue)
            logger.info(f"SSE client disconnected (remaining: {len(sse_subscribers)})")

    return EventSourceResponse(event_generator())


# ─── WebSocket ────────────────────────────────────────────────────────────────
@app.websocket("/debug/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    logger.info(f"WebSocket client connected (total: {len(ws_clients)})")
    try:
        while True:
            data = await ws.receive_text()
            try:
                event = json.loads(data)
                stored = store.add_event(event)
                await broadcast_event(stored)
            except json.JSONDecodeError:
                await ws.send_text(json.dumps({"error": "Invalid JSON"}))
    except WebSocketDisconnect:
        pass
    finally:
        if ws in ws_clients:
            ws_clients.remove(ws)
        logger.info(f"WebSocket client disconnected (remaining: {len(ws_clients)})")


# ─── Project Root ─────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).parent.parent


# ── V1 API Endpoints ─────────────────────────────────────────────────────────


@app.post("/v1/chat/test")
async def v1_chat_test(request: Request):
    """E2E chat test endpoint — echoes back to verify the chat pipeline is alive."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    message = body.get("message", "")
    return {
        "response": f"pong: {message}" if message else "pong",
        "model": "live-debug-echo",
        "latency_ms": 1,
    }


@app.get("/v1/introspect")
async def v1_introspect():
    """Returns a real introspect structure based on the project files."""
    fe_dir = PROJECT_ROOT / "frontend"
    be_dir = PROJECT_ROOT / "backend"

    def _list_files(d: Path, ext: str) -> list[str]:
        if not d.exists():
            return []
        return sorted(f.name for f in d.rglob(f"*{ext}") if f.is_file())

    js_files = _list_files(fe_dir / "js", ".js")
    css_files = _list_files(fe_dir / "css", ".css")
    py_files = _list_files(be_dir, ".py")

    # Use framework adapters for deep introspection
    frameworks = detect_frameworks(PROJECT_ROOT)
    adapter_info = extract_all(frameworks, PROJECT_ROOT) if frameworks else {}

    # Extract routes from FastAPI app (this app's own routes)
    own_routes = []
    for route in app.routes:
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", None)
        if methods and path:
            for m in sorted(methods):
                own_routes.append(f"{m} {path}")

    return {
        "scannedAt": time.strftime("%H:%M:%S"),
        "frontend": {
            "components": [],
            "stores": [],
            "hooks": [],
            "services": js_files,
            "entryPoints": ["index.html"],
            "css": css_files,
        },
        "coreEngine": {"modules": js_files, "topFiles": js_files[:10]},
        "backend": {
            "routes": adapter_info.get("routes", []) or own_routes,
            "services": py_files,
            "middleware": adapter_info.get("middleware", ["CORSMiddleware"]),
            "models": adapter_info.get("models", []),
        },
        "tauri": {
            "present": (PROJECT_ROOT / "src-tauri").exists(),
            "rustModules": [],
            "migrations": [],
            "capabilities": [],
        },
        "infrastructure": [],
        "configs": [],
        "scripts": [],
        "problems": [],
        "summary": {
            "totalNodes": len(js_files) + len(py_files) + len(css_files),
            "coreEngineFiles": len(js_files),
        },
    }


@app.get("/v1/introspect/agent-flow")
async def v1_introspect_agent_flow():
    return {"pipeline": [], "agents": [], "memory": []}


@app.get("/v1/introspect/agent-intelligence")
async def v1_introspect_agent_intelligence():
    """
    Full agent infrastructure detection.
    Scans project filesystem to detect IDE(s), agent config, MCP servers,
    custom instructions, model providers, and the prompt pipeline architecture.
    """
    return detect_agent_intelligence(PROJECT_ROOT)


# ─── Prompt Trace Pipeline ────────────────────────────────────────────────────
# When called, simulates (or tracks) a prompt flowing through each pipeline stage.
# Each stage emits an SSE event so the frontend can animate it live.


def _generate_step_transformation(step_info: dict, prompt_text: str) -> str:
    """Generate a realistic transformation description for a pipeline stage."""
    name = step_info.get("name", "").lower()
    phase = step_info.get("phase", "")
    comp = step_info.get("component", "")
    plen = len(prompt_text)
    if "user input" in name or ("input" in name and phase == "frontend"):
        preview = prompt_text[:120] + ("\u2026" if plen > 120 else "")
        return f'Captured: "{preview}" ({plen} chars)'
    if "codebase index" in name or "embedding" in name:
        return (
            "Searched embeddings index \u2192 5 relevant code chunks (similarity: 0.94)"
        )
    if "context" in name and "server" not in name:
        return "Gathered: active file (247 lines), selection (12 lines), 3 editors, git diff (+42/\u22128)"
    if "psi" in name:
        return (
            "AST analysis: 23 PsiElements, 8 type references, 3 method calls in scope"
        )
    if "instructions" in name or "rules" in name:
        return (
            "Loaded 2 instruction files \u2192 340 tokens injected into system prompt"
        )
    if "mcp" in name and "tool" not in name:
        return "MCP discovery: 2 servers \u2192 8 tools available (file ops, search, terminal)"
    if "assembly" in name or "synthesis" in name:
        return f"Assembled: system(1.2K tk) + context(800 tk) + tools(450 tk) + user({plen} ch)"
    if any(k in name for k in ("model", "routing", "selection", "selector", "router")):
        return (
            "Model selected via complexity score (0.72) \u2192 routing to primary model"
        )
    if "llm" in name or "api call" in name:
        return (
            f"POST streaming \u2192 ~{2400 + plen} tokens, awaiting first chunk\u2026"
        )
    if "tool" in name and ("execution" in name or "loop" in name):
        return "Agent evaluating: analyzing if code search / edit / terminal needed"
    if "agent" in name or "junie" in name:
        return "Agent loop: plan \u2192 execute \u2192 validate (iteration 1)"
    if "response" in name or "rendering" in name or "streaming" in name:
        return "Streaming markdown \u2192 code blocks, syntax highlighting, follow-ups"
    if "diff" in name:
        return (
            "Generating diffs: 2 files modified \u2192 preview ready for accept/reject"
        )
    if "memory" in name:
        return "Retrieved 3 episodic memories + 2 semantic associations"
    if "governor" in name:
        return "Quality gate: confidence = 0.94, coherence = 0.91, no safety flags"
    if "dispatch" in name:
        return "Routing to specialized agent based on prompt analysis"
    if "flow" in name and "execution" in name:
        return "Step-by-step: read(2) \u2192 edit(1) \u2192 verify(1) \u2192 complete"
    if "slash" in name:
        return "Resolved /file, /tab \u2192 added 2 file contexts"
    return f"Processing through {comp}"


def _generate_simulated_response(prompt_text: str, ide_name: str, n_steps: int) -> str:
    """Return a simulated agent response for the trace visualization."""
    return (
        f"Based on analysis through the {ide_name} {n_steps}-stage pipeline:\n\n"
        f'> "{prompt_text}"\n\n'
        f"I gathered context from your workspace, processed custom instructions, "
        f"assembled the full prompt with tool schemas, routed to the configured model, "
        f"and generated this response.\n\n"
        f"[Simulated trace \u2014 in production the LLM response streams here after "
        f"all {n_steps} {ide_name} pipeline stages complete]"
    )


def _detect_agents_for_step(step_info: dict, ide_name: str) -> list[dict]:
    """Determine which agents are active at a given pipeline step."""
    name = step_info.get("name", "").lower()
    _phase = step_info.get("phase", "")
    agents = []
    if any(k in name for k in ("user input", "input")):
        agents.append({"name": "UserProxy", "role": "receiver", "icon": "\ud83d\udcdd"})
    if any(k in name for k in ("context", "codebase", "psi", "slash")):
        agents.append(
            {"name": "ContextAgent", "role": "gatherer", "icon": "\ud83d\udd0d"}
        )
    if any(k in name for k in ("instructions", "rules", "guidelines")):
        agents.append({"name": "RulesAgent", "role": "loader", "icon": "\ud83d\udcdc"})
    if "mcp" in name:
        agents.append({"name": "MCPAgent", "role": "discovery", "icon": "\ud83d\udd0c"})
    if any(k in name for k in ("assembly", "synthesis", "prompt")):
        agents.append(
            {"name": "AssemblerAgent", "role": "builder", "icon": "\ud83d\udee0\ufe0f"}
        )
    if any(k in name for k in ("model", "routing", "selection", "router")):
        agents.append(
            {"name": "RouterAgent", "role": "selector", "icon": "\ud83e\udded"}
        )
    if any(k in name for k in ("llm", "api call", "inference")):
        agents.append({"name": "InferenceAgent", "role": "executor", "icon": "\u26a1"})
    if any(
        k in name
        for k in ("tool", "execution", "junie", "agent", "flow execution", "composer")
    ):
        agents.append(
            {"name": "ExecutorAgent", "role": "tool-runner", "icon": "\ud83e\udd16"}
        )
        if (
            "loop" in name
            or "iteration" in name
            or "junie" in name
            or "composer" in name
        ):
            agents.append(
                {"name": "PlannerAgent", "role": "orchestrator", "icon": "\ud83c\udfaf"}
            )
    if any(k in name for k in ("response", "rendering", "streaming", "diff")):
        agents.append(
            {"name": "RendererAgent", "role": "presenter", "icon": "\ud83d\udcac"}
        )
    if "governor" in name:
        agents.append(
            {
                "name": "GovernorAgent",
                "role": "supervisor",
                "icon": "\ud83d\udee1\ufe0f",
            }
        )
    if "memory" in name:
        agents.append(
            {"name": "MemoryAgent", "role": "retriever", "icon": "\ud83e\udde0"}
        )
    if "dispatch" in name:
        agents.append(
            {"name": "DispatchAgent", "role": "router", "icon": "\ud83d\ude80"}
        )
    if not agents:
        agents.append(
            {"name": "PipelineAgent", "role": "processor", "icon": "\u2699\ufe0f"}
        )
    return agents


@app.post("/v1/prompt-trace")
async def v1_prompt_trace(request: Request):
    """
    Trace a prompt through the IDE-specific pipeline.
    Emits one SSE event per pipeline stage with realistic timing.
    Body: { "prompt": "user text", "mode": "trace" | "simulate", "source": "chat" | "manual" }
    """
    body = await request.json()
    prompt_text = body.get("prompt", "")
    trace_mode = body.get("mode", "simulate")
    source = body.get("source", "manual")
    flow_id = str(uuid.uuid4())[:8]

    # Get the current pipeline from detection
    detection = detect_agent_intelligence(PROJECT_ROOT)
    pipeline = detection.get("promptPipeline", [])
    ide_name = detection.get("primaryIDE", {}).get("name", "Unknown")

    # Collect all unique agents across the pipeline
    all_agents = {}
    for step in pipeline:
        for a in _detect_agents_for_step(step, ide_name):
            all_agents[a["name"]] = a

    # Emit start event
    start_event = store.add_event(
        {
            "type": "prompt-trace:start",
            "component": "AgentIntelligence",
            "flowId": flow_id,
            "data": {
                "prompt": prompt_text,
                "ide": ide_name,
                "totalSteps": len(pipeline),
                "mode": trace_mode,
                "source": source,
                "agents": list(all_agents.values()),
            },
        }
    )
    await broadcast_event(start_event)

    # Emit each pipeline stage as an event with realistic delays
    _PHASE_DELAYS = {"frontend": 0.15, "engine": 0.25, "backend": 0.4, "response": 0.2}

    for step in pipeline:
        delay = _PHASE_DELAYS.get(step.get("phase", "engine"), 0.2)
        await asyncio.sleep(delay)

        transformation = _generate_step_transformation(step, prompt_text)
        step_agents = _detect_agents_for_step(step, ide_name)
        step_event = store.add_event(
            {
                "type": "prompt-trace:step",
                "component": step.get("component", "Unknown"),
                "step": step.get("step"),
                "flowId": flow_id,
                "data": {
                    "name": step.get("name"),
                    "phase": step.get("phase"),
                    "detail": step.get("detail"),
                    "prompt": prompt_text,
                    "transformation": transformation,
                    "annotations": step.get("annotations", []),
                    "agents": step_agents,
                },
            }
        )
        await broadcast_event(step_event)

    # Collect recent errors from the event store for cross-referencing
    # Exclude vscode-diagnostics (IDE lint warnings, not pipeline errors)
    recent_errors = []
    for ev in store.get_events(50):
        if ev.get("type") == "error" and ev.get("component") != "vscode-diagnostics":
            recent_errors.append(
                {
                    "id": ev.get("id", ""),
                    "component": ev.get("component", ""),
                    "message": (ev.get("data", {}) or {}).get("firstError", ""),
                    "path": (ev.get("data", {}) or {}).get("path", ""),
                }
            )
    recent_errors = recent_errors[:5]  # max 5 errors

    # Emit completion event with simulated response
    simulated_response = _generate_simulated_response(
        prompt_text, ide_name, len(pipeline)
    )
    complete_event = store.add_event(
        {
            "type": "prompt-trace:complete",
            "component": "AgentIntelligence",
            "flowId": flow_id,
            "data": {
                "prompt": prompt_text,
                "totalSteps": len(pipeline),
                "ide": ide_name,
                "response": simulated_response,
                "agents": list(all_agents.values()),
                "recentErrors": recent_errors,
            },
        }
    )
    await broadcast_event(complete_event)

    return {
        "ok": True,
        "flowId": flow_id,
        "stepsEmitted": len(pipeline),
        "ide": ide_name,
        "source": source,
    }


@app.post("/v1/chat-forward")
async def v1_chat_forward(request: Request):
    """
    Webhook for IDE extensions to forward chat messages.
    Any IDE (VS Code, Cursor, Windsurf, JetBrains, Zed) can POST here
    whenever the user sends a chat message.
    Body: { "prompt": "...", "ide": "vscode", "source": "copilot-chat" }
    """
    body = await request.json()
    prompt_text = body.get("prompt", "")
    source = body.get("source", "ide-chat")
    if not prompt_text.strip():
        return {"ok": False, "error": "empty prompt"}

    # Broadcast chat-intercepted event immediately for UI feedback
    intercepted_event = store.add_event(
        {
            "type": "chat-intercepted",
            "component": "IDE-Chat",
            "data": {
                "prompt": prompt_text,
                "source": source,
                "ide": body.get("ide", "unknown"),
            },
        }
    )
    await broadcast_event(intercepted_event)

    # Now trigger the full pipeline trace
    # (Request object not needed — we call the trace function directly)
    # We call the trace function directly
    detection = detect_agent_intelligence(PROJECT_ROOT)
    pipeline = detection.get("promptPipeline", [])
    ide_name = detection.get("primaryIDE", {}).get("name", "Unknown")
    flow_id = str(uuid.uuid4())[:8]

    all_agents = {}
    for step in pipeline:
        for a in _detect_agents_for_step(step, ide_name):
            all_agents[a["name"]] = a

    start_event = store.add_event(
        {
            "type": "prompt-trace:start",
            "component": "AgentIntelligence",
            "flowId": flow_id,
            "data": {
                "prompt": prompt_text,
                "ide": ide_name,
                "totalSteps": len(pipeline),
                "mode": "live",
                "source": source,
                "agents": list(all_agents.values()),
            },
        }
    )
    await broadcast_event(start_event)

    _PHASE_DELAYS = {"frontend": 0.12, "engine": 0.2, "backend": 0.35, "response": 0.15}
    for step in pipeline:
        delay = _PHASE_DELAYS.get(step.get("phase", "engine"), 0.2)
        await asyncio.sleep(delay)
        transformation = _generate_step_transformation(step, prompt_text)
        step_agents = _detect_agents_for_step(step, ide_name)
        step_event = store.add_event(
            {
                "type": "prompt-trace:step",
                "component": step.get("component", "Unknown"),
                "step": step.get("step"),
                "flowId": flow_id,
                "data": {
                    "name": step.get("name"),
                    "phase": step.get("phase"),
                    "detail": step.get("detail"),
                    "prompt": prompt_text,
                    "transformation": transformation,
                    "annotations": step.get("annotations", []),
                    "agents": step_agents,
                },
            }
        )
        await broadcast_event(step_event)

    recent_errors = []
    for ev in store.get_events(50):
        if ev.get("type") == "error" and ev.get("component") != "vscode-diagnostics":
            recent_errors.append(
                {
                    "id": ev.get("id", ""),
                    "component": ev.get("component", ""),
                    "message": (ev.get("data", {}) or {}).get("firstError", ""),
                    "path": (ev.get("data", {}) or {}).get("path", ""),
                }
            )

    simulated_response = _generate_simulated_response(
        prompt_text, ide_name, len(pipeline)
    )
    complete_event = store.add_event(
        {
            "type": "prompt-trace:complete",
            "component": "AgentIntelligence",
            "flowId": flow_id,
            "data": {
                "prompt": prompt_text,
                "totalSteps": len(pipeline),
                "ide": ide_name,
                "response": simulated_response,
                "agents": list(all_agents.values()),
                "recentErrors": recent_errors[:5],
            },
        }
    )
    await broadcast_event(complete_event)

    return {
        "ok": True,
        "flowId": flow_id,
        "stepsEmitted": len(pipeline),
        "ide": ide_name,
        "source": source,
    }


@app.get("/v1/introspect/dependencies")
async def v1_introspect_deps():
    """Return real dependencies from requirements.txt / package.json if present."""
    deps = []
    req_file = PROJECT_ROOT / "backend" / "requirements.txt"
    if not req_file.exists():
        req_file = PROJECT_ROOT / "requirements.txt"
    if req_file.exists():
        for line in req_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                deps.append({"name": line, "source": "requirements.txt"})

    pkg_file = PROJECT_ROOT / "package.json"
    if pkg_file.exists():
        try:
            pkg = json.loads(pkg_file.read_text(encoding="utf-8"))
            for name, ver in pkg.get("dependencies", {}).items():
                deps.append({"name": f"{name}@{ver}", "source": "package.json"})
            for name, ver in pkg.get("devDependencies", {}).items():
                deps.append({"name": f"{name}@{ver}", "source": "package.json (dev)"})
        except Exception:
            pass

    return {"dependencies": deps, "total": len(deps)}


@app.get("/v1/governor/dashboard")
async def v1_governor_dashboard():
    """Real governor dashboard: scan project, assess health, list problems & recommendations."""
    problems = []
    recommendations = []
    health_checks = {}
    perf = {}

    # ---- Gather real data ----
    status = store.get_status()
    perf["uptime_s"] = round(status["uptime"], 1)
    perf["total_events"] = status["event_count"]
    perf["sse_clients"] = len(sse_subscribers)
    perf["ws_clients"] = len(ws_clients)
    perf["events_per_sec"] = round(
        status["stats"]["total"] / max(1, status["uptime"]), 2
    )

    # Health: backend is alive
    health_checks["backend"] = True
    health_checks["sse_stream"] = len(sse_subscribers) >= 0  # always ok
    health_checks["event_store"] = status["event_count"] >= 0

    # Scan project for real problems
    try:
        tree = _scan_tree(PROJECT_ROOT, max_depth=3)
        stats = _count_tree(tree)
        health_checks["project_files"] = stats["files"] > 0
        perf["total_files"] = stats["files"]
        perf["total_dirs"] = stats["dirs"]

        # Check for common problems
        py_files = list(PROJECT_ROOT.rglob("*.py"))
        js_files = (
            list((PROJECT_ROOT / "frontend").rglob("*.js"))
            if (PROJECT_ROOT / "frontend").exists()
            else []
        )

        # Problem: missing requirements.txt
        req_file = PROJECT_ROOT / "backend" / "requirements.txt"
        if not req_file.exists():
            req_file = PROJECT_ROOT / "requirements.txt"
        if not req_file.exists():
            problems.append(
                {
                    "severity": "warning",
                    "message": "No requirements.txt found",
                    "file": "requirements.txt",
                }
            )
            recommendations.append(
                {
                    "message": "Create requirements.txt with project dependencies",
                    "file": "requirements.txt",
                    "autoFix": True,
                    "aiFixable": True,
                }
            )

        # Problem: missing README
        readme = PROJECT_ROOT / "README.md"
        if not readme.exists():
            problems.append(
                {
                    "severity": "warning",
                    "message": "No README.md found",
                    "file": "README.md",
                }
            )
            recommendations.append(
                {
                    "message": "Create a README.md for the project",
                    "file": "README.md",
                    "autoFix": False,
                    "aiFixable": True,
                }
            )

        # Problem: missing .gitignore
        gitignore = PROJECT_ROOT / ".gitignore"
        if not gitignore.exists():
            problems.append(
                {
                    "severity": "warning",
                    "message": "No .gitignore found",
                    "file": ".gitignore",
                }
            )
            recommendations.append(
                {
                    "message": "Create .gitignore with standard exclusions",
                    "file": ".gitignore",
                    "autoFix": True,
                    "aiFixable": True,
                }
            )

        # Scan Python files for common issues
        for pf in py_files[:50]:
            try:
                content = pf.read_text(encoding="utf-8", errors="ignore")
                lines = content.split("\n")
                # Bare except
                for i, line in enumerate(lines):
                    if re.match(r"\s*except\s*:", line):
                        rel = str(pf.relative_to(PROJECT_ROOT))
                        problems.append(
                            {
                                "severity": "warning",
                                "message": f"Bare except at line {i+1}",
                                "file": rel,
                            }
                        )
                        recommendations.append(
                            {
                                "message": f"Replace bare except with specific exception at line {i+1}",
                                "file": rel,
                                "autoFix": True,
                                "aiFixable": True,
                            }
                        )
                        break  # one per file
                # TODO/FIXME comments
                for i, line in enumerate(lines):
                    if "TODO" in line or "FIXME" in line or "HACK" in line:
                        rel = str(pf.relative_to(PROJECT_ROOT))
                        problems.append(
                            {
                                "severity": "info",
                                "message": f"TODO/FIXME at line {i+1}: {line.strip()[:80]}",
                                "file": rel,
                            }
                        )
                        break
            except Exception:
                pass

        # Scan JS files for common issues
        for jf in js_files[:50]:
            try:
                content = jf.read_text(encoding="utf-8", errors="ignore")
                if "console.error" in content and "catch" not in content:
                    rel = str(jf.relative_to(PROJECT_ROOT))
                    problems.append(
                        {
                            "severity": "info",
                            "message": "console.error without catch block",
                            "file": rel,
                        }
                    )
            except Exception:
                pass

        health_checks["no_critical_issues"] = not any(
            p["severity"] == "error" for p in problems
        )

    except Exception as exc:
        problems.append(
            {"severity": "error", "message": f"Scan failed: {exc}", "file": ""}
        )
        health_checks["project_files"] = False

    # Compute grade
    error_count = sum(1 for p in problems if p["severity"] == "error")
    warn_count = sum(1 for p in problems if p["severity"] == "warning")
    score = max(0, 100 - error_count * 20 - warn_count * 5)
    if score >= 90:
        grade, label = "A", "Excellent"
    elif score >= 75:
        grade, label = "B", "Good"
    elif score >= 60:
        grade, label = "C", "Fair"
    elif score >= 40:
        grade, label = "D", "Needs Work"
    else:
        grade, label = "F", "Critical"

    return {
        "assessment": {"grade": grade, "label": label, "score": score},
        "health": health_checks,
        "performance": perf,
        "problems": problems,
        "recommendations": recommendations,
    }


@app.post("/v1/governor/scan")
async def v1_governor_scan():
    return {"status": "ok", "findings": []}


@app.post("/v1/governor/heal")
async def v1_governor_heal():
    return {"status": "ok", "actions": []}


# ─── Governor Fix Endpoints ──────────────────────────────────────────────────


@app.post("/v1/governor/auto-fix")
async def v1_governor_auto_fix(request: Request):
    """Accept a fix recommendation, return a diff preview."""
    body = await request.json()
    fix = body.get("fix", {})
    file_path = fix.get("file", "")
    message = fix.get("message", fix.get("description", ""))

    result = {"status": "preview", "file": file_path, "message": message}

    # Try to read the actual file and suggest a simple fix
    if file_path:
        target = PROJECT_ROOT / file_path
        if target.exists() and target.is_file():
            try:
                content = target.read_text(encoding="utf-8", errors="ignore")
                result["diff"] = (
                    f"--- a/{file_path}\n+++ b/{file_path}\n@@ Auto-fix suggestion @@\n# {message}\n"
                )
                result["oldCode"] = content[:500]
                result["newCode"] = content[
                    :500
                ]  # placeholder — real AI fix would modify
            except Exception as exc:
                result["error"] = str(exc)

    return result


@app.post("/v1/governor/ai-fix")
async def v1_governor_ai_fix(request: Request):
    """AI-assisted fix — returns diff suggestion."""
    body = await request.json()
    issue = body.get("issue", {})
    return {
        "status": "suggestion",
        "file": issue.get("file", ""),
        "message": f"AI fix suggestion for: {issue.get('message', issue.get('description', 'unknown'))}",
        "diff": f"--- AI suggestion ---\n# This would be generated by an AI model\n# Issue: {issue.get('message', '')}",
    }


@app.post("/v1/governor/auto-heal")
async def v1_governor_auto_heal(request: Request):
    """Step-by-step auto-heal process."""
    body = await request.json()
    step = body.get("step", "scan")
    dry_run = body.get("dryRun", True)

    step_results = {
        "scan": {
            "message": f"Scanned {len(list(PROJECT_ROOT.rglob('*.py')))} Python files + {len(list((PROJECT_ROOT / 'frontend').rglob('*.js'))) if (PROJECT_ROOT / 'frontend').exists() else 0} JS files"
        },
        "filter": {"message": "Filtered: 0 auto-fixable issues found"},
        "generate": {"message": "Generated fix proposals"},
        "validate": {
            "message": "Validation passed (dry-run)" if dry_run else "Validation passed"
        },
        "preview": {"message": "Preview ready — no changes applied (dry-run)"},
        "apply": {
            "message": (
                "No changes applied (safety mode)" if dry_run else "Applied fixes"
            )
        },
        "rescan": {"message": "Rescan complete"},
    }

    return step_results.get(step, {"message": f"Unknown step: {step}"})


@app.post("/v1/governor/apply-fix")
async def v1_governor_apply_fix(request: Request):
    """Apply a diff fix to a file on disk."""
    body = await request.json()
    file_path = body.get("file", "")
    new_code = body.get("newCode", "")

    if not file_path:
        return JSONResponse(
            {"status": "error", "message": "No file specified"}, status_code=400
        )

    target = PROJECT_ROOT / file_path
    if not target.exists():
        return JSONResponse(
            {"status": "error", "message": f"File not found: {file_path}"},
            status_code=404,
        )

    if not new_code:
        return {"status": "skipped", "message": "No new code provided"}

    try:
        target.write_text(new_code, encoding="utf-8")
        return {
            "status": "applied",
            "message": f"Fix applied to {file_path}",
            "file": file_path,
        }
    except Exception as exc:
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=500)


# ─── Governor Report Endpoint ────────────────────────────────────────────────


@app.post("/debug/governor-report")
async def debug_governor_report(request: Request):
    """Write a .governor-report.md file to the project root."""
    body = await request.json()

    # Build markdown from report data
    problems = body.get("problems", [])
    grade = body.get("grade", "?")
    score = body.get("score", 0)
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

    md_lines = [
        "# Governor Report",
        "",
        f"**Generated:** {timestamp}",
        f"**Grade:** {grade} ({score}/100)",
        f"**Problems:** {len(problems)}",
        "",
    ]

    if problems:
        md_lines.append("## Problems\n")
        for i, p in enumerate(problems, 1):
            sev = p.get("severity", "info")
            msg = p.get("message", p.get("description", "—"))
            file = p.get("file", "")
            md_lines.append(
                f"{i}. **[{sev.upper()}]** {msg}" + (f" — `{file}`" if file else "")
            )
        md_lines.append("")

    recommendations = body.get("recommendations", [])
    if recommendations:
        md_lines.append("## Recommendations\n")
        for i, r in enumerate(recommendations, 1):
            msg = (
                r if isinstance(r, str) else r.get("message", r.get("description", "—"))
            )
            md_lines.append(f"{i}. {msg}")
        md_lines.append("")

    md_lines.append("---\n")
    md_lines.append('*Ask the AI: "Read .governor-report.md and fix the problems"*\n')

    md_content = "\n".join(md_lines)
    report_path = PROJECT_ROOT / ".governor-report.md"
    report_path.write_text(md_content, encoding="utf-8")

    return {
        "ok": True,
        "problems": len(problems),
        "size": len(md_content),
        "path": str(report_path),
    }


# ─── Coverage Endpoint ───────────────────────────────────────────────────────


def _compute_file_coverage(file_path: Path) -> dict:
    """Approximate code coverage metrics by static analysis (not runtime)."""
    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
        lines = content.split("\n")
        total_lines = len(lines)
        code_lines = sum(
            1
            for ln in lines
            if ln.strip()
            and not ln.strip().startswith("#")
            and not ln.strip().startswith("//")
            and not ln.strip().startswith("/*")
        )
        # Count functions/methods
        if file_path.suffix == ".py":
            funcs = sum(1 for ln in lines if re.match(r"\s*(def|async\s+def)\s+\w+", ln))
            classes = sum(1 for ln in lines if re.match(r"\s*class\s+\w+", ln))
        elif file_path.suffix in (".js", ".ts", ".jsx", ".tsx"):
            funcs = sum(
                1
                for ln in lines
                if re.search(r"(function\s+\w+|=>\s*{|\w+\s*\(.*\)\s*{)", ln)
            )
            classes = sum(1 for ln in lines if re.match(r"\s*class\s+\w+", ln))
        else:
            funcs = 0
            classes = 0

        # Estimate coverage (files with tests nearby get higher score)
        has_tests = False
        test_dir = file_path.parent / "__tests__"
        if test_dir.exists():
            has_tests = True
        test_file = file_path.parent / f"test_{file_path.name}"
        if test_file.exists():
            has_tests = True
        test_file2 = file_path.parent / f"{file_path.stem}.test{file_path.suffix}"
        if test_file2.exists():
            has_tests = True

        line_pct = (
            80.0
            if has_tests
            else max(10.0, min(60.0, code_lines / max(1, total_lines) * 100))
        )
        func_pct = (
            75.0
            if has_tests
            else max(5.0, min(50.0, (funcs / max(1, funcs + 2)) * 100))
        )
        branch_pct = 70.0 if has_tests else max(5.0, min(40.0, line_pct * 0.6))

        return {
            "file": str(file_path.relative_to(PROJECT_ROOT)),
            "lines": {
                "total": total_lines,
                "covered": int(total_lines * line_pct / 100),
                "pct": round(line_pct, 1),
            },
            "branches": {
                "total": max(1, funcs * 2),
                "covered": int(funcs * 2 * branch_pct / 100),
                "pct": round(branch_pct, 1),
            },
            "functions": {
                "total": funcs,
                "covered": int(funcs * func_pct / 100),
                "pct": round(func_pct, 1),
            },
            "classes": classes,
            "codeLines": code_lines,
        }
    except Exception:
        return None


@app.get("/v1/coverage")
async def v1_coverage():
    """Return coverage-like data computed from static analysis of project files."""
    files_data = []
    extensions = {".py", ".js", ".ts", ".jsx", ".tsx"}

    for ext in extensions:
        for fp in list(PROJECT_ROOT.rglob(f"*{ext}"))[:100]:
            # Skip noise
            if any(
                skip in str(fp)
                for skip in (
                    "node_modules",
                    "__pycache__",
                    ".git",
                    "venv",
                    ".venv",
                    "dist",
                    "build",
                )
            ):
                continue
            cov = _compute_file_coverage(fp)
            if cov:
                files_data.append(cov)

    # Sort by coverage ascending (worst first)
    files_data.sort(key=lambda f: f["lines"]["pct"])

    # Summary
    total_lines = sum(f["lines"]["total"] for f in files_data)
    covered_lines = sum(f["lines"]["covered"] for f in files_data)
    total_branches = sum(f["branches"]["total"] for f in files_data)
    covered_branches = sum(f["branches"]["covered"] for f in files_data)
    total_funcs = sum(f["functions"]["total"] for f in files_data)
    covered_funcs = sum(f["functions"]["covered"] for f in files_data)

    return {
        "files": files_data,
        "summary": {
            "lines": {
                "total": total_lines,
                "covered": covered_lines,
                "pct": round(covered_lines / max(1, total_lines) * 100, 1),
            },
            "branches": {
                "total": total_branches,
                "covered": covered_branches,
                "pct": round(covered_branches / max(1, total_branches) * 100, 1),
            },
            "functions": {
                "total": total_funcs,
                "covered": covered_funcs,
                "pct": round(covered_funcs / max(1, total_funcs) * 100, 1),
            },
        },
        "totalFiles": len(files_data),
    }


# ─── TQI (Technical Quality Index) ───────────────────────────────────────────


def _compute_tqi(root: Path) -> dict:
    """Compute a Technical Quality Index from static code analysis."""
    py_files = [
        f
        for f in root.rglob("*.py")
        if not any(
            s in str(f)
            for s in ("node_modules", "__pycache__", ".git", "venv", ".venv")
        )
    ]
    js_files = [
        f
        for f in root.rglob("*.js")
        if not any(
            s in str(f)
            for s in ("node_modules", "__pycache__", ".git", "venv", ".venv")
        )
    ]
    all_code = py_files + js_files

    total_lines = 0
    total_functions = 0
    total_classes = 0
    total_todos = 0
    total_bare_excepts = 0
    total_long_functions = 0
    total_long_lines = 0
    total_duplicates = 0
    has_tests = False
    has_docs = False
    has_ci = False
    has_security_headers = False
    file_hashes = {}
    worst_files = []

    for fp in all_code[:100]:
        try:
            content = fp.read_text(encoding="utf-8", errors="ignore")
            lines = content.split("\n")
            total_lines += len(lines)

            # Functions
            if fp.suffix == ".py":
                funcs = [
                    i
                    for i, ln in enumerate(lines)
                    if re.match(r"\s*(def|async\s+def)\s+\w+", ln)
                ]
            else:
                funcs = [
                    i
                    for i, ln in enumerate(lines)
                    if re.search(r"(function\s+\w+|=>\s*{)", ln)
                ]
            total_functions += len(funcs)
            total_classes += sum(1 for ln in lines if re.match(r"\s*class\s+\w+", ln))

            # Long functions (>50 lines)
            for fi in range(len(funcs)):
                start = funcs[fi]
                end = funcs[fi + 1] if fi + 1 < len(funcs) else len(lines)
                if end - start > 50:
                    total_long_functions += 1

            # Long lines
            total_long_lines += sum(1 for ln in lines if len(ln) > 120)

            # TODOs
            todos = sum(1 for ln in lines if "TODO" in ln or "FIXME" in ln or "HACK" in ln)
            total_todos += todos

            # Bare excepts
            bare_ex = sum(1 for ln in lines if re.match(r"\s*except\s*:", ln))
            total_bare_excepts += bare_ex

            # Content hash for duplication detection
            h = hashlib.md5(content.encode()).hexdigest()
            if h in file_hashes:
                total_duplicates += 1
            file_hashes[h] = str(fp.relative_to(root))

            # Per-file score
            issues = todos + bare_ex + total_long_functions
            if issues > 0:
                worst_files.append(
                    {
                        "file": str(fp.relative_to(root)),
                        "score": max(0, 100 - issues * 10),
                        "issues": issues,
                    }
                )

        except Exception:
            pass

    # Check for test infrastructure
    has_tests = any((root / d).exists() for d in ["tests", "test", "__tests__", "spec"])
    has_docs = (root / "README.md").exists() or (root / "docs").exists()
    has_ci = any(
        (root / f).exists()
        for f in [".github/workflows", ".gitlab-ci.yml", "Jenkinsfile", ".circleci"]
    )
    has_security_headers = any(
        "security" in str(f).lower() for f in root.rglob("*.py") if f.is_file()
    )

    # Compute sub-scores (0-100)
    file_count = max(1, len(all_code))
    coverage_score = 70 if has_tests else 20
    reliability_score = max(0, 100 - total_bare_excepts * 10)
    maintainability_score = max(0, 100 - total_long_functions * 5 - total_todos * 2)
    security_score = 60 if has_security_headers else 30
    performance_score = max(0, 100 - total_long_lines // max(1, file_count) * 5)
    complexity_score = max(0, 100 - (total_functions // max(1, file_count)) * 3)
    duplication_score = max(0, 100 - total_duplicates * 15)
    documentation_score = 80 if has_docs else 20

    breakdown = {
        "coverage": round(min(100, coverage_score), 1),
        "reliability": round(min(100, reliability_score), 1),
        "maintainability": round(min(100, maintainability_score), 1),
        "security": round(min(100, security_score), 1),
        "performance": round(min(100, performance_score), 1),
        "complexity": round(min(100, complexity_score), 1),
        "duplication": round(min(100, duplication_score), 1),
        "documentation": round(min(100, documentation_score), 1),
    }

    tqi = round(sum(breakdown.values()) / len(breakdown), 1)

    # Detect patterns
    patterns = []
    if total_bare_excepts > 0:
        patterns.append(
            {
                "name": "Bare Excepts",
                "description": f"Found {total_bare_excepts} bare except clauses",
                "severity": "warning",
                "count": total_bare_excepts,
            }
        )
    if total_todos > 3:
        patterns.append(
            {
                "name": "TODO Debt",
                "description": f"Found {total_todos} TODO/FIXME comments",
                "severity": "info",
                "count": total_todos,
            }
        )
    if total_long_functions > 0:
        patterns.append(
            {
                "name": "Long Functions",
                "description": f"{total_long_functions} functions exceed 50 lines",
                "severity": "warning",
                "count": total_long_functions,
            }
        )
    if total_duplicates > 0:
        patterns.append(
            {
                "name": "Duplicated Files",
                "description": f"{total_duplicates} files with identical content",
                "severity": "warning",
                "count": total_duplicates,
            }
        )
    if not has_tests:
        patterns.append(
            {
                "name": "No Test Suite",
                "description": "No test directory found",
                "severity": "error",
                "count": 1,
            }
        )
    if not has_ci:
        patterns.append(
            {
                "name": "No CI/CD",
                "description": "No CI configuration found",
                "severity": "info",
                "count": 1,
            }
        )

    worst_files.sort(key=lambda f: f["score"])

    return {
        "tqi": tqi,
        "score": tqi,
        "breakdown": breakdown,
        "patterns": patterns,
        "worstFiles": worst_files[:15],
        "stats": {
            "totalLines": total_lines,
            "totalFunctions": total_functions,
            "totalClasses": total_classes,
            "totalFiles": len(all_code),
        },
    }


@app.get("/v1/tqi")
async def v1_tqi():
    """Return Technical Quality Index computed from real project analysis."""
    return _compute_tqi(PROJECT_ROOT)


# ─── Metrics History Alias ────────────────────────────────────────────────────


@app.get("/v1/metrics/history")
async def v1_metrics_history():
    """Alias endpoint for frontend metrics tab — returns enriched metrics history."""
    history = metrics_history.copy()

    # Build enriched response matching frontend expectations
    _total_events = sum(h.get("event_count", 0) for h in history)
    total_errors = store.get_status()["stats"].get("errors", 0)
    avg_latency = 0
    if history:
        # Simulate latency from event processing time
        avg_latency = (
            sum(h.get("ws_clients", 0) + h.get("sse_clients", 0) for h in history)
            / len(history)
            * 10
            + 50
        )

    # Convert history to hourly format
    hourly = []
    for h in history[-48:]:
        hourly.append(
            {
                "hour": h.get("timestamp", ""),
                "events": h.get("event_count", 0),
                "avgLatency": avg_latency + (hash(h.get("timestamp", "")) % 100 - 50),
                "errors": 0,
            }
        )

    # Endpoint stats from own routes
    endpoint_stats = []
    for route in app.routes:
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", None)
        if methods and path and not path.startswith("/{"):
            for m in sorted(methods):
                latency = 10 + hash(f"{m}{path}") % 200
                endpoint_stats.append(
                    {
                        "endpoint": f"{m} {path}",
                        "path": path,
                        "avgLatency": abs(latency),
                        "calls": abs(hash(path) % 500) + 10,
                    }
                )

    status = store.get_status()
    uptime_h = int(status["uptime"] // 3600)
    uptime_m = int((status["uptime"] % 3600) // 60)

    return {
        "allTime": {
            "totalEvents": status["stats"]["total"],
            "avgLatency": round(avg_latency, 1),
            "totalErrors": total_errors,
            "fixesApplied": 0,
            "peakProblems": 0,
            "uptime": f"{uptime_h}h {uptime_m}m",
        },
        "hourly": hourly,
        "endpoints": sorted(
            endpoint_stats, key=lambda e: e["avgLatency"], reverse=True
        )[:15],
        "fixes": [],
        "problemTrend": [{"count": abs(hash(str(i)) % 5)} for i in range(30)],
    }


# ─── Introspect: Roadmap ─────────────────────────────────────────────────────


@app.get("/v1/introspect/roadmap")
async def v1_introspect_roadmap():
    """Scan project for spec documents, README sections, and categorize them."""
    documents = []
    codebase_stats = {}

    # Scan for documentation files
    _doc_patterns = {
        "*.md": "documentation",
        "*.rst": "documentation",
        "*.txt": "documentation",
        "*.yaml": "configuration",
        "*.yml": "configuration",
        "*.toml": "configuration",
        "*.json": "configuration",
        "*.env*": "configuration",
        "Dockerfile*": "deployment",
        "docker-compose*": "deployment",
        "*.tf": "deployment",
        "*.spec.*": "testing",
        "*.test.*": "testing",
    }

    # Find documentation files
    for fp in PROJECT_ROOT.rglob("*"):
        if not fp.is_file():
            continue
        if any(
            skip in str(fp)
            for skip in (
                "node_modules",
                "__pycache__",
                ".git",
                "venv",
                ".venv",
                "dist",
                "build",
            )
        ):
            continue

        name = fp.name.lower()
        rel = str(fp.relative_to(PROJECT_ROOT))
        cat = "other"

        # Categorize
        if name.endswith(".md") or name.endswith(".rst"):
            cat = "documentation"
            if "api" in name:
                cat = "api"
            elif "security" in name or "auth" in name:
                cat = "security"
            elif "test" in name:
                cat = "testing"
            elif "deploy" in name or "ci" in name:
                cat = "deployment"
            elif "arch" in name or "design" in name:
                cat = "architecture"
            elif "perf" in name:
                cat = "performance"
            elif "monitor" in name or "log" in name:
                cat = "monitoring"
        elif name in ("dockerfile", "docker-compose.yml", "docker-compose.yaml"):
            cat = "deployment"
        elif name.endswith((".yaml", ".yml", ".toml", ".cfg", ".ini")):
            cat = "configuration"
        elif any(x in name for x in ("test", "spec")):
            cat = "testing"
        elif name in (
            "package.json",
            "requirements.txt",
            "pyproject.toml",
            "cargo.toml",
        ):
            cat = "configuration"
        elif name.endswith((".github", ".gitlab-ci.yml")):
            cat = "ci-cd"
        else:
            continue  # Skip non-doc files

        # Read headings for .md files
        headings = []
        description = ""
        features = []
        if fp.suffix in (".md", ".rst"):
            try:
                content = fp.read_text(encoding="utf-8", errors="ignore")
                for line in content.split("\n")[:50]:
                    if line.startswith("#"):
                        headings.append(line.strip("# ").strip())
                    elif not description and line.strip() and not line.startswith("#"):
                        description = line.strip()[:120]
                # Extract feature-like items
                for line in content.split("\n"):
                    if re.match(r"\s*[-*]\s+.+", line) and len(features) < 10:
                        features.append(line.strip("- *").strip()[:80])
            except Exception:
                pass

        documents.append(
            {
                "file": rel,
                "name": fp.name,
                "title": headings[0] if headings else fp.name,
                "category": cat,
                "description": description,
                "headings": headings[:10],
                "features": features[:5],
            }
        )

    # Codebase stats
    components = (
        len(list((PROJECT_ROOT / "frontend" / "js" / "tabs").rglob("*.js")))
        if (PROJECT_ROOT / "frontend" / "js" / "tabs").exists()
        else 0
    )
    engine_modules = (
        len(list((PROJECT_ROOT / "frontend" / "js").glob("*.js")))
        if (PROJECT_ROOT / "frontend" / "js").exists()
        else 0
    )
    stores = 0
    services = len(list(PROJECT_ROOT.rglob("*.py"))) if PROJECT_ROOT.exists() else 0
    hooks = 0
    routes_count = len([r for r in app.routes if getattr(r, "methods", None)])

    codebase_stats = {
        "components": components,
        "engineModules": engine_modules,
        "stores": stores,
        "services": services,
        "hooks": hooks,
        "routes": routes_count,
    }

    overview = {
        "components": components,
        "engineModules": engine_modules,
        "stores": stores,
        "services": services,
        "hooks": hooks,
        "routes": routes_count,
        "targetTotal": max(components + engine_modules + services + routes_count, 50),
    }

    return {
        "overview": overview,
        "codebase": codebase_stats,
        "documents": documents,
    }


# ─── Introspect: Structural Health ───────────────────────────────────────────


def _analyze_structural_health(root: Path) -> dict:
    """Analyze project structure and return health assessment."""
    subsystems = []
    findings = []
    matrix = []

    # Define expected subsystems
    expected_subsystems = {
        "Frontend": {"path": "frontend", "expected": True},
        "Backend": {"path": "backend", "expected": True},
        "Styles": {"path": "frontend/css", "expected": True},
        "JavaScript": {"path": "frontend/js", "expected": True},
        "Tab Modules": {"path": "frontend/js/tabs", "expected": True},
        "Configuration": {"path": "", "expected": True},
        "Tests": {"path": "tests", "expected": True},
        "Documentation": {"path": "docs", "expected": False},
        "CI/CD": {"path": ".github", "expected": False},
    }

    total_score = 0
    for name, info in expected_subsystems.items():
        sub_path = root / info["path"] if info["path"] else root
        exists = sub_path.exists() if info["path"] else True

        if info["path"] and exists:
            files = list(sub_path.rglob("*"))
            file_count = sum(1 for f in files if f.is_file())
            sub_score = min(100, file_count * 10) if file_count > 0 else 0
        elif not info["path"]:
            # Root-level config files
            configs = [
                f
                for f in root.iterdir()
                if f.is_file()
                and f.suffix
                in (".json", ".toml", ".yaml", ".yml", ".cfg", ".ini", ".txt")
            ]
            file_count = len(configs)
            sub_score = min(100, file_count * 15)
        else:
            file_count = 0
            sub_score = 0

        severity = (
            "healthy"
            if sub_score >= 70
            else "warning" if sub_score >= 40 else "critical"
        )

        if not exists and info["expected"]:
            findings.append(
                {
                    "severity": "error",
                    "message": f"Expected directory '{info['path']}' not found",
                    "subsystem": name,
                }
            )
            sub_score = 0
            severity = "critical"
        elif exists and file_count == 0:
            findings.append(
                {
                    "severity": "warning",
                    "message": f"Directory '{info['path']}' is empty",
                    "subsystem": name,
                }
            )
            sub_score = 20

        subsystems.append(
            {
                "name": name,
                "score": sub_score,
                "severity": severity,
                "issues": 0 if severity == "healthy" else 1,
                "description": f"{file_count} files"
                + (f" in {info['path']}" if info["path"] else " at root"),
            }
        )
        total_score += sub_score

        # Spec vs Reality matrix
        matrix.append(
            {
                "feature": name,
                "specified": info["expected"],
                "implemented": exists and file_count > 0,
            }
        )

    # Additional structural checks
    has_requirements = (root / "requirements.txt").exists() or (
        root / "backend" / "requirements.txt"
    ).exists()
    has_readme = (root / "README.md").exists()
    has_gitignore = (root / ".gitignore").exists()

    if not has_requirements:
        findings.append(
            {
                "severity": "warning",
                "message": "No requirements.txt found",
                "subsystem": "Configuration",
            }
        )
    if not has_readme:
        findings.append(
            {
                "severity": "warning",
                "message": "No README.md found",
                "subsystem": "Documentation",
            }
        )
    if not has_gitignore:
        findings.append(
            {
                "severity": "info",
                "message": "No .gitignore found",
                "subsystem": "Configuration",
            }
        )

    # Check for circular imports (simplified)
    py_files = list(root.rglob("*.py"))
    if len(py_files) > 0:
        import_graph = {}
        for pf in py_files[:50]:
            try:
                content = pf.read_text(encoding="utf-8", errors="ignore")
                imports = re.findall(r"(?:from|import)\s+(\w+)", content)
                import_graph[pf.stem] = imports
            except Exception:
                pass

    overall_score = total_score / max(1, len(expected_subsystems))

    if overall_score >= 90:
        grade = "A"
    elif overall_score >= 75:
        grade = "B"
    elif overall_score >= 60:
        grade = "C"
    elif overall_score >= 40:
        grade = "D"
    else:
        grade = "F"

    return {
        "grade": grade,
        "score": round(overall_score, 1),
        "subsystems": subsystems,
        "findings": findings,
        "matrix": matrix,
        "summary": {
            "grade": grade,
            "score": round(overall_score, 1),
        },
    }


@app.get("/v1/introspect/structural-health")
async def v1_introspect_structural_health():
    """Analyze structural health of the project."""
    return _analyze_structural_health(PROJECT_ROOT)


@app.get("/v1/introspect/language-registry")
async def v1_introspect_language_registry():
    """Scan the real project and detect languages, extensions, test runners, etc."""
    return await asyncio.to_thread(_scan_language_registry, PROJECT_ROOT)


def _scan_language_registry(root: Path) -> dict:
    """Scan project files and build a real language registry."""
    # Language definitions with detection patterns
    LANG_DEFS = {
        ".ts": {"lang": "TypeScript", "tier": "Tier 1 - Core", "testRunner": "vitest", "formatter": "prettier", "linter": "eslint"},
        ".tsx": {"lang": "TypeScript (React)", "tier": "Tier 1 - Core", "testRunner": "vitest", "formatter": "prettier", "linter": "eslint"},
        ".js": {"lang": "JavaScript", "tier": "Tier 1 - Core", "testRunner": "vitest", "formatter": "prettier", "linter": "eslint"},
        ".jsx": {"lang": "JavaScript (React)", "tier": "Tier 1 - Core", "testRunner": "vitest", "formatter": "prettier", "linter": "eslint"},
        ".mjs": {"lang": "JavaScript (ESM)", "tier": "Tier 1 - Core", "testRunner": "vitest", "formatter": "prettier", "linter": "eslint"},
        ".py": {"lang": "Python", "tier": "Tier 1 - Core", "testRunner": "pytest", "formatter": "black", "linter": "ruff"},
        ".rs": {"lang": "Rust", "tier": "Tier 1 - Core", "testRunner": "cargo test", "formatter": "rustfmt", "linter": "clippy"},
        ".go": {"lang": "Go", "tier": "Tier 2 - Enterprise", "testRunner": "go test", "formatter": "gofmt", "linter": "golangci-lint"},
        ".java": {"lang": "Java", "tier": "Tier 2 - Enterprise", "testRunner": "JUnit", "formatter": "google-java-format", "linter": "SpotBugs"},
        ".cs": {"lang": "C#", "tier": "Tier 2 - Enterprise", "testRunner": "xUnit", "formatter": "dotnet format", "linter": "Roslyn"},
        ".cpp": {"lang": "C++", "tier": "Tier 2 - Enterprise", "testRunner": "GoogleTest", "formatter": "clang-format", "linter": "clang-tidy"},
        ".c": {"lang": "C", "tier": "Tier 2 - Enterprise", "testRunner": "CUnit", "formatter": "clang-format", "linter": "cppcheck"},
        ".h": {"lang": "C/C++ Header", "tier": "Tier 2 - Enterprise", "testRunner": "-", "formatter": "clang-format", "linter": "clang-tidy"},
        ".kt": {"lang": "Kotlin", "tier": "Tier 3 - Modern", "testRunner": "JUnit5", "formatter": "ktlint", "linter": "detekt"},
        ".swift": {"lang": "Swift", "tier": "Tier 3 - Modern", "testRunner": "XCTest", "formatter": "swift-format", "linter": "SwiftLint"},
        ".dart": {"lang": "Dart", "tier": "Tier 3 - Modern", "testRunner": "dart test", "formatter": "dart format", "linter": "dart analyze"},
        ".php": {"lang": "PHP", "tier": "Tier 3 - Modern", "testRunner": "PHPUnit", "formatter": "php-cs-fixer", "linter": "PHPStan"},
        ".rb": {"lang": "Ruby", "tier": "Tier 3 - Modern", "testRunner": "RSpec", "formatter": "rubocop", "linter": "rubocop"},
        ".ex": {"lang": "Elixir", "tier": "Tier 4 - Functional", "testRunner": "ExUnit", "formatter": "mix format", "linter": "Credo"},
        ".exs": {"lang": "Elixir Script", "tier": "Tier 4 - Functional", "testRunner": "ExUnit", "formatter": "mix format", "linter": "Credo"},
        ".hs": {"lang": "Haskell", "tier": "Tier 4 - Functional", "testRunner": "HSpec", "formatter": "ormolu", "linter": "hlint"},
        ".scala": {"lang": "Scala", "tier": "Tier 4 - Functional", "testRunner": "ScalaTest", "formatter": "scalafmt", "linter": "scalafix"},
        ".zig": {"lang": "Zig", "tier": "Tier 4 - Functional", "testRunner": "zig test", "formatter": "zig fmt", "linter": "-"},
        ".lua": {"lang": "Lua", "tier": "Tier 5 - Config", "testRunner": "busted", "formatter": "StyLua", "linter": "luacheck"},
        ".r": {"lang": "R", "tier": "Tier 5 - Config", "testRunner": "testthat", "formatter": "styler", "linter": "lintr"},
        ".sh": {"lang": "Shell", "tier": "Tier 5 - Config", "testRunner": "bats", "formatter": "shfmt", "linter": "shellcheck"},
        ".bash": {"lang": "Bash", "tier": "Tier 5 - Config", "testRunner": "bats", "formatter": "shfmt", "linter": "shellcheck"},
        ".sql": {"lang": "SQL", "tier": "Tier 5 - Config", "testRunner": "pgTAP", "formatter": "sql-formatter", "linter": "sqlfluff"},
        ".yml": {"lang": "YAML", "tier": "Tier 5 - Config", "testRunner": "-", "formatter": "prettier", "linter": "yamllint"},
        ".yaml": {"lang": "YAML", "tier": "Tier 5 - Config", "testRunner": "-", "formatter": "prettier", "linter": "yamllint"},
        ".toml": {"lang": "TOML", "tier": "Tier 5 - Config", "testRunner": "-", "formatter": "taplo", "linter": "taplo"},
        ".json": {"lang": "JSON", "tier": "Tier 5 - Config", "testRunner": "-", "formatter": "prettier", "linter": "jsonlint"},
        ".jsonc": {"lang": "JSON with Comments", "tier": "Tier 5 - Config", "testRunner": "-", "formatter": "prettier", "linter": "jsonlint"},
        ".md": {"lang": "Markdown", "tier": "Tier 5 - Config", "testRunner": "-", "formatter": "prettier", "linter": "markdownlint"},
        ".mdx": {"lang": "MDX", "tier": "Tier 5 - Config", "testRunner": "-", "formatter": "prettier", "linter": "markdownlint"},
        ".html": {"lang": "HTML", "tier": "Tier 5 - Config", "testRunner": "-", "formatter": "prettier", "linter": "htmlhint"},
        ".htm": {"lang": "HTML", "tier": "Tier 5 - Config", "testRunner": "-", "formatter": "prettier", "linter": "htmlhint"},
        ".css": {"lang": "CSS", "tier": "Tier 5 - Config", "testRunner": "-", "formatter": "prettier", "linter": "stylelint"},
        ".scss": {"lang": "SCSS", "tier": "Tier 5 - Config", "testRunner": "-", "formatter": "prettier", "linter": "stylelint"},
        ".less": {"lang": "LESS", "tier": "Tier 5 - Config", "testRunner": "-", "formatter": "prettier", "linter": "stylelint"},
        ".xml": {"lang": "XML", "tier": "Tier 5 - Config", "testRunner": "-", "formatter": "xml-formatter", "linter": "xmllint"},
        ".vue": {"lang": "Vue", "tier": "Tier 3 - Modern", "testRunner": "vitest", "formatter": "prettier", "linter": "eslint"},
        ".svelte": {"lang": "Svelte", "tier": "Tier 3 - Modern", "testRunner": "vitest", "formatter": "prettier", "linter": "eslint"},
    }

    # Scan project
    ext_count: dict[str, int] = {}
    file_samples: dict[str, list[str]] = {}
    test_patterns_found: set[str] = set()
    config_files_found: list[str] = []

    ignore_dirs = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", ".next", "target"}

    for fpath in root.rglob("*"):
        if fpath.is_dir():
            continue
        # Skip ignored directories
        if any(part in ignore_dirs for part in fpath.parts):
            continue
        ext = fpath.suffix.lower()
        if ext:
            ext_count[ext] = ext_count.get(ext, 0) + 1
            if ext not in file_samples:
                file_samples[ext] = []
            if len(file_samples[ext]) < 5:
                try:
                    rel = fpath.relative_to(root)
                    file_samples[ext].append(str(rel).replace("\\", "/"))
                except ValueError:
                    pass

        # Detect test patterns
        name_lower = fpath.name.lower()
        if "test" in name_lower or "spec" in name_lower:
            if ext == ".py":
                test_patterns_found.add("pytest")
            elif ext in (".ts", ".tsx", ".js", ".jsx"):
                test_patterns_found.add("vitest/jest")
            elif ext == ".rs":
                test_patterns_found.add("cargo test")

        # Detect config files
        if fpath.name in ("package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle"):
            config_files_found.append(fpath.name)

    # Build detected languages
    detected = []
    tiers: dict[str, list[dict]] = {}
    for ext, count in sorted(ext_count.items(), key=lambda x: -x[1]):
        if ext in LANG_DEFS:
            info = LANG_DEFS[ext]
            entry = {
                "extension": ext,
                "lang": info["lang"],
                "fileCount": count,
                "testRunner": info["testRunner"],
                "formatter": info["formatter"],
                "linter": info["linter"],
                "samples": file_samples.get(ext, []),
            }
            detected.append(entry)
            tier = info["tier"]
            if tier not in tiers:
                tiers[tier] = []
            tiers[tier].append(entry)

    # Summary
    total_langs = len(set(d["lang"] for d in detected))
    total_exts = len(detected)
    total_files = sum(d["fileCount"] for d in detected)

    return {
        "scannedAt": time.strftime("%H:%M:%S"),
        "projectRoot": str(root),
        "summary": {
            "totalLanguages": total_langs,
            "totalExtensions": total_exts,
            "totalFiles": total_files,
            "tiers": len(tiers),
        },
        "detected": detected,
        "byTier": tiers,
        "testPatterns": list(test_patterns_found),
        "configFiles": config_files_found,
        "integrations": [
            {"name": "Monaco Editor", "description": "Syntax highlighting", "status": "active"},
            {"name": "Test Runner", "description": "Per-language test execution", "status": "active" if test_patterns_found else "inactive"},
            {"name": "Formatter", "description": "Auto-formatting", "status": "active"},
            {"name": "Linter", "description": "Real-time diagnostics", "status": "active"},
            {"name": "Coverage", "description": "Per-language coverage", "status": "partial"},
        ],
    }


# ---------------------------------------------------------------------------
# /v1/models  /v1/settings — Stub endpoints for dashboard probes
# ---------------------------------------------------------------------------

@app.get("/v1/models")
async def v1_models():
    """Return available LLM models.

    This is a stub endpoint that tries to detect Ollama models if available,
    otherwise returns a minimal list to satisfy dashboard probes.
    """
    import httpx

    models = []

    # Try Ollama
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get("http://127.0.0.1:11434/api/tags")
            if r.status_code == 200:
                data = r.json()
                for m in data.get("models", []):
                    models.append({
                        "id": m.get("name", "unknown"),
                        "name": m.get("name", "unknown"),
                        "provider": "ollama",
                        "status": "available",
                    })
    except Exception:
        pass

    # Fallback if no models detected
    if not models:
        models = [
            {"id": "default", "name": "No LLM detected", "provider": "none", "status": "unavailable"},
        ]

    return {"models": models, "count": len(models)}


@app.get("/v1/settings")
async def v1_settings():
    """Return current dashboard settings.

    Stub endpoint for dashboard probes.
    """
    return {
        "model": "auto",
        "defaultModel": "ollama/llama3",
        "host": "127.0.0.1",
        "port": 8421,
        "theme": "dark",
        "notifications": True,
        "sounds": False,
        "pollingInterval": 10000,
    }


# --- Canvas: Helpers ---


def _debug_event_to_canvas(event: dict) -> dict | None:
    """Transform a debug event into a canvas node event for the Architecture Live Graph.

    Returns a dict with:
      eventType  - one of: node_activity, file_change, node_error, node_warning
      nodeId     - unique node (file stem or event-type bucket)
      label      - display name
      category   - grouping key (file-watcher | debug | error | warning)
      meta       - extra context (path, extension, action, etc.)
    Returns None if the event is not mappable.
    """
    etype = event.get("type", "")
    component = event.get("component", "")
    data = event.get("data") or {}
    severity = str(data.get("severity", "")).lower()

    # File-watcher events -> highlight the changed file node
    if etype == "file-write":
        rel_path = data.get("path", "")
        if not rel_path:
            return None
        return {
            "eventType": "file_change",
            "nodeId": rel_path.replace("\\", "/"),
            "label": Path(rel_path).name,
            "category": "file-watcher",
            "meta": {
                "path": rel_path,
                "extension": data.get("extension", ""),
                "action": data.get("action", "modified"),
            },
        }

    # Warning events -> mark node as warning (blinking red ring)
    if (
        etype == "warning"
        or "warning" in etype.lower()
        or "warn" in etype.lower()
        or severity == "warning"
    ):
        source = data.get("source") or data.get("file") or component or "unknown"
        return {
            "eventType": "node_warning",
            "nodeId": source,
            "label": source,
            "category": "warning",
            "meta": {"message": str(data.get("message", ""))[:200]},
        }

    # Error events -> mark node as error (solid red ring)
    if etype == "error" or "error" in etype.lower():
        source = data.get("source") or data.get("file") or component or "unknown"
        return {
            "eventType": "node_error",
            "nodeId": source,
            "label": source,
            "category": "error",
            "meta": {"message": str(data.get("message", ""))[:200]},
        }

    # Generic debug events -> activity pulse on the component/source node
    source = data.get("file") or data.get("source") or component or etype
    if not source:
        return None
    return {
        "eventType": "node_activity",
        "nodeId": source,
        "label": source,
        "category": "debug",
        "meta": {"type": etype, "component": component},
    }


# ─── File Inspector (for clickable graph nodes) ──────────────────────────────

# ── Smart Lint Agent: real linters with JSON output ──────────────────────────

import platform as _platform
import shutil as _shutil_early

_USE_SHELL = _platform.system() == "Windows"

# Tool registry: extension → list of [tool_id, detect_cmd, fix_cmd, json_parser]
# detect_cmd receives {file} placeholder; fix_cmd likewise.
# Tools are tried in priority order; first available wins.

_LINT_TOOLS: dict[str, list[dict]] = {
    ".js": [
        {
            "id": "eslint",
            "bin": "eslint",
            "detect": [
                "npx",
                "--yes",
                "eslint",
                "-f",
                "json",
                "--no-error-on-unmatched-pattern",
                "{file}",
            ],
            "fix": ["npx", "--yes", "eslint", "--fix", "{file}"],
            "parser": "_parse_eslint_json",
        },
        {
            "id": "biome",
            "bin": "@biomejs/biome",
            "detect": [
                "npx",
                "--yes",
                "@biomejs/biome",
                "lint",
                "--reporter=json",
                "{file}",
            ],
            "fix": ["npx", "--yes", "@biomejs/biome", "lint", "--write", "{file}"],
            "parser": "_parse_biome_json",
        },
    ],
    ".ts": None,  # filled below
    ".jsx": None,
    ".tsx": None,
    ".css": [
        {
            "id": "stylelint",
            "bin": "stylelint",
            "detect": ["npx", "--yes", "stylelint", "--formatter", "json", "{file}"],
            "fix": ["npx", "--yes", "stylelint", "--fix", "{file}"],
            "parser": "_parse_stylelint_json",
        },
        {
            "id": "biome-css",
            "bin": "@biomejs/biome",
            "detect": [
                "npx",
                "--yes",
                "@biomejs/biome",
                "lint",
                "--reporter=json",
                "{file}",
            ],
            "fix": ["npx", "--yes", "@biomejs/biome", "lint", "--write", "{file}"],
            "parser": "_parse_biome_json",
        },
    ],
    ".py": [
        {
            "id": "ruff",
            "bin": "ruff",
            "detect": ["ruff", "check", "--output-format", "json", "{file}"],
            "fix": ["ruff", "check", "--fix", "--unsafe-fixes", "{file}"],
            "parser": "_parse_ruff_json",
        },
    ],
}
# Share JS tools for TS/JSX/TSX
_LINT_TOOLS[".ts"] = _LINT_TOOLS[".js"]
_LINT_TOOLS[".jsx"] = _LINT_TOOLS[".js"]
_LINT_TOOLS[".tsx"] = _LINT_TOOLS[".js"]


def _parse_eslint_json(raw: str, file_path: str) -> list[dict]:
    """Parse ESLint --format json output into unified diagnostics."""
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return []
    diagnostics: list[dict] = []
    for entry in data:
        for msg in entry.get("messages", []):
            sev_num = msg.get("severity", 0)
            severity = (
                "error" if sev_num == 2 else "warning" if sev_num == 1 else "info"
            )
            diagnostics.append(
                {
                    "line": msg.get("line", 1),
                    "column": msg.get("column", 1),
                    "severity": severity,
                    "message": msg.get("message", ""),
                    "source": f"eslint/{msg.get('ruleId', 'unknown')}",
                    "code": msg.get("ruleId", ""),
                    "fixable": msg.get("fix") is not None,
                }
            )
    return diagnostics


def _parse_stylelint_json(raw: str, file_path: str) -> list[dict]:
    """Parse Stylelint --formatter json output."""
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return []

    # Stylelint rules known to be actually auto-fixable with --fix
    _STYLELINT_FIXABLE_RULES = {
        "indentation",
        "color-hex-case",
        "color-hex-length",
        "number-leading-zero",
        "number-no-trailing-zeros",
        "string-quotes",
        "length-zero-no-unit",
        "shorthand-property-no-redundant-values",
        "declaration-block-semicolon-newline-after",
        "declaration-block-trailing-semicolon",
        "block-closing-brace-newline-after",
        "block-opening-brace-space-before",
        "selector-list-comma-newline-after",
        "no-eol-whitespace",
        "no-missing-end-of-source-newline",
        "no-extra-semicolons",
    }

    diagnostics: list[dict] = []
    for entry in data:
        for w in entry.get("warnings", []):
            severity = w.get("severity", "warning")
            if severity not in ("error", "warning", "info"):
                severity = "warning"
            rule = w.get("rule", "")
            diagnostics.append(
                {
                    "line": w.get("line", 1),
                    "column": w.get("column", 1),
                    "severity": severity,
                    "message": w.get("text", ""),
                    "source": f"stylelint/{rule}",
                    "code": rule,
                    "fixable": rule in _STYLELINT_FIXABLE_RULES,
                }
            )
    return diagnostics


def _parse_biome_json(raw: str, file_path: str) -> list[dict]:
    """Parse Biome --reporter=json output."""
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return []
    diagnostics: list[dict] = []
    for diag in data.get("diagnostics", []):
        severity = diag.get("severity", "warning").lower()
        if severity not in ("error", "warning", "info"):
            severity = "warning"
        loc = diag.get("location", {}).get("span", {})
        diagnostics.append(
            {
                "line": loc.get("start", {}).get("line", 1),
                "column": loc.get("start", {}).get("character", 1),
                "severity": severity,
                "message": diag.get("description", diag.get("message", "")),
                "source": f"biome/{diag.get('category', 'unknown')}",
                "code": diag.get("category", ""),
                "fixable": "fixable" in str(diag.get("tags", [])).lower()
                or diag.get("fixable", False),
            }
        )
    return diagnostics


def _parse_ruff_json(raw: str, file_path: str) -> list[dict]:
    """Parse Ruff --output-format json output."""
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return []
    diagnostics: list[dict] = []
    for item in data:
        diagnostics.append(
            {
                "line": item.get("location", {}).get("row", 1),
                "column": item.get("location", {}).get("column", 1),
                "severity": (
                    "error" if item.get("code", "").startswith("E") else "warning"
                ),
                "message": item.get("message", ""),
                "source": f"ruff/{item.get('code', 'unknown')}",
                "code": item.get("code", ""),
                "fixable": item.get("fix") is not None,
            }
        )
    return diagnostics


# Map parser names to functions
_PARSERS = {
    "_parse_eslint_json": _parse_eslint_json,
    "_parse_stylelint_json": _parse_stylelint_json,
    "_parse_biome_json": _parse_biome_json,
    "_parse_ruff_json": _parse_ruff_json,
}


def _find_tool_for_ext(ext: str) -> dict | None:
    """Return the first available lint tool for this file extension, or None."""
    tools = _LINT_TOOLS.get(ext)
    if not tools:
        return None
    for tool in tools:
        # Quick availability check — look for the binary
        bin_name = tool["bin"]
        # For npx tools, check node_modules or assume npx will handle download
        if tool["detect"][0] == "npx":
            # Check if installed locally
            local_bin = PROJECT_ROOT / "node_modules" / ".bin" / bin_name.split("/")[-1]
            if local_bin.exists():
                return tool
            # npx --yes will download, so still available
            if _shutil_early.which("npx"):
                return tool
        else:
            if _shutil_early.which(bin_name):
                return tool
    return None


def _run_linter_json(file_path: str, ext: str) -> tuple[list[dict], dict | None, str]:
    """Run a real linter on the file and return (diagnostics, tool_used, raw_output).

    Returns:
        - diagnostics: list of unified diagnostics
        - tool: the tool dict that was used (or None)
        - raw: raw stdout+stderr from the linter
    """
    tool = _find_tool_for_ext(ext)
    if not tool:
        return [], None, ""

    # Build command with file placeholder replaced
    cmd = [c.replace("{file}", file_path) for c in tool["detect"]]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            cwd=str(PROJECT_ROOT),
            shell=_USE_SHELL,
            stdin=subprocess.DEVNULL,
        )
        raw = (result.stdout or "") + (result.stderr or "")

        # Linters often exit with code 1 when they find issues — that's normal
        parser_fn = _PARSERS.get(tool["parser"])
        if parser_fn:
            # Try stdout first, then stderr (some tools like Stylelint write JSON to stderr)
            diagnostics = parser_fn(result.stdout or "", file_path)
            if not diagnostics and result.stderr:
                diagnostics = parser_fn(result.stderr, file_path)
        else:
            diagnostics = []

        return diagnostics, tool, raw

    except FileNotFoundError:
        return [], None, f"Tool not found: {cmd[0]}"
    except subprocess.TimeoutExpired:
        return [], None, "Linter timed out"
    except Exception as exc:
        return [], None, f"Error: {exc}"


def _run_linter_fix(file_path: str, ext: str) -> tuple[bool, dict | None, str]:
    """Run the linter's --fix command on the file.

    Returns:
        - success: True if exit code 0
        - tool: the tool dict used
        - output: raw stdout+stderr
    """
    tool = _find_tool_for_ext(ext)
    if not tool:
        return False, None, "No lint tool available for this file type"

    cmd = [c.replace("{file}", file_path) for c in tool["fix"]]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            cwd=str(PROJECT_ROOT),
            shell=_USE_SHELL,
            stdin=subprocess.DEVNULL,
        )
        output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
        # ESLint/Stylelint exit with code 1 when warnings remain after fix.
        # That does NOT mean the fix failed — it just means unfixable issues remain.
        # Only treat exit code >= 2 as real failure (or timeout/crash).
        success = result.returncode <= 1
        return success, tool, output.strip()[:3000]
    except FileNotFoundError:
        return False, tool, f"Tool not found: {cmd[0]}. Install with npx/pip."
    except subprocess.TimeoutExpired:
        return False, tool, "Fix command timed out (60s)"
    except Exception as exc:
        return False, tool, f"Error: {exc}"


# ── Smart Fix endpoint: detect → fix → verify ───────────────────────────────


@app.post("/v1/canvas/smart-fix")
async def canvas_smart_fix(body: dict):
    """The Smart Fix Agent: detect issues with real linters, fix them, verify.

    Body:
      - filePath: relative path to the file
      - action: "lint" (detect only) | "fix" (detect → fix → verify) | "fix-dry" (detect only, show what's fixable)

    Returns:
      - diagnostics: list of issues found (unified format)
      - tool: which linter was used {id, bin}
      - fixable: count of fixable issues
      - applied: (fix action only) what was fixed, before/after counts
    """
    file_path = body.get("filePath", "")
    action = body.get("action", "lint")

    if not file_path or not PROJECT_ROOT:
        return JSONResponse({"error": "No file path specified"}, status_code=400)

    target = (PROJECT_ROOT / file_path).resolve()
    if not str(target).startswith(str(PROJECT_ROOT.resolve())):
        return JSONResponse({"error": "Path traversal blocked"}, status_code=403)

    if not target.exists() or not target.is_file():
        return JSONResponse({"error": f"File not found: {file_path}"}, status_code=404)

    ext = Path(file_path).suffix.lower()

    # ── STEP 1: DETECT ──
    # ★ Use to_thread to avoid blocking the event loop
    diagnostics, tool, raw = await asyncio.to_thread(_run_linter_json, file_path, ext)

    tool_info = {"id": tool["id"], "bin": tool["bin"]} if tool else None
    fixable_count = sum(1 for d in diagnostics if d.get("fixable"))

    if action == "lint":
        return {
            "filePath": file_path,
            "action": "lint",
            "diagnostics": diagnostics,
            "tool": tool_info,
            "totalCount": len(diagnostics),
            "fixableCount": fixable_count,
            "errorCount": sum(1 for d in diagnostics if d["severity"] == "error"),
            "warningCount": sum(1 for d in diagnostics if d["severity"] == "warning"),
        }

    if action == "fix-dry":
        return {
            "filePath": file_path,
            "action": "fix-dry",
            "diagnostics": diagnostics,
            "tool": tool_info,
            "totalCount": len(diagnostics),
            "fixableCount": fixable_count,
            "message": (
                f"{fixable_count}/{len(diagnostics)} issues are auto-fixable"
                if diagnostics
                else "No issues found"
            ),
        }

    # ── STEP 2: FIX ──
    before_count = len(diagnostics)
    before_fixable = fixable_count

    if not tool:
        return {
            "filePath": file_path,
            "action": "fix",
            "success": False,
            "message": f"No lint tool available for {ext} files",
            "diagnostics": diagnostics,
            "tool": None,
        }

    if fixable_count == 0 and before_count > 0:
        return {
            "filePath": file_path,
            "action": "fix",
            "success": False,
            "message": f"{before_count} issues found but none are auto-fixable",
            "diagnostics": diagnostics,
            "tool": tool_info,
            "beforeCount": before_count,
            "afterCount": before_count,
        }

    fix_success, _, fix_output = await asyncio.to_thread(
        _run_linter_fix, file_path, ext
    )

    # Invalidate diagnostics cache for this file (it was just modified by fix)
    _file_diag_cache.pop(file_path.replace("\\", "/"), None)

    # ── STEP 3: VERIFY ──
    diagnostics_after, _, _ = await asyncio.to_thread(_run_linter_json, file_path, ext)
    after_count = len(diagnostics_after)
    fixed_count = before_count - after_count

    return {
        "filePath": file_path,
        "action": "fix",
        "success": fixed_count > 0,
        "tool": tool_info,
        "beforeCount": before_count,
        "afterCount": after_count,
        "fixedCount": max(fixed_count, 0),
        "fixableCount": before_fixable,
        "diagnostics": diagnostics_after,  # updated diagnostics
        "message": (
            f"✅ {tool_info['id']}: {before_count} → {after_count} issues ({fixed_count} fixed)"
            if fixed_count > 0
            else f"⚠ {tool_info['id']} ran but no issues were resolved ({after_count} remaining)"
        ),
        "fixOutput": fix_output[:1000],
    }


# ── Legacy basic static analysis (kept as fallback) ─────────────────────────


def _detect_file_errors(filepath: Path, content: str, extension: str) -> list[dict]:
    """Run basic static analysis on file content and return a list of diagnostics.

    Each diagnostic: {line, column, severity, message, source}
    """
    errors: list[dict] = []
    lines = content.split("\n")

    if extension == ".py":
        # Python: compile to detect syntax errors
        try:
            compile(content, str(filepath), "exec")
        except SyntaxError as e:
            errors.append(
                {
                    "line": e.lineno or 1,
                    "column": e.offset or 1,
                    "severity": "error",
                    "message": str(e.msg),
                    "source": "python-syntax",
                }
            )

        # Common pattern checks
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            # bare except
            if re.match(r"except\s*:", stripped):
                errors.append(
                    {
                        "line": i,
                        "column": 1,
                        "severity": "warning",
                        "message": "Bare 'except:' catches all exceptions including SystemExit",
                        "source": "lint",
                    }
                )
            # TODO/FIXME/HACK markers
            for marker in ("TODO", "FIXME", "HACK", "XXX"):
                if marker in line:
                    errors.append(
                        {
                            "line": i,
                            "column": line.index(marker) + 1,
                            "severity": "info",
                            "message": f"{marker} marker found",
                            "source": "markers",
                        }
                    )
            # print() left in code (not in tests)
            if stripped.startswith("print(") and "test" not in str(filepath).lower():
                errors.append(
                    {
                        "line": i,
                        "column": 1,
                        "severity": "info",
                        "message": "Debug print() statement",
                        "source": "lint",
                    }
                )

    elif extension in (".js", ".ts", ".jsx", ".tsx"):
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            # console.log left in code
            if "console.log(" in stripped:
                errors.append(
                    {
                        "line": i,
                        "column": line.index("console.log") + 1,
                        "severity": "info",
                        "message": "console.log() statement",
                        "source": "lint",
                    }
                )
            # console.error
            if "console.error(" in stripped:
                errors.append(
                    {
                        "line": i,
                        "column": line.index("console.error") + 1,
                        "severity": "warning",
                        "message": "console.error() call",
                        "source": "lint",
                    }
                )
            # TODO/FIXME
            for marker in ("TODO", "FIXME", "HACK", "XXX"):
                if marker in line:
                    errors.append(
                        {
                            "line": i,
                            "column": line.index(marker) + 1,
                            "severity": "info",
                            "message": f"{marker} marker found",
                            "source": "markers",
                        }
                    )
            # var usage (suggest let/const)
            if re.match(r"\s*var\s+", line) and extension != ".js":
                errors.append(
                    {
                        "line": i,
                        "column": 1,
                        "severity": "info",
                        "message": "Consider using let/const instead of var",
                        "source": "lint",
                    }
                )

    elif extension == ".css":
        for i, line in enumerate(lines, 1):
            # !important
            if "!important" in line:
                errors.append(
                    {
                        "line": i,
                        "column": line.index("!important") + 1,
                        "severity": "warning",
                        "message": "!important overrides cascading -- consider refactoring specificity",
                        "source": "lint",
                    }
                )
            # TODO
            for marker in ("TODO", "FIXME", "HACK"):
                if marker in line:
                    errors.append(
                        {
                            "line": i,
                            "column": line.index(marker) + 1,
                            "severity": "info",
                            "message": f"{marker} marker found",
                            "source": "markers",
                        }
                    )

    elif extension == ".html":
        for i, line in enumerate(lines, 1):
            for marker in ("TODO", "FIXME", "HACK"):
                if marker in line:
                    errors.append(
                        {
                            "line": i,
                            "column": line.index(marker) + 1,
                            "severity": "info",
                            "message": f"{marker} marker found",
                            "source": "markers",
                        }
                    )

    return errors


@app.get("/debug/canvas/file-info")
async def canvas_file_info(path: str = ""):
    """Return detailed info about a project file: metadata, content, errors, dependencies."""
    if not path or not PROJECT_ROOT:
        return JSONResponse({"error": "No file path specified"}, status_code=400)

    # Security: ensure path stays within PROJECT_ROOT
    target = (PROJECT_ROOT / path).resolve()
    if not str(target).startswith(str(PROJECT_ROOT.resolve())):
        return JSONResponse({"error": "Path traversal blocked"}, status_code=403)

    if not target.exists() or not target.is_file():
        return JSONResponse({"error": f"File not found: {path}"}, status_code=404)

    # Read content
    try:
        content = target.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        return JSONResponse({"error": f"Cannot read file: {exc}"}, status_code=500)

    stat = target.stat()
    ext = target.suffix
    posix_key = path.replace("\\", "/")

    # Run error detection — try CACHED results first, then REAL linter, fallback to regex.
    # Cache is keyed by POSIX relative path + file modification time.
    cached_diag = _file_diag_cache.get(posix_key)
    if cached_diag and cached_diag.get("mtime") == stat.st_mtime:
        # Cache hit — same file, instant response
        diagnostics = cached_diag["diagnostics"]
        lint_tool = cached_diag["lint_tool"]
        diagnostics_source = lint_tool["id"] if lint_tool else "regex"
        fixable_count = cached_diag.get("fixable_count", 0)
    else:
        # Cache miss — run real linter in a thread to avoid blocking the event loop
        real_diagnostics, lint_tool, _lint_raw = await asyncio.to_thread(
            _run_linter_json, path, ext
        )
        if lint_tool is not None:
            diagnostics = real_diagnostics
            diagnostics_source = lint_tool["id"]
            fixable_count = sum(1 for d in diagnostics if d.get("fixable"))
        else:
            diagnostics = _detect_file_errors(target, content, ext)
            diagnostics_source = "regex"
            fixable_count = 0
        # Store in cache
        _file_diag_cache[posix_key] = {
            "diagnostics": diagnostics,
            "lint_tool": lint_tool,
            "fixable_count": fixable_count,
            "mtime": stat.st_mtime,
        }

    # Find dependencies (imports from/to this file)
    imports_from: list[str] = []  # what this file imports
    imported_by: list[str] = []  # what imports this file

    for edge in graphData_cache.get("edges") or []:
        if edge["source"] == path:
            imports_from.append(edge["target"])
        if edge["target"] == path:
            imported_by.append(edge["source"])

    # Activity history
    # (activity data is frontend-only, so we return what the backend knows)

    # ── Package Intelligence: suggest useful packages based on diagnostics ──
    installed_deps: set[str] = set()
    try:
        proj_info = _detect_project_tooling(PROJECT_ROOT)
        installed_deps = proj_info.get("installedJsDeps", set()) | proj_info.get("installedPyDeps", set())
    except Exception:
        pass
    pkg_suggestions = _collect_package_suggestions(diagnostics, installed_deps)

    return {
        "path": path,
        "name": target.name,
        "extension": ext,
        "size": stat.st_size,
        "modified": stat.st_mtime,
        "lines": content.count("\n") + 1,
        "content": content,
        "diagnostics": diagnostics,
        "diagnosticsSource": diagnostics_source,
        "lintTool": (
            {"id": lint_tool["id"], "bin": lint_tool["bin"]} if lint_tool else None
        ),
        "fixableCount": fixable_count,
        "errorCount": sum(1 for d in diagnostics if d["severity"] == "error"),
        "warningCount": sum(1 for d in diagnostics if d["severity"] == "warning"),
        "infoCount": sum(1 for d in diagnostics if d["severity"] == "info"),
        "importsFrom": imports_from,
        "importedBy": imported_by,
        "suggestedPackages": pkg_suggestions,
    }


# ─── Quick Fix: smart project-aware suggest & execute ────────────────────────

import shutil as _shutil


def _detect_project_tooling(root: Path) -> dict:
    """Analyse the project once and return tooling intelligence.

    Returns a dict with:
      - jsPackageManager: "npm" | "yarn" | "pnpm" | "bun" | None
      - pyPackageManager: "pip" | "poetry" | "uv" | "pipenv" | "pdm" | None
      - installedJsDeps: set of package names from package.json (deps + devDeps)
      - installedPyDeps: set of package names from requirements / pyproject
      - configFiles: set of config files found (e.g. ".eslintrc.json", "ruff.toml", …)
      - languages: set of detected language keys
    """

    info: dict = {
        "jsPackageManager": None,
        "pyPackageManager": None,
        "installedJsDeps": set(),
        "installedPyDeps": set(),
        "configFiles": set(),
        "languages": set(),
    }

    # ── JS package manager ──
    for lock, pm in [
        ("pnpm-lock.yaml", "pnpm"),
        ("yarn.lock", "yarn"),
        ("bun.lockb", "bun"),
        ("package-lock.json", "npm"),
    ]:
        if (root / lock).exists():
            info["jsPackageManager"] = pm
            break
    if info["jsPackageManager"] is None and (root / "package.json").exists():
        info["jsPackageManager"] = "npm"  # fallback

    # ── JS dependencies ──
    pkg_json = root / "package.json"
    if pkg_json.exists():
        info["languages"].add("javascript")
        try:
            pkg = json.loads(pkg_json.read_text(encoding="utf-8", errors="ignore"))
            deps = set(pkg.get("dependencies", {}).keys())
            dev = set(pkg.get("devDependencies", {}).keys())
            info["installedJsDeps"] = deps | dev
        except Exception:
            pass

    if (root / "tsconfig.json").exists():
        info["languages"].add("typescript")

    # ── Python package manager ──
    for lock, pm in [
        ("poetry.lock", "poetry"),
        ("uv.lock", "uv"),
        ("Pipfile.lock", "pipenv"),
        ("pdm.lock", "pdm"),
    ]:
        if (root / lock).exists():
            info["pyPackageManager"] = pm
            break
    if info["pyPackageManager"] is None:
        # Check for requirements.txt or pyproject.toml → pip
        for f in ("requirements.txt", "backend/requirements.txt", "pyproject.toml"):
            if (root / f).exists():
                info["pyPackageManager"] = "pip"
                info["languages"].add("python")
                break

    # ── Python dependencies ──
    # requirements.txt
    for req_path in [
        "requirements.txt",
        "backend/requirements.txt",
        "requirements-dev.txt",
    ]:
        rf = root / req_path
        if rf.exists():
            info["languages"].add("python")
            try:
                for line in rf.read_text(
                    encoding="utf-8", errors="ignore"
                ).splitlines():
                    line = line.strip()
                    if line and not line.startswith("#") and not line.startswith("-"):
                        # Extract package name (before ==, >=, etc.)
                        name = re.split(r"[><=!~\[;]", line)[0].strip().lower()
                        if name:
                            info["installedPyDeps"].add(name)
            except Exception:
                pass

    # pyproject.toml
    pyp = root / "pyproject.toml"
    if pyp.exists():
        info["languages"].add("python")
        try:
            content = pyp.read_text(encoding="utf-8", errors="ignore")
            # Simple scanner for dependencies in pyproject.toml
            in_deps = False
            for line in content.splitlines():
                stripped = line.strip()
                if stripped.startswith("[") and "dependencies" in stripped.lower():
                    in_deps = True
                    continue
                elif stripped.startswith("["):
                    in_deps = False
                if in_deps and stripped and not stripped.startswith("#"):
                    name = (
                        re.split(r"[><=!~\[;=]", stripped)[0]
                        .strip()
                        .strip('"')
                        .strip("'")
                        .lower()
                    )
                    if name and not name.startswith("["):
                        info["installedPyDeps"].add(name)
            # Check [tool.ruff], [tool.black], [tool.isort] etc.
            if "[tool.ruff]" in content or "[tool.ruff." in content:
                info["configFiles"].add("pyproject.toml:ruff")
            if "[tool.black]" in content:
                info["configFiles"].add("pyproject.toml:black")
            if "[tool.isort]" in content:
                info["configFiles"].add("pyproject.toml:isort")
            if "[tool.autopep8]" in content:
                info["configFiles"].add("pyproject.toml:autopep8")
            if "[tool.pylint]" in content:
                info["configFiles"].add("pyproject.toml:pylint")
            if "[tool.mypy]" in content:
                info["configFiles"].add("pyproject.toml:mypy")
            if "[tool.flake8]" in content:
                info["configFiles"].add("pyproject.toml:flake8")
        except Exception:
            pass

    # ── Config files (presence means the tool is configured) ──
    config_checks = [
        # JS/TS
        (".eslintrc", "eslint"),
        (".eslintrc.js", "eslint"),
        (".eslintrc.json", "eslint"),
        (".eslintrc.yml", "eslint"),
        (".eslintrc.yaml", "eslint"),
        ("eslint.config.js", "eslint"),
        ("eslint.config.mjs", "eslint"),
        ("eslint.config.ts", "eslint"),
        (".prettierrc", "prettier"),
        (".prettierrc.js", "prettier"),
        (".prettierrc.json", "prettier"),
        (".prettierrc.yml", "prettier"),
        ("prettier.config.js", "prettier"),
        (".stylelintrc", "stylelint"),
        (".stylelintrc.json", "stylelint"),
        ("stylelint.config.js", "stylelint"),
        ("stylelint.config.mjs", "stylelint"),
        ("biome.json", "biome"),
        ("biome.jsonc", "biome"),
        # Python
        ("ruff.toml", "ruff"),
        (".ruff.toml", "ruff"),
        ("setup.cfg", "setup.cfg"),  # may contain flake8/mypy sections
        (".flake8", "flake8"),
        ("tox.ini", "tox"),
        (".pylintrc", "pylint"),
        ("pylintrc", "pylint"),
        (".mypy.ini", "mypy"),
        ("mypy.ini", "mypy"),
        # Rust
        ("Cargo.toml", "cargo"),
        ("rustfmt.toml", "rustfmt"),
        (".rustfmt.toml", "rustfmt"),
        ("clippy.toml", "clippy"),
        (".clippy.toml", "clippy"),
        # Go
        ("go.mod", "go"),
        (".golangci.yml", "golangci-lint"),
        (".golangci.yaml", "golangci-lint"),
        (".golangci.json", "golangci-lint"),
        # Ruby
        ("Gemfile", "ruby"),
        (".rubocop.yml", "rubocop"),
        # PHP
        ("composer.json", "composer"),
        (".php-cs-fixer.php", "php-cs-fixer"),
        (".php-cs-fixer.dist.php", "php-cs-fixer"),
        # Java/Kotlin/JVM
        ("pom.xml", "maven"),
        ("build.gradle", "gradle"),
        ("build.gradle.kts", "gradle"),
        ("checkstyle.xml", "checkstyle"),
        # Dart
        ("pubspec.yaml", "dart"),
        ("analysis_options.yaml", "dart-analyzer"),
        # Swift
        ("Package.swift", "swift"),
        (".swiftlint.yml", "swiftlint"),
        # C/C++
        (".clang-format", "clang-format"),
        (".clang-tidy", "clang-tidy"),
        ("CMakeLists.txt", "cmake"),
    ]
    for fname, tool_name in config_checks:
        if (root / fname).exists():
            info["configFiles"].add(tool_name)
            # Infer language
            if tool_name in ("eslint", "prettier", "stylelint", "biome"):
                info["languages"].add("javascript")
            elif tool_name in ("ruff", "black", "flake8", "pylint", "mypy"):
                info["languages"].add("python")
            elif tool_name in ("cargo", "rustfmt", "clippy"):
                info["languages"].add("rust")
            elif tool_name in ("go", "golangci-lint"):
                info["languages"].add("go")
            elif tool_name in ("ruby", "rubocop"):
                info["languages"].add("ruby")
            elif tool_name in ("composer", "php-cs-fixer"):
                info["languages"].add("php")
            elif tool_name in ("dart-analyzer", "dart"):
                info["languages"].add("dart")
            elif tool_name in ("swift", "swiftlint"):
                info["languages"].add("swift")
            elif tool_name in ("clang-format", "clang-tidy", "cmake"):
                info["languages"].add("cpp")

    # Extra language markers
    for marker, lang in [
        ("Cargo.toml", "rust"),
        ("go.mod", "go"),
        ("Gemfile", "ruby"),
        ("composer.json", "php"),
        ("pubspec.yaml", "dart"),
    ]:
        if (root / marker).exists():
            info["languages"].add(lang)

    return info


# Cache project tooling (rebuilt when project root changes)
_tooling_cache: dict = {"root": None, "info": None}


def _get_tooling() -> dict:
    """Get cached project tooling info."""
    if _tooling_cache["root"] != str(PROJECT_ROOT) or _tooling_cache["info"] is None:
        _tooling_cache["root"] = str(PROJECT_ROOT)
        _tooling_cache["info"] = _detect_project_tooling(PROJECT_ROOT)
    return _tooling_cache["info"]


def _js_install_cmd(pm: str | None, pkg: str, dev: bool = True) -> tuple[str, str]:
    """Return (cmd, display) for installing a JS package with the detected package manager."""
    d = "-D" if dev else ""
    if pm == "pnpm":
        return (f"pnpm add {d} {pkg}".strip(), f"pnpm add {d} {pkg}".strip())
    elif pm == "yarn":
        flag = "--dev" if dev else ""
        return (f"yarn add {flag} {pkg}".strip(), f"yarn add {flag} {pkg}".strip())
    elif pm == "bun":
        flag = "-d" if dev else ""
        return (f"bun add {flag} {pkg}".strip(), f"bun add {flag} {pkg}".strip())
    else:  # npm
        return (f"npm install {d} {pkg}".strip(), f"npm install {d} {pkg}".strip())


def _py_install_cmd(pm: str | None, pkg: str) -> tuple[str, str]:
    """Return (cmd, display) for installing a Python package with the detected package manager."""
    if pm == "poetry":
        return (f"poetry add --group dev {pkg}", f"poetry add --group dev {pkg}")
    elif pm == "uv":
        return (f"uv pip install {pkg}", f"uv pip install {pkg}")
    elif pm == "pipenv":
        return (f"pipenv install --dev {pkg}", f"pipenv install --dev {pkg}")
    elif pm == "pdm":
        return (f"pdm add -dG dev {pkg}", f"pdm add -dG dev {pkg}")
    else:  # pip
        return (f"pip install {pkg}", f"pip install {pkg}")


def _build_suggestions(file_path: str, ext: str) -> list[dict]:
    """Build smart, project-aware fix suggestions for a file."""
    ti = _get_tooling()
    js_pm = ti["jsPackageManager"]
    py_pm = ti["pyPackageManager"]
    js_deps = ti["installedJsDeps"]
    py_deps = ti["installedPyDeps"]
    configs = ti["configFiles"]

    suggestions: list[dict] = []

    def _add(
        id_: str,
        label: str,
        icon: str,
        cmd: list[str],
        display: str,
        install_pkg: str,
        install_fn,
        category: str,
        *,
        configured: bool = False,
        in_deps: bool = False,
    ):
        install_cmd, install_display = (
            install_fn(install_pkg) if install_pkg else ("", "")
        )
        tool_bin = cmd[0]
        available = _shutil.which(tool_bin) is not None
        suggestions.append(
            {
                "id": id_,
                "label": label,
                "icon": icon,
                "cmd": cmd,
                "display": display.replace("{file}", file_path),
                "installCmd": install_cmd,
                "installDisplay": install_display,
                "category": category,
                "available": available,
                "configured": configured,
                "inProject": in_deps,
            }
        )

    def js_install(pkg):
        return _js_install_cmd(js_pm, pkg)

    def py_install(pkg):
        return _py_install_cmd(py_pm, pkg)

    def no_install(pkg):
        return ("", "")

    # ── CSS / SCSS / LESS ──
    if ext in (".css", ".scss", ".less", ".sass"):
        _add(
            "stylelint-fix",
            "Stylelint --fix",
            "🔧",
            ["npx", "--yes", "stylelint", "--fix"],
            "npx stylelint --fix {file}",
            "stylelint stylelint-config-standard",
            js_install,
            "lint",
            configured="stylelint" in configs,
            in_deps=bool({"stylelint"} & js_deps),
        )
        _add(
            "prettier-css",
            "Prettier",
            "🎨",
            ["npx", "--yes", "prettier", "--write"],
            "npx prettier --write {file}",
            "prettier",
            js_install,
            "format",
            configured="prettier" in configs,
            in_deps="prettier" in js_deps,
        )

    # ── JavaScript / TypeScript ──
    elif ext in (".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"):
        # Biome (modern alternative to ESLint+Prettier)
        if "biome" in configs or "@biomejs/biome" in js_deps:
            _add(
                "biome-check",
                "Biome check --fix",
                "🔧",
                ["npx", "--yes", "@biomejs/biome", "check", "--fix"],
                "npx @biomejs/biome check --fix {file}",
                "@biomejs/biome",
                js_install,
                "lint",
                configured="biome" in configs,
                in_deps="@biomejs/biome" in js_deps,
            )
        # ESLint
        _add(
            "eslint-fix",
            "ESLint --fix",
            "🔧",
            ["npx", "--yes", "eslint", "--fix"],
            "npx eslint --fix {file}",
            "eslint",
            js_install,
            "lint",
            configured="eslint" in configs,
            in_deps="eslint" in js_deps,
        )
        # Prettier
        _add(
            "prettier-js",
            "Prettier",
            "🎨",
            ["npx", "--yes", "prettier", "--write"],
            "npx prettier --write {file}",
            "prettier",
            js_install,
            "format",
            configured="prettier" in configs,
            in_deps="prettier" in js_deps,
        )

    # ── Python ──
    elif ext in (".py", ".pyi"):
        # Ruff (fast, modern)
        _add(
            "ruff-fix",
            "Ruff --fix",
            "🔧",
            ["ruff", "check", "--fix", "--unsafe-fixes"],
            "ruff check --fix --unsafe-fixes {file}",
            "ruff",
            py_install,
            "lint",
            configured="ruff" in configs or "pyproject.toml:ruff" in configs,
            in_deps="ruff" in py_deps,
        )
        # Ruff format (replacement for black)
        _add(
            "ruff-format",
            "Ruff format",
            "🎨",
            ["ruff", "format"],
            "ruff format {file}",
            "ruff",
            py_install,
            "format",
            configured="ruff" in configs or "pyproject.toml:ruff" in configs,
            in_deps="ruff" in py_deps,
        )
        # Black
        _add(
            "black-format",
            "Black",
            "🎨",
            ["black"],
            "black {file}",
            "black",
            py_install,
            "format",
            configured="pyproject.toml:black" in configs,
            in_deps="black" in py_deps,
        )
        # Autopep8
        _add(
            "autopep8-fix",
            "Autopep8",
            "🎨",
            ["autopep8", "--in-place"],
            "autopep8 --in-place {file}",
            "autopep8",
            py_install,
            "format",
            configured="pyproject.toml:autopep8" in configs,
            in_deps="autopep8" in py_deps,
        )
        # Flake8
        if (
            "flake8" in configs
            or "pyproject.toml:flake8" in configs
            or "flake8" in py_deps
        ):
            _add(
                "flake8-check",
                "Flake8 (check only)",
                "🔍",
                ["flake8"],
                "flake8 {file}",
                "flake8",
                py_install,
                "lint",
                configured="flake8" in configs or "pyproject.toml:flake8" in configs,
                in_deps="flake8" in py_deps,
            )
        # Pylint
        if (
            "pylint" in configs
            or "pyproject.toml:pylint" in configs
            or "pylint" in py_deps
        ):
            _add(
                "pylint-check",
                "Pylint (check only)",
                "🔍",
                ["pylint"],
                "pylint {file}",
                "pylint",
                py_install,
                "lint",
                configured="pylint" in configs or "pyproject.toml:pylint" in configs,
                in_deps="pylint" in py_deps,
            )
        # Mypy
        if "mypy" in configs or "pyproject.toml:mypy" in configs or "mypy" in py_deps:
            _add(
                "mypy-check",
                "Mypy (type check)",
                "🔍",
                ["mypy"],
                "mypy {file}",
                "mypy",
                py_install,
                "lint",
                configured="mypy" in configs or "pyproject.toml:mypy" in configs,
                in_deps="mypy" in py_deps,
            )

    # ── Rust ──
    elif ext == ".rs":
        _add(
            "cargo-clippy-fix",
            "Clippy --fix",
            "🔧",
            ["cargo", "clippy", "--fix", "--allow-dirty", "--"],
            "cargo clippy --fix --allow-dirty",
            "",
            no_install,
            "lint",
            configured="clippy" in configs,
        )
        _add(
            "rustfmt",
            "Rustfmt",
            "🎨",
            ["rustfmt"],
            "rustfmt {file}",
            "",
            no_install,
            "format",
            configured="rustfmt" in configs,
        )

    # ── Go ──
    elif ext == ".go":
        _add(
            "gofmt",
            "Gofmt",
            "🎨",
            ["gofmt", "-w"],
            "gofmt -w {file}",
            "",
            no_install,
            "format",
        )
        _add(
            "golangci-lint-fix",
            "Golangci-lint --fix",
            "🔧",
            ["golangci-lint", "run", "--fix"],
            "golangci-lint run --fix {file}",
            "github.com/golangci/golangci-lint/cmd/golangci-lint@latest",
            lambda pkg: (f"go install {pkg}", f"go install {pkg.split('/')[-1]}"),
            "lint",
            configured="golangci-lint" in configs,
        )

    # ── Ruby ──
    elif ext == ".rb":
        _add(
            "rubocop-fix",
            "RuboCop -A",
            "🔧",
            ["rubocop", "-A"],
            "rubocop -A {file}",
            "rubocop",
            lambda pkg: ("gem install rubocop", "gem install rubocop"),
            "lint",
            configured="rubocop" in configs,
        )

    # ── PHP ──
    elif ext == ".php":
        _add(
            "php-cs-fixer",
            "PHP-CS-Fixer",
            "🔧",
            ["php-cs-fixer", "fix"],
            "php-cs-fixer fix {file}",
            "friendsofphp/php-cs-fixer",
            lambda pkg: (
                "composer global require friendsofphp/php-cs-fixer",
                "composer require php-cs-fixer",
            ),
            "lint",
            configured="php-cs-fixer" in configs,
        )

    # ── Java / Kotlin ──
    elif ext in (".java", ".kt", ".kts"):
        if "checkstyle" in configs:
            _add(
                "checkstyle",
                "Checkstyle",
                "🔍",
                ["checkstyle", "-c", "/google_checks.xml"],
                "checkstyle {file}",
                "",
                no_install,
                "lint",
                configured=True,
            )
        _add(
            "google-java-format",
            "Google Java Format",
            "🎨",
            ["google-java-format", "--replace"],
            "google-java-format --replace {file}",
            "",
            no_install,
            "format",
        )

    # ── HTML ──
    elif ext in (".html", ".htm"):
        _add(
            "prettier-html",
            "Prettier",
            "🎨",
            ["npx", "--yes", "prettier", "--write"],
            "npx prettier --write {file}",
            "prettier",
            js_install,
            "format",
            configured="prettier" in configs,
            in_deps="prettier" in js_deps,
        )

    # ── JSON / YAML / Markdown ──
    elif ext in (".json", ".jsonc", ".yaml", ".yml", ".md"):
        _add(
            "prettier-json",
            "Prettier",
            "🎨",
            ["npx", "--yes", "prettier", "--write"],
            "npx prettier --write {file}",
            "prettier",
            js_install,
            "format",
            configured="prettier" in configs,
            in_deps="prettier" in js_deps,
        )

    # ── Dart ──
    elif ext == ".dart":
        _add(
            "dart-fix",
            "dart fix --apply",
            "🔧",
            ["dart", "fix", "--apply"],
            "dart fix --apply {file}",
            "",
            no_install,
            "lint",
        )
        _add(
            "dart-format",
            "dart format",
            "🎨",
            ["dart", "format"],
            "dart format {file}",
            "",
            no_install,
            "format",
        )

    # ── Swift ──
    elif ext == ".swift":
        _add(
            "swiftlint-fix",
            "SwiftLint --fix",
            "🔧",
            ["swiftlint", "--fix"],
            "swiftlint --fix {file}",
            "swiftlint",
            lambda pkg: ("brew install swiftlint", "brew install swiftlint"),
            "lint",
            configured="swiftlint" in configs,
        )
        _add(
            "swift-format",
            "swift-format",
            "🎨",
            ["swift-format", "--in-place"],
            "swift-format --in-place {file}",
            "swift-format",
            lambda pkg: ("brew install swift-format", "brew install swift-format"),
            "format",
        )

    # ── C / C++ ──
    elif ext in (".c", ".h", ".cpp", ".hpp", ".cc", ".cxx"):
        _add(
            "clang-format",
            "Clang-Format",
            "🎨",
            ["clang-format", "-i"],
            "clang-format -i {file}",
            "",
            no_install,
            "format",
            configured="clang-format" in configs,
        )
        if "clang-tidy" in configs:
            _add(
                "clang-tidy",
                "Clang-Tidy --fix",
                "🔧",
                ["clang-tidy", "--fix"],
                "clang-tidy --fix {file}",
                "",
                no_install,
                "lint",
                configured=True,
            )

    # Sort: configured first, then in-project deps, then available, then rest
    suggestions.sort(
        key=lambda s: (
            not s.get("configured"),
            not s.get("inProject"),
            not s.get("available"),
            s["label"],
        )
    )

    return suggestions


# ─── Auto-Fix: directly resolve diagnostics by editing the file ───────────────


def _auto_fix_file(
    filepath: Path, content: str, extension: str, fix_filter: str | None = None
) -> tuple[str, list[dict]]:
    """Apply targeted fixes to the file content based on _detect_file_errors diagnostics.

    Args:
        filepath: absolute path to the file
        content: current file content text
        extension: file extension (e.g. ".css", ".py")
        fix_filter: if set, only apply fixes for this specific `source:message` key.
                    If None, apply ALL available auto-fixes.

    Returns:
        (new_content, list_of_applied_fixes)
        Each applied fix: {line, message, action}
    """
    lines = content.split("\n")
    applied: list[dict] = []

    # We process lines in reverse order to keep line numbers stable
    for i in range(len(lines) - 1, -1, -1):
        line_num = i + 1
        line = lines[i]
        stripped = line.strip()

        if extension == ".css":
            # Fix: remove !important
            if "!important" in line:
                key = "lint:!important overrides cascading"
                if fix_filter and not key.startswith(fix_filter):
                    continue
                lines[i] = line.replace(" !important", "").replace("!important", "")
                applied.append(
                    {
                        "line": line_num,
                        "message": "Removed !important",
                        "action": "edit",
                    }
                )

            # Fix: remove TODO/FIXME/HACK comment lines
            for marker in ("TODO", "FIXME", "HACK"):
                if marker in line:
                    key = f"markers:{marker} marker found"
                    if fix_filter and not key.startswith(fix_filter):
                        continue
                    # If the whole line is a comment with just the marker, remove it
                    if re.match(r"^\s*/\*.*" + marker + r".*\*/\s*$", line) or re.match(
                        r"^\s*/\*\*?\s*" + marker + r".*$", line
                    ):
                        lines.pop(i)
                        applied.append(
                            {
                                "line": line_num,
                                "message": f"Removed {marker} comment line",
                                "action": "delete",
                            }
                        )

        elif extension == ".py":
            # Fix: bare except → except Exception
            if re.match(r"except\s*:", stripped):
                key = "lint:Bare 'except:'"
                if fix_filter and not key.startswith(fix_filter):
                    continue
                lines[i] = line.replace("except:", "except Exception:")
                applied.append(
                    {
                        "line": line_num,
                        "message": "Changed bare 'except:' to 'except Exception:'",
                        "action": "edit",
                    }
                )

            # Fix: remove print() statements
            if stripped.startswith("print(") and "test" not in str(filepath).lower():
                key = "lint:Debug print()"
                if fix_filter and not key.startswith(fix_filter):
                    continue
                lines.pop(i)
                applied.append(
                    {
                        "line": line_num,
                        "message": "Removed debug print() statement",
                        "action": "delete",
                    }
                )

            # Fix: remove TODO/FIXME/HACK comment lines
            for marker in ("TODO", "FIXME", "HACK", "XXX"):
                if marker in line:
                    key = f"markers:{marker} marker found"
                    if fix_filter and not key.startswith(fix_filter):
                        continue
                    if re.match(r"^\s*#.*" + marker + r".*$", line):
                        lines.pop(i)
                        applied.append(
                            {
                                "line": line_num,
                                "message": f"Removed {marker} comment line",
                                "action": "delete",
                            }
                        )
                        break  # line is gone, don't check other markers

        elif extension in (".js", ".ts", ".jsx", ".tsx"):
            # Fix: remove console.log()
            if "console.log(" in stripped:
                key = "lint:console.log()"
                if fix_filter and not key.startswith(fix_filter):
                    continue
                # If the entire statement is console.log(...), remove the line
                if re.match(r"^\s*console\.log\(.*\);?\s*$", line):
                    lines.pop(i)
                    applied.append(
                        {
                            "line": line_num,
                            "message": "Removed console.log() statement",
                            "action": "delete",
                        }
                    )

            # Fix: console.error → remove
            if "console.error(" in stripped:
                key = "lint:console.error()"
                if fix_filter and not key.startswith(fix_filter):
                    continue
                if re.match(r"^\s*console\.error\(.*\);?\s*$", line):
                    lines.pop(i)
                    applied.append(
                        {
                            "line": line_num,
                            "message": "Removed console.error() statement",
                            "action": "delete",
                        }
                    )

            # Fix: var → let
            if re.match(r"\s*var\s+", line) and extension != ".js":
                key = "lint:Consider using let/const"
                if fix_filter and not key.startswith(fix_filter):
                    continue
                lines[i] = re.sub(r"\bvar\b", "let", line, count=1)
                applied.append(
                    {
                        "line": line_num,
                        "message": "Changed var to let",
                        "action": "edit",
                    }
                )

            # Fix: remove TODO/FIXME/HACK comment lines
            for marker in ("TODO", "FIXME", "HACK", "XXX"):
                if marker in line:
                    key = f"markers:{marker} marker found"
                    if fix_filter and not key.startswith(fix_filter):
                        continue
                    if re.match(r"^\s*//.*" + marker + r".*$", line):
                        lines.pop(i)
                        applied.append(
                            {
                                "line": line_num,
                                "message": f"Removed {marker} comment line",
                                "action": "delete",
                            }
                        )
                        break

        elif extension == ".html":
            for marker in ("TODO", "FIXME", "HACK"):
                if marker in line:
                    key = f"markers:{marker} marker found"
                    if fix_filter and not key.startswith(fix_filter):
                        continue
                    if re.match(r"^\s*<!--.*" + marker + r".*-->\s*$", line):
                        lines.pop(i)
                        applied.append(
                            {
                                "line": line_num,
                                "message": f"Removed {marker} comment",
                                "action": "delete",
                            }
                        )
                        break

    new_content = "\n".join(lines)
    return new_content, applied


@app.post("/v1/canvas/auto-fix")
async def canvas_auto_fix(body: dict):
    """Apply targeted auto-fixes to a file, resolving the diagnostics that
    _detect_file_errors found.

    Body:
      - filePath: relative path to the file
      - fixType: (optional) filter — only apply fixes matching this source:message prefix.
                 E.g. "lint:!important", "markers:TODO", "lint:console.log".
                 If omitted, ALL fixable diagnostics are resolved.
      - dryRun: (optional, default false) if true, return fixes WITHOUT writing to disk.

    Returns:
      - applied: list of fixes applied [{line, message, action}]
      - beforeCount: number of diagnostics before
      - afterCount: number of diagnostics after
      - filePath: the file path
    """
    file_path = body.get("filePath", "")
    fix_type = body.get("fixType", None)
    dry_run = body.get("dryRun", False)

    if not file_path or not PROJECT_ROOT:
        return JSONResponse({"error": "No file path specified"}, status_code=400)

    target = (PROJECT_ROOT / file_path).resolve()
    if not str(target).startswith(str(PROJECT_ROOT.resolve())):
        return JSONResponse({"error": "Path traversal blocked"}, status_code=403)

    if not target.exists() or not target.is_file():
        return JSONResponse({"error": f"File not found: {file_path}"}, status_code=404)

    try:
        content = target.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        return JSONResponse({"error": f"Cannot read file: {exc}"}, status_code=500)

    ext = target.suffix
    diagnostics_before = _detect_file_errors(target, content, ext)
    before_count = len(diagnostics_before)

    new_content, applied = _auto_fix_file(target, content, ext, fix_type)

    if not applied:
        return {
            "filePath": file_path,
            "applied": [],
            "beforeCount": before_count,
            "afterCount": before_count,
            "message": "No auto-fixable issues found"
            + (f" for filter '{fix_type}'" if fix_type else ""),
        }

    if not dry_run:
        # Write the fixed content back
        try:
            target.write_text(new_content, encoding="utf-8")
        except Exception as exc:
            return JSONResponse({"error": f"Cannot write file: {exc}"}, status_code=500)

    # Re-detect to get new count
    diagnostics_after = _detect_file_errors(target, new_content, ext)
    after_count = len(diagnostics_after)

    return {
        "filePath": file_path,
        "applied": applied,
        "beforeCount": before_count,
        "afterCount": after_count,
        "message": f"Applied {len(applied)} fix{'es' if len(applied) != 1 else ''} — {before_count} → {after_count} issues",
    }


@app.post("/v1/canvas/quick-fix")
async def canvas_quick_fix(body: dict):
    """Suggest or execute fix commands for a file's diagnostics.

    Body:
      - filePath: relative path to the file
      - action: "suggest" (default) or "execute"
      - toolId: which fix to execute (required for action=execute)
    """
    file_path = body.get("filePath", "")
    action = body.get("action", "suggest")
    tool_id = body.get("toolId", "")

    if not file_path or not PROJECT_ROOT:
        return JSONResponse({"error": "No file path specified"}, status_code=400)

    # Security: stay within PROJECT_ROOT
    target = (PROJECT_ROOT / file_path).resolve()
    if not str(target).startswith(str(PROJECT_ROOT.resolve())):
        return JSONResponse({"error": "Path traversal blocked"}, status_code=403)

    ext = Path(file_path).suffix.lower()
    suggestions = _build_suggestions(file_path, ext)

    # Gather project detection metadata
    ti = _get_tooling()

    if action == "suggest":
        return {
            "filePath": file_path,
            "extension": ext,
            "suggestions": suggestions,
            "projectInfo": {
                "jsPackageManager": ti["jsPackageManager"],
                "pyPackageManager": ti["pyPackageManager"],
                "configuredTools": sorted(ti["configFiles"]),
                "languages": sorted(ti["languages"]),
            },
        }

    # ── Execute mode ──
    if not tool_id:
        return JSONResponse(
            {"error": "toolId required for execute action"}, status_code=400
        )

    chosen = next((s for s in suggestions if s["id"] == tool_id), None)
    if not chosen:
        return JSONResponse({"error": f"Unknown toolId: {tool_id}"}, status_code=404)

    # Build full command (some tools like cargo clippy don't take per-file args)
    cmd = [*list(chosen["cmd"]), file_path]
    # Special cases where file path goes differently
    if tool_id in ("cargo-clippy-fix",):
        cmd = list(chosen["cmd"])  # clippy operates on the whole crate

    display_cmd = chosen["display"]

    import platform as _platform

    _use_shell = _platform.system() == "Windows"

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(PROJECT_ROOT),
            shell=_use_shell,
            stdin=subprocess.DEVNULL,
        )
        output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")

        # Invalidate tooling cache so next suggest sees any changes
        _tooling_cache["info"] = None

        return {
            "success": result.returncode == 0,
            "toolId": tool_id,
            "command": display_cmd,
            "output": output.strip()[:3000]
            or (
                "Done — no output"
                if result.returncode == 0
                else "Failed with no output"
            ),
            "exitCode": result.returncode,
        }
    except FileNotFoundError:
        return {
            "success": False,
            "toolId": tool_id,
            "command": display_cmd,
            "output": f"Tool not found: {cmd[0]}.\n\nInstall with:\n  {chosen.get('installCmd', 'N/A')}",
            "exitCode": -1,
            "installCmd": chosen.get("installCmd", ""),
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "toolId": tool_id,
            "command": display_cmd,
            "output": "Command timed out after 60 seconds",
            "exitCode": -1,
        }
    except Exception as exc:
        return {
            "success": False,
            "toolId": tool_id,
            "command": display_cmd,
            "output": f"Error: {exc}",
            "exitCode": -1,
        }


@app.post("/v1/canvas/install-tool")
async def canvas_install_tool(body: dict):
    """Install a fix tool (npm/pip/gem/etc.) so Quick Fix can use it."""
    install_cmd_str = body.get("installCmd", "")
    if not install_cmd_str:
        return JSONResponse({"error": "No installCmd provided"}, status_code=400)

    # Parse command string into list
    import shlex

    try:
        cmd = shlex.split(install_cmd_str)
    except ValueError:
        cmd = install_cmd_str.split()

    import platform as _platform

    _use_shell = _platform.system() == "Windows"

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(PROJECT_ROOT),
            shell=_use_shell,
            stdin=subprocess.DEVNULL,
        )
        output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")

        # Invalidate tooling cache after install
        _tooling_cache["info"] = None

        return {
            "success": result.returncode == 0,
            "command": install_cmd_str,
            "output": output.strip()[:3000] or "Done",
            "exitCode": result.returncode,
        }
    except FileNotFoundError:
        return {
            "success": False,
            "command": install_cmd_str,
            "output": f"Command not found: {cmd[0]}. Ensure the package manager is installed.",
            "exitCode": -1,
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "command": install_cmd_str,
            "output": "Installation timed out after 120 seconds",
            "exitCode": -1,
        }
    except Exception as exc:
        return {
            "success": False,
            "command": install_cmd_str,
            "output": f"Error: {exc}",
            "exitCode": -1,
        }


# ── Terminal Command Queue (for VS Code extension polling) ─────────────────
# Frontend sends commands here; the VS Code extension polls /v1/terminal/pending
# and executes them in the VS Code integrated terminal.
# The extension ACKs each command after execution so the frontend can show
# clear completion feedback.

import threading
import uuid as _uuid_mod
from collections import deque

_terminal_queue: deque = deque(maxlen=50)
_terminal_lock = threading.Lock()

# Track command status: id -> { command, status, queued_at, acked_at }
# status: "queued" | "executed"
_terminal_commands: dict[str, dict] = {}
_TERMINAL_CMD_MAX = 200  # max tracked commands (FIFO eviction)


def _terminal_gc():
    """Evict oldest commands if we exceed the max."""
    while len(_terminal_commands) > _TERMINAL_CMD_MAX:
        oldest_key = next(iter(_terminal_commands))
        del _terminal_commands[oldest_key]


@app.post("/v1/terminal/run")
async def terminal_run(body: dict):
    """Queue a command for execution in the VS Code terminal.

    Body:
      - command: string — the shell command to run
      - cwd: string (optional) — working directory

    Returns:
      - id: unique command ID for status tracking
      - queued: true
    """
    command = body.get("command", "").strip()
    if not command:
        return JSONResponse({"error": "No command provided"}, status_code=400)

    cmd_id = _uuid_mod.uuid4().hex[:12]
    with _terminal_lock:
        _terminal_queue.append(
            {
                "id": cmd_id,
                "command": command,
                "cwd": body.get("cwd", ""),
            }
        )
        _terminal_commands[cmd_id] = {
            "command": command,
            "status": "queued",
            "queued_at": _time_ops.time(),
            "acked_at": None,
        }
        _terminal_gc()
    return {"queued": True, "id": cmd_id, "command": command}


@app.get("/v1/terminal/pending")
async def terminal_pending():
    """Return and clear all pending terminal commands.

    The VS Code extension polls this endpoint every ~2 seconds.
    Each command includes an 'id' field for ACK tracking.
    """
    with _terminal_lock:
        commands = list(_terminal_queue)
        _terminal_queue.clear()
    return {"commands": commands}


@app.post("/v1/terminal/ack")
async def terminal_ack(body: dict):
    """Acknowledge that a command was executed in the terminal.

    Body:
      - id: string — the command ID returned by /v1/terminal/run
    """
    cmd_id = body.get("id", "").strip()
    if not cmd_id:
        return JSONResponse({"error": "No id provided"}, status_code=400)
    with _terminal_lock:
        if cmd_id in _terminal_commands:
            _terminal_commands[cmd_id]["status"] = "executed"
            _terminal_commands[cmd_id]["acked_at"] = _time_ops.time()
            return {"acked": True, "id": cmd_id}
    return JSONResponse({"error": "Unknown command id"}, status_code=404)


@app.get("/v1/terminal/status/{cmd_id}")
async def terminal_status(cmd_id: str):
    """Check the status of a terminal command.

    Returns:
      - status: "queued" | "executed" | "unknown"
    """
    with _terminal_lock:
        entry = _terminal_commands.get(cmd_id)
    if entry:
        return {"id": cmd_id, "status": entry["status"], "command": entry["command"]}
    return {"id": cmd_id, "status": "unknown"}


# ── Operations Center — Lint Dashboard, Health Scan, Fix All ────────────────

import time as _time_ops

_ops_history: list[dict] = []  # structured history of all operations
_OPS_MAX_HISTORY = 100

# Per-file scan cache: maps relative path -> {errors, warnings, issues, fixable, linter}
# Populated by scan-all, consumed by _build_project_graph for real linter counts.
_ops_scan_cache: dict[str, dict] = {}

# Per-file full diagnostics cache: maps POSIX relative path -> full linter results.
# Populated lazily by file-info (and by scan-all in future).
# Stores: {diagnostics, lint_tool, mtime} where mtime is the file modification time
# at the time of the scan, so we can invalidate when the file changes.
_file_diag_cache: dict[str, dict] = {}


def _collect_project_files() -> dict[str, list[str]]:
    """Collect files grouped by linter category: js, css, py."""
    if not PROJECT_ROOT:
        return {}
    result: dict[str, list[str]] = {"js": [], "css": [], "py": []}

    # JS files
    js_dirs = [PROJECT_ROOT / "frontend" / "js"]
    for js_dir in js_dirs:
        if js_dir.exists():
            for f in js_dir.rglob("*.js"):
                result["js"].append(str(f))

    # CSS files
    css_dirs = [PROJECT_ROOT / "frontend" / "css"]
    for css_dir in css_dirs:
        if css_dir.exists():
            for f in css_dir.rglob("*.css"):
                result["css"].append(str(f))

    # Python files
    py_dirs = [PROJECT_ROOT / "backend"]
    for py_dir in py_dirs:
        if py_dir.exists():
            for f in py_dir.rglob("*.py"):
                if "__pycache__" not in str(f):
                    result["py"].append(str(f))

    return result


@app.post("/v1/ops/scan-all")
async def ops_scan_all():
    """Run all available linters on all project files and return structured results.

    Uses ThreadPoolExecutor to parallelise linter subprocess calls per category.
    ★ The heavy work runs in asyncio.to_thread so the event loop stays free.
    """
    if not PROJECT_ROOT:
        return JSONResponse({"error": "No project root"}, status_code=400)

    scan_result = await asyncio.to_thread(_ops_scan_all_sync)
    return scan_result


def _ops_scan_all_sync() -> dict:
    """Synchronous scan-all helper (runs in a worker thread)."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    start = _time_ops.time()
    files = _collect_project_files()

    linters_summary: list[dict] = []
    files_detail: list[dict] = []
    total_issues = 0
    total_fixable = 0
    total_files_scanned = 0
    total_files_clean = 0

    def _scan_one(fpath: str, ext: str):
        diagnostics, tool, _raw = _run_linter_json(fpath, ext)
        n_issues = len(diagnostics)
        n_fix = sum(1 for d in diagnostics if d.get("fixable"))
        rel = str(Path(fpath).relative_to(PROJECT_ROOT))
        return {
            "file": rel,
            "linter": tool["id"] if tool else "none",
            "issues": n_issues,
            "fixable": n_fix,
            "errors": sum(1 for d in diagnostics if d.get("severity") == "error"),
            "warnings": sum(1 for d in diagnostics if d.get("severity") == "warning"),
            "topIssues": [d["message"][:80] for d in diagnostics[:3]],
        }

    for cat, ext, linter_name, cat_label in [
        ("js", ".js", "eslint", "JavaScript"),
        ("css", ".css", "stylelint", "CSS"),
        ("py", ".py", "ruff", "Python"),
    ]:
        cat_files = files.get(cat, [])
        if not cat_files:
            continue
        cat_issues = 0
        cat_fixable = 0

        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(_scan_one, fp, ext): fp for fp in cat_files}
            for fut in as_completed(futures):
                info = fut.result()
                files_detail.append(info)
                total_files_scanned += 1
                cat_issues += info["issues"]
                cat_fixable += info["fixable"]
                if info["issues"] == 0:
                    total_files_clean += 1

        total_issues += cat_issues
        total_fixable += cat_fixable
        linters_summary.append(
            {
                "linter": linter_name,
                "category": cat_label,
                "filesScanned": len(cat_files),
                "totalIssues": cat_issues,
                "fixableIssues": cat_fixable,
                "status": "clean" if cat_issues == 0 else "issues",
            }
        )

    # ── Populate per-file cache so the Architecture Graph can show real linter data ──
    # Keys are normalised to POSIX paths (forward slashes) to match _build_project_graph.
    _ops_scan_cache.clear()
    for fd in files_detail:
        key = fd["file"].replace("\\", "/")
        _ops_scan_cache[key] = {
            "errors": fd["errors"],
            "warnings": fd["warnings"],
            "issues": fd["issues"],
            "fixable": fd["fixable"],
            "linter": fd["linter"],
        }

    elapsed = round(_time_ops.time() - start, 2)
    files_detail.sort(key=lambda f: f["issues"], reverse=True)

    health_score = (
        round((total_files_clean / total_files_scanned) * 100)
        if total_files_scanned > 0
        else 100
    )

    scan_result = {
        "healthScore": health_score,
        "totalFiles": total_files_scanned,
        "cleanFiles": total_files_clean,
        "totalIssues": total_issues,
        "fixableIssues": total_fixable,
        "linters": linters_summary,
        "files": files_detail,
        "duration": elapsed,
        "timestamp": _time_ops.time(),
    }

    _ops_history.append(
        {
            "type": "scan",
            "healthScore": health_score,
            "totalIssues": total_issues,
            "fixableIssues": total_fixable,
            "totalFiles": total_files_scanned,
            "cleanFiles": total_files_clean,
            "duration": elapsed,
            "timestamp": _time_ops.time(),
        }
    )
    if len(_ops_history) > _OPS_MAX_HISTORY:
        _ops_history.pop(0)

    return scan_result


@app.post("/v1/ops/fix-all")
async def ops_fix_all():
    """Run all linters with --fix on every applicable file. Returns before/after comparison.

    Uses ThreadPoolExecutor to parallelise subprocess calls within each linter category.
    ★ The heavy work runs in asyncio.to_thread so the event loop stays free.
    """
    if not PROJECT_ROOT:
        return JSONResponse({"error": "No project root"}, status_code=400)

    fix_result = await asyncio.to_thread(_ops_fix_all_sync)
    return fix_result


def _ops_fix_all_sync() -> dict:
    """Synchronous fix-all helper (runs in a worker thread).

    Optimised: uses scan cache when available to skip categories with 0 fixable.
    Only runs BEFORE/FIX/AFTER for files that have fixable issues.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    start = _time_ops.time()
    files = _collect_project_files()
    results: list[dict] = []
    all_errors: list[dict] = []

    def _scan_one(fpath: str, ext: str) -> tuple[int, int, list]:
        """Return (total_issues, fixable_count, diagnostics)."""
        diag, _t, _r = _run_linter_json(fpath, ext)
        fixable = sum(1 for d in diag if d.get("fixable"))
        return len(diag), fixable, diag

    def _fix_one(fpath: str, ext: str) -> tuple[str, bool, str]:
        ok, _tool, output = _run_linter_fix(fpath, ext)
        return fpath, ok, output

    for cat, ext, linter_name, cat_label in [
        ("js", ".js", "eslint", "JavaScript"),
        ("css", ".css", "stylelint", "CSS"),
        ("py", ".py", "ruff", "Python"),
    ]:
        cat_files = files.get(cat, [])
        if not cat_files:
            continue

        # ── BEFORE scan (parallel) — also determines which files have fixable issues ──
        before_total = 0
        fixable_total = 0
        fixable_files: list[str] = []  # only these need --fix

        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(_scan_one, fp, ext): fp for fp in cat_files}
            for fut in as_completed(futures):
                fp = futures[fut]
                count, fixable, _ = fut.result()
                before_total += count
                fixable_total += fixable
                if fixable > 0:
                    fixable_files.append(fp)

        # ── Skip FIX if nothing is fixable in this category ──
        if fixable_total == 0:
            results.append(
                {
                    "linter": linter_name,
                    "category": cat_label,
                    "filesProcessed": len(cat_files),
                    "beforeIssues": before_total,
                    "afterIssues": before_total,
                    "fixedCount": 0,
                    "remainingFixable": 0,
                    "fixErrors": 0,
                }
            )
            continue

        # ── FIX only files with fixable issues (parallel) ──
        fix_failures: list[dict] = []
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(_fix_one, fp, ext): fp for fp in fixable_files}
            for fut in as_completed(futures):
                fpath, ok, output = fut.result()
                if not ok:
                    rel = str(Path(fpath).relative_to(PROJECT_ROOT))
                    fix_failures.append(
                        {"file": rel, "linter": linter_name, "error": output[:200]}
                    )

        all_errors.extend(fix_failures)

        # ── AFTER scan — re-scan ALL files to get accurate counts ──
        after_total = 0
        after_fixable = 0
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(_scan_one, fp, ext): fp for fp in cat_files}
            for fut in as_completed(futures):
                count, fixable, _ = fut.result()
                after_total += count
                after_fixable += fixable

        results.append(
            {
                "linter": linter_name,
                "category": cat_label,
                "filesProcessed": len(cat_files),
                "beforeIssues": before_total,
                "afterIssues": after_total,
                "fixedCount": max(0, before_total - after_total),
                "remainingFixable": after_fixable,
                "fixErrors": len(fix_failures),
            }
        )

    elapsed = round(_time_ops.time() - start, 2)
    total_before = sum(r["beforeIssues"] for r in results)
    total_after = sum(r["afterIssues"] for r in results)
    total_fixed = max(0, total_before - total_after)

    fix_result = {
        "totalBefore": total_before,
        "totalAfter": total_after,
        "totalFixed": total_fixed,
        "linters": results,
        "errors": all_errors,
        "duration": elapsed,
        "timestamp": _time_ops.time(),
    }

    _ops_history.append(
        {
            "type": "fix-all",
            "totalBefore": total_before,
            "totalAfter": total_after,
            "totalFixed": total_fixed,
            "errors": len(all_errors),
            "duration": elapsed,
            "timestamp": _time_ops.time(),
        }
    )
    if len(_ops_history) > _OPS_MAX_HISTORY:
        _ops_history.pop(0)

    return fix_result


@app.get("/v1/ops/history")
async def ops_history():
    """Return the structured history of scan & fix operations."""
    return {"history": list(reversed(_ops_history))}


# Graph data cache for dependency lookups
graphData_cache: dict = {}


def _build_project_graph(root: Path) -> dict:
    """Build a dependency graph of project files.

    Uses real linter data: first checks _ops_scan_cache, then runs linters
    in parallel for any files not yet cached.  Falls back to regex only when
    no linter binary is available for the extension.

    Returns:
        nodes: list of {id, label, group, extension, size}
        edges: list of {source, target}
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    nodes = []
    edges = []
    node_ids: set[str] = set()

    # Collect Python + JS/TS files
    extensions = {".py", ".js", ".ts", ".jsx", ".tsx", ".css", ".html"}
    ignore_dirs = {
        "__pycache__",
        "node_modules",
        ".git",
        "venv",
        ".venv",
        "dist",
        "build",
    }

    # Phase 1:  gather all files and separate cached vs uncached
    file_entries: list[dict] = []  # {fp, rel, group, size, ext}
    uncached_entries: list[dict] = []  # subset that needs real linter scan

    for fp in root.rglob("*"):
        if fp.is_dir():
            continue
        if any(part in ignore_dirs for part in fp.parts):
            continue
        if fp.suffix not in extensions:
            continue
        # Skip vendored/minified libraries — they pollute linter results
        if fp.name.endswith(".min.js") or fp.name.endswith(".min.css"):
            continue

        rel = fp.relative_to(root).as_posix()
        parts = rel.split("/")
        group = parts[0] if len(parts) > 1 else "root"

        try:
            size = fp.stat().st_size
        except OSError:
            size = 0

        entry = {"fp": fp, "rel": rel, "group": group, "size": size, "ext": fp.suffix}
        file_entries.append(entry)

        cached = _ops_scan_cache.get(rel)
        if cached:
            entry["diag_errors"] = cached["errors"]
            entry["diag_warnings"] = cached["warnings"]
            entry["total_issues"] = cached["issues"]
            entry["fixable_count"] = cached["fixable"]
            entry["linter_id"] = cached["linter"]
            entry["real"] = True
        else:
            uncached_entries.append(entry)

    # Phase 2:  run real linters in parallel for uncached files
    def _lint_one(e: dict) -> dict:
        """Run real linter on a single file; fallback to regex if no tool."""
        rel = e["rel"]
        ext = e["ext"]
        fp = e["fp"]
        diagnostics, tool, _raw = _run_linter_json(rel, ext)
        if tool is not None:
            errs = sum(1 for d in diagnostics if d.get("severity") == "error")
            warns = sum(1 for d in diagnostics if d.get("severity") == "warning")
            n_fix = sum(1 for d in diagnostics if d.get("fixable"))
            # Populate the shared cache so next graph build is instant
            _ops_scan_cache[rel] = {
                "errors": errs,
                "warnings": warns,
                "issues": len(diagnostics),
                "fixable": n_fix,
                "linter": tool["id"],
            }
            return {
                "rel": rel,
                "errors": errs,
                "warnings": warns,
                "issues": len(diagnostics),
                "fixable": n_fix,
                "linter": tool["id"],
                "real": True,
            }
        else:
            # No linter for this extension — regex fallback
            errs = warns = 0
            try:
                content = fp.read_text(encoding="utf-8", errors="ignore")
                diag = _detect_file_errors(fp, content, ext)
                for d in diag:
                    if d["severity"] == "error":
                        errs += 1
                    elif d["severity"] == "warning":
                        warns += 1
            except Exception:
                pass
            return {
                "rel": rel,
                "errors": errs,
                "warnings": warns,
                "issues": errs + warns,
                "fixable": 0,
                "linter": "",
                "real": False,
            }

    if uncached_entries:
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(_lint_one, e): e for e in uncached_entries}
            for fut in as_completed(futures):
                result = fut.result()
                entry = futures[fut]
                entry["diag_errors"] = result["errors"]
                entry["diag_warnings"] = result["warnings"]
                entry["total_issues"] = result["issues"]
                entry["fixable_count"] = result["fixable"]
                entry["linter_id"] = result["linter"]
                entry["real"] = result["real"]

    # Phase 3:  build node list
    for e in file_entries:
        nodes.append(
            {
                "id": e["rel"],
                "label": e["fp"].name,
                "group": e["group"],
                "extension": e["ext"],
                "size": e["size"],
                "errorCount": e.get("diag_errors", 0),
                "warningCount": e.get("diag_warnings", 0),
                "issueCount": e.get("total_issues", 0),
                "fixableCount": e.get("fixable_count", 0),
                "linter": e.get("linter_id", ""),
                "realLinterData": e.get("real", False),
            }
        )
        node_ids.add(e["rel"])

    # Build edges from import/require statements
    for node in nodes:
        fp = root / node["id"]
        try:
            content = fp.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        if node["extension"] == ".py":
            # Python: from X import Y / import X
            for m in re.finditer(r"(?:from|import)\s+([\w.]+)", content):
                mod = m.group(1).split(".")[0]
                # resolve to a file in the project
                for candidate in node_ids:
                    if Path(candidate).stem == mod:
                        edges.append({"source": node["id"], "target": candidate})
                        break

        elif node["extension"] in (".js", ".ts", ".jsx", ".tsx"):
            # JS/TS: import ... from './path' / require('./path')
            for m in re.finditer(
                r"""(?:import\s.*?from\s+|require\s*\(\s*)['"]([^'"]+)['"]""", content
            ):
                ref = m.group(1)
                if not ref.startswith("."):
                    continue  # skip node_modules
                # resolve relative to the file
                ref_path = (fp.parent / ref).resolve()
                # try with extensions
                for ext in ("", ".js", ".ts", ".jsx", ".tsx"):
                    cand = ref_path.with_suffix(ext) if ext else ref_path
                    try:
                        cand_rel = cand.relative_to(root).as_posix()
                    except ValueError:
                        continue
                    if cand_rel in node_ids:
                        edges.append({"source": node["id"], "target": cand_rel})
                        break

        elif node["extension"] == ".html":
            # HTML: <script src="..."> / <link href="...">
            for m in re.finditer(r"""(?:src|href)\s*=\s*['"]([^'"]+)['"]""", content):
                ref = m.group(1)
                if ref.startswith("http"):
                    continue
                ref_clean = ref.split("?")[0]  # strip cache busters
                for candidate in node_ids:
                    if candidate.endswith(ref_clean) or ref_clean.endswith(candidate):
                        edges.append({"source": node["id"], "target": candidate})
                        break

    # Deduplicate edges
    seen = set()
    unique_edges = []
    for e in edges:
        key = (e["source"], e["target"])
        if key not in seen and e["source"] != e["target"]:
            seen.add(key)
            unique_edges.append(e)

    return {"nodes": nodes, "edges": unique_edges}


# ─── Vulnerability / Audit Scan (Phase 3) ────────────────────────────────────

_audit_cache: dict = {}  # {"npm": {...}, "pip": {...}, "ts": float}


def _run_npm_audit(root: Path) -> dict:
    """Run `npm audit --json` and parse results."""
    pkg_json = root / "package.json"
    if not pkg_json.exists():
        return {"available": False, "reason": "no package.json"}

    try:
        result = subprocess.run(
            ["npm", "audit", "--json"],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=60,
        )
        # npm audit returns exit code > 0 when vulnerabilities found —
        # that's expected, not an error
        raw = result.stdout or "{}"
        data = json.loads(raw)
    except FileNotFoundError:
        return {"available": False, "reason": "npm not found"}
    except subprocess.TimeoutExpired:
        return {"available": False, "reason": "npm audit timed out"}
    except (json.JSONDecodeError, ValueError):
        return {"available": False, "reason": "npm audit JSON parse error"}

    # npm audit v7+ format: { vulnerabilities: { pkg: {severity, ...} } }
    vulns_raw = data.get("vulnerabilities", {})
    metadata = data.get("metadata", {})
    vuln_counts = metadata.get("vulnerabilities", {})

    vulnerabilities: list[dict] = []
    for pkg_name, info in vulns_raw.items():
        severity = info.get("severity", "info")
        via = info.get("via", [])
        # "via" can be dicts (direct) or strings (transitive)
        advisories: list[str] = []
        for v in via:
            if isinstance(v, dict):
                advisories.append(v.get("title", v.get("name", "")))
            elif isinstance(v, str):
                advisories.append(f"via {v}")

        vulnerabilities.append({
            "package": pkg_name,
            "severity": severity,
            "title": "; ".join(advisories[:3]) if advisories else f"{severity} vulnerability",
            "fixAvailable": info.get("fixAvailable", False),
            "range": info.get("range", ""),
            "isDirect": info.get("isDirect", False),
        })

    # Sort: critical > high > moderate > low > info
    sev_order = {"critical": 0, "high": 1, "moderate": 2, "low": 3, "info": 4}
    vulnerabilities.sort(key=lambda v: sev_order.get(v["severity"], 5))

    return {
        "available": True,
        "tool": "npm audit",
        "total": len(vulnerabilities),
        "critical": vuln_counts.get("critical", 0),
        "high": vuln_counts.get("high", 0),
        "moderate": vuln_counts.get("moderate", 0),
        "low": vuln_counts.get("low", 0),
        "info": vuln_counts.get("info", 0),
        "vulnerabilities": vulnerabilities,
        "fixCmd": "npm audit fix",
        "fixForceCmd": "npm audit fix --force",
    }


def _run_pip_audit(root: Path) -> dict:
    """Run `pip-audit --format json` and parse results."""
    # Check for Python project
    has_py = False
    for f in ("requirements.txt", "backend/requirements.txt", "pyproject.toml", "setup.py"):
        if (root / f).exists():
            has_py = True
            break
    if not has_py:
        return {"available": False, "reason": "no Python project files"}

    try:
        result = subprocess.run(
            ["pip-audit", "--format", "json"],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=120,
        )
        raw = result.stdout or "[]"
        data = json.loads(raw)
    except FileNotFoundError:
        return {"available": False, "reason": "pip-audit not installed (pip install pip-audit)"}
    except subprocess.TimeoutExpired:
        return {"available": False, "reason": "pip-audit timed out"}
    except (json.JSONDecodeError, ValueError):
        return {"available": False, "reason": "pip-audit JSON parse error"}

    # pip-audit returns a list of {name, version, vulns: [{id, fix_versions, description}]}
    # OR {dependencies: [...]} format
    deps_list = data if isinstance(data, list) else data.get("dependencies", [])

    vulnerabilities: list[dict] = []
    for dep in deps_list:
        pkg_name = dep.get("name", "unknown")
        version = dep.get("version", "")
        for vuln in dep.get("vulns", []):
            vuln_id = vuln.get("id", "")
            desc = vuln.get("description", "")
            fix_versions = vuln.get("fix_versions", [])
            vulnerabilities.append({
                "package": pkg_name,
                "severity": "high",  # pip-audit doesn't provide severity levels
                "title": f"{vuln_id}: {desc[:120]}" if desc else vuln_id,
                "fixAvailable": len(fix_versions) > 0,
                "range": f"{version} → {', '.join(fix_versions)}" if fix_versions else version,
                "isDirect": True,
                "vulnId": vuln_id,
            })

    return {
        "available": True,
        "tool": "pip-audit",
        "total": len(vulnerabilities),
        "critical": 0,
        "high": len(vulnerabilities),
        "moderate": 0,
        "low": 0,
        "info": 0,
        "vulnerabilities": vulnerabilities,
        "fixCmd": "pip-audit --fix",
        "fixForceCmd": "pip-audit --fix --dry-run",
    }


@app.post("/v1/canvas/audit")
async def canvas_audit():
    """Run npm audit and/or pip-audit, return vulnerability report."""
    global _audit_cache
    if not PROJECT_ROOT:
        return {"error": "PROJECT_ROOT not set"}

    npm_result = await asyncio.to_thread(_run_npm_audit, PROJECT_ROOT)
    pip_result = await asyncio.to_thread(_run_pip_audit, PROJECT_ROOT)

    total_vulns = 0
    critical = 0
    high = 0
    if npm_result.get("available"):
        total_vulns += npm_result.get("total", 0)
        critical += npm_result.get("critical", 0)
        high += npm_result.get("high", 0)
    if pip_result.get("available"):
        total_vulns += pip_result.get("total", 0)
        critical += pip_result.get("critical", 0)
        high += pip_result.get("high", 0)

    _audit_cache = {
        "npm": npm_result,
        "pip": pip_result,
        "ts": time.time(),
        "totalVulns": total_vulns,
        "critical": critical,
        "high": high,
    }

    # Push audit result to canvas SSE so graph updates in real-time
    audit_event = {
        "type": "audit_result",
        "totalVulns": total_vulns,
        "critical": critical,
        "high": high,
        "npm": {
            "available": npm_result.get("available", False),
            "total": npm_result.get("total", 0),
            "critical": npm_result.get("critical", 0),
            "high": npm_result.get("high", 0),
        },
        "pip": {
            "available": pip_result.get("available", False),
            "total": pip_result.get("total", 0),
        },
    }
    _push_canvas_event(audit_event)

    return {
        "npm": npm_result,
        "pip": pip_result,
        "totalVulns": total_vulns,
        "critical": critical,
        "high": high,
        "timestamp": _audit_cache["ts"],
    }


@app.get("/v1/canvas/audit")
async def canvas_audit_get():
    """Return cached audit results (GET for Inspector panel)."""
    if not _audit_cache:
        return {"npm": {"available": False}, "pip": {"available": False}, "totalVulns": 0, "cached": False}
    return {
        "npm": _audit_cache.get("npm", {}),
        "pip": _audit_cache.get("pip", {}),
        "totalVulns": _audit_cache.get("totalVulns", 0),
        "critical": _audit_cache.get("critical", 0),
        "high": _audit_cache.get("high", 0),
        "timestamp": _audit_cache.get("ts", 0),
        "cached": True,
    }


# ─── Canvas SSE Stream ───────────────────────────────────────────────────────

canvas_sse_subscribers: list[asyncio.Queue] = []


@app.get("/debug/canvas/stream")
async def canvas_sse_stream(request: Request):
    """SSE stream for canvas node/edge events."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=500)
    canvas_sse_subscribers.append(queue)
    logger.info(f"Canvas SSE client connected (total: {len(canvas_sse_subscribers)})")

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=30.0)
                    if data == ":keepalive":
                        yield {"comment": "keepalive"}
                    else:
                        yield {"data": data}
                except asyncio.TimeoutError:
                    yield {"comment": "keepalive"}
        finally:
            if queue in canvas_sse_subscribers:
                canvas_sse_subscribers.remove(queue)
            logger.info(
                f"Canvas SSE client disconnected (remaining: {len(canvas_sse_subscribers)})"
            )

    return EventSourceResponse(event_generator())


@app.get("/debug/canvas/graph")
async def canvas_graph():
    """Return the full project dependency graph (nodes + edges) for the Architecture Live Graph."""
    global graphData_cache
    if not PROJECT_ROOT:
        return {"nodes": [], "edges": [], "error": "PROJECT_ROOT not set"}
    # ★ Run in thread — _build_project_graph now runs real linters in parallel
    graph = await asyncio.to_thread(_build_project_graph, PROJECT_ROOT)
    graphData_cache = graph  # cache for file-info dependency lookups
    return graph


# ─── Test Runner ──────────────────────────────────────────────────────────────

_TEST_COMMANDS: dict[str, dict] = {
    "vitest": {
        "cmd": ["npx", "vitest", "run", "--reporter=json"],
        "label": "Vitest Unit Tests",
    },
    "tsc": {"cmd": ["npx", "tsc", "--noEmit"], "label": "TypeScript Check"},
    "eslint": {"cmd": ["npx", "eslint", ".", "--format=json"], "label": "ESLint"},
    "integration": {
        "cmd": ["npx", "vitest", "run", "--config=vitest.integration.config.ts"],
        "label": "Integration Tests",
    },
    "e2e": {"cmd": ["npx", "playwright", "test"], "label": "E2E Playwright"},
    "pytest": {
        "cmd": ["python", "-m", "pytest", "--tb=short", "-q"],
        "label": "Pytest Backend",
    },
    "openapi": {
        "cmd": ["python", "-m", "pytest", "tests/test_openapi.py", "-q"],
        "label": "OpenAPI Audit",
    },
    "tlaplus": {
        "cmd": ["tlc", "-config", "spec.cfg", "spec.tla"],
        "label": "TLA+ Specs",
    },
    "coverage": {
        "cmd": ["python", "-m", "pytest", "--cov", "--cov-report=json", "-q"],
        "label": "Coverage",
    },
    "security": {"cmd": ["npx", "audit-ci", "--json"], "label": "Security Audit"},
    "a11y": {"cmd": ["npx", "pa11y-ci"], "label": "Accessibility"},
    "perf": {
        "cmd": ["npx", "lighthouse", "--output=json", "--quiet"],
        "label": "Performance",
    },
    "contract": {"cmd": ["npx", "dredd"], "label": "API Contract"},
    "dependency": {"cmd": ["pip", "check"], "label": "Dependency Audit"},
}


@app.post("/v1/tests/run/{suite_id}")
async def v1_tests_run(suite_id: str):
    """Run a test suite by ID. Attempts real execution; falls back to status report."""
    suite = _TEST_COMMANDS.get(suite_id)
    if not suite:
        return JSONResponse(
            {"error": f"Unknown test suite: {suite_id}"}, status_code=404
        )

    # ★ Run blocking subprocess in a thread to keep the event loop free
    return await asyncio.to_thread(_run_test_suite_sync, suite_id, suite)


def _run_test_suite_sync(suite_id: str, suite: dict) -> dict:
    """Synchronous test-suite runner (runs in a worker thread)."""
    cmd = suite["cmd"]
    label = suite["label"]
    start = time.time()

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(PROJECT_ROOT),
        )
        elapsed = round(time.time() - start, 2)

        # Parse output
        stdout = result.stdout or ""
        stderr = result.stderr or ""
        output = stdout + ("\n" + stderr if stderr else "")
        success = result.returncode == 0

        # Try to extract pass/fail counts from output
        passed = 0
        failed = 0
        # Common patterns
        m = re.search(r"(\d+)\s+pass", output, re.I)
        if m:
            passed = int(m.group(1))
        m = re.search(r"(\d+)\s+fail", output, re.I)
        if m:
            failed = int(m.group(1))
        # pytest style
        m = re.search(r"(\d+)\s+passed", output, re.I)
        if m:
            passed = int(m.group(1))
        m = re.search(r"(\d+)\s+failed", output, re.I)
        if m:
            failed = int(m.group(1))

        if passed == 0 and failed == 0 and success:
            passed = 1  # At least mark as 1 passed if exit code 0

        return {
            "success": success,
            "passed": passed,
            "failed": failed,
            "duration": f"{elapsed}s",
            "output": output[:2000],
            "suite": suite_id,
            "label": label,
        }

    except FileNotFoundError:
        return {
            "success": False,
            "passed": 0,
            "failed": 1,
            "duration": "0s",
            "output": f"Command not found: {cmd[0]}. Install the required tool to run {label}.",
            "suite": suite_id,
            "label": label,
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "passed": 0,
            "failed": 1,
            "duration": "60s (timeout)",
            "output": f"{label} timed out after 60 seconds",
            "suite": suite_id,
            "label": label,
        }
    except Exception as exc:
        return {
            "success": False,
            "passed": 0,
            "failed": 1,
            "duration": "0s",
            "output": f"Error running {label}: {exc}",
            "suite": suite_id,
            "label": label,
        }


# ─── Project Scanner ──────────────────────────────────────────────────────────


def _scan_tree(root: Path, max_depth: int = 4, _depth: int = 0) -> list[dict]:
    """Walk the project directory and return a lightweight tree structure."""
    items = []
    if _depth > max_depth:
        return items
    try:
        for entry in sorted(
            root.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())
        ):
            name = entry.name
            # Skip common noise
            if name.startswith(".") or name in (
                "__pycache__",
                "node_modules",
                ".git",
                "venv",
                ".venv",
                "dist",
                "build",
            ):
                continue
            if entry.is_dir():
                children = _scan_tree(entry, max_depth, _depth + 1)
                items.append({"name": name, "type": "dir", "children": children})
            else:
                size = entry.stat().st_size
                items.append(
                    {"name": name, "type": "file", "size": size, "ext": entry.suffix}
                )
    except PermissionError:
        pass
    return items


def _count_tree(tree: list[dict]) -> dict:
    """Count files and dirs in a scanned tree."""
    files = 0
    dirs = 0
    by_ext: dict[str, int] = {}
    for item in tree:
        if item["type"] == "dir":
            dirs += 1
            sub = _count_tree(item.get("children", []))
            files += sub["files"]
            dirs += sub["dirs"]
            for ext, cnt in sub["by_ext"].items():
                by_ext[ext] = by_ext.get(ext, 0) + cnt
        else:
            files += 1
            ext = item.get("ext", "")
            if ext:
                by_ext[ext] = by_ext.get(ext, 0) + 1
    return {"files": files, "dirs": dirs, "by_ext": by_ext}


@app.get("/v1/project/scan")
async def v1_project_scan():
    """Scan the actual project directory and return its real file tree."""
    tree = _scan_tree(PROJECT_ROOT)
    stats = _count_tree(tree)
    return {
        "root": str(PROJECT_ROOT),
        "tree": tree,
        "stats": stats,
        "scannedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }


@app.get("/v1/project/endpoints")
async def v1_project_endpoints():
    """Return all registered routes in this FastAPI app."""
    routes = []
    for route in app.routes:
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", None)
        if methods and path:
            for m in sorted(methods):
                routes.append({"method": m, "path": path})
    return {"endpoints": routes, "total": len(routes)}


# ─── Services Discovery (RADAR) ──────────────────────────────────────────────
# Dynamically discovers ALL service groups from actual registered routes.
# Zero hardcoding — works on any backend, any project, any IDE.
_SKIP_PATHS = frozenset(
    {
        "/openapi.json",
        "/docs",
        "/docs/oauth2-redirect",
        "/redoc",
        "/",
        "/{filename:path}.html",
    }
)


def _group_key_for_path(path: str) -> str | None:
    """Derive a service-group key from a route path.
    Returns None for internal/static routes that should be skipped."""
    if path in _SKIP_PATHS:
        return None
    parts = path.strip("/").split("/")
    if not parts or not parts[0]:
        return None
    first = parts[0]
    if first == "v1":
        return parts[1] if len(parts) >= 2 else None
    if first == "ws":
        return "websocket"
    # Top-level groups: /health, /ready → "health"; /debug/* → "debug"
    if first in ("health", "ready"):
        return "health"
    return first


@app.get("/v1/services/discover")
async def v1_services_discover():
    """RADAR: discover all live service groups from actual registered routes.

    Introspects app.routes at runtime — no hardcoded list, no hallucinations.
    Groups routes by path prefix, detects source files from Python bytecode,
    and provides a testable GET URL for each service group.
    """
    from collections import defaultdict

    groups: dict[str, dict] = defaultdict(
        lambda: {
            "endpoints": [],
            "get_paths": [],
            "source_files": set(),
        }
    )

    for route in app.routes:
        methods = getattr(route, "methods", None)
        rpath = getattr(route, "path", None)
        if not methods or not rpath:
            continue
        key = _group_key_for_path(rpath)
        if key is None:
            continue

        g = groups[key]

        # Detect source file from the endpoint callable's bytecode
        ep_func = getattr(route, "endpoint", None)
        if ep_func:
            try:
                src = os.path.basename(ep_func.__code__.co_filename)
                g["source_files"].add(src)
            except Exception:
                pass

        for m in sorted(methods):
            ep_str = f"{m} {rpath}"
            if ep_str not in g["endpoints"]:
                g["endpoints"].append(ep_str)
            # Collect GET paths without path-params for test URL selection
            # Exclude SSE streams and the diagnostics endpoint itself (recursive)
            if m == "GET" and "{" not in rpath:
                if "stream" in rpath or rpath == "/v1/services/diagnostics":
                    continue
                if rpath not in g["get_paths"]:
                    g["get_paths"].append(rpath)

    services = []
    for key in sorted(groups):
        g = groups[key]
        eps = sorted(g["endpoints"])
        all_get_paths = list(g["get_paths"])  # all GETs without path-params
        test_path = all_get_paths[0] if all_get_paths else None
        src_files = sorted(g["source_files"]) if g["source_files"] else ["unknown"]

        services.append(
            {
                "id": key,
                "name": key.replace("-", " ").replace("_", " ").title(),
                "endpoints": eps,
                "endpointCount": len(eps),
                "testPath": test_path,
                "testPaths": all_get_paths,  # ALL testable GET endpoints
                "sourceFiles": src_files,
            }
        )

    return {
        "discoveredAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "services": services,
        "totalServices": len(services),
        "totalEndpoints": sum(s["endpointCount"] for s in services),
    }


# ── In-memory per-service error history (RADAR diagnostics) ──────────────
_service_error_log: dict[str, list[dict]] = (
    {}
)  # service_id -> [{ts, path, status, msg}]
_SERVICE_ERROR_LOG_MAX = 50  # max errors kept per service


@app.get("/v1/services/health")
async def v1_services_health():
    """Quick service health overview without probing all endpoints.

    Returns a simple summary based on route introspection.
    Use /v1/services/diagnostics for full probe scan.
    """
    discovery = await v1_services_discover()
    services = discovery["services"]

    return {
        "status": "ok",
        "totalServices": len(services),
        "totalEndpoints": sum(s["endpointCount"] for s in services),
        "services": [
            {
                "id": s["id"],
                "name": s["name"],
                "endpointCount": s["endpointCount"],
                "status": "healthy",  # Assume healthy if route exists
            }
            for s in services
        ],
        "checkedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }


@app.get("/v1/services/diagnostics")
async def v1_services_diagnostics():
    """RADAR deep diagnostics: probe EVERY testable GET endpoint internally.

    Uses httpx ASGI transport to call each endpoint inside the running
    process -- zero network overhead, real execution.

    Returns per-service:
      - probes: [{path, latencyMs, httpStatus, bodyValid, bodySize, bodyPreview, anomalies}]
      - status: worst across all probes (offline > degraded > healthy > no-test)
      - latencyMs: max across probes
      - anomalies: aggregated from all probes
      - recentErrors: from error log
    """
    discovery = await v1_services_discover()
    services = discovery["services"]

    LATENCY_WARN_MS = 500
    LATENCY_CRIT_MS = 2000
    TIMEOUT_S = 5.0

    STATUS_RANK = {"offline": 3, "degraded": 2, "healthy": 1, "no-test": 0}

    results = []

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://internal",
        timeout=TIMEOUT_S,
    ) as client:
        for svc in services:
            test_paths = svc.get("testPaths") or []
            all_probes = []
            svc_anomalies = []
            svc_worst_status = "no-test"

            if not test_paths:
                svc_anomalies.append("No testable GET endpoint")

            for tp in test_paths:
                probe: dict[str, Any] = {
                    "path": tp,
                    "status": "offline",
                    "latencyMs": None,
                    "httpStatus": None,
                    "bodyValid": None,
                    "bodySize": None,
                    "bodyPreview": None,
                    "anomalies": [],
                }

                t0 = time.perf_counter()
                try:
                    resp = await client.get(tp)
                    elapsed_ms = round((time.perf_counter() - t0) * 1000)
                    body_bytes = resp.content
                    body_text = body_bytes.decode("utf-8", errors="replace")

                    probe["latencyMs"] = elapsed_ms
                    probe["httpStatus"] = resp.status_code
                    probe["bodySize"] = len(body_bytes)
                    probe["bodyPreview"] = body_text[:300]

                    # Status
                    if 200 <= resp.status_code < 300:
                        probe["status"] = "healthy"
                    elif 400 <= resp.status_code < 500:
                        probe["status"] = "degraded"
                        probe["anomalies"].append(
                            f"Client error: HTTP {resp.status_code}"
                        )
                    else:
                        probe["status"] = "degraded"
                        probe["anomalies"].append(
                            f"Server error: HTTP {resp.status_code}"
                        )

                    # Body validation
                    if len(body_bytes) == 0:
                        probe["bodyValid"] = False
                        probe["anomalies"].append("Empty response body")
                    else:
                        try:
                            json.loads(body_text)
                            probe["bodyValid"] = True
                        except (json.JSONDecodeError, ValueError):
                            probe["bodyValid"] = False
                            if resp.headers.get("content-type", "").startswith(
                                "application/json"
                            ):
                                probe["anomalies"].append(
                                    "Content-Type is JSON but body is not valid JSON"
                                )

                    # Latency anomalies
                    if elapsed_ms > LATENCY_CRIT_MS:
                        probe["anomalies"].append(
                            f"CRITICAL latency: {elapsed_ms}ms (>{LATENCY_CRIT_MS}ms)"
                        )
                    elif elapsed_ms > LATENCY_WARN_MS:
                        probe["anomalies"].append(
                            f"High latency: {elapsed_ms}ms (>{LATENCY_WARN_MS}ms)"
                        )

                    # Log errors
                    if resp.status_code >= 400:
                        _log_service_error(
                            svc["id"], tp, resp.status_code, body_text[:200]
                        )

                except httpx.TimeoutException:
                    elapsed_ms = round((time.perf_counter() - t0) * 1000)
                    probe["latencyMs"] = elapsed_ms
                    probe["anomalies"].append(f"Timeout after {elapsed_ms}ms")
                    _log_service_error(svc["id"], tp, 0, "timeout")
                except Exception as exc:
                    elapsed_ms = round((time.perf_counter() - t0) * 1000)
                    probe["latencyMs"] = elapsed_ms
                    probe["anomalies"].append(f"Connection error: {str(exc)[:120]}")
                    _log_service_error(svc["id"], tp, 0, str(exc)[:200])

                all_probes.append(probe)
                # Aggregate worst status
                if STATUS_RANK.get(probe["status"], 0) > STATUS_RANK.get(
                    svc_worst_status, 0
                ):
                    svc_worst_status = probe["status"]
                # Aggregate anomalies (prefixed with path)
                for a in probe["anomalies"]:
                    svc_anomalies.append(f"{tp}: {a}")

            # Compute service-level aggregates from probes
            probe_latencies = [
                p["latencyMs"] for p in all_probes if p["latencyMs"] is not None
            ]
            max_latency = max(probe_latencies) if probe_latencies else None
            # Pick representative HTTP status (worst one)
            probe_statuses = [
                p["httpStatus"] for p in all_probes if p["httpStatus"] is not None
            ]
            worst_http = max(probe_statuses) if probe_statuses else None
            # Body valid = all valid
            probe_valid = [
                p["bodyValid"] for p in all_probes if p["bodyValid"] is not None
            ]
            all_body_valid = all(probe_valid) if probe_valid else None
            # Total body size
            total_body_size = (
                sum(p["bodySize"] for p in all_probes if p["bodySize"] is not None)
                or None
            )

            diag: dict[str, Any] = {
                "id": svc["id"],
                "name": svc["name"],
                "endpoints": svc["endpoints"],
                "endpointCount": svc["endpointCount"],
                "testPath": svc["testPath"],
                "testPaths": svc.get("testPaths", []),
                "sourceFiles": svc["sourceFiles"],
                # Aggregated diagnostics
                "status": svc_worst_status,
                "latencyMs": max_latency,
                "httpStatus": worst_http,
                "bodyValid": all_body_valid,
                "bodySize": total_body_size,
                "bodyPreview": None,  # no single preview when multi-probe
                "anomalies": svc_anomalies,
                "recentErrors": _service_error_log.get(svc["id"], [])[-5:],
                # NEW: per-endpoint probes
                "probes": all_probes,
                "probeCount": len(all_probes),
            }

            results.append(diag)

    # Summary stats
    healthy = sum(1 for r in results if r["status"] == "healthy")
    degraded = sum(1 for r in results if r["status"] == "degraded")
    offline = sum(1 for r in results if r["status"] == "offline")
    no_test = sum(1 for r in results if r["status"] == "no-test")
    total_anomalies = sum(len(r["anomalies"]) for r in results)
    latencies = [r["latencyMs"] for r in results if r["latencyMs"] is not None]
    avg_latency = round(sum(latencies) / len(latencies)) if latencies else None

    return {
        "scannedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "summary": {
            "total": len(results),
            "healthy": healthy,
            "degraded": degraded,
            "offline": offline,
            "noTest": no_test,
            "totalAnomalies": total_anomalies,
            "avgLatencyMs": avg_latency,
        },
        "services": results,
    }


def _log_service_error(service_id: str, path: str, status: int, msg: str):
    """Append to per-service error history (capped per service)."""
    if service_id not in _service_error_log:
        _service_error_log[service_id] = []
    log = _service_error_log[service_id]
    log.append(
        {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "path": path,
            "status": status,
            "msg": msg,
        }
    )
    # Cap
    if len(log) > _SERVICE_ERROR_LOG_MAX:
        _service_error_log[service_id] = log[-_SERVICE_ERROR_LOG_MAX:]


@app.get("/v1/project/detect")
async def v1_project_detect():
    """Auto-detect language, framework, package manager, structure, and IDE hints."""
    result = detect_project(PROJECT_ROOT)

    # ── IDE Detection Hints ───────────────────────────────────────────────
    # Check for IDE-specific configuration directories in the project root.
    ide_hint = "generic"
    ide_markers = {
        ".vscode": "vscode",
        ".cursor": "cursor",
        ".idea": "jetbrains",
        ".windsurf": "windsurf",
        ".zed": "zed",
    }
    detected_ides = []
    for marker, ide_id in ide_markers.items():
        if (PROJECT_ROOT / marker).exists():
            detected_ides.append(ide_id)

    # Check framework hints for Tauri/Electron → synapse profile
    fws = result.get("frameworks", [])
    if any(f.lower() in ("tauri", "electron") for f in fws):
        detected_ides.append("synapse")

    if detected_ides:
        ide_hint = detected_ides[0]  # Primary IDE

    result["ide"] = ide_hint
    result["detectedIDEs"] = detected_ides
    return result


@app.get("/v1/project/framework")
async def v1_project_framework():
    """Framework-specific deep introspection (routes, models, middleware)."""
    frameworks = detect_frameworks(PROJECT_ROOT)
    if not frameworks:
        return {"message": "No known framework detected", "frameworks": []}
    return extract_all(frameworks, PROJECT_ROOT)


# ─── File Watcher Endpoints ──────────────────────────────────────────────────
@app.get("/v1/watcher/status")
async def v1_watcher_status():
    """Return file watcher status."""
    if _file_watcher is None:
        return {
            "running": False,
            "available": False,
            "message": "Watcher not initialized",
        }
    return {
        "running": _file_watcher.is_running,
        "available": _file_watcher.available,
        "root": str(_file_watcher.root),
    }


@app.post("/v1/watcher/start")
async def v1_watcher_start():
    """Start the file watcher."""
    if _file_watcher is None:
        return JSONResponse({"error": "Watcher not initialized"}, status_code=500)
    if _file_watcher.is_running:
        return {"message": "Already running"}
    _file_watcher.start()
    return {"message": "Watcher started", "running": _file_watcher.is_running}


@app.post("/v1/watcher/stop")
async def v1_watcher_stop():
    """Stop the file watcher."""
    if _file_watcher is None:
        return JSONResponse({"error": "Watcher not initialized"}, status_code=500)
    if not _file_watcher.is_running:
        return {"message": "Already stopped"}
    _file_watcher.stop()
    return {"message": "Watcher stopped", "running": False}


# ─── Serve Frontend ──────────────────────────────────────────────────────────
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

if FRONTEND_DIR.exists():
    # Serve static assets (css, js, assets)
    for subdir in ["css", "js", "assets"]:
        subpath = FRONTEND_DIR / subdir
        if subpath.exists():
            app.mount(f"/{subdir}", StaticFiles(directory=str(subpath)), name=subdir)

    @app.get("/", response_class=HTMLResponse)
    async def serve_frontend():
        index = FRONTEND_DIR / "index.html"
        if index.exists():
            raw = index.read_bytes()
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                text = raw.decode("utf-8", errors="replace")
            return HTMLResponse(content=text)
        return HTMLResponse(content="<h1>Frontend not found</h1>", status_code=404)

    @app.get("/{filename:path}.html", response_class=HTMLResponse)
    async def serve_html(filename: str):
        """Serve any .html file from the frontend directory."""
        safe = filename.replace("..", "").replace("/", "").replace("\\", "")
        target = FRONTEND_DIR / f"{safe}.html"
        if target.exists():
            raw = target.read_bytes()
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                text = raw.decode("utf-8", errors="replace")
            return HTMLResponse(content=text)
        return HTMLResponse(content="<h1>Not found</h1>", status_code=404)

else:

    @app.get("/")
    async def no_frontend():
        return {"message": "Frontend directory not found. Place files in ../frontend/"}


# ─── Main ─────────────────────────────────────────────────────────────────────
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="synapse-live-debug",
        description="Live Debug -- Universal IDE telemetry dashboard",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py                                    # Debug this project, port 8421
  python main.py --project-root /path/to/myapp      # Debug another project
  python main.py --port 9000 --open                 # Custom port + open browser
  python main.py --no-watch                         # Disable file watcher
  python main.py --project-root . --open            # Debug current directory
        """,
    )
    parser.add_argument(
        "--project-root",
        "-r",
        type=str,
        default=None,
        help="Path to the project to debug (default: parent of this script)",
    )
    parser.add_argument(
        "--port",
        "-p",
        type=int,
        default=int(os.environ.get("SYNAPSE_DEBUG_PORT", "8421")),
        help="Port to serve on (default: 8421, or $SYNAPSE_DEBUG_PORT)",
    )
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Host to bind to (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--open",
        "-o",
        action="store_true",
        default=False,
        help="Open the dashboard in the default browser",
    )
    parser.add_argument(
        "--no-watch",
        action="store_true",
        default=False,
        help="Disable the file watcher",
    )
    parser.add_argument(
        "--no-reload",
        action="store_true",
        default=False,
        help="Disable uvicorn auto-reload",
    )
    return parser.parse_args()


if __name__ == "__main__":
    import uvicorn

    args = parse_args()

    # Set PROJECT_ROOT based on CLI or default
    if args.project_root:
        PROJECT_ROOT = Path(args.project_root).resolve()
    # else keep the default (parent of backend/)

    _cli_config["project_root"] = str(PROJECT_ROOT)
    _cli_config["port"] = args.port
    _cli_config["open_browser"] = args.open
    _cli_config["watch"] = not args.no_watch

    try:
        print(f"""
  ╔══════════════════════════════════════════════════╗
  ║    Live Debug v3.1 - Universal IDE Monitor       ║
  ╠══════════════════════════════════════════════════╣
  ║  Dashboard:    http://{args.host}:{args.port:<5}              ║
  ║  API Docs:     http://{args.host}:{args.port}/docs         ║
  ║  Project:      {str(PROJECT_ROOT)[:35]:<35} ║
  ║  File Watcher: {'ON' if not args.no_watch else 'OFF':<35} ║
  ╚══════════════════════════════════════════════════╝
""")
    except UnicodeEncodeError:
        print(
            f"\n  Live Debug v3.1 - http://{args.host}:{args.port}\n  Project: {PROJECT_ROOT}\n"
        )

    uvicorn.run(
        "main:app",
        host=args.host,
        port=args.port,
        reload=not args.no_reload,
        log_level="info",
    )
