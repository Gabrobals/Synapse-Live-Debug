# Synapse Live Debug — Guida Utente

**Dashboard di telemetria real-time per qualsiasi progetto software.**

---

## Indice

1. [Installazione](#installazione)
2. [Avvio Rapido](#avvio-rapido)
3. [Interfaccia Dashboard](#interfaccia-dashboard)
4. [Canvas SSE — Grafo del Progetto](#canvas-sse--grafo-del-progetto)
5. [Smart Fix — Correzione Automatica dei Bug](#smart-fix--correzione-automatica-dei-bug)
6. [Prompt Generator — Generatore di Prompt AI](#prompt-generator--generatore-di-prompt-ai)
7. [Security Audit — Audit di Sicurezza](#security-audit--audit-di-sicurezza)
8. [Terminal Feedback UX](#terminal-feedback-ux)
9. [Operations Center (Ops Center)](#operations-center-ops-center)
10. [Menu Contestuale](#menu-contestuale)
11. [Sistema Icone SVG](#sistema-icone-svg)
12. [Quick Fix Panel](#quick-fix-panel)
13. [Flusso Completo di Risoluzione Bug](#flusso-completo-di-risoluzione-bug)
14. [Project Scanner](#project-scanner)
15. [Collegamento a un Progetto](#collegamento-a-un-progetto)
16. [Estensione VS Code](#estensione-vs-code)
17. [File Watcher](#file-watcher)
18. [Invio Eventi Personalizzati](#invio-eventi-personalizzati)
19. [Integrazione con Altri IDE](#integrazione-con-altri-ide)
20. [Configurazione Avanzata](#configurazione-avanzata)
21. [Troubleshooting](#troubleshooting)

---

## Installazione

### Requisiti
- **VS Code** (versione recente) con **GitHub Copilot** e **Copilot Chat** installati e attivi
- **Node.js 18+** (per compilare l'estensione: `npm install` + `npm run compile`)
- **Python 3.10+** con pip (per il backend)

### Cosa è automatico e cosa no

| Azione | Chi la fa | Dettaglio |
|--------|-----------|----------|
| Cattura prompt | **Automatico** | `@synapse` si attiva da solo 3s dopo l'avvio di VS Code |
| Risposta AI | **Automatico** | Copilot risponde normalmente — L'utente non nota differenze |
| Eventi (file, terminale, errori) | **Automatico** | L'estensione li cattura e li invia al backend |
| Installare l'estensione | **Tu (1 volta)** | Compilare + creare il junction link |
| Avviare il backend | **Tu** | `python main.py --open` oppure `start.bat` |

### Passaggi

```bash
# Clona il progetto
git clone <repo-url>
cd "Synapse Live Debug"

# Installa le dipendenze Python
cd backend
pip install -r requirements.txt
```

Le dipendenze sono:
- **fastapi** — Web framework
- **uvicorn** — ASGI server
- **sse-starlette** — Server-Sent Events
- **pydantic** — Data validation
- **watchdog** — File system monitoring

---

## Avvio Rapido

> **In sintesi:** installi l'estensione una volta sola (Fase A), poi ogni volta
> che lavori avvii il backend (Fase B) e apri VS Code — tutto il resto è automatico.

### Fase A — Estensione VS Code (una tantum)

```bash
cd vscode-extension
npm install
npm run compile
```

Poi crea un junction link (vedi sezione [Estensione VS Code](#estensione-vs-code)
per i comandi completi). Riavvia VS Code.

### Fase B — Backend + Dashboard (ogni sessione)

#### Windows
Doppio click su `start.bat` oppure:
```cmd
cd backend
python main.py --open
```

### Linux / macOS
```bash
chmod +x start.sh
./start.sh
```

### Opzioni CLI

```bash
python main.py [OPZIONI]
```

| Opzione | Breve | Default | Descrizione |
|---------|-------|---------|-------------|
| `--project-root PATH` | `-r` | directory padre | Percorso del progetto da debuggare |
| `--port PORT` | `-p` | 8421 | Porta del server |
| `--host HOST` | — | 127.0.0.1 | Host di ascolto |
| `--open` | `-o` | off | Apri il browser automaticamente |
| `--no-watch` | — | off | Disabilita il file watcher |
| `--no-reload` | — | off | Disabilita auto-reload di uvicorn |

### Esempi

```bash
# Debug del progetto corrente
python main.py --project-root . --open

# Debug di un altro progetto su porta personalizzata
python main.py -r C:\Users\me\Projects\MyApp -p 9000 --open

# Modalità produzione
python main.py --no-reload --no-watch --host 0.0.0.0
```

---

## Interfaccia Dashboard

La dashboard ha una **sidebar verticale a sinistra** con 5 sezioni principali:

### Live
- **Live Events** — Stream in tempo reale di tutti gli eventi (file save, LLM call, tool execution...)
- **Services Health** — Griglia di servizi con health check e test endpoint
- **Canvas SSE** — Grafo interattivo del progetto con diagnostica per file, Smart Fix, Prompt Generator e audit di sicurezza (vedi sezione dedicata)
- **Ops Center** — Centro operativo unificato con health score, scansione automatica e azioni rapide (vedi sezione dedicata)

### System
- **Agent Intelligence** — Tab unificato con 3 viste:
  - *Infra* — Mappa delle 14 categorie infrastrutturali del progetto
  - *Flow* — Pipeline live a 9 stadi (il prompt viene catturato automaticamente via `@synapse`)
  - *Diagnostics* — Probe sequenziali per verificare l'integrità della catena chat AI
- **Architecture** — Visualizzazione TAC (Technology Architecture Canvas)
- **Orchestra** — Orchestrazione multi-agente
- **Governor** — Supervisore runtime con auto-healing

### Testing
- **Test Center** — Runner di test con risultati live
- **Quality** — Metriche di qualità del codice
- **TQI** — Technical Quality Index

### Analytics
- **Metrics** — Grafici di performance e throughput
- **Project Reality** — Scanner reale della struttura del progetto
- **Structural Health** — Analisi della salute strutturale
- **Language Registry** — Registry dei linguaggi e parser

---

## Canvas SSE — Grafo del Progetto

Il tab **Canvas SSE** è il cuore visuale di Synapse Live Debug. Mostra un **grafo interattivo** di tutti i file del progetto, con diagnostica in tempo reale, Smart Fix e generazione di prompt AI.

### Panoramica

Quando apri il tab Canvas SSE, il sistema:
1. Chiama l'endpoint `GET /debug/canvas/graph` del backend
2. Riceve la lista di tutti i file del progetto con le loro dipendenze
3. Esegue i linter reali (eslint, ruff, stylelint) su ogni file in parallelo
4. Genera un grafo SVG interattivo con le relazioni tra file
5. Aggiorna automaticamente il grafo quando i file cambiano (via SSE)

### Tipi di Nodo

Ogni file viene rappresentato come un nodo nel grafo. Ci sono **3 tipi di rendering**:

| Tipo | Forma | Esempi di file | Descrizione |
|------|-------|----------------|-------------|
| **Trigger** | Capsula con lato sinistro arrotondato | `main.py`, `index.html`, `app.js` | Punti di ingresso dell'applicazione |
| **Config** | Cerchio | `package.json`, `tsconfig.json`, `ruff.toml`, `.yml` | File di configurazione |
| **Default** | Rettangolo | Tutti gli altri file `.py`, `.js`, `.css`, ecc. | File sorgente standard |

### Codifica Colori per Linguaggio

Ogni estensione di file ha un colore unico che ne facilita il riconoscimento:

| Linguaggio | Colore | Codice |
|------------|--------|--------|
| Python (.py) | Blu scuro | `#3572A5` |
| JavaScript (.js) | Giallo | `#F1E05A` |
| TypeScript (.ts) | Blu | `#3178C6` |
| CSS (.css) | Viola | `#563D7C` |
| HTML (.html) | Arancione | `#E34C26` |
| JSON (.json) | Grigio scuro | `#292929` |
| Markdown (.md) | Azzurro | `#083FA1` |
| YAML (.yml) | Rosso | `#CB171E` |
| TOML (.toml) | Grigio | `#9C4121` |
| JSX (.jsx) | Giallo/Blu | `#F1E05A` |
| TSX (.tsx) | Blu/Viola | `#3178C6` |

### Icone SVG e Label

Ogni nodo mostra:
- Un'**icona SVG** specifica per il tipo di file (vedi [Sistema Icone SVG](#sistema-icone-svg))
- Una **label testuale** abbreviata del tipo: `PY`, `JS`, `TS`, `#` (CSS), `</>` (HTML), `{}` (JSON), `CFG` (config), ecc.

### Swimlane (Bande per Directory)

I file sono raggruppati visivamente in **bande orizzontali** (swimlane) per directory:
- Ogni directory del progetto (`backend/`, `frontend/`, `docs/`, `frontend/js/tabs/`, ecc.) ha la sua banda
- Le bande hanno un'etichetta con il nome della directory
- I file all'interno della stessa directory sono posizionati nella stessa fascia orizzontale
- Questo rende immediato capire la struttura del progetto a colpo d'occhio

### Connessioni tra File (Edge)

Le linee tratteggiate tra i nodi rappresentano le **relazioni di import/dipendenza**:
- Una freccia da `A` → `B` significa che il file A importa/dipende dal file B
- Le relazioni vengono estratte analizzando gli import nel codice sorgente
- Le linee sono tratteggiate per non sovraccaricare visivamente il grafo

### Indicatori di Stato

Ogni nodo mostra lo stato di salute del file tramite il **colore del bordo**:

| Colore bordo | Significato | Dettaglio |
|--------------|-------------|----------|
| 🟢 Verde | File pulito | Nessun errore, nessun warning |
| 🟡 Giallo | Warning presenti | Uno o più warning, nessun errore |
| 🔴 Rosso | Errori presenti | Uno o più errori di lint |

Inoltre, un **pallino colorato** (dot) appare nell'angolo del nodo per indicare lo stato.

### Pannello Inspector (Diagnostica)

Cliccando su qualsiasi nodo, si apre un **pannello inspector** sulla destra con:

1. **Intestazione del file**: Nome del file e percorso completo
2. **Badge di conteggio**:
   - Badge rosso: numero di errori
   - Badge giallo: numero di warning
   - Badge blu: numero di info
3. **Tool di lint rilevato**: Badge che mostra quale linter è stato utilizzato (eslint, ruff, stylelint) con indicatore in tempo reale
4. **Conteggio fixable**: Indicatore di quanti problemi sono auto-risolvibili
5. **Lista diagnostici**: Ogni problema viene mostrato con:
   - Numero di riga
   - Messaggio di errore/warning
   - Codice regola (es. `no-unused-vars`, `E501`)
   - Severità (error/warning/info)
6. **Pulsanti azione**:
   - **Smart Fix** — Correzione automatica (vedi sezione dedicata)
   - **Prompt Generator** — Genera prompt per Copilot (vedi sezione dedicata)
   - **Ri-scansiona file** — Riesegue il linter sul file

### Toolbar del Canvas

Sopra il grafo è presente una toolbar con i seguenti controlli:

- **Pan** — Trascina il grafo per navigare
- **Zoom** — Ingrandisci/rimpicciolisci con la rotellina del mouse
- **Auto-layout** — Ricalcola automaticamente il posizionamento dei nodi
- **Audit** — Pulsante con icona scudo per eseguire l'audit di sicurezza
- **Refresh** — Ricarica il grafo dal backend

### Auto-refresh

Il grafo si aggiorna automaticamente quando:
- Un file viene salvato (evento SSE `file-write`)
- Il backend rileva una modifica tramite il file watcher
- Viene eseguita una scansione manuale

---

## Smart Fix — Correzione Automatica dei Bug

Lo **Smart Fix** è il sistema di correzione automatica dei bug integrato nel Canvas SSE. Rileva il linter corretto per ogni file e ne esegue il comando `--fix` automaticamente.

### Come Funziona

1. **Rilevamento del linter**: Il sistema identifica automaticamente il linter appropriato per il file:
   - `.js`, `.jsx` → **eslint**
   - `.ts`, `.tsx` → **eslint**
   - `.py` → **ruff**
   - `.css` → **stylelint**
2. **Esecuzione del fix**: Viene eseguito il comando di fix del linter specifico:
   - `npx eslint --fix <file>` per JavaScript/TypeScript
   - `ruff check --fix <file>` per Python
   - `npx stylelint --fix <file>` per CSS
3. **Feedback in tempo reale**: Il risultato viene mostrato nel pannello Terminal Feedback
4. **Re-scansione**: Dopo il fix, il file viene automaticamente ri-scansionato per verificare i risultati

### Pulsanti Smart Fix

Nel pannello inspector, i pulsanti di fix sono:

| Pulsante | Icona | Quando appare | Azione |
|----------|-------|---------------|--------|
| **Smart Fix** | 🔨 Martello | Quando viene rilevato un linter reale | Esegue `--fix` del linter specifico |
| **Fix All** | 🔧 Chiave | Come fallback quando non c'è un linter configurato | Tenta una correzione generica |

### Badge di Conteggio Fix

Accanto al pulsante Smart Fix appare un **badge numerico** che indica quanti problemi sono auto-risolvibili. Ad esempio:

```
[Smart Fix 12] — significa che 12 problemi possono essere corretti automaticamente
```

### Passi per Usare Smart Fix

1. Clicca su un nodo con errori (bordo rosso o giallo) nel grafo
2. Nel pannello inspector, verifica i diagnostici elencati
3. Se il badge del linter mostra "eslint", "ruff" o "stylelint", il pulsante **Smart Fix** è disponibile
4. Clicca **Smart Fix**
5. Il sistema esegue il comando di fix e mostra il risultato nel Terminal Feedback
6. I problemi risolti vengono rimossi dalla lista dopo la re-scansione
7. I problemi non risolvibili automaticamente restano elencati — usa il **Prompt Generator** per quelli

---

## Prompt Generator — Generatore di Prompt AI

Il **Prompt Generator** è un sistema che genera prompt ottimizzati per GitHub Copilot Chat, permettendoti di correggere errori non auto-fixabili tramite l'AI.

### Tipi di Prompt

Ci sono due modalità di generazione:

| Modalità | Icona | Posizione | Cosa genera |
|----------|-------|-----------|-------------|
| **Prompt singolo** | 🤖 Robot piccolo | Accanto a OGNI diagnostico nella lista | Prompt per UN singolo problema specifico |
| **Prompt completo** | Pulsante "Prompt" | Accanto al titolo della sezione diagnostici | Prompt per TUTTI i problemi del file |

### Come Usare il Prompt Generator

#### Prompt per un Singolo Diagnostico

1. Nel pannello inspector, individua il diagnostico che vuoi correggere
2. Clicca l'**icona robot** (🤖) accanto al messaggio del diagnostico
3. Il sistema genera un prompt mirato con:
   - Percorso del file
   - Numero di riga
   - Messaggio di errore esatto
   - Codice regola del linter
   - Istruzione specifica per la correzione
4. Il prompt viene **copiato automaticamente negli appunti** (clipboard)
5. Una notifica toast conferma: **"Prompt copiato!"**
6. Apri **GitHub Copilot Chat** in VS Code
7. Incolla con **Ctrl+V** (o Cmd+V su Mac)
8. Copilot analizza il problema e suggerisce la correzione esatta

#### Prompt per Tutti i Diagnostici

1. Nel pannello inspector, clicca il pulsante **"Prompt"** accanto al titolo della sezione
2. Il sistema genera un prompt comprensivo con:
   - Percorso del file
   - Lista completa di TUTTI i diagnostici
   - Numero di riga e messaggio per ciascun problema
   - Istruzioni per correggere tutti i problemi in blocco
3. Il prompt viene copiato negli appunti
4. Incolla in Copilot Chat per ottenere tutte le correzioni in una volta

### Workflow Tipico

```
1. Smart Fix → corregge i problemi auto-fixabili (formattazione, spazi, ecc.)
2. Prompt Generator → per i problemi che richiedono ragionamento logico
3. Ri-scansiona file → verifica che tutti i problemi siano risolti
```

> **Suggerimento:** Usa prima il Smart Fix per risolvere i problemi banali, poi il Prompt Generator per quelli complessi. Questo riduce il numero di problemi che Copilot deve analizzare.

---

## Security Audit — Audit di Sicurezza

Il Canvas SSE include un sistema di **audit di sicurezza** che analizza le dipendenze del progetto alla ricerca di vulnerabilità note.

### Come Avviare l'Audit

1. Apri il tab **Canvas SSE**
2. Nella toolbar in alto, clicca il **pulsante Audit** (icona scudo 🛡️)
3. Il sistema avvia automaticamente gli audit appropriati per il progetto

### Cosa Viene Scansionato

| Tipo progetto | Comando eseguito | Cosa controlla |
|---------------|------------------|----------------|
| JavaScript/Node.js | `npm audit` | Vulnerabilità nelle dipendenze npm |
| Python | `pip-audit` | Vulnerabilità nelle dipendenze Python |

Il sistema rileva automaticamente il tipo di progetto e esegue l'audit corretto.

### Risultati dell'Audit

I risultati vengono mostrati nel pannello inspector con:

1. **Badge di conteggio vulnerabilità**: Numero totale di vulnerabilità trovate
2. **Suddivisione per severità**:
   - 🔴 **Critical** — Vulnerabilità critiche, da risolvere immediatamente
   - 🟠 **High** — Severità alta
   - 🟡 **Moderate** — Severità media
   - 🔵 **Low** — Severità bassa
3. **Comandi di fix rapido**: Per ogni vulnerabilità, il sistema suggerisce il comando per risolverla (es. `npm audit fix`)

### Sezione Dependencies Inspector

Cliccando un nodo nel grafo, la sezione inspector può mostrare anche i **dettagli delle dipendenze**:
- Nome del pacchetto
- Versione installata
- Versione sicura consigliata
- Tipo di vulnerabilità

---

## Terminal Feedback UX

Quando il sistema esegue comandi (Smart Fix, audit, scansione), un **pannello di feedback** appare nella parte inferiore dell'inspector per mostrare lo stato dell'operazione.

### Elementi del Pannello

| Elemento | Descrizione |
|----------|-------------|
| **Comando** | Il comando esatto che viene eseguito (es. `npx eslint --fix src/app.js`) |
| **Stato** | Indicatore visivo: ⏳ In attesa, ✅ Successo, ❌ Errore |
| **Output** | Testo di output del comando eseguito |
| **Badge risultati** | Conteggio dei fix applicati o errori riscontrati |

### Sistema ACK (Acknowledgement)

Dopo il completamento di un fix:

1. Il pannello mostra il **risultato dell'operazione** (quanti problemi sono stati corretti)
2. Un pulsante di **dismissione** permette di chiudere il feedback
3. La **re-scansione automatica** del file viene avviata
4. I risultati aggiornati vengono mostrati nel pannello inspector

### Flusso del Terminal Feedback

```
CliccaSmartFix → [Pannello: "Esecuzione in corso..."] 
                → [Pannello: "Completato: 8 fix applicati"]
                → [Re-scansione automatica]
                → [Inspector aggiornato con nuovi conteggi]
```

---

## Operations Center (Ops Center)

L'**Operations Center** (Ops Center) fornisce una vista unificata della salute complessiva del progetto.

### Health Score

Al centro dell'Ops Center viene mostrato un **punteggio di salute** (Health Score) calcolato in base a:

- Numero totale di file nel progetto
- Numero di file con errori
- Numero di file con warning
- Numero di file puliti (nessun problema)

#### Formula del Punteggio

Il punteggio viene calcolato considerando il peso relativo di errori e warning rispetto al totale dei file:

```
Health Score = f(file_totali, errori, warning, file_puliti)
```

Un punteggio alto indica un progetto in buona salute; un punteggio basso indica molti problemi da risolvere.

### Auto-Scan al Caricamento

Quando apri il tab Ops Center, il sistema **avvia automaticamente una scansione** dell'intero progetto:
1. Tutti i file vengono scansionati con i rispettivi linter
2. I risultati vengono aggregati
3. L'Health Score viene calcolato e visualizzato
4. Una notifica toast mostra il progresso e il risultato finale

### Azioni Rapide

L'Ops Center offre pulsanti per operazioni frequenti:

| Azione | Descrizione |
|--------|-------------|
| **Ri-scansiona** | Riesegue la scansione completa del progetto |
| **Fix All** | Esegue il fix automatico su tutti i file con problemi risolvibili |

### Notifiche Toast

Durante le operazioni, il sistema mostra notifiche toast che informano su:
- Inizio scansione
- Progresso (numero di file scansionati)
- Risultato finale (errori trovati, warning, file puliti)

---

## Menu Contestuale

All'interno del grafo Canvas SSE, è possibile attivare un **menu contestuale** cliccando con il tasto destro su un nodo.

### Azioni Disponibili

| Azione | Icona | Descrizione |
|--------|-------|-------------|
| **Ri-scansiona progetto** | 🔄 Refresh | Riesegue la scansione di tutti i file del progetto |
| **Ri-scansiona file** | 🔄 Refresh | Riesegue la scansione solo del file selezionato |
| **Apri nel browser** | 🌐 Globe | Apre i risultati dell'audit del file nel browser |
| **Azioni aggiuntive** | Varie | Azioni specifiche in base al contesto del nodo |

### Come Usare il Menu Contestuale

1. Nel grafo Canvas SSE, individua il nodo del file di interesse
2. **Clicca con il tasto destro** sul nodo
3. Appare il menu contestuale con le azioni disponibili
4. Seleziona l'azione desiderata
5. L'operazione viene eseguita e il risultato mostrato nel pannello inspector

---

## Sistema Icone SVG

Tutte le icone nell'applicazione utilizzano un **sistema di icone SVG inline personalizzato**, ispirato al design system di minimax.io.

### Caratteristiche del Design

- **Stroke-based** — Le icone usano tratti (stroke), non riempimenti
- **Niente emoji** — Icone vettoriali pulite, senza caratteri emoji
- **Flat & minimal** — Design piatto e minimale, coerente in tutta l'app
- **Dimensione e colore configurabili** — Ogni icona può essere personalizzata

### File Sorgente

Tutte le icone sono definite nel file `frontend/js/svg-icons.js`, che funge da **registro centrale** delle icone.

### Utilizzo nel Codice

Le icone possono essere usate in due contesti:

#### Contesto HTML

Per inserire un'icona nel DOM HTML:

```javascript
// Icona bolt (fulmine) rossa, dimensione 14px
SynapseIcons.html('bolt', { size: 14, color: '#F53F3F' })

// Icona gear (ingranaggio) blu, dimensione 20px
SynapseIcons.html('gear', { size: 20, color: '#1456F0' })
```

#### Contesto SVG

Per inserire un'icona dentro un elemento `<svg>` (ad esempio nei nodi del grafo):

```javascript
// Icona bolt bianca, dimensione 14px (per SVG)
SynapseIcons.svg('bolt', { size: 14, color: 'white' })

// Icona shield verde, dimensione 16px (per SVG)
SynapseIcons.svg('shield', { size: 16, color: '#00B42A' })
```

### Catalogo Icone Disponibili

| Categoria | Icone |
|-----------|-------|
| **Interfaccia** | `gear`, `search`, `refresh`, `check`, `warning`, `info`, `eye`, `window`, `home` |
| **Azioni** | `bolt`, `wrench`, `hammer`, `pencil`, `trash`, `clipboard`, `floppy` |
| **Sviluppo** | `bug`, `terminal`, `flask`, `package`, `document`, `folder`, `layers`, `code` |
| **AI / Intelligenza** | `robot`, `brain`, `sparkles`, `lightbulb`, `puzzle`, `dna` |
| **Comunicazione** | `chat`, `globe` |
| **Sicurezza** | `shield`, `target` |
| **Analisi** | `microscope`, `ruler`, `chart`, `palette` |
| **Navigazione** | `hook`, `route`, `masks`, `hourglass` |
| **Status** | `heart`, `dot-red`, `dot-yellow`, `dot-green` |

---

## Quick Fix Panel

Quando si clicca un nodo con problemi di lint nel grafo Canvas SSE, viene mostrato un **pannello Quick Fix** con informazioni dettagliate sugli strumenti disponibili.

### Informazioni sul Progetto

Il pannello mostra dei **badge informativi**:
- **Package manager**: quale gestore pacchetti è configurato (npm, pip, ecc.)
- **Tool configurati**: numero di strumenti di lint/format configurati nel progetto

### Stato per Tool

Per ogni strumento di lint rilevato, il pannello mostra:

| Indicatore | Significato |
|------------|-------------|
| ✅ **Configurato** | Il tool ha un file di configurazione nel progetto (es. `eslint.config.js`, `ruff.toml`) |
| ✅ **In devDependencies** | Il tool è dichiarato come dipendenza di sviluppo nel `package.json` |
| ⚠️ **Non installato** | Il tool è configurato ma non risulta installato (manca in `node_modules` o nell'ambiente Python) |

### Comandi di Installazione

Se un tool risulta mancante, il pannello mostra il **comando di installazione** pronto all'uso:

```bash
# Esempio per eslint mancante
npm install --save-dev eslint

# Esempio per ruff mancante
pip install ruff

# Esempio per stylelint mancante
npm install --save-dev stylelint
```

### Pulsanti di Fix Diretto

Il pannello offre pulsanti per azioni immediate:
- **Installa** — Installa il tool mancante con un click
- **Smart Fix** — Esegui il fix automatico (se il tool è disponibile)
- **Configura** — Apri/crea il file di configurazione del tool

---

## Flusso Completo di Risoluzione Bug

Questa sezione descrive il **workflow completo** per trovare e correggere tutti i bug del progetto, passo dopo passo.

### Passo 1 — Avvia il Backend

Avvia il server Synapse Live Debug:

```bash
cd backend
python main.py --open
```

Il flag `--open` apre automaticamente il browser. Il server si avvia sulla porta **8421** per default.

### Passo 2 — Apri la Dashboard

Il browser si apre su `http://127.0.0.1:8421`. Se non si apre automaticamente, naviga manualmente all'indirizzo.

### Passo 3 — Vai al Tab Canvas SSE

Nella **sidebar sinistra**, clicca su **Canvas SSE** nella sezione "Live". Il grafo del progetto inizia a caricarsi.

### Passo 4 — Caricamento del Grafo

Il grafo si carica automaticamente mostrando tutti i file del progetto:
- Ogni file è rappresentato come un nodo
- Le connessioni mostrano le dipendenze tra file
- I file sono raggruppati in swimlane per directory

### Passo 5 — Osserva i Colori dei Nodi

I colori dei bordi dei nodi indicano lo stato di salute:

| Colore del bordo | Significato | Azione necessaria |
|------------------|-------------|-------------------|
| 🟢 **Verde** | File pulito | Nessuna azione |
| 🟡 **Giallo** | Warning presenti | Consigliata una revisione |
| 🔴 **Rosso** | Errori presenti | Correzione necessaria |

### Passo 6 — Clicca su un Nodo con Errori

Clicca su un nodo con **bordo rosso** (errori) o **bordo giallo** (warning). Si apre il **pannello inspector** sulla destra.

### Passo 7 — Analizza l'Inspector

L'inspector mostra:

- **Badge errori/warning/info**: Conteggio con colori distinti
  - 🔴 Rosso = errori
  - 🟡 Giallo = warning
  - 🔵 Blu = info
- **Lista diagnostici**: Ogni problema con:
  - Numero di riga (es. `Riga 42`)
  - Messaggio di errore
  - Codice regola (es. `no-unused-vars`, `E501`, `declaration-empty-line-before`)
- **Tool di lint**: Badge che mostra il linter utilizzato:
  - `eslint` per file JavaScript/TypeScript
  - `ruff` per file Python
  - `stylelint` per file CSS

### Passo 8 — Correzione Automatica con Smart Fix

Se il linter supporta la correzione automatica:

1. Verifica che il badge del linter sia presente (es. "eslint")
2. Clicca il pulsante **"Smart Fix"** (icona martello 🔨)
3. Il sistema esegue il comando appropriato:
   - `npx eslint --fix <file>` per JS/TS
   - `ruff check --fix <file>` per Python
   - `npx stylelint --fix <file>` per CSS
4. Il **Terminal Feedback** mostra il risultato in tempo reale
5. I fix applicati vengono conteggiati e mostrati
6. L'inspector si aggiorna automaticamente con i problemi rimanenti

### Passo 9 — Errori Non Auto-Fixabili con Prompt Generator

Per gli errori che il linter non può correggere automaticamente:

1. Individua il diagnostico nella lista dell'inspector
2. Clicca il pulsante **"Prompt"** (icona robot 🤖) per generare un prompt
   - **Prompt singolo**: Clicca l'icona robot accanto a UN diagnostico specifico
   - **Prompt completo**: Clicca il pulsante "Prompt" accanto al titolo della sezione per TUTTI i diagnostici
3. Il prompt viene **copiato automaticamente negli appunti**
4. Una notifica toast conferma: **"Prompt copiato!"**
5. Apri **GitHub Copilot Chat** in VS Code (`Ctrl+Shift+I`)
6. Incolla il prompt con **Ctrl+V**
7. Copilot analizza il problema e suggerisce la **correzione esatta**
8. Applica la correzione suggerita da Copilot

### Passo 10 — Verifica le Correzioni

Dopo aver applicato le correzioni:

1. **Ri-scansiona il file**: Clicca con il tasto destro sul nodo → "Ri-scansiona file"
2. **Oppure ri-scansiona il progetto**: Clicca con il tasto destro → "Ri-scansiona progetto"
3. **Verifica** che il bordo del nodo passi da rosso/giallo a **verde**
4. Se restano problemi, ripeti dal Passo 7

### Riepilogo del Workflow

```
┌─────────────────────────────────────────────────────┐
│  1. Avvia backend (python main.py --open)           │
│  2. Apri Canvas SSE                                 │
│  3. Identifica nodi rossi/gialli                    │
│  4. Clicca nodo → Inspector                         │
│  5. Smart Fix → corregge problemi auto-fixabili     │
│  6. Prompt Generator → per problemi complessi       │
│  7. Incolla prompt in Copilot Chat                  │
│  8. Applica correzione                              │
│  9. Ri-scansiona → verifica nodo verde              │
│ 10. Ripeti per tutti i nodi con problemi            │
└─────────────────────────────────────────────────────┘
```

---

## Project Scanner

Il **Project Scanner** è il componente backend che analizza tutti i file del progetto e ne raccoglie le diagnostiche.

### Come Funziona

1. Il backend usa `root.rglob("*")` per scansionare ricorsivamente tutti i file nella directory del progetto
2. Per ogni file trovato, verifica l'estensione e decide quale linter utilizzare
3. I linter vengono eseguiti **in parallelo** (4 thread) per massimizzare le performance
4. I risultati vengono aggregati e restituiti come risposta JSON

### Tipi di File Supportati

| Estensione | Linter utilizzato |
|------------|-------------------|
| `.py` | ruff |
| `.js` | eslint |
| `.ts` | eslint |
| `.jsx` | eslint |
| `.tsx` | eslint |
| `.css` | stylelint |
| `.html` | (analisi strutturale) |

### Directory Ignorate

Il scanner salta automaticamente le seguenti directory:

- `__pycache__` — Cache di Python
- `node_modules` — Dipendenze Node.js
- `.git` — Repository Git
- `venv` / `.venv` — Ambienti virtuali Python
- `dist` — Output di build
- `build` — Output di build

### File Ignorati

Vengono inoltre saltati i file minificati:
- `*.min.js` — JavaScript minificato
- `*.min.css` — CSS minificato

### Cache dei Risultati

I risultati della scansione vengono **cachati** per migliorare le performance:
- La prima scansione analizza tutti i file
- Le scansioni successive usano la cache per i file non modificati
- La cache viene invalidata quando un file viene salvato (triggherato dal file watcher)

### Endpoint API

L'endpoint per ottenere il grafo del progetto è:

```
GET /debug/canvas/graph
```

Risposta JSON di esempio:

```json
{
  "nodes": [
    {
      "id": "backend/main.py",
      "label": "main.py",
      "type": "trigger",
      "extension": ".py",
      "directory": "backend",
      "diagnostics": {
        "errors": 0,
        "warnings": 2,
        "info": 0,
        "items": [...]
      }
    }
  ],
  "edges": [
    {
      "source": "backend/main.py",
      "target": "backend/debug_store.py"
    }
  ]
}
```

### Esecuzione Parallela

Il scanner utilizza un **ThreadPoolExecutor** con 4 worker per eseguire i linter in parallelo:

```python
# Concetto semplificato
with ThreadPoolExecutor(max_workers=4) as executor:
    futures = {executor.submit(run_linter, f): f for f in files}
    for future in as_completed(futures):
        results.append(future.result())
```

Questo significa che su un progetto con 50 file, la scansione viene completata molto più rapidamente rispetto all'esecuzione sequenziale.

---

## Collegamento a un Progetto

### Metodo 1: CLI (consigliato)

```bash
cd /path/to/synapse-live-debug/backend
python main.py --project-root /path/to/your/project --open
```

Il sistema automaticamente:
1. Rileva il linguaggio (Python, JS, Rust, Go, Java...)
2. Rileva il framework (FastAPI, Express, Next.js, Django, Spring Boot...)
3. Rileva il package manager (npm, pip, cargo...)
4. Scansiona la struttura del progetto
5. Avvia il file watcher per monitorare le modifiche

### Metodo 2: Dall'interfaccia

La dashboard legge la configurazione da `localStorage`:
```javascript
localStorage.setItem('synapse_api_base', 'http://127.0.0.1:8421');
```

### Metodo 3: VS Code Extension

Vedi la sezione [Estensione VS Code](#estensione-vs-code).

---

## Estensione VS Code

L'estensione VS Code fornisce integrazione nativa con cattura automatica dei prompt.

### Installazione

#### Passo 1 — Compilazione

```bash
cd vscode-extension
npm install
npm run compile
```

Questo produce la cartella `out/` con il codice compilato.

#### Passo 2 — Registrazione in VS Code (junction link)

VS Code carica le estensioni dalla cartella `~/.vscode/extensions/`.
Per rendere l'estensione disponibile **senza pacchettizzare un `.vsix`**, crea un
collegamento simbolico (junction su Windows):

**Windows (PowerShell come Amministratore):**
```powershell
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.vscode\extensions\synapse-live-debug-0.1.0" `
  -Target "C:\percorso\completo\Synapse Live Debug\vscode-extension"
```

**Linux / macOS:**
```bash
ln -s "/percorso/completo/Synapse Live Debug/vscode-extension" \
      "$HOME/.vscode/extensions/synapse-live-debug-0.1.0"
```

> **Importante:** il nome della cartella (`synapse-live-debug-0.1.0`) deve corrispondere
> al campo `name` + `version` del `package.json` dell'estensione.

#### Passo 3 — Riavvia VS Code

Chiudi e riapri VS Code (oppure `Developer: Reload Window` da Command Palette).
Nell'Output Panel, canale **Synapse Live Debug**, vedrai:

```
Synapse Live Debug extension activated.
[Mirror] Network interception active (fetch + https + dc + tls)
Synapse Chat Participant registered (isSticky=true — auto-intercepts all prompts).
@synapse chat opened automatically — all prompts will be traced.
```

#### Passo 4 — Verifica

1. Apri il pannello **Chat** di VS Code (Ctrl+Shift+I oppure icona chat nella sidebar).
2. Dovresti vedere `@synapse` già selezionato (il partecipante si attiva automaticamente).
3. Scrivi qualsiasi messaggio, ad esempio `ciao test`.
4. Il prompt viene:
   - Inviato alla dashboard via `/v1/chat-forward` (visibile nel tab **Agent Intelligence**)
   - Processato dal modello AI di Copilot (la risposta appare nella chat)
5. Nella dashboard, il tab **Agent Intelligence** mostra il flusso completo a 9 stadi.

### Come funziona: @synapse Chat Participant

L'estensione registra un **Chat Participant** chiamato `@synapse` con la proprietà
`isSticky = true`. Questo significa che:

- **Auto-attivazione** — 3 secondi dopo l'avvio, l'estensione apre automaticamente
  la chat con `@synapse` pre-selezionato.
- **Sticky** — Una volta attivo, `@synapse` rimane il partecipante selezionato.
  Tutti i messaggi successivi passano attraverso di lui senza bisogno di digitare `@synapse`.
- **Trasparente** — Il partecipante inoltra il prompt alla dashboard e poi chiede al
  modello AI di Copilot di generare la risposta. L'utente riceve la risposta normalmente,
  come se stesse parlando direttamente con Copilot.
- **Pipeline trace** — Ogni prompt attraversa i 9 stadi della pipeline (User Proxy →
  Context Gathering → Rules → MCP → Prompt Assembly → Model Routing → LLM API →
  Tool Execution → Response Streaming) e viene visualizzato in real-time nella dashboard.

> **Nota tecnica:** I prompt di Copilot Chat vengono inviati dal processo renderer di
> VS Code (core Electron), non dall'Extension Host. Per questo motivo l'intercettazione
> a livello di rete (monkey-patching fetch/https) non può catturare quei prompt.
> Il Chat Participant è l'unico meccanismo supportato per intercettarli.

### Funzionalità dell'estensione

1. **Chat Participant @synapse** — Cattura automatica di tutti i prompt
2. **Forwarding eventi** — L'estensione cattura automaticamente:
   - Salvataggio file → `file-write`
   - Apertura file → `file-read`
   - Cambio editor attivo → `user-input`
   - Apertura terminale → `terminal-exec`
   - Errori diagnostici → `error`
   - Sessioni di debug → `agent-status`
   - Task (build, test) → `terminal-exec`
3. **Sidebar** — Pannelli nella barra laterale:
   - Dashboard Status (stato, versione, progetto rilevato)
   - Services (tutti gli endpoint API)
   - Recent Events (ultimi 20 eventi)
4. **Webview Panel** — Dashboard integrata dentro VS Code
5. **Status Bar** — Indicatore nella barra inferiore

### Comandi

| Comando | Descrizione |
|---------|-------------|
| `Synapse: Start Live Debug Dashboard` | Avvia il backend |
| `Synapse: Stop Live Debug Dashboard` | Ferma il backend |
| `Synapse: Open Dashboard in Browser` | Apri nel browser |
| `Synapse: Open Dashboard Panel` | Apri come tab in VS Code |
| `Synapse: Set Project Root` | Cambia la root del progetto |

### Impostazioni

| Chiave | Default | Descrizione |
|--------|---------|-------------|
| `synapseLiveDebug.port` | 8421 | Porta del server |
| `synapseLiveDebug.autoStart` | false | Auto-avvio all'apertura workspace |
| `synapseLiveDebug.openBrowser` | true | Apri browser all'avvio |
| `synapseLiveDebug.enableFileWatcher` | true | Abilita monitoraggio file |
| `synapseLiveDebug.pythonPath` | python | Path dell'interprete Python |
| `synapseLiveDebug.backendPath` | (bundled) | Path del backend |
| `synapseLiveDebug.filterLintNoise` | false | Filtra i diagnostici CSS/HTML lint (Safari compat, viewport, ecc.) |

---

## File Watcher

Il file watcher monitora le modifiche ai file del progetto in tempo reale.

### Come funziona
- Usa la libreria `watchdog` per monitorare il filesystem
- Ignora automaticamente: `node_modules`, `.git`, `__pycache__`, `venv`, `dist`, `build`
- Ignora file binari (`.pyc`, `.exe`, `.dll`, immagini, font)
- Debounce di 0.5s per evitare eventi duplicati
- Gli eventi vengono emessi come `file-write` nel bus SSE

### Controllo via API

```bash
# Stato del watcher
curl http://localhost:8421/v1/watcher/status

# Ferma il watcher
curl -X POST http://localhost:8421/v1/watcher/stop

# Riavvia il watcher
curl -X POST http://localhost:8421/v1/watcher/start
```

---

## Invio Eventi Personalizzati

Puoi inviare eventi da qualsiasi sistema tramite l'API REST:

### Singolo evento

```bash
curl -X POST http://localhost:8421/debug/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "custom-event",
    "component": "my-service",
    "data": {
      "message": "Qualcosa è successo",
      "details": { "key": "value" }
    }
  }'
```

### Batch di eventi

```bash
curl -X POST http://localhost:8421/debug/events/batch \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      { "type": "step-1", "component": "pipeline", "data": {} },
      { "type": "step-2", "component": "pipeline", "data": {} }
    ]
  }'
```

### Da Python

```python
import requests

def emit_event(event_type: str, component: str, data: dict):
    requests.post("http://localhost:8421/debug/events", json={
        "type": event_type,
        "component": component,
        "data": data,
    })

# Esempio
emit_event("llm-call", "my-agent", {"model": "gpt-4", "prompt_tokens": 1500})
```

### Da JavaScript/TypeScript

```typescript
async function emitEvent(type: string, component: string, data: Record<string, any>) {
    await fetch('http://localhost:8421/debug/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, component, data }),
    });
}

// Esempio
emitEvent('tool-execute', 'code-analyzer', { file: 'main.py', action: 'lint' });
```

### Ascolto real-time via SSE

```javascript
const evtSource = new EventSource('http://localhost:8421/debug/events/stream');
evtSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Event:', data.type, data);
};
```

### Ascolto real-time via WebSocket

```javascript
const ws = new WebSocket('ws://localhost:8421/debug/ws');
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Event:', data.type, data);
};

// Puoi anche INVIARE eventi via WebSocket
ws.send(JSON.stringify({
    type: 'my-event',
    component: 'ws-client',
    data: { hello: 'world' }
}));
```

---

## Integrazione con Altri IDE

### Architettura dell'adapter

Ogni IDE ha bisogno di un **adapter leggero** che:

1. **Rileva il workspace** → passa `--project-root` al backend
2. **Avvia il backend** → `python main.py --project-root <path> --port <port>`
3. **Forwarda eventi** → `POST /debug/events` per ogni azione dell'IDE
4. **Mostra la dashboard** → tramite webview o browser esterno

### JetBrains (IntelliJ, PyCharm, WebStorm)

Crea un plugin che:
```kotlin
// Plugin.kt
class SynapseLiveDebugPlugin : StartupActivity {
    override fun runActivity(project: Project) {
        val root = project.basePath ?: return
        // Avvia python main.py --project-root $root
        // Ascolta PSI events per forwarding
    }
}
```

### Neovim

```lua
-- init.lua
local function start_synapse()
    local root = vim.fn.getcwd()
    vim.fn.jobstart({
        "python", "main.py",
        "--project-root", root,
        "--port", "8421"
    }, { cwd = "/path/to/synapse-live-debug/backend" })
end

-- Auto-forward su BufWritePost
vim.api.nvim_create_autocmd("BufWritePost", {
    callback = function()
        local file = vim.fn.expand("%:p")
        -- POST to http://localhost:8421/debug/events
        vim.fn.jobstart({
            "curl", "-s", "-X", "POST",
            "http://localhost:8421/debug/events",
            "-H", "Content-Type: application/json",
            "-d", vim.fn.json_encode({
                type = "file-write",
                component = "neovim",
                data = { path = file, action = "saved" }
            })
        })
    end
})
```

### Sublime Text

```python
# synapse_live_debug.py (Sublime plugin)
import sublime
import sublime_plugin
import urllib.request
import json

class SynapseOnSave(sublime_plugin.EventListener):
    def on_post_save_async(self, view):
        event = {
            "type": "file-write",
            "component": "sublime-text",
            "data": {
                "path": view.file_name(),
                "action": "saved",
            }
        }
        req = urllib.request.Request(
            "http://localhost:8421/debug/events",
            data=json.dumps(event).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(req, timeout=2)
        except Exception:
            pass
```

### Generic HTTP Integration

Qualsiasi sistema che può fare HTTP POST può integrarsi:

```bash
# Dalla tua CI/CD pipeline
curl -X POST http://your-server:8421/debug/events \
  -H "Content-Type: application/json" \
  -d '{"type":"pipeline-start","component":"github-actions","data":{"ref":"main"}}'
```

---

## Configurazione Avanzata

### Cambiare la porta

```bash
# Via CLI
python main.py --port 9000

# Via variabile d'ambiente
export SYNAPSE_DEBUG_PORT=9000
python main.py
```

### Esporre su rete locale

```bash
python main.py --host 0.0.0.0 --port 8421
# Accessibile da http://<tuo-ip>:8421
```

### Disabilitare funzionalità

```bash
# Solo dashboard, senza watcher
python main.py --no-watch

# Senza auto-reload (produzione)
python main.py --no-reload --no-watch
```

### Personalizzare la dashboard

La dashboard frontend è in `frontend/`. I file CSS principali:

| File | Cosa controlla |
|------|----------------|
| `css/base.css` | Token di design, font, colori, tipografia |
| `css/layout.css` | Sidebar, header, layout responsive |
| `css/components.css` | Card, bottoni, badge, modal |
| `css/tabs.css` | Stili specifici per ogni pannello tab |

Per cambiare i colori, modifica le variabili CSS in `base.css`:
```css
:root {
  --accent-blue: #1456F0;     /* Colore primario */
  --text-primary: #181E25;    /* Testo principale */
  --bg-page: #ffffff;         /* Sfondo pagina */
  --border-primary: #F2F3F5;  /* Bordi */
}
```

---

## Troubleshooting

### Il backend non si avvia

```bash
# Verifica Python
python --version  # Richiede 3.10+

# Reinstalla le dipendenze
pip install -r requirements.txt --force-reinstall

# Verifica che la porta sia libera
netstat -an | findstr "8421"
```

### Il file watcher non funziona

```bash
# Verifica che watchdog sia installato
pip install watchdog

# Controlla lo stato via API
curl http://localhost:8421/v1/watcher/status
```

### I test dei servizi falliscono tutti

Verifica che `CONFIG.API_BASE` in `frontend/js/config.js` punti al backend corretto:
```javascript
// Deve essere la porta del backend Synapse
API_BASE: 'http://127.0.0.1:8421'
```

### La dashboard non si aggiorna

1. Svuota la cache del browser (Ctrl+Shift+R)
2. Verifica la connessione SSE in Console → Network → EventSource
3. Controlla che il backend sia vivo: `curl http://localhost:8421/health`

---

## Prossimi Sviluppi

- [ ] Plugin JetBrains (IntelliJ, PyCharm, WebStorm)
- [ ] Plugin Neovim (Lua)
- [ ] Plugin Sublime Text
- [ ] Docker image
- [ ] Persistenza eventi su SQLite
- [ ] Export eventi in JSON/CSV
- [ ] Dashboard temi (dark mode)
- [ ] Autenticazione per accesso remoto
- [ ] Webhook in uscita (Slack, Discord, Teams)
- [ ] Plugin sistema per framework custom
