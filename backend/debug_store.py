"""
Synapse Live Debug — Backend
Event storage and SSE broadcast service.
"""

from __future__ import annotations

import time
import uuid
from collections import deque
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class DebugEvent:
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    timestamp: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%S.000Z"))
    type: str = "unknown"
    component: str = ""
    step: int | None = None
    flowId: str | None = None
    data: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        return {k: v for k, v in d.items() if v is not None}


class DebugStore:
    """In-memory circular buffer for debug events."""

    def __init__(self, max_events: int = 2000):
        self._events: deque[dict] = deque(maxlen=max_events)
        self._start_time = time.time()
        self._stats = {
            "total": 0,
            "errors": 0,
            "llm_calls": 0,
            "tool_executions": 0,
            "user_inputs": 0,
        }

    def add_event(self, event: dict) -> dict:
        """Add an event to the store. Returns the stored event."""
        if "id" not in event:
            event["id"] = str(uuid.uuid4())[:8]
        if "timestamp" not in event:
            event["timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        self._events.appendleft(event)
        self._update_stats(event)
        return event

    def add_batch(self, events: list[dict]) -> list[dict]:
        """Add multiple events. Returns stored events."""
        stored = []
        for e in events:
            stored.append(self.add_event(e))
        return stored

    def get_events(self, limit: int = 200) -> list[dict]:
        """Get recent events."""
        return list(self._events)[:limit]

    def clear(self):
        """Clear all events."""
        self._events.clear()
        self._stats = {k: 0 for k in self._stats}

    def get_status(self) -> dict:
        return {
            "uptime": round(time.time() - self._start_time),
            "event_count": len(self._events),
            "stats": self._stats.copy(),
            "buffer_max": self._events.maxlen,
        }

    def _update_stats(self, event: dict):
        self._stats["total"] += 1
        etype = event.get("type", "")
        if etype == "error":
            self._stats["errors"] += 1
        elif etype in ("llm-call", "llm-response"):
            self._stats["llm_calls"] += 1
        elif etype in ("tool-execute", "tool-result"):
            self._stats["tool_executions"] += 1
        elif etype in ("user-input", "message-add"):
            self._stats["user_inputs"] += 1


# Singleton store
store = DebugStore()
