# CANVAS GRAPH — Specifica Visuale

## STRUTTURA EDIFICIO

```
╔════════════════════════════════════════════════════════════════════════════════════════════╗
║  PIANO 5 - ENTRY POINTS                                                                    ║
╠════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                            ║
║    FRONTEND                         BACKEND                      VSCODE-EXT               ║
║                                                                                            ║
║    ╭──────────────────────────────────────────╮                                            ║
║    │ ‹/›  │  index.html              frontend │   ← CONFIGURABLE (256×96)                 ║
║    │ HTML │  27 dependencies                  │     Hub con molte connessioni             ║
║    ╰───────────────────────────◇──────────────╯                                            ║
║                                │                                                           ║
║    ╭──────────────────┐        │         ╭──────────────────┐    ╭──────────────────┐     ║
║    │  PY  │  main.py  │        │         │  TS │extension.ts│    │  SH │  start.bat │     ║
║    │ ⚡   │  backend  │        │         │ ⚡  │  vscode    │    │ ⚡  │   root     │     ║
║    ╰──────────────────╯        │         ╰──────────────────╯    ╰──────────────────╯     ║
║       ↑ TRIGGER (96×96)        │            ↑ TRIGGER               ↑ TRIGGER             ║
║                                │                                                           ║
╠════════════════════════════════════════════════════════════════════════════════════════════╣
║  PIANO 4                                                                                   ║
╠════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                            ║
║    ┌────────────────────┐              ┌────────────────────┐                             ║
║    │  JS  │   app.js    │              │  TS │   panel.ts   │    ← DEFAULT (96×96)        ║
║    │      │  frontend   │              │     │   vscode     │                             ║
║    └────────────────────┘              └────────────────────┘                             ║
║                                        ┌────────────────────┐                             ║
║                                        │  TS │tree-views.ts │                             ║
║                                        │     │   vscode     │                             ║
║                                        └────────────────────┘                             ║
║                                                                                            ║
╠════════════════════════════════════════════════════════════════════════════════════════════╣
║  PIANO 3 - TABS/MODULI                                                                     ║
╠════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                            ║
║  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   BACKEND:                            ║
║  │ JS │canvas-  │ │ JS │live-   │ │ JS │architect│   ┌──────────────┐                     ║
║  │    │sse      │ │    │events  │ │    │ure      │   │ PY │debug_   │                     ║
║  └──────────────┘ └──────────────┘ └──────────────┘   │    │store    │                     ║
║  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   └──────────────┘                     ║
║  │ JS │governor │ │ JS │orchest │ │ JS │quality  │   ┌──────────────┐                     ║
║  │    │         │ │    │ra      │ │    │         │   │ PY │file_    │                     ║
║  └──────────────┘ └──────────────┘ └──────────────┘   │    │watcher  │                     ║
║  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   └──────────────┘                     ║
║  │ JS │services │ │ JS │test-   │ │ JS │metrics  │   ┌──────────────┐                     ║
║  │    │health   │ │    │center  │ │    │         │   │ PY │project_ │                     ║
║  └──────────────┘ └──────────────┘ └──────────────┘   │    │detector │                     ║
║       ↑ tutti DEFAULT (96×96)                        └──────────────┘                     ║
║                                                      ┌──────────────┐                     ║
║                                                      │ PY │framewrk │                     ║
║                                                      │    │adapters │                     ║
║                                                      └──────────────┘                     ║
║                                                           ↑ DEFAULT                       ║
╠════════════════════════════════════════════════════════════════════════════════════════════╣
║  PIANO 2 - UTILITIES                                                                       ║
╠════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                            ║
║  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                      ║
║  │ JS │sse-     │ │ JS │event-  │ │ JS │ide-     │ │ JS │notifi-  │                      ║
║  │    │manager  │ │    │bus     │ │    │adapter  │ │    │cations  │                      ║
║  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘                      ║
║       ↑ DEFAULT (96×96)                                                                   ║
║                                                                                            ║
╠════════════════════════════════════════════════════════════════════════════════════════════╣
║  PIANO 1 - CONFIG (fondamenta)                                                             ║
╠════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                            ║
║       ╭─────╮      ╭─────╮      ╭─────╮      ╭─────╮                                      ║
║       │  #  │      │  #  │      │  #  │      │  #  │     ← CONFIG (80×80 cerchi)          ║
║       ╰─────╯      ╰─────╯      ╰─────╯      ╰─────╯                                      ║
║       base.css    layout.css   comps.css    tabs.css                                      ║
║          ╎            ╎            ╎            ╎                                          ║
║          ╰────────────┴────────────┴────────────╯                                          ║
║                            ╎                                                               ║
║                    ╭───────┴───────╮                                                       ║
║                    │     { }       │                                                       ║
║                    │   config.js   │     ← CONFIG (cerchio, linea tratteggiata ↑)         ║
║                    ╰───────────────╯                                                       ║
║                                                                                            ║
╠════════════════════════════════════════════════════════════════════════════════════════════╣
║  PIANO 0 - ISOLATI                                                                         ║
╠════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                            ║
║  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                      ║
║  │ PY │audit_   │ │ PY │audit_  │ │ PY │audit_  │ │ JS │eslint.  │                      ║
║  │    │final    │ │    │html    │ │    │spaces  │ │    │config   │                      ║
║  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘                      ║
║       ↑ DEFAULT (nessuna connessione - "garage esterno")                                  ║
║                                                                                            ║
╚════════════════════════════════════════════════════════════════════════════════════════════╝
```


## 4 FORME NODO

```
TRIGGER (entry point)        DEFAULT (standard)
╭──┬─────────────────╮       ┌──────────────────┐
│⚡│                 │       │                  │
│  │     96 × 96     │       │     96 × 96      │
│  │                 │       │                  │
╰──┴─────────────────╯       └──────────────────┘
  semicerchio + rect           quadrato r=8


CONFIG (*.css, *.json)       CONFIGURABLE (hub ≥8 conn)
      ╭─────────╮            ╭────────────────────────────────────────────╮
     ╱           ╲           │                                            │
    │    r=40     │          │              256 × 96                      │
     ╲           ╱           │                                            │
      ╰─────────╯            ╰────────────────────────────────────────────╯
      cerchio 80×80              rettangolo largo con bordi arrotondati
```


## REGOLE ASSEGNAZIONE PIANO

```
PIANO 5 - ENTRY POINTS:
  └─ main.py, extension.ts, start.bat, start.sh (TRIGGER)
  └─ index.html (CONFIGURABLE se ≥8 dipendenze)

PIANO 4 - ORCHESTRATORI:
  └─ app.js, panel.ts, tree-views.ts

PIANO 3 - TABS/MODULI:
  └─ frontend/js/tabs/*.js
  └─ backend/*.py (escluso main.py)

PIANO 2 - UTILITIES:
  └─ sse-manager.js, event-bus.js, ide-adapter.js, notifications.js

PIANO 1 - CONFIG:
  └─ *.css, *.json, config.js

PIANO 0 - ISOLATI:
  └─ nodi senza connessioni (in + out = 0)
```


## COLORI ESTENSIONE

```
.py   ████  #3572A5  Python Blue
.js   ████  #D4A017  JavaScript Gold  
.ts   ████  #3178C6  TypeScript Blue
.css  ████  #663399  CSS Purple
.html ████  #E34C26  HTML Orange
.json ████  #444444  JSON Dark
.md   ████  #083FA1  Markdown Blue
.sh   ████  #4E9A06  Shell Green
.bat  ████  #4E9A06  Batch Green
```


## ICONE GEOMETRICHE (bianche, dentro cerchio colorato)

```
Python      JavaScript    TypeScript    CSS          HTML
   ▲            ■            ⬡           ◇            ‹/›
triangolo    quadrato     esagono      rombo       tag HTML


JSON        Markdown      Shell        Default
  {}           M            $            ●
parentesi   lettera M   dollaro      cerchio
```


## CONNESSIONI — IMPIANTI EDIFICIO

```
╔════════════════════════════════════════════════════════════════════════════╗
║  TIPI DI IMPIANTO                                                          ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  ELETTRICO (eventi/dati dinamici)                                          ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━►                                        ║
║  Linea SOLIDA spessa (3px)                                                 ║
║  Es: SSE events, event-bus dispatch, callbacks                             ║
║                                                                            ║
║  IDRAULICO (import/dipendenze statiche)                                    ║
║  ────────────────────────────────────►                                     ║
║  Linea SOLIDA sottile (1.5px)                                              ║
║  Es: import { x } from './module'                                          ║
║                                                                            ║
║  GAS (configurazione)                                                      ║
║  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─►                                               ║
║  Linea TRATTEGGIATA (dash: 8,4)                                            ║
║  Es: config.js -> moduli, *.css -> componenti                              ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
```


## ROUTING ORTOGONALE (dentro i muri)

```
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║  Le connessioni NON attraversano i nodi.                                   ║
║  Passano in CORRIDOI verticali tra le colonne.                             ║
║                                                                            ║
║      ┌─────┐              ┌─────┐              ┌─────┐                     ║
║      │  A  │──┐           │  B  │──┐           │  C  │                     ║
║      └─────┘  │           └─────┘  │           └─────┘                     ║
║               │   CORRIDOIO        │   CORRIDOIO                           ║
║               │      ║             │      ║                                ║
║      ┌─────┐  │      ║    ┌─────┐  │      ║    ┌─────┐                     ║
║      │  D  │◄─┘      ║    │  E  │◄─┴──────╫───►│  F  │                     ║
║      └─────┘         ║    └─────┘         ║    └─────┘                     ║
║                      ║                    ║                                ║
║  REGOLE:             ║                    ║                                ║
║  • Uscita sempre da RIGHT o BOTTOM       ║                                ║
║  • Curva a 90° nei corridoi              ║                                ║
║  • Entrata sempre da LEFT o TOP          ║                                ║
║  • Mai diagonali                         ║                                ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
```


## RACCORDI (bundling per tipo)

```
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║  Connessioni dello stesso TIPO viaggiano insieme (bundle).                 ║
║  Si separano solo vicino alla destinazione.                                ║
║                                                                            ║
║                    ┌─────────┐                                             ║
║                    │ config  │                                             ║
║                    └────┬────┘                                             ║
║                         │                                                  ║
║            ┌────────────┼────────────┐   ← BUNDLE GAS (tratteggiato)       ║
║            │            │            │                                     ║
║            ▼            ▼            ▼                                     ║
║       ┌────────┐   ┌────────┐   ┌────────┐                                ║
║       │ tab-1  │   │ tab-2  │   │ tab-3  │                                ║
║       └────────┘   └────────┘   └────────┘                                ║
║                                                                            ║
║  SEPARAZIONE VISIVA per evitare sovrapposizione:                          ║
║                                                                            ║
║       ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   ELETTRICO (sopra, spesso)           ║
║       ──────────────────────────────   IDRAULICO (centro, sottile)        ║
║       ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   GAS (sotto, tratteggiato)           ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
```


## COLORI STATO CONNESSIONE

```
  #98A2B3  grigio    (neutral/idle)
  #17B26A  verde     (success/active)  
  #F79009  arancio   (warning)
  #F04438  rosso     (error)
  #7B61FF  viola     (running/in-flight)
```


## PORTE 4 FACCE

```
              TOP
               │
               ▼
        ┌──────────────┐
        │              │
 LEFT ──│    NODO      │── RIGHT
        │              │
        └──────────────┘
               │
               ▼
            BOTTOM

Se target sotto  → src.BOTTOM → tgt.TOP
Se target sopra  → src.TOP    → tgt.BOTTOM  
Se target destra → src.RIGHT  → tgt.LEFT
Se target sinistra → src.LEFT → tgt.RIGHT
```


## SPAZIATURA

```
PAD          = 64px   (margine esterno)
NODE_SPACING = 128px  (tra nodi orizzontale)
PIANO_GAP    = 160px  (tra piani verticale)
MAX_PER_ROW  = 10     (nodi per riga nel piano)
```


## DIMENSIONI NODO

```
DEFAULT       96 × 96    quadrato
TRIGGER       96 × 96    quadrato con semicerchio
CONFIG        80 × 80    cerchio (diameter)
CONFIGURABLE  256 × 96   rettangolo largo
```


## INTERAZIONE

```
PAN:   click + drag sul canvas
ZOOM:  rotella mouse (centrato su cursore)
       range 10% — 1000%
```
