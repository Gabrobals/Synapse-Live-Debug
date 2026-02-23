# Synapse Live Debug

Real-time observability dashboard for AI-assisted development. Monitor live events, services health, code quality, and AI agent interactions through an intuitive web interface with SSE streaming and VS Code integration.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  VS Code Extension / IDE                        │
│  Captures: file changes, errors, debug sessions │
└──────────────────┬──────────────────────────────┘
                   │ HTTP POST /v1/events
                   ▼
┌─────────────────────────────────────────────────┐
│  FastAPI Backend (port 8421)                    │
│  ├─ SSE broadcast  (/v1/events)                │
│  ├─ REST API       (/v1/*)                     │
│  ├─ File watcher   (project analysis)          │
│  └─ Static files   (../frontend/)              │
└──────────────────┬──────────────────────────────┘
                   │ SSE (Server-Sent Events)
                   ▼
┌─────────────────────────────────────────────────┐
│  Dashboard UI (13 tabs in 5 categories)         │
│                                                 │
│  LIVE                   SYSTEM                  │
│  ├─ Live Events         ├─ Agent Intelligence   │
│  ├─ Services Health     └─ Governor             │
│  └─ Canvas SSE                                  │
│                                                 │
│  TESTING                ANALYTICS               │
│  ├─ Test Center         ├─ Metrics History      │
│  ├─ Quality             ├─ Project Reality      │
│  └─ Test Quality (TQI)  ├─ Structural Health    │
│                         └─ Language Registry    │
│  HELP                                           │
│  └─ User Guide                                  │
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

Then open **http://localhost:8421** in your browser.

## Project Structure

```
├── backend/
│   ├── main.py              # FastAPI app (SSE, REST, static files)
│   ├── debug_store.py       # In-memory event store (circular buffer)
│   ├── file_watcher.py      # Project file monitoring
│   ├── project_detector.py  # Framework & language detection
│   ├── framework_adapters.py# Test framework adapters
│   ├── ide_agent_detector.py# AI agent detection
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── index.html           # Dashboard shell
│   ├── css/
│   │   ├── base.css         # Design tokens, reset, typography
│   │   ├── layout.css       # App shell, header, sidebar
│   │   ├── components.css   # Cards, badges, buttons, modals
│   │   └── tabs.css         # Per-tab specific styling
│   ├── assets/
│   │   └── dolphin.png      # App logo
│   └── js/
│       ├── app.js           # Main application shell & init
│       ├── config.js        # Configuration constants
│       ├── event-bus.js     # SynapseBus (pub/sub)
│       ├── sse-manager.js   # ConnectionManager (SSE, health polling)
│       ├── notifications.js # Alerts, desktop notifications, audio, TTS
│       ├── svg-icons.js     # Icon definitions
│       ├── ide-adapter.js   # IDE integration
│       ├── ops-center.js    # Operations center
│       └── tabs/
│           ├── live-events.js       # Live event stream
│           ├── services-health.js   # Service health monitoring
│           ├── canvas-sse.js        # Visual event canvas
│           ├── agent-intelligence.js# AI agent monitoring (Infra + Flow)
│           ├── governor.js          # Auto-heal & recommendations
│           ├── test-center.js       # 14 test suites runner
│           ├── quality.js           # Coverage & gap analysis
│           ├── tqi.js               # Test Quality Index
│           ├── metrics.js           # Metrics history & trends
│           ├── project-reality.js   # Design vs implementation tracking
│           ├── structural-health.js # Dependency & structure analysis
│           ├── language-registry.js # Language & framework census
│           └── user-guide.js        # Interactive documentation
├── vscode-extension/
│   ├── src/
│   │   ├── extension.ts     # Extension entry point
│   │   ├── panel.ts         # WebView panel
│   │   └── tree-views.ts    # Sidebar tree views
│   ├── package.json         # Extension manifest
│   └── tsconfig.json        # TypeScript config
├── docs/
│   ├── DEVELOPER.md         # Developer documentation
│   ├── USER_GUIDE.md        # User guide
│   ├── STRATEGY.md          # Project strategy
│   └── CANVAS_GRAPH_SPEC.md # Canvas specification
├── start.bat                # Windows launcher
├── start.sh                 # Unix launcher
└── README.md
```

## Features

### 🔴 Live Monitoring
- **Live Events**: Real-time stream of all system events (file changes, errors, tests, AI interactions)
- **Services Health**: Status monitoring for all connected services with latency metrics
- **Canvas SSE**: Visual graph representation of event flow and dependencies

### 🤖 AI & Automation
- **Agent Intelligence**: Monitor AI agents (Copilot, Ollama, local LLMs) with infrastructure and flow views
- **Governor**: Auto-correction engine with problem detection and suggested fixes

### 🧪 Testing
- **Test Center**: Run and manage 14 different test suites (unit, integration, E2E, linting)
- **Quality**: Code coverage analysis and gap identification
- **TQI (Test Quality Index)**: Composite metric measuring test suite effectiveness

### 📊 Analytics
- **Metrics History**: Track trends over time with historical data visualization
- **Project Reality**: Compare designed features vs actual implementation
- **Structural Health**: Analyze dependencies, detect circular imports, find orphan files
- **Language Registry**: Census of languages, frameworks, and dependencies

### 📖 Documentation
- **User Guide**: Interactive, searchable documentation with 22 detailed sections

## Requirements

- **Python 3.9+**
- **pip** (for FastAPI, uvicorn, watchdog)
- A modern browser (Chrome, Edge, Firefox, Safari)

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Backend health check |
| `/v1/events` | GET | SSE event stream |
| `/v1/events` | POST | Submit new event |
| `/v1/services/health` | GET | All services status |
| `/v1/governor/problems` | GET | Current problems list |
| `/v1/governor/heal` | POST | Apply auto-fix |
| `/v1/introspect` | GET | Project structure |
| `/v1/introspect/structural-health` | GET | Structural analysis |
| `/v1/introspect/roadmap` | GET | Project roadmap |
| `/v1/coverage` | GET | Coverage data |
| `/v1/tqi` | GET | Test Quality Index |
| `/v1/metrics/history` | GET | Metrics history |
| `/v1/tests/suites` | GET | Available test suites |
| `/v1/tests/run/{suite}` | POST | Run specific test suite |
| `/docs` | GET | OpenAPI/Swagger UI |

## VS Code Extension

The extension captures IDE events and sends them to the dashboard:

```typescript
// Events captured automatically:
// - File saves and modifications
// - Diagnostic errors and warnings
// - Debug session start/stop
// - Terminal commands
// - AI assistant interactions (Copilot, etc.)
```

Install from `vscode-extension/` folder:
```bash
cd vscode-extension
npm install
npm run watch  # Development mode
```

## Design Language

Inspired by [minimax.io](https://minimax.io):
- Pure black background (`#000000`)
- Inter + JetBrains Mono fonts
- Glassmorphism cards with subtle blur
- Gradient brand accents (cyan → purple)
- 14px border radius, smooth animations

## License

MIT License - Open source project for AI-assisted development workflows.
