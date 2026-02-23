# Architecture Live Graph — Strategia di Sviluppo

> Data: 19 Febbraio 2026  
> Aggiornato: 20 Febbraio 2026  
> Stato: Fase 1 ✅ | Fase 2 ✅ | Fase 3 ✅ — TUTTE LE FASI COMPLETATE

---

## Stato Attuale — Cosa Funziona

| Componente | Stato | Note |
|-----------|-------|------|
| Scanner reale (ESLint/Stylelint/Ruff) | ✅ OK | Linter eseguiti via subprocess, output JSON parsato |
| Grafo con badge errori/warning | ✅ OK | Nodi rossi/arancioni con conteggi reali |
| Click nodo → Inspector | ✅ OK | Mostra riga, messaggio, regola, severità, codice sorgente annotato |
| Smart Fix (DETECT→FIX→VERIFY) | ✅ OK | `--unsafe-fixes` abilitato per ruff |
| Quick Fix bar (tool di linting) | ✅ OK | Suggerisce ESLint/Prettier/Ruff + comandi install |
| Fix-All parallelizzato | ✅ OK | Ops Center esegue fix su tutti i file |
| Dependency graph | ✅ OK | Import/require parsing per Python/JS/TS/HTML |
| Backend main.py | ✅ OK | 0 errori ruff, sintassi pulita, server stabile |

---

## Gap Identificati — Cosa Manca

### Gap 1: Auto-Scan Agent (PRIORITÀ ALTA) — ✅ COMPLETATO
**Stato**: Implementato il 19 Febbraio 2026

**Cosa è stato fatto**:
- `_auto_lint_file()` — async function che esegue `_run_linter_json()` in `asyncio.to_thread()`
- `_schedule_auto_lint()` — debounce 2s per file tramite `asyncio.TimerHandle`
- Hooked in `_on_file_event()` — su `modified`/`created` lancia auto-lint
- Aggiorna `_ops_scan_cache` e invalida `_file_diag_cache`
- Invia SSE `node_diagnostics` con conteggi aggiornati
- Frontend: handler `node_diagnostics` aggiorna nodo nel grafo, auto-refresh Inspector
- `_showAutoScanToast()` — toast animato con risultato scan (✅/🔴/🟡)
- Notifiche solo quando i problemi aumentano

**File modificati**:
- `backend/main.py`: `_push_canvas_event()`, `_auto_lint_file()`, `_schedule_auto_lint()`, `_on_file_event()`
- `frontend/js/tabs/canvas-sse.js`: handler `node_diagnostics` in `handleCanvasEvent()`, `_showAutoScanToast()`

---

### Gap 2: Package Intelligence (PRIORITÀ MEDIA) — ✅ COMPLETATO
**Stato**: Implementato il 20 Febbraio 2026

**Cosa è stato fatto**:
- `_PACKAGE_SUGGESTIONS` dict — 30+ mapping rule→package per ESLint, Ruff, Stylelint
- `_collect_package_suggestions()` — estrae suggerimenti unici, match esatto + prefix, deduplicazione, rileva pacchetti già installati
- `/debug/canvas/file-info` arricchito — restituisce `suggestedPackages` con installCmd e stato installed
- Inspector: sezione "📦 Suggested Packages" tra Diagnostics e Source Code
- Ogni suggerimento mostra: icona lingua (🐍/📦/🎨), nome pacchetto, spiegazione, pulsante install (→ VS Code terminal), link docs
- Badge per pacchetti già installati e stdlib
- CSS completo per `.pkg-suggestion-row`, `.pkg-install-btn`, `.pkg-link`

**Regole coperte (esempi)**:
| Regola | Pacchetto | Perché |
|--------|-----------|--------|
| `no-unused-vars` | `eslint-plugin-unused-imports` | Auto-remove unused imports |
| `no-console` | `debug` | Structured logging |
| `E501` | `black` | Auto-format long lines |
| `F401` | `autoflake` | Remove unused imports |
| `SIM105` | `contextlib (stdlib)` | Use suppress() pattern |
| `no-descending-specificity` | `stylelint-no-unsupported-browser-features` | CSS specificity conflicts |

**File modificati**:
- `backend/main.py`: `_PACKAGE_SUGGESTIONS`, `_collect_package_suggestions()`, risposta `/debug/canvas/file-info`
- `frontend/js/tabs/canvas-sse.js`: sezione `pkgSec` in `_renderInspector()`
- `frontend/css/components.css`: stili Package Intelligence

---

### Gap 3: Vulnerability/Audit Scan (PRIORITÀ BASSA) — ✅ COMPLETATO
**Stato**: Implementato il 20 Febbraio 2026

**Cosa è stato fatto**:
- `_run_npm_audit(root)` — esegue `npm audit --json`, parsa formato v7+, estrae vulnerabilità con severity/fixAvailable/isDirect, ordina per severity
- `_run_pip_audit(root)` — esegue `pip-audit --format json`, gestisce formati list e dict
- `POST /v1/canvas/audit` — esegue entrambi audit in `asyncio.to_thread()`, salva in `_audit_cache`, push SSE `audit_result`
- `GET /v1/canvas/audit` — restituisce risultati cached
- Nodo esagonale "📦 Dependencies" nel grafo con colore viola `#E040FB`
- Badge vulnerabilità con animazione pulse per errori/warning
- Inspector panel completo: summary (critical/high/moderate/low), lista vulnerabilità per npm e pip, bottoni fix (`npm audit fix`, `npm audit fix --force`, `pip-audit --fix`)
- Bottone install `pip-audit` se non presente
- SSE handler `audit_result` — fetcha dati completi da GET, aggiorna grafo, badge, notifiche
- Pulsante 🛡 Audit nella toolbar del grafo

**Package testati**:
- npm audit: rileva vulnerabilità npm con severity e fix disponibili
- pip-audit: rileva CVE (es. pillow CVE-2026-25990, pip CVE-2025-8869, pip CVE-2026-1703)

**File modificati**:
- `backend/main.py`: `_audit_cache`, `_run_npm_audit()`, `_run_pip_audit()`, endpoint POST+GET `/v1/canvas/audit`
- `frontend/js/tabs/canvas-sse.js`: `runAudit()`, `_injectAuditNode()`, `_renderAuditInspector()`, nodo esagonale, SSE handler `audit_result`
- `frontend/index.html`: pulsante 🛡 Audit
- `frontend/css/components.css`: stili audit (`.audit-vuln-row`, severity colors, badges)

---

## Piano di Esecuzione

### Fase 1: Auto-Scan Agent — ✅ COMPLETATO
**Completato**: 19 Febbraio 2026

### Fase 2: Package Intelligence — ✅ COMPLETATO
**Completato**: 20 Febbraio 2026

### Fase 3: Vulnerability Scan — ✅ COMPLETATO
**Completato**: 20 Febbraio 2026

---

## Note Tecniche

### Architettura Attuale (riferimento)
```
Backend (FastAPI :8421)
├── /debug/canvas/graph      → Costruisce grafo + esegue linter per nodo
├── /debug/canvas/stream     → SSE stream per eventi real-time
├── /debug/canvas/file-info  → Dettaglio file con diagnostics
├── /v1/canvas/smart-fix     → DETECT → FIX → VERIFY pipeline
├── /v1/canvas/quick-fix     → Suggerimenti tool per tipo file
├── /v1/canvas/install-tool  → Installa tool via npm/pip
├── /v1/ops/scan-all         → Scan completo progetto
├── /v1/ops/fix-all          → Fix tutti i file├── /v1/canvas/audit (POST)   → Esegue npm audit + pip-audit
├── /v1/canvas/audit (GET)    → Risultati cached└── /v1/ops/history          → Storico operazioni

Frontend
├── canvas-sse.js            → Grafo force-directed + Inspector + Smart Fix
├── ops-center.js            → Dashboard scan/fix + storico
└── notifications.js         → Toast + audio + desktop notifications

Cache
├── _ops_scan_cache          → Per-file: {errors, warnings, fixable, linter}
├── _file_diag_cache         → Full diagnostics + mtime (invalidazione automatica)
├── _graph_cache             → Grafo completo (nodes + edges)
└── _audit_cache             → Risultati npm audit + pip-audit
```

### File Principali e Dimensioni
- `backend/main.py` — ~5960 righe (monolite, da considerare split futuro)
- `frontend/js/tabs/canvas-sse.js` — ~1810 righe
- `frontend/css/components.css` — ~2350 righe
- `frontend/js/ops-center.js` — ~440 righe

### Linter Configurati
| Tool | Linguaggi | Detect | Fix |
|------|-----------|--------|-----|
| ESLint | JS/TS/JSX/TSX | `npx eslint --format json {file}` | `npx eslint --fix {file}` |
| Stylelint | CSS/SCSS/LESS | `npx stylelint --formatter json {file}` | `npx stylelint --fix {file}` |
| Ruff | Python | `ruff check --output-format json {file}` | `ruff check --fix --unsafe-fixes {file}` |
| Biome | JS/TS/CSS (fallback) | `npx biome lint --reporter json {file}` | `npx biome check --fix {file}` |
