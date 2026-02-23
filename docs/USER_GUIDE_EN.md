# Synapse Live Debug — User Guide

**Real-time telemetry dashboard for any software project.**

---

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Dashboard Interface](#dashboard-interface)
4. [Canvas SSE — Project Graph](#canvas-sse--project-graph)
5. [Smart Fix — Automatic Bug Correction](#smart-fix--automatic-bug-correction)
6. [Prompt Generator — AI Prompt Generator](#prompt-generator--ai-prompt-generator)
7. [Security Audit](#security-audit)
8. [Terminal Feedback UX](#terminal-feedback-ux)
9. [Operations Center](#operations-center)
10. [Context Menu](#context-menu)
11. [SVG Icon System](#svg-icon-system)
12. [Quick Fix Panel](#quick-fix-panel)
13. [Complete Bug Resolution Workflow](#complete-bug-resolution-workflow)
14. [Project Scanner](#project-scanner)
15. [Connecting to a Project](#connecting-to-a-project)
16. [VS Code Extension](#vs-code-extension)
17. [File Watcher](#file-watcher)
18. [Sending Custom Events](#sending-custom-events)
19. [Integration with Other IDEs](#integration-with-other-ides)
20. [Advanced Configuration](#advanced-configuration)
21. [Troubleshooting](#troubleshooting)

---

## Installation

### Requirements
- **VS Code** (recent version) with **GitHub Copilot** and **Copilot Chat** installed and active
- **Node.js 18+** (to compile the extension: `npm install` + `npm run compile`)
- **Python 3.10+** with pip (for the backend)

### What's Automatic and What's Not

| Action | Who Does It | Detail |
|--------|-------------|--------|
| Prompt capture | **Automatic** | `@synapse` activates automatically 3s after VS Code starts |
| AI response | **Automatic** | Copilot responds normally — User notices no difference |
| Events (file, terminal, errors) | **Automatic** | Extension captures and sends them to backend |
| Installing the extension | **You (once)** | Compile + create junction link |
| Starting the backend | **You** | `python main.py --open` or `start.bat` |

### Steps

```bash
# Clone the project
git clone https://github.com/Gabrobals/Synapse-Live-Debug.git
cd "Synapse Live Debug"

# Install Python dependencies
cd backend
pip install -r requirements.txt
```

Dependencies are:
- **fastapi** — Web framework
- **uvicorn** — ASGI server
- **sse-starlette** — Server-Sent Events
- **pydantic** — Data validation
- **watchdog** — File system monitoring
- **httpx** — HTTP client

---

## Quick Start

> **In short:** Install the extension once (Phase A), then each time you work, start the backend (Phase B) and open VS Code — everything else is automatic.

### Phase A — VS Code Extension (one-time)

```bash
cd vscode-extension
npm install
npm run compile
```

Then create a junction link (see [VS Code Extension](#vs-code-extension) section for complete commands). Restart VS Code.

### Phase B — Backend + Dashboard (each session)

#### Windows
Double-click `start.bat` or:
```cmd
cd backend
python main.py --open
```

### Linux / macOS
```bash
chmod +x start.sh
./start.sh
```

### CLI Options

```bash
python main.py [OPTIONS]
```

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--project-root PATH` | `-r` | parent directory | Path to project to debug |
| `--port PORT` | `-p` | 8421 | Server port |
| `--host HOST` | — | 127.0.0.1 | Listen host |
| `--open` | `-o` | off | Open browser automatically |
| `--no-watch` | — | off | Disable file watcher |
| `--no-reload` | — | off | Disable uvicorn auto-reload |

### Examples

```bash
# Debug current project
python main.py --project-root . --open

# Debug another project on custom port
python main.py -r C:\Users\me\Projects\MyApp -p 9000 --open

# Production mode
python main.py --no-reload --no-watch --host 0.0.0.0
```

---

## Dashboard Interface

The dashboard has a **vertical sidebar on the left** with 5 main sections:

### Live
- **Live Events** — Real-time stream of all events (file save, LLM call, tool execution...)
- **Canvas SSE** — Interactive project graph with per-file diagnostics, Smart Fix, Prompt Generator and security audit
- **Chat Pipeline** — AI chat pipeline visualization

### System
- **Services Health** — Service grid with health checks and endpoint tests
- **Governor** — Runtime supervisor with auto-healing
- **Structural Health** — Structural health analysis
- **Agent Infra** — Map of 14 infrastructure categories

### Testing
- **Test Center** — Test runner with live results

### Analytics
- **TQI** — Technical Quality Index
- **Metrics** — Performance and throughput charts
- **Project Reality** — Real project structure scanner

### Help
- **Language Registry** — Language and parser registry
- **User Guide** — This documentation

---

## Canvas SSE — Project Graph

The **Canvas SSE** tab is the visual heart of Synapse Live Debug. It shows an **interactive graph** of all project files with real-time diagnostics, Smart Fix and AI prompt generation.

### Overview

When you open the Canvas SSE tab, the system:
1. Calls the `GET /debug/canvas/graph` backend endpoint
2. Receives the list of all project files with their dependencies
3. Runs real linters (eslint, ruff, stylelint) on each file in parallel
4. Generates an interactive SVG graph with relationships between files
5. Automatically updates the graph when files change (via SSE)

### Node Types

Each file is represented as a node in the graph. There are **3 rendering types**:

| Type | Shape | Example Files | Description |
|------|-------|---------------|-------------|
| **Trigger** | Capsule with rounded left side | `main.py`, `index.html`, `app.js` | Application entry points |
| **Config** | Circle | `package.json`, `tsconfig.json`, `ruff.toml`, `.yml` | Configuration files |
| **Default** | Rectangle | All other `.py`, `.js`, `.css`, etc. files | Standard source files |

### Color Coding by Language

Each file extension has a unique color for easy recognition:

| Language | Color | Code |
|----------|-------|------|
| Python (.py) | Dark Blue | `#3572A5` |
| JavaScript (.js) | Yellow | `#F1E05A` |
| TypeScript (.ts) | Blue | `#3178C6` |
| CSS (.css) | Purple | `#563D7C` |
| HTML (.html) | Orange | `#E34C26` |
| JSON (.json) | Dark Gray | `#292929` |
| Markdown (.md) | Light Blue | `#083FA1` |
| YAML (.yml) | Red | `#CB171E` |

### Status Indicators

Each node shows the file health status via **border color**:

| Border Color | Meaning | Detail |
|--------------|---------|--------|
| 🟢 Green | Clean file | No errors, no warnings |
| 🟡 Yellow | Warnings present | One or more warnings, no errors |
| 🔴 Red | Errors present | One or more lint errors |

### Inspector Panel (Diagnostics)

Clicking on any node opens an **inspector panel** on the right with:

1. **File header**: File name and full path
2. **Count badges**:
   - Red badge: number of errors
   - Yellow badge: number of warnings
   - Blue badge: number of info
3. **Detected lint tool**: Badge showing which linter was used (eslint, ruff, stylelint)
4. **Fixable count**: Indicator of how many problems are auto-fixable
5. **Diagnostics list**: Each problem shows:
   - Line number
   - Error/warning message
   - Rule code (e.g., `no-unused-vars`, `E501`)
   - Severity (error/warning/info)
6. **Action buttons**:
   - **Smart Fix** — Automatic correction
   - **Prompt Generator** — Generate prompt for Copilot
   - **Re-scan file** — Re-run linter on file

---

## Smart Fix — Automatic Bug Correction

**Smart Fix** is the automatic bug correction system integrated in Canvas SSE. It detects the correct linter for each file and runs its `--fix` command automatically.

### How It Works

1. **Linter detection**: The system automatically identifies the appropriate linter:
   - `.js`, `.jsx` → **eslint**
   - `.ts`, `.tsx` → **eslint**
   - `.py` → **ruff**
   - `.css` → **stylelint**
2. **Fix execution**: Runs the specific linter's fix command:
   - `npx eslint --fix <file>` for JavaScript/TypeScript
   - `ruff check --fix <file>` for Python
   - `npx stylelint --fix <file>` for CSS
3. **Real-time feedback**: Result shown in Terminal Feedback panel
4. **Re-scan**: After fix, file is automatically re-scanned to verify results

### Steps to Use Smart Fix

1. Click on a node with errors (red or yellow border) in the graph
2. In the inspector panel, check the listed diagnostics
3. If the linter badge shows "eslint", "ruff" or "stylelint", **Smart Fix** button is available
4. Click **Smart Fix**
5. System runs fix command and shows result in Terminal Feedback
6. Resolved problems are removed from list after re-scan
7. Non-auto-fixable problems remain — use **Prompt Generator** for those

---

## Prompt Generator — AI Prompt Generator

The **Prompt Generator** generates optimized prompts for GitHub Copilot Chat, letting you fix non-auto-fixable errors through AI.

### Prompt Types

There are two generation modes:

| Mode | Icon | Position | What It Generates |
|------|------|----------|-------------------|
| **Single prompt** | 🤖 Small robot | Next to EACH diagnostic in list | Prompt for ONE specific problem |
| **Complete prompt** | "Prompt" button | Next to diagnostics section title | Prompt for ALL file problems |

### How to Use

#### Single Diagnostic Prompt

1. In inspector panel, find the diagnostic you want to fix
2. Click the **robot icon** (🤖) next to the diagnostic message
3. System generates targeted prompt with:
   - File path
   - Line number
   - Exact error message
   - Linter rule code
   - Specific correction instruction
4. Prompt is **automatically copied to clipboard**
5. Toast notification confirms: **"Prompt copied!"**
6. Open **GitHub Copilot Chat** in VS Code
7. Paste with **Ctrl+V**
8. Copilot analyzes the problem and suggests exact fix

#### All Diagnostics Prompt

1. In inspector panel, click **"Prompt"** button next to section title
2. System generates comprehensive prompt with all problems
3. Paste in Copilot Chat for all fixes at once

---

## Security Audit

Canvas SSE includes a **security audit** system that analyzes project dependencies for known vulnerabilities.

### How to Start Audit

1. Open **Canvas SSE** tab
2. In toolbar at top, click **Audit button** (shield icon 🛡️)
3. System automatically starts appropriate audits

### What Gets Scanned

| Project Type | Command Executed | What It Checks |
|--------------|------------------|----------------|
| JavaScript/Node.js | `npm audit` | npm dependency vulnerabilities |
| Python | `pip-audit` | Python dependency vulnerabilities |

### Audit Results

Results shown in inspector panel with:

1. **Vulnerability count badge**: Total vulnerabilities found
2. **Severity breakdown**:
   - 🔴 **Critical** — Critical vulnerabilities, fix immediately
   - 🟠 **High** — High severity
   - 🟡 **Moderate** — Medium severity
   - 🔵 **Low** — Low severity

---

## VS Code Extension

The VS Code extension provides native integration with automatic prompt capture.

### Installation

#### Step 1 — Compilation

```bash
cd vscode-extension
npm install
npm run compile
```

This produces the `out/` folder with compiled code.

#### Step 2 — Register in VS Code (junction link)

VS Code loads extensions from `~/.vscode/extensions/`.
To make the extension available **without packaging a `.vsix`**, create a symbolic link (junction on Windows):

**Windows (PowerShell as Administrator):**
```powershell
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.vscode\extensions\synapse-live-debug-0.1.0" `
  -Target "C:\full\path\Synapse Live Debug\vscode-extension"
```

**Linux / macOS:**
```bash
ln -s "/full/path/Synapse Live Debug/vscode-extension" \
      "$HOME/.vscode/extensions/synapse-live-debug-0.1.0"
```

#### Step 3 — Restart VS Code

Close and reopen VS Code (or `Developer: Reload Window` from Command Palette).

### Extension Features

1. **@synapse Chat Participant** — Automatic capture of all prompts
2. **Event forwarding** — Extension automatically captures:
   - File save → `file-write`
   - File open → `file-read`
   - Active editor change → `user-input`
   - Terminal open → `terminal-exec`
   - Diagnostic errors → `error`
   - Debug sessions → `agent-status`
3. **Sidebar** — Panels in sidebar:
   - Dashboard Status
   - Services (all API endpoints)
   - Recent Events (last 20 events)
4. **Webview Panel** — Dashboard integrated inside VS Code
5. **Status Bar** — Indicator in bottom bar

### Commands

| Command | Description |
|---------|-------------|
| `Synapse: Start Live Debug Dashboard` | Start backend |
| `Synapse: Stop Live Debug Dashboard` | Stop backend |
| `Synapse: Open Dashboard in Browser` | Open in browser |
| `Synapse: Open Dashboard Panel` | Open as VS Code tab |
| `Synapse: Set Project Root` | Change project root |

### Settings

| Key | Default | Description |
|-----|---------|-------------|
| `synapseLiveDebug.port` | 8421 | Server port |
| `synapseLiveDebug.autoStart` | false | Auto-start on workspace open |
| `synapseLiveDebug.openBrowser` | true | Open browser on start |
| `synapseLiveDebug.enableFileWatcher` | true | Enable file monitoring |
| `synapseLiveDebug.pythonPath` | python | Python interpreter path |

---

## File Watcher

The file watcher monitors file changes in real-time.

### How It Works
- Uses `watchdog` library to monitor filesystem
- Automatically ignores: `node_modules`, `.git`, `__pycache__`, `venv`, `dist`, `build`
- Ignores binary files (`.pyc`, `.exe`, `.dll`, images, fonts)
- 0.5s debounce to avoid duplicate events
- Events emitted as `file-write` in SSE bus

### API Control

```bash
# Watcher status
curl http://localhost:8421/v1/watcher/status

# Stop watcher
curl -X POST http://localhost:8421/v1/watcher/stop

# Restart watcher
curl -X POST http://localhost:8421/v1/watcher/start
```

---

## Sending Custom Events

You can send events from any system via REST API:

### Single Event

```bash
curl -X POST http://localhost:8421/debug/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "custom-event",
    "component": "my-service",
    "data": {
      "message": "Something happened",
      "details": { "key": "value" }
    }
  }'
```

### From Python

```python
import requests

def emit_event(event_type: str, component: str, data: dict):
    requests.post("http://localhost:8421/debug/events", json={
        "type": event_type,
        "component": component,
        "data": data,
    })

# Example
emit_event("llm-call", "my-agent", {"model": "gpt-4", "prompt_tokens": 1500})
```

### From JavaScript/TypeScript

```typescript
async function emitEvent(type: string, component: string, data: Record<string, any>) {
    await fetch('http://localhost:8421/debug/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, component, data }),
    });
}
```

### Real-time Listening via SSE

```javascript
const evtSource = new EventSource('http://localhost:8421/debug/events/stream');
evtSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Event:', data.type, data);
};
```

---

## Integration with Other IDEs

### JetBrains (IntelliJ, PyCharm, WebStorm)

Create a plugin that starts the backend and forwards events.

### Neovim

```lua
-- init.lua
vim.api.nvim_create_autocmd("BufWritePost", {
    callback = function()
        local file = vim.fn.expand("%:p")
        vim.fn.jobstart({
            "curl", "-s", "-X", "POST",
            "http://localhost:8421/debug/events",
            "-H", "Content-Type: application/json",
            "-d", vim.fn.json_encode({
                type = "file-write",
                component = "neovim",
                data = { path = file }
            })
        })
    end
})
```

### Generic HTTP Integration

Any system that can make HTTP POST can integrate:

```bash
curl -X POST http://your-server:8421/debug/events \
  -H "Content-Type: application/json" \
  -d '{"type":"pipeline-start","component":"github-actions","data":{"ref":"main"}}'
```

---

## Advanced Configuration

### Change Port

```bash
python main.py --port 9000
```

### Expose on Local Network

```bash
python main.py --host 0.0.0.0 --port 8421
# Accessible from http://<your-ip>:8421
```

### Disable Features

```bash
# Dashboard only, no watcher
python main.py --no-watch

# No auto-reload (production)
python main.py --no-reload --no-watch
```

### Customize Dashboard

Frontend is in `frontend/`. Main CSS files:

| File | Controls |
|------|----------|
| `css/base.css` | Design tokens, fonts, colors, typography |
| `css/layout.css` | Sidebar, header, responsive layout |
| `css/components.css` | Cards, buttons, badges, modals |
| `css/tabs.css` | Specific styles for each tab panel |

---

## Troubleshooting

### Backend Won't Start

```bash
# Check Python
python --version  # Requires 3.10+

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall

# Check port is free
netstat -an | findstr "8421"
```

### File Watcher Not Working

```bash
# Verify watchdog is installed
pip install watchdog

# Check status via API
curl http://localhost:8421/v1/watcher/status
```

### Service Tests All Fail

Verify `CONFIG.API_BASE` in `frontend/js/config.js` points to correct backend:
```javascript
API_BASE: 'http://127.0.0.1:8421'
```

### Dashboard Not Updating

1. Clear browser cache (Ctrl+Shift+R)
2. Check SSE connection in Console → Network → EventSource
3. Verify backend is alive: `curl http://localhost:8421/health`

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/ready` | GET | Readiness check |
| `/debug/events` | POST | Send single event |
| `/debug/events/batch` | POST | Send batch of events |
| `/debug/events` | GET | Get stored events |
| `/debug/events/stream` | GET | SSE stream |
| `/debug/status` | GET | Store status + stats |
| `/debug/events` | DELETE | Clear all events |
| `/debug/canvas/graph` | GET | Get project graph |
| `/v1/project/scan` | GET | Scan project file tree |
| `/v1/project/detect` | GET | Auto-detect language/framework |
| `/v1/watcher/status` | GET | File watcher status |
| `/v1/watcher/start` | POST | Start file watcher |
| `/v1/watcher/stop` | POST | Stop file watcher |

---

## License

Apache License 2.0 - See [LICENSE](../LICENSE) for details.
