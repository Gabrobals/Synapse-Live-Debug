# Synapse Live Debug

**Real-time project telemetry dashboard that hooks into any IDE and reads the backend of any project.**

Synapse Live Debug is a framework-agnostic debugging and monitoring tool that provides a live dashboard for visualizing events, service health, file changes, and project structure in real-time.

---

## Quick Start

```bash
# 1. Clone or navigate to the project
cd "Synapse Live Debug"

# 2. Install dependencies
cd backend
pip install -r requirements.txt

# 3. Start the dashboard
python main.py --open
```

The dashboard opens at **http://localhost:8421**.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Synapse Live Debug                         │
├──────────────┬───────────────────────┬───────────────────────┤
│  IDE Layer   │    Core Engine        │     Dashboard          │
│  (adapter)   │    (Python backend)   │     (HTML/JS SPA)      │
├──────────────┼───────────────────────┼───────────────────────┤
│ VS Code ext  │ FastAPI server        │ Vanilla JS + CSS       │
│ JetBrains *  │ Project detector      │ SSE real-time feed     │
│ Neovim *     │ Framework adapters    │ WebSocket support      │
│ Sublime *    │ File watcher          │ 16 tab panels          │
│ Zed/Cursor * │ Event bus (SSE/WS)    │ minimax.io design      │
│              │ Health monitoring     │                        │
│  * planned   │ CLI with argparse     │                        │
└──────────────┴───────────────────────┴───────────────────────┘
```

### Components

| Component | Path | Description |
|-----------|------|-------------|
| **Backend** | `backend/` | FastAPI server — event store, SSE broadcast, project introspection |
| **Frontend** | `frontend/` | Single-page dashboard with 16 tab panels |
| **VS Code Extension** | `vscode-extension/` | IDE adapter — starts backend, forwards events, webview panel |
| **Docs** | `docs/` | Developer documentation and user guide |

---

## CLI Reference

```bash
python main.py [OPTIONS]
```

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--project-root PATH` | `-r` | Parent of backend/ | Path to the project to debug |
| `--port PORT` | `-p` | 8421 | Port to serve on |
| `--host HOST` | — | 127.0.0.1 | Host to bind to |
| `--open` | `-o` | off | Open browser automatically |
| `--no-watch` | — | off | Disable file watcher |
| `--no-reload` | — | off | Disable uvicorn auto-reload |

### Examples

```bash
# Debug the current directory
python main.py --project-root . --open

# Debug a different project on a custom port
python main.py --project-root /path/to/myapp --port 9000

# Production mode (no reload, no watcher)
python main.py --no-reload --no-watch --host 0.0.0.0
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNAPSE_DEBUG_PORT` | 8421 | Default port (overridden by --port) |

---

## API Endpoints

### Health & Status

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/ready` | Readiness check |
| GET | `/debug/status` | Store status + connection counts |
| GET | `/debug/performance` | Performance metrics |
| GET | `/debug/metrics-history` | Historical metrics snapshots |

### Event Bus

| Method | Path | Description |
|--------|------|-------------|
| POST | `/debug/events` | Submit a single event |
| POST | `/debug/events/batch` | Submit multiple events |
| GET | `/debug/events` | Get stored events (limit=200) |
| DELETE | `/debug/events` | Clear all events |
| GET | `/debug/events/stream` | SSE real-time stream |
| WS | `/debug/ws` | WebSocket bidirectional |

### Project Introspection

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/project/scan` | Scan project file tree |
| GET | `/v1/project/detect` | Auto-detect language/framework/package manager |
| GET | `/v1/project/framework` | Framework-specific deep introspection |
| GET | `/v1/project/endpoints` | List all registered API routes |
| GET | `/v1/introspect` | Full project introspection |
| GET | `/v1/introspect/agent-flow` | Agent pipeline introspection |
| GET | `/v1/introspect/dependencies` | Project dependencies |

### File Watcher

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/watcher/status` | File watcher status |
| POST | `/v1/watcher/start` | Start file watcher |
| POST | `/v1/watcher/stop` | Stop file watcher |

### Services

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/settings` | Current settings |
| GET | `/v1/models` | Available models |
| GET | `/v1/notes` | Notes storage |
| GET | `/v1/webhook/status` | Webhook status |
| GET | `/v1/governor/dashboard` | Governor dashboard |
| POST | `/v1/governor/scan` | Run governor scan |
| POST | `/v1/governor/heal` | Run governor heal |

---

## Event Schema

Events are the core data unit. Any system can emit events to the bus.

```json
{
  "id": "a1b2c3d4",
  "timestamp": "2026-02-17T12:00:00.000Z",
  "type": "file-write",
  "component": "vscode-extension",
  "step": null,
  "flowId": null,
  "data": {
    "path": "src/main.py",
    "action": "saved",
    "languageId": "python"
  }
}
```

### Event Types

| Type | Category | Description |
|------|----------|-------------|
| `user-input` | User | User interaction |
| `file-read` | File | File opened/read |
| `file-write` | File | File saved/created/deleted |
| `llm-call` | LLM | LLM API request |
| `llm-response` | LLM | LLM response received |
| `tool-execute` | Tool | Tool execution started |
| `tool-result` | Tool | Tool result returned |
| `terminal-exec` | Terminal | Terminal command |
| `error` | Error | Error occurred |
| `agent-status` | Agent | Agent state change |
| `memory-read` | Memory | Memory access |
| `memory-write` | Memory | Memory write |
| `mcp-call` | MCP | MCP protocol call |
| `security-check` | Security | Security validation |

---

## Project Detection

Synapse automatically detects the project's technology stack:

### Supported Languages
Python, JavaScript, TypeScript, Rust, Go, Java, Kotlin, C#, F#, Ruby, PHP, Elixir, Dart, Swift, C, C++

### Supported Frameworks
FastAPI, Flask, Django, Starlette, Express, Next.js, Nuxt, SvelteKit, Angular, Vue, Vite, Astro, Remix, Spring Boot, Rails, Sinatra, Laravel, Symfony, Actix-web, Axum, Rocket, Gin, Echo, Fiber, Tauri, Electron, Flutter

### Supported Package Managers
npm, yarn, pnpm, bun, pip, pipenv, poetry, uv, pdm, cargo, go-modules, bundler, composer, pub

---

## File Structure

```
Synapse Live Debug/
├── backend/
│   ├── main.py                 # FastAPI server + CLI
│   ├── debug_store.py          # In-memory circular event buffer
│   ├── project_detector.py     # Language/framework auto-detection
│   ├── framework_adapters.py   # Framework-specific introspection
│   ├── file_watcher.py         # Watchdog-based file monitoring
│   └── requirements.txt        # Python dependencies
├── frontend/
│   ├── index.html              # Dashboard SPA shell
│   ├── css/
│   │   ├── base.css            # Design tokens, reset, typography
│   │   ├── layout.css          # App shell, sidebar, responsive
│   │   ├── components.css      # Cards, buttons, badges, modals
│   │   └── tabs.css            # Tab-specific content styles
│   └── js/
│       ├── config.js           # Configuration, service definitions
│       ├── app.js              # Main app shell
│       ├── event-bus.js        # Client-side event bus
│       ├── sse-manager.js      # SSE connection manager
│       ├── notifications.js    # Desktop/sound/voice notifications
│       └── tabs/               # 16 tab panel modules
│           ├── live-events.js
│           ├── services-health.js
│           ├── canvas-sse.js
│           ├── agent-infra.js
│           ├── architecture.js
│           ├── agent-flow.js
│           ├── orchestra.js
│           ├── governor.js
│           ├── test-center.js
│           ├── chat-pipeline.js
│           ├── quality.js
│           ├── tqi.js
│           ├── metrics.js
│           ├── project-reality.js
│           ├── structural-health.js
│           └── language-registry.js
├── vscode-extension/
│   ├── package.json            # Extension manifest
│   ├── tsconfig.json           # TypeScript config
│   ├── src/
│   │   ├── extension.ts        # Extension entry point
│   │   ├── panel.ts            # Webview dashboard panel
│   │   └── tree-views.ts       # Sidebar tree views
│   └── resources/
│       └── icon.svg            # Activity bar icon
├── docs/
│   ├── DEVELOPER.md            # Developer documentation (this file)
│   └── USER_GUIDE.md           # End-user guide
├── start.bat                   # Windows launcher
├── start.sh                    # Linux/macOS launcher
└── README.md
```

---

## TODO / Roadmap

### ✅ Completati
- [x] **13 tabs funzionanti** — Events, Services, Canvas SSE, Agent Intelligence, Governor, Test Center, Quality, TQI, Metrics, Project Reality, Structural Health, Language Registry, User Guide
- [x] **Backend introspection** — `/v1/introspect/*` analizza il progetto reale
- [x] **Language Registry dinamico** — endpoint `/v1/introspect/language-registry` scansiona file reali
- [x] **User Guide interattivo** — 24 sezioni con navigazione TOC + search
- [x] **Debug Avanzato** — sezione completa su come leggere e risolvere bug
- [x] **SSE real-time** — stream eventi con reconnect automatico
- [x] **File watcher** — monitora modifiche file in tempo reale
- [x] **Project detector** — rileva linguaggio, framework, package manager
- [x] **Endpoint /v1/models** — rileva modelli Ollama disponibili
- [x] **Endpoint /v1/settings** — configurazione dashboard
- [x] **Endpoint /v1/services/health** — health check rapido servizi

### 🔄 In Progress
- [ ] **VS Code extension** — webview panel funzionante, tree-view da completare

### 📋 Pianificati
- [ ] **JetBrains plugin** — adapter per IntelliJ/PyCharm
- [ ] **Neovim plugin** — adapter Lua
- [ ] **Export PDF** — esportare dashboard come report
- [ ] **Themes** — light mode, Solarized, Nord
- [ ] **WebSocket fallback** — quando SSE non disponibile
- [ ] **Persistent storage** — salvare eventi su SQLite
- [ ] **Multi-project** — monitorare più progetti contemporaneamente

### 🐛 Bug Noti
| ID | Descrizione | Stato |
|----|-------------|-------|
| BUG-001 | `/v1/services/health` 404 | ✅ Risolto |
| BUG-002 | `/v1/services/diagnostics` timeout | ⚠️ Normale (deep scan) |
| BUG-003 | `SYNAPSE_LIVE_DEBUG.html` 375 warning lint (file legacy) | Ignorare |
| BUG-004 | `/v1/models` 404 | ✅ Risolto |

### 📂 Struttura Tab ↔ Endpoint

| Tab | File JS | Endpoint |
|-----|---------|----------|
| Live Events | `live-events.js` | `/debug/events/stream` (SSE) |
| Services | `services-health.js` | `/v1/services/diagnostics` |
| Canvas SSE | `canvas-sse.js` | `/debug/events/stream` |
| Agent Intel | `agent-infra.js` | `/v1/introspect/agent-intelligence` |
| Governor | `governor.js` | `/v1/governor/dashboard` |
| Test Center | `test-center.js` | `/v1/tests/run/{suite}` |
| Quality | `quality.js` | `/v1/coverage` |
| TQI | `tqi.js` | `/v1/tqi` |
| Metrics | `metrics.js` | `/v1/metrics/history` |
| Roadmap | `project-reality.js` | `/v1/introspect/roadmap` |
| Structural | `structural-health.js` | `/v1/introspect/structural-health` |
| Lang Registry | `language-registry.js` | `/v1/introspect/language-registry` |
| User Guide | `user-guide.js` | (static content) |

---

## License

MIT
