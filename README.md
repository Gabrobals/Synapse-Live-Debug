# Synapse Live Debug

Real-time observability dashboard for the Synapse IDE — extracted from the monolithic debug HTML into a clean, modular standalone application with minimax.io-inspired design.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  DebugEventEmitter (Synapse IDE)                │
│  emit('engine:routing:start', {...})            │
└──────────────────┬──────────────────────────────┘
                   │ HTTP POST /v1/events
                   ▼
┌─────────────────────────────────────────────────┐
│  FastAPI Backend (port 8420)                    │
│  ├─ SSE broadcast  (/debug/stream)             │
│  ├─ WebSocket      (/ws)                       │
│  ├─ REST API       (/v1/*)                     │
│  └─ Static files   (../frontend/)              │
└──────────────────┬──────────────────────────────┘
                   │ SSE / WebSocket
                   ▼
┌─────────────────────────────────────────────────┐
│  Dashboard UI (16 tabs)                         │
│  ├─ Live Events      ├─ Governor               │
│  ├─ Services Health  ├─ Orchestra              │
│  ├─ Canvas SSE       ├─ Chat Diagnostics       │
│  ├─ Agent Infra      ├─ Quality & Coverage     │
│  ├─ Architecture TAC ├─ TQI Dashboard          │
│  ├─ Agent Flow       ├─ Metrics History        │
│  ├─ Test Center      ├─ Project Reality        │
│  └─                  ├─ Structural Health      │
│                      └─ Language Registry       │
└─────────────────────────────────────────────────┘
```

## Quick Start

### Windows
```bat
start.bat
```

### macOS / Linux
```bash
chmod +x start.sh
./start.sh
```

Then open **http://localhost:8420** in your browser.

## Project Structure

```
├── backend/
│   ├── main.py              # FastAPI app (SSE, WebSocket, REST, static files)
│   ├── debug_store.py       # In-memory event store (circular buffer)
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── index.html           # Dashboard shell (16 tabs)
│   ├── css/
│   │   ├── base.css         # Design tokens, reset, typography
│   │   ├── layout.css       # App shell, header, tabs, grids
│   │   ├── components.css   # Cards, badges, buttons, modals
│   │   └── tabs.css         # Per-tab specific styling
│   └── js/
│       ├── config.js        # CONFIG, EVENT_CATEGORIES, SERVICES, INFRA
│       ├── event-bus.js     # SynapseBus (pub/sub)
│       ├── sse-manager.js   # ConnectionManager (SSE, WS, health polling)
│       ├── notifications.js # Alerts, desktop notifications, audio, TTS
│       ├── app.js           # Main application shell & init
│       └── tabs/
│           ├── live-events.js       # Tab 1:  Live event stream
│           ├── services-health.js   # Tab 2:  17 service health checks
│           ├── canvas-sse.js        # Tab 3:  Canvas node SSE stream
│           ├── agent-infra.js       # Tab 4:  Infrastructure grid
│           ├── architecture.js      # Tab 5:  Architecture TAC (SVG)
│           ├── agent-flow.js        # Tab 6:  Pipeline flow visualization
│           ├── test-center.js       # Tab 7:  14 test suites
│           ├── governor.js          # Tab 8:  Auto-heal & recommendations
│           ├── orchestra.js         # Tab 9:  Agent orchestration (SVG)
│           ├── chat-pipeline.js     # Tab 10: 7 diagnostic probes
│           ├── quality.js           # Tab 11: Coverage & gap analysis
│           ├── tqi.js               # Tab 12: Total Quality Index
│           ├── metrics.js           # Tab 13: Metrics history & trends
│           ├── project-reality.js   # Tab 14: Roadmap tracker
│           ├── structural-health.js # Tab 15: Spec vs reality
│           └── language-registry.js # Tab 16: 30+ language registry
├── start.bat                # Windows launcher
├── start.sh                 # Unix launcher
└── README.md
```

## Requirements

- **Python 3.9+**
- **pip** (for FastAPI, uvicorn, sse-starlette)
- A modern browser (Chrome, Edge, Firefox, Safari)

## Design Language

Inspired by [minimax.io](https://minimax.io):
- Pure black background (`#000000`)
- Inter + JetBrains Mono fonts
- Glassmorphism cards with subtle blur
- Gradient brand accents (cyan → purple)
- 14px border radius, 60fps animations

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Backend health check |
| `/debug/stream` | GET | SSE event stream |
| `/ws` | WS | WebSocket bidirectional |
| `/v1/events` | GET/POST | Event CRUD |
| `/v1/events/batch` | POST | Batch event submission |
| `/v1/debug/live-state` | GET | Governor live state |
| `/v1/introspect` | GET | Architecture introspection |
| `/v1/introspect/agent-flow` | GET | Agent flow data |
| `/v1/introspect/structural-health` | GET | Structural health scan |
| `/v1/introspect/roadmap` | GET | Project roadmap |
| `/v1/coverage` | GET | Coverage data |
| `/v1/tqi` | GET | Total Quality Index |
| `/v1/metrics/history` | GET | Metrics history |
| `/v1/tests/run/{suite}` | POST | Run test suite |
| `/docs` | GET | OpenAPI/Swagger UI |

## Connecting from Synapse IDE

```typescript
// In your DebugEventEmitter
const DEBUG_URL = 'http://localhost:8420';

async function emitDebugEvent(type: string, data: any) {
  await fetch(`${DEBUG_URL}/v1/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, data, timestamp: Date.now() }),
  });
}

// Example usage
emitDebugEvent('engine:routing:start', { model: 'ollama/llama3', prompt: '...' });
```

## License

Internal development tool — part of the Synapse IDE project.
