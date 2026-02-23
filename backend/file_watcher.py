"""
Synapse Live Debug — File Watcher
==================================
Watches the project directory for file changes and emits events
to the debug event bus via the internal broadcast function.

Uses ``watchdog`` for cross-platform filesystem monitoring.
Gracefully degrades if watchdog is not installed.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from pathlib import Path

logger = logging.getLogger("synapse-debug.watcher")

# Directories / patterns to ignore
IGNORE_DIRS = {
    "__pycache__", "node_modules", ".git", ".hg", ".svn",
    "venv", ".venv", "env", ".env",
    "dist", "build", ".next", ".nuxt", ".output",
    ".pytest_cache", ".mypy_cache", ".ruff_cache",
    "target", "bin", "obj",
    ".idea", ".vscode",
}

IGNORE_EXTENSIONS = {
    ".pyc", ".pyo", ".class", ".o", ".obj", ".exe", ".dll",
    ".so", ".dylib", ".wasm",
    ".lock", ".log",
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
    ".woff", ".woff2", ".ttf", ".eot",
    ".map",
}


def _should_ignore(path: str) -> bool:
    """Return True if this path should be ignored."""
    parts = Path(path).parts
    for part in parts:
        if part in IGNORE_DIRS:
            return True
    ext = Path(path).suffix.lower()
    if ext in IGNORE_EXTENSIONS:
        return True
    return False


try:
    from watchdog.events import (
        FileSystemEventHandler,
    )
    from watchdog.observers import Observer
    WATCHDOG_AVAILABLE = True
except ImportError:
    WATCHDOG_AVAILABLE = False
    Observer = None  # type: ignore
    FileSystemEventHandler = object  # type: ignore


class _SynapseFileHandler(FileSystemEventHandler if WATCHDOG_AVAILABLE else object):
    """Converts file system events to Synapse debug events."""

    def __init__(
        self,
        project_root: Path,
        event_callback: Callable[[dict], Awaitable[None]],
        loop: asyncio.AbstractEventLoop,
    ):
        if WATCHDOG_AVAILABLE:
            super().__init__()
        self.root = project_root
        self.callback = event_callback
        self.loop = loop
        self._debounce: dict[str, float] = {}

    def _relative(self, path: str) -> str:
        try:
            return str(Path(path).relative_to(self.root))
        except ValueError:
            return path

    def _emit(self, event_type: str, path: str, extra: dict | None = None):
        if _should_ignore(path):
            return
        # Debounce: skip if same path+type within 0.5s
        key = f"{event_type}:{path}"
        now = time.time()
        if key in self._debounce and now - self._debounce[key] < 0.5:
            return
        self._debounce[key] = now

        rel = self._relative(path)
        event = {
            "type": event_type,
            "component": "file-watcher",
            "data": {
                "path": rel,
                "absolute": path,
                "extension": Path(path).suffix,
                **(extra or {}),
            },
        }
        # Schedule the async callback on the event loop
        asyncio.run_coroutine_threadsafe(self.callback(event), self.loop)

    def on_created(self, event):
        if not getattr(event, "is_directory", False):
            self._emit("file-write", event.src_path, {"action": "created"})

    def on_modified(self, event):
        if not getattr(event, "is_directory", False):
            self._emit("file-write", event.src_path, {"action": "modified"})

    def on_deleted(self, event):
        if not getattr(event, "is_directory", False):
            self._emit("file-write", event.src_path, {"action": "deleted"})

    def on_moved(self, event):
        if not getattr(event, "is_directory", False):
            self._emit("file-write", event.src_path, {
                "action": "moved",
                "destination": self._relative(event.dest_path),
            })


class FileWatcher:
    """
    Manages the watchdog Observer for a project directory.

    Usage:
        watcher = FileWatcher(project_root, broadcast_callback, loop)
        watcher.start()
        # ... later ...
        watcher.stop()
    """

    def __init__(
        self,
        project_root: Path,
        event_callback: Callable[[dict], Awaitable[None]],
        loop: asyncio.AbstractEventLoop | None = None,
    ):
        self.root = project_root.resolve()
        self.callback = event_callback
        self.loop = loop or asyncio.get_event_loop()
        self._observer = None
        self._running = False

    @property
    def available(self) -> bool:
        return WATCHDOG_AVAILABLE

    def start(self):
        if not WATCHDOG_AVAILABLE:
            logger.warning(
                "watchdog not installed — file watcher disabled. "
                "Install with: pip install watchdog"
            )
            return

        if self._running:
            return

        handler = _SynapseFileHandler(self.root, self.callback, self.loop)
        self._observer = Observer()
        self._observer.schedule(handler, str(self.root), recursive=True)
        self._observer.daemon = True
        self._observer.start()
        self._running = True
        logger.info(f"File watcher started on {self.root}")

    def stop(self):
        if self._observer and self._running:
            self._observer.stop()
            self._observer.join(timeout=5)
            self._running = False
            logger.info("File watcher stopped")

    @property
    def is_running(self) -> bool:
        return self._running
