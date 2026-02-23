/**
 * Live Debug -- Tab 3: Canvas SSE
 * Architecture Live Graph + Real-Time Event Flow
 *
 * Two views:
 *   1) Architecture Graph -- project files as nodes, imports as edges,
 *      files light up on file-watcher events.
 *   2) Event Flow -- every debug event streams in as a transient node
 *      grouped by source/type.
 *
 * Data sources:
 *   - GET /debug/canvas/graph  -> initial dependency graph (nodes + edges)
 *   - SSE /debug/canvas/stream -> live events (file_change, node_activity, node_error, node_warning)
 */
(function () {
  'use strict';

  // -- State ------------------------------------------------------------------
  let canvasEventSource = null;
  let currentView = 'graph'; // 'graph' | 'flow'
  let graphData = { nodes: [], edges: [] };
  const activityNodes = new Map();   // nodeId -> { ...node, pulseUntil, hits }
  const flowEvents = [];             // recent flow events (max 200)
  const svgEl = null; // eslint-disable-line no-unused-vars
  const simulation = null; // eslint-disable-line no-unused-vars -- force-layout state
  const animFrame = null; // eslint-disable-line no-unused-vars
  let autoConnected = false;
  let _selectedNodeId = null;        // currently inspected node

  // -- Zoom / Pan state -------------------------------------------------------
  let _zoomScale = 1;
  let _panX = 0;
  let _panY = 0;
  let _isPanning = false;
  let _panStartX = 0;
  let _panStartY = 0;

  // -- Color palette per group (saturated, visible on light bg) ----------------
  const GROUP_COLORS = {
    backend:  '#1456F0',
    frontend: '#00B42A',
    root:     '#FF7D00',
    tests:    '#7C3AED',
    docs:     '#607D8B',
    config:   '#FF7D00',
    'vscode-extension': '#3178c6',
    '__audit__': '#E040FB',
  };
  function groupColor(g) {
    return GROUP_COLORS[g] || GROUP_COLORS[(g || '').toLowerCase()] || '#607D8B';
  }

  // -- n8n-style Card System (inspected from n8n-io/n8n source) ─────────────
  //  n8n uses three distinct node render types:
  //    1) Trigger nodes — entry points, distinctive rounded-left shape
  //    2) Default nodes — standard rectangular cards with icon + label
  //    3) Config nodes  — smaller circular/compact nodes for settings
  //  Each node has an icon strip colored by integration type.
  //  Layout uses dagre (left-to-right directed graph), NOT radial/orbital.

  const CARD_R   = 8;     // border radius
  const PORT_R   = 5;     // eslint-disable-line no-unused-vars -- connection port radius
  const ICON_SIZE = 40;   // n8n icon circle diameter
  const CONFIG_RADIUS = 40; // config node circle radius

  // ── Per-node-type dimensions (EDIFICIO spec exact sizes) ──
  const NODE_TYPES = {
    trigger:      { w: 96,  h: 96, iconW: 96, label: 'Trigger'       },   // entry-point: capsule-left 96×96
    default_:     { w: 96,  h: 96, iconW: 96, label: 'Default'       },   // standard: square 96×96
    config:       { w: 80,  h: 80, iconW: 80, label: 'Config'        },   // config: circle r=40 (80×80)
    configurable: { w: 256, h: 96, iconW: 96, label: 'Configurable'  },   // hub: wide rectangle 256×96
  };

  /** Determine node render type based on EDIFICIO spec (extension + topology) */
  function _nodeRenderType(n, inDegree, outDegree) {
    // Config files: circular node (config type) — .css, .json, .toml, .yml, .yaml, .cfg, .ini, .env
    const cfgExts = ['.css', '.scss', '.less', '.json', '.toml', '.yml', '.yaml', '.cfg', '.ini', '.env'];
    if (cfgExts.includes(n.extension)) return 'config';
    // Hub nodes (many connections ≥8) → configurable wide rectangle 256×96
    const totalDegree = (inDegree[n.id] || 0) + (outDegree ? (outDegree[n.id] || 0) : 0);
    if (totalDegree >= 8) return 'configurable';
    // Entry-point files (no incoming edges) → trigger-style capsule
    if ((inDegree[n.id] || 0) === 0) return 'trigger';
    return 'default_';
  }

  // Extension → badge color (language-specific, CANVAS_GRAPH_SPEC.md exact)
  const EXT_COLORS = {
    '.py': '#3572A5', '.pyw': '#3572A5',                              // Python Blue
    '.js': '#D4A017', '.jsx': '#D4A017', '.mjs': '#D4A017', '.cjs': '#D4A017',  // JavaScript Gold (darker)
    '.ts': '#3178C6', '.tsx': '#3178C6', '.mts': '#3178C6',           // TypeScript Blue
    '.css': '#663399', '.scss': '#CF649A', '.less': '#1D365D',        // CSS Purple
    '.html': '#E34C26', '.htm': '#E34C26', '.svelte': '#FF3E00', '.vue': '#42B883',  // HTML Orange
    '.md': '#083FA1',                                                  // Markdown Blue
    '.json': '#444444', '.toml': '#9C4121', '.yml': '#CB171E',        // JSON Dark (was too dark)
    '.yaml': '#CB171E', '.cfg': '#607D8B', '.ini': '#607D8B', '.txt': '#607D8B',
    '.bat': '#4E9A06', '.sh': '#4E9A06', '.ps1': '#012456', '.cmd': '#4E9A06',  // Shell Green (darker)
  };

  /** Return a pure SVG TEXT label for a file extension (visible inside icon circle) */
  function _cardIcon(ext) {
    // Text labels centered at 0,0 — white text on colored background (from the circle fill)
    const fontSize = 10;
    const fontWeight = 700;
    let label = '';
    switch (ext) {
      case '.py': case '.pyw': label = 'PY'; break;
      case '.js': case '.jsx': case '.mjs': case '.cjs': label = 'JS'; break;
      case '.ts': case '.tsx': case '.mts': label = 'TS'; break;
      case '.css': case '.scss': case '.less': label = '#'; break;
      case '.html': case '.htm': label = '⟨/⟩'; break;
      case '.svelte': label = 'SV'; break;
      case '.vue': label = 'VU'; break;
      case '.md': label = 'MD'; break;
      case '.json': label = '{ }'; break;
      case '.toml': label = 'TM'; break;
      case '.yml': case '.yaml': label = 'YM'; break;
      case '.cfg': case '.ini': label = 'CF'; break;
      case '.bat': case '.cmd': label = 'BAT'; break;
      case '.sh': label = 'SH'; break;
      case '.ps1': label = 'PS'; break;
      case '.txt': label = 'TXT'; break;
      default: label = '•'; break;
    }
    return `<text x="0" y="4" text-anchor="middle" fill="white" font-size="${fontSize}" font-weight="${fontWeight}" font-family="var(--font-mono)" style="text-shadow: 0 1px 2px rgba(0,0,0,0.3);">${label}</text>`;
  }

  /** Short label for legend */
  function _cardGlyph(ext) {
    switch (ext) {
      case '.py': case '.pyw': return 'PY';
      case '.js': case '.jsx': case '.mjs': case '.cjs': return 'JS';
      case '.ts': case '.tsx': case '.mts': return 'TS';
      case '.css': case '.scss': case '.less': return '#';
      case '.html': case '.htm': case '.svelte': case '.vue': return '⟨/⟩';
      case '.md': return 'MD';
      case '.json': return '{}';
      case '.toml': case '.yml': case '.yaml': case '.cfg': case '.ini': return 'CFG';
      case '.bat': case '.sh': case '.ps1': case '.cmd': return '$_';
      case '.txt': return 'Tx';
      default: return '•';
    }
  }

  // -- Group display order for DAG columns ───────────────────────────────────
  const GROUP_PRIORITY = { // eslint-disable-line no-unused-vars
    'root': 0, 'backend': 1, 'frontend': 2,
    'vscode-extension': 3, 'docs': 4, 'tests': 5, 'config': 6,
  };

  // ── n8n constants (from useCanvasLayout.ts + getEdgeRenderData.ts) ──
  const GRID = 16;
  const NODE_X_SPACING = GRID * 8;   // eslint-disable-line no-unused-vars -- 128 ranksep
  const NODE_Y_SPACING = GRID * 6;   // eslint-disable-line no-unused-vars -- 96 nodesep
  // eslint-disable-next-line no-unused-vars -- reserved for backward edge routing
  const EDGE_PAD_BOTTOM = 130;       // backward edge padding below
  // eslint-disable-next-line no-unused-vars -- reserved for backward edge routing
  const EDGE_PAD_X = 40;             // backward edge horizontal padding
  // eslint-disable-next-line no-unused-vars -- reserved for backward edge routing
  const EDGE_BORDER_R = 16;          // backward edge corner radius

  // ── Swimlane group definitions (infrastructure layers) ──
  const SWIMLANE_GROUPS = [
    { id: 'root',              label: 'ROOT / CONFIG',     color: '#FF7D00', bg: 'rgba(255,125,0,0.03)',   border: 'rgba(255,125,0,0.10)' },
    { id: 'config',            label: 'CONFIG',            color: '#FF7D00', bg: 'rgba(255,125,0,0.03)',   border: 'rgba(255,125,0,0.10)' },
    { id: 'vscode-extension',  label: 'VSCODE EXTENSION',  color: '#3178C6', bg: 'rgba(49,120,198,0.03)',  border: 'rgba(49,120,198,0.10)' },
    { id: 'frontend',          label: 'FRONTEND',          color: '#00B42A', bg: 'rgba(0,180,42,0.03)',    border: 'rgba(0,180,42,0.10)' },
    { id: 'backend',           label: 'BACKEND',           color: '#1456F0', bg: 'rgba(20,86,240,0.03)',   border: 'rgba(20,86,240,0.10)' },
    { id: 'tests',             label: 'TESTS',             color: '#7C3AED', bg: 'rgba(124,58,237,0.03)',  border: 'rgba(124,58,237,0.10)' },
    { id: 'docs',              label: 'DOCS',              color: '#607D8B', bg: 'rgba(96,125,139,0.03)',  border: 'rgba(96,125,139,0.10)' },
    { id: '__audit__',         label: 'DEPENDENCIES',      color: '#E040FB', bg: 'rgba(224,64,251,0.03)',  border: 'rgba(224,64,251,0.10)' },
  ];
  const SWIMLANE_INFO = {};
  SWIMLANE_GROUPS.forEach(g => { SWIMLANE_INFO[g.id] = g; });

  // -- Public tab API ---------------------------------------------------------
  let _auditData = null;             // cached audit results

  const tab = SynapseApp.tabs.canvas = {
    connect: connectCanvasSSE,
    clear: clearCanvas,
    setView,
    loadGraph,
    sendTestEvent,
    inspectNode,
    closeInspector,
    runAudit,
    _zoomIn,
    _zoomOut,
    _zoomReset,
    _zoomFit,
    _scrollToPiano,
  };

  // ---- VIEW SWITCH ----------------------------------------------------------
  function setView(view) {
    currentView = view;
    document.querySelectorAll('.canvas-view-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    const graphWrap = document.getElementById('canvasGraphWrap');
    const flowWrap  = document.getElementById('canvasFlowWrap');
    if (graphWrap) graphWrap.style.display = view === 'graph' ? '' : 'none';
    if (flowWrap)  flowWrap.style.display  = view === 'flow'  ? '' : 'none';
    if (view === 'graph') renderGraph();
    if (view === 'flow')  renderFlow();
  }

  // ---- GRAPH: Load + Render -------------------------------------------------
  async function loadGraph() {
    try {
      const resp = await fetch(`${CONFIG.API_BASE  }/debug/canvas/graph`);
      if (!resp.ok) throw new Error(`HTTP ${  resp.status}`);
      graphData = await resp.json();
      initSimulation();
      renderGraph();

      // Pre-populate flow with project scan summary (only once, on first load)
      if (graphData.nodes.length && flowEvents.length === 0) {
        _populateFlowFromGraph(graphData);
      }

      // Send diagnostic summary ONCE (not on every refresh)
      if (!loadGraph._notified) {
        loadGraph._notified = true;
        _notifyDiagnostics(graphData);
      }
    } catch (err) {
      const wrap = document.getElementById('canvasGraphWrap');
      if (wrap) wrap.innerHTML = `<div class="empty-state"><div class="empty-state-text">Graph load failed: ${  err.message  }</div></div>`;
    }
  }

  /**
   * Send diagnostic alerts to Notification Center based on graph scan results.
   * Groups files by severity and sends concise summary alerts.
   */
  function _notifyDiagnostics(graph) {
    if (!graph.nodes || !graph.nodes.length) return;
    if (typeof Notifications === 'undefined') return;

    // Exclude vendor/minified libraries from diagnostic counts
    const isVendor = (n) => /(\.min\.js|[\/\\]lib[\/\\]|[\/\\]vendor[\/\\]|node_modules)/i.test(n.id || '');

    const errorFiles = [];
    const warningFiles = [];
    graph.nodes.forEach((n) => {
      if (isVendor(n)) return;  // skip vendor files
      if ((n.errorCount || 0) > 0) errorFiles.push({ name: n.label, count: n.errorCount });
      if ((n.warningCount || 0) > 0) warningFiles.push({ name: n.label, count: n.warningCount });
    });

    if (errorFiles.length > 0) {
      const totalErrors = errorFiles.reduce((s, f) => { return s + f.count; }, 0);
      let names = errorFiles.slice(0, 3).map((f) => { return `${f.name  }(${  f.count  })`; }).join(', ');
      if (errorFiles.length > 3) names += ` +${  errorFiles.length - 3  } more`;
      Notifications.addAlert('error', `Canvas Scan: ${  totalErrors  } errors in ${  errorFiles.length  } files -- ${  names}`, 'Architecture');
      Notifications.playBeep('critical');
      Notifications.sendDesktop('Code Errors Detected', `${totalErrors  } errors in ${  errorFiles.length  } files`);
    }

    if (warningFiles.length > 0) {
      const totalWarnings = warningFiles.reduce((s, f) => { return s + f.count; }, 0);
      let names2 = warningFiles.slice(0, 3).map((f) => { return `${f.name  }(${  f.count  })`; }).join(', ');
      if (warningFiles.length > 3) names2 += ` +${  warningFiles.length - 3  } more`;
      Notifications.addAlert('warning', `Canvas Scan: ${  totalWarnings  } warnings in ${  warningFiles.length  } files -- ${  names2}`, 'Architecture');
    }
  }

  /**
   * Generate initial flow events from the project graph so Flow is never empty.
   * Creates one "scan" event per group showing file count.
   */
  function _populateFlowFromGraph(graph) {
    const groups = {};
    graph.nodes.forEach((n) => {
      if (!groups[n.group]) groups[n.group] = [];
      groups[n.group].push(n.label);
    });

    // Add a summary event for each group
    const now = Date.now();
    let idx = 0;
    Object.keys(groups).forEach((g) => {
      const files = groups[g];
      flowEvents.push({
        eventType: 'node_activity',
        nodeId: `${g  }/`,
        label: `${g  }/ (${  files.length  } files)`,
        category: 'initial-scan',
        meta: { type: 'project-scan', files: files.slice(0, 5).join(', ') + (files.length > 5 ? '...' : '') },
        _ts: now - (idx * 10), // slight offset so they sort correctly
      });
      idx++;
    });

    // Add a total summary at the top
    flowEvents.unshift({
      eventType: 'node_activity',
      nodeId: 'project-root',
      label: 'Project Scan Complete',
      category: 'system',
      meta: { type: 'scan-complete', message: `${graph.nodes.length  } files, ${  graph.edges.length  } dependencies` },
      _ts: now + 1,
    });

    if (currentView === 'flow') renderFlow();
    updateCounters();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ═══ EDIFICIO Layout — Architectural building metaphor ═══════════════════
  // ══════════════════════════════════════════════════════════════════════════
  // Nodes are placed on "floors" (piani) based on their architectural role:
  //   Piano 5 (TETTO):      Entry points - index.html, main.py, extension.ts
  //   Piano 4 (FACCIATA):   UI/Views - app.js, panel.ts  
  //   Piano 3 (STANZE):     Tabs/Modules - tabs/*.js, backend modules
  //   Piano 2 (IMPIANTI):   Utilities - sse-manager, event-bus, ide-adapter
  //   Piano 1 (FONDAMENTA): Config/CSS - *.css, config.js
  //   Piano 0 (GARAGE):     Isolates - nodes with no connections
  // Config nodes (*.json, *.md, package.json) go below their target.
  // ══════════════════════════════════════════════════════════════════════════

  function initSimulation() {
    const nodes = graphData.nodes;
    const edges = graphData.edges;
    if (!nodes.length) return;

    // ── In-degree / Out-degree ──
    const inDeg = {}, outDeg = {};
    nodes.forEach(n => { inDeg[n.id] = 0; outDeg[n.id] = 0; });
    edges.forEach(e => { 
      inDeg[e.target] = (inDeg[e.target] || 0) + 1;
      outDeg[e.source] = (outDeg[e.source] || 0) + 1;
    });

    nodes.forEach(n => {
      n._inDegree = inDeg[n.id] || 0;
      n._outDegree = outDeg[n.id] || 0;
      n._renderType = _nodeRenderType(n, inDeg, outDeg);
      const nt = NODE_TYPES[n._renderType];
      n._w = nt.w; n._h = nt.h; n._iconW = nt.iconW;
    });

    // ── Config vs main edges ──
    const configEdgeMap = [];
    const mainEdges = [];
    edges.forEach(e => {
      const sn = nodes.find(nd => nd.id === e.source);
      if (sn && sn._renderType === 'config') { configEdgeMap.push(e); e._isConfig = true; }
      else { mainEdges.push(e); e._isConfig = false; }
    });

    const regularNodes = nodes.filter(n => n._renderType !== 'config');
    const cfgNodes = nodes.filter(n => n._renderType === 'config');
    const nodeById = {};
    nodes.forEach(n => { nodeById[n.id] = n; });

    // ── Adjacency ──
    const outAdj = {}, inAdj = {};
    regularNodes.forEach(n => { outAdj[n.id] = []; inAdj[n.id] = []; });
    mainEdges.forEach(e => {
      if (outAdj[e.source]) outAdj[e.source].push(e.target);
      if (inAdj[e.target]) inAdj[e.target].push(e.source);
    });

    // ══════════════════════════════════════════════════════════════════════════
    // ═══ EDIFICIO Layout — Assegna nodi a "piani" architetturali ═══════════════
    // ══════════════════════════════════════════════════════════════════════════

    // Piano classificator based on CANVAS_GRAPH_SPEC.md rules
    const PIANO_RULES = [
      // Piano 5: ENTRY POINTS - main.py, extension.ts, start.bat, start.sh, index.html (hub)
      { piano: 5, label: 'ENTRY POINTS', test: (n) => /^(main\.py|extension\.ts|start\.bat|start\.sh|index\.html)$/i.test(n.label) },
      // Piano 4: ORCHESTRATORI - app.js, panel.ts, tree-views.ts
      { piano: 4, label: 'ORCHESTRATORI', test: (n) => /^(app\.js|panel\.ts|tree-views\.ts)$/i.test(n.label) },
      // Piano 3: TABS/MODULI - frontend/js/tabs/*.js, backend/*.py (escluso main.py)
      { piano: 3, label: 'TABS/MODULI', test: (n) => /tabs[\/\\]/i.test(n.id) || (/backend[\/\\]/i.test(n.id) && !/main\.py$/i.test(n.label)) },
      // Piano 2: UTILITIES - sse-manager.js, event-bus.js, ide-adapter.js, notifications.js
      { piano: 2, label: 'UTILITIES', test: (n) => /^(sse-manager\.js|event-bus\.js|ide-adapter\.js|notifications\.js)$/i.test(n.label) },
      // Piano 1: CONFIG - *.css, *.json, config.js (handled by node type = config)
      { piano: 1, label: 'CONFIG', test: (n) => n._renderType === 'config' || /^config\.js$/i.test(n.label) },
      // Piano 0: ISOLATI - nodi senza connessioni
    ];

    // Classify each regular node into a piano
    const getPiano = (n) => {
      // If no connections at all → ISOLATI (piano 0)
      const hasConnections = edges.some(e => e.source === n.id || e.target === n.id);
      if (!hasConnections) return { piano: 0, label: 'ISOLATI' };
      
      for (const rule of PIANO_RULES) {
        if (rule.test(n)) return { piano: rule.piano, label: rule.label };
      }
      // Default: piano 3 (TABS/MODULI) for connected nodes
      return { piano: 3, label: 'TABS/MODULI' };
    };

    // Assign piano to each regular node
    regularNodes.forEach(n => {
      const { piano, label } = getPiano(n);
      n._piano = piano;
      n._pianoLabel = label;
      n._depth = 5 - piano; // Inverted for Y positioning (tetto at top)
    });

    // Assign piano to config nodes (piano 1)
    cfgNodes.forEach(n => {
      n._piano = 1;
      n._pianoLabel = 'CONFIG';
      n._depth = 4;
    });

    // ══════════════════════════════════════════════════════════════════════════
    // ═══ EDIFICIO Layout — Calcolo posizioni con BANDE PIANI ═══════════════════
    // ══════════════════════════════════════════════════════════════════════════

    const PAD = 120;                 // margine esterno
    const PIANO_HEADER = 56;         // altezza header piano (label)
    const NODE_H = 96;               // altezza nodo standard
    // eslint-disable-next-line no-unused-vars -- reserved for layout calculations
    const NODE_W = 96;               // larghezza nodo standard  
    // eslint-disable-next-line no-unused-vars -- reserved for layout calculations
    const LABEL_H = 48;              // spazio per label sotto nodo (2 righe)
    const NODE_SPACING_X = 240;      // spaziatura orizzontale tra nodi (più spazio)
    const NODE_SPACING_Y = 260;      // spaziatura verticale tra righe (nodo 96 + label 48 + gap 116)
    const PIANO_PADDING = 48;        // padding interno piano
    const PIANO_GAP = 64;            // gap tra piani
    const MAX_PER_ROW = 5;           // max nodi per riga (meno nodi, più spazio)

    // Group nodes by piano
    const pianoGroups = {};
    const allNodes = [...regularNodes, ...cfgNodes];
    allNodes.forEach(n => {
      const p = n._piano;
      if (!pianoGroups[p]) pianoGroups[p] = [];
      pianoGroups[p].push(n);
    });

    // Sort nodes within each piano by group then by name
    Object.values(pianoGroups).forEach(arr => {
      arr.sort((a, b) => {
        if (a.group !== b.group) return (a.group || '').localeCompare(b.group || '');
        return (a.label || '').localeCompare(b.label || '');
      });
    });

    // Calculate each piano's height based on node count
    const pianoInfo = {};
    const piani = [5, 4, 3, 2, 1, 0];
    const PIANO_LABELS = {
      5: 'PIANO 5 — ENTRY POINTS',
      4: 'PIANO 4 — ORCHESTRATORI',
      3: 'PIANO 3 — TABS/MODULI',
      2: 'PIANO 2 — UTILITIES',
      1: 'PIANO 1 — CONFIG',
      0: 'PIANO 0 — ISOLATI'
    };

    let currentY = PAD;
    piani.forEach(p => {
      const arr = pianoGroups[p] || [];
      const rowCount = Math.ceil(arr.length / MAX_PER_ROW) || 1;
      const pianoHeight = PIANO_HEADER + PIANO_PADDING * 2 + rowCount * NODE_SPACING_Y;
      
      pianoInfo[p] = {
        y: currentY,
        height: pianoHeight,
        label: PIANO_LABELS[p],
        nodes: arr,
        rowCount
      };
      
      currentY += pianoHeight + PIANO_GAP;
    });

    // Store piano bands for rendering
    graphData._pianoBands = piani.map(p => {
      const info = pianoInfo[p];
      return {
        piano: p,
        label: info.label,
        y: info.y,
        height: info.height,
        nodeCount: info.nodes.length
      };
    });

    // Calculate max width needed
    const maxNodesInRow = Math.max(...piani.map(p => Math.min((pianoGroups[p] || []).length, MAX_PER_ROW)));
    const contentWidth = PAD * 2 + maxNodesInRow * NODE_SPACING_X;

    // Place nodes within each piano
    piani.forEach(p => {
      const info = pianoInfo[p];
      const arr = info.nodes;
      if (arr.length === 0) return;

      // Split into rows
      const rows = [];
      for (let i = 0; i < arr.length; i += MAX_PER_ROW) {
        rows.push(arr.slice(i, i + MAX_PER_ROW));
      }

      rows.forEach((row, rowIdx) => {
        // Center row horizontally
        const rowWidth = row.length * NODE_SPACING_X;
        const startX = PAD + (contentWidth - PAD * 2 - rowWidth) / 2 + NODE_SPACING_X / 2;
        const rowY = info.y + PIANO_HEADER + PIANO_PADDING + rowIdx * NODE_SPACING_Y + NODE_H / 2;

        row.forEach((n, nodeIdx) => {
          n._x = startX + nodeIdx * NODE_SPACING_X;
          n._y = rowY;
        });
      });
    });

    // ── Grid-snap ──
    nodes.forEach(n => {
      if (n._x !== undefined) {
        n._x = Math.round(n._x / 16) * 16;
        n._y = Math.round(n._y / 16) * 16;
      }
    });

    graphData._configEdges = configEdgeMap;
    nodes.forEach(n => {
      const s = Math.max(n.size || 100, 100);
      n._r = Math.max(8, Math.min(22, 4 + Math.log(s) * 1.5));
    });
  }

  function renderGraph() {
    const wrap = document.getElementById('canvasGraphWrap');
    if (!wrap) return;
    if (!graphData.nodes.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-state-text">No project files found</div><div class="empty-state-hint">Ensure PROJECT_ROOT is set correctly</div></div>';
      return;
    }

    const nodes = graphData.nodes;
    const edges = graphData.edges;
    const idx   = {};
    nodes.forEach((n, i) => { idx[n.id] = i; });
    const now = Date.now();

    // ── Compute dynamic viewBox from piano bands + node positions ──
    let vbMinX = 0, vbMinY = 0, vbMaxX = 1600, vbMaxY = 1200;
    
    // Include piano bands in viewBox calculation
    if (graphData._pianoBands && graphData._pianoBands.length) {
      vbMinY = Math.min(...graphData._pianoBands.map(b => b.y)) - 20;
      vbMaxY = Math.max(...graphData._pianoBands.map(b => b.y + b.height)) + 60;
    }
    
    // Include nodes in viewBox calculation
    nodes.forEach((n) => {
      if (n._x === undefined) return;
      vbMinX = Math.min(vbMinX, n._x - (n._w || 96) / 2 - 80);
      vbMaxX = Math.max(vbMaxX, n._x + (n._w || 96) / 2 + 80);
    });
    
    const W = Math.max(vbMaxX - vbMinX, 1400);
    const H = Math.max(vbMaxY - vbMinY, 800);
    
    // SVG dimensioni esplicite per permettere scroll nel container
    const svgWidth = Math.max(W, 1200);
    const svgHeight = H;

    let svg = `<svg id="synapse-graph-svg" xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="${vbMinX} ${vbMinY} ${W} ${H}" style="display:block;border-radius:8px;cursor:default;">`;
    svg += `<g id="synapse-graph-layer" style="transition:transform 0.08s ease-out;" transform="translate(${_panX},${_panY}) scale(${_zoomScale})">`;        

    // ── Defs: shadows, clip paths per node type, dot grid, arrow markers ──
    svg += '<defs>';
    svg += '<filter id="card-shadow" x="-20%" y="-20%" width="150%" height="170%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.08)" flood-opacity="1"/></filter>';
    svg += '<filter id="card-shadow-error" x="-20%" y="-20%" width="150%" height="170%"><feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="rgba(245,63,63,0.25)" flood-opacity="1"/></filter>';
    svg += '<filter id="card-shadow-warning" x="-20%" y="-20%" width="150%" height="170%"><feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="rgba(255,125,0,0.2)" flood-opacity="1"/></filter>';
    svg += '<filter id="card-shadow-selected" x="-20%" y="-20%" width="150%" height="170%"><feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="rgba(20,86,240,0.2)" flood-opacity="1"/></filter>';
    svg += '<filter id="card-shadow-running" x="-20%" y="-20%" width="150%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="8" flood-color="rgba(123,97,255,0.30)" flood-opacity="1"/></filter>';
    svg += '<filter id="glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    svg += '<pattern id="n8n-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r=".7" fill="rgba(0,0,0,0.04)"/></pattern>';
    // State-colored arrow markers (n8n style)
    const markerColors = { neutral: '#98A2B3', success: '#17B26A', error: '#F04438', warning: '#F79009', running: '#7B61FF' };
    Object.keys(markerColors).forEach(mk => {
      svg += `<marker id="arrow-${mk}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${markerColors[mk]}"/></marker>`;
    });
    svg += '</defs>';

    // ── Background: light canvas + dot grid ──
    svg += `<rect x="${vbMinX}" y="${vbMinY}" width="${W}" height="${H}" fill="#FAFBFC"/>`;
    svg += `<rect x="${vbMinX}" y="${vbMinY}" width="${W}" height="${H}" fill="url(#n8n-dots)"/>`;

    // ══════════════════════════════════════════════════════════════════════════
    // ═══ EDIFICIO — Bande visive per ogni PIANO ════════════════════════════════
    // ══════════════════════════════════════════════════════════════════════════
    const PIANO_COLORS = [
      { bg: 'rgba(99,102,241,0.04)', border: 'rgba(99,102,241,0.15)', text: '#6366F1' },  // Piano 5 - indigo
      { bg: 'rgba(59,130,246,0.04)', border: 'rgba(59,130,246,0.15)', text: '#3B82F6' },  // Piano 4 - blue
      { bg: 'rgba(16,185,129,0.04)', border: 'rgba(16,185,129,0.15)', text: '#10B981' },  // Piano 3 - emerald
      { bg: 'rgba(245,158,11,0.04)', border: 'rgba(245,158,11,0.15)', text: '#F59E0B' },  // Piano 2 - amber
      { bg: 'rgba(139,92,246,0.04)', border: 'rgba(139,92,246,0.15)', text: '#8B5CF6' },  // Piano 1 - violet
      { bg: 'rgba(107,114,128,0.04)', border: 'rgba(107,114,128,0.15)', text: '#6B7280' }, // Piano 0 - gray
    ];

    if (graphData._pianoBands && graphData._pianoBands.length) {
      graphData._pianoBands.forEach((band) => {
        const colors = PIANO_COLORS[5 - band.piano] || PIANO_COLORS[5];
        const bandWidth = W - 40;
        const bandX = vbMinX + 20;
        
        // Piano band rectangle
        svg += `<rect x="${bandX}" y="${band.y}" width="${bandWidth}" height="${band.height}" rx="8" fill="${colors.bg}" stroke="${colors.border}" stroke-width="1.5"/>`;
        
        // Piano label (left side, inside band)
        svg += `<text x="${bandX + 16}" y="${band.y + 26}" fill="${colors.text}" font-size="13" font-weight="700" font-family="var(--font-mono)" letter-spacing="0.5">${band.label}</text>`;
        
        // Node count badge
        if (band.nodeCount > 0) {
          svg += `<text x="${bandX + bandWidth - 16}" y="${band.y + 26}" fill="${colors.text}" font-size="11" font-weight="500" font-family="var(--font-mono)" text-anchor="end" opacity="0.7">${band.nodeCount} nodi</text>`;
        }
      });
    }

    // ── Pre-compute port positions (distribute edges along node edges) ──
    // Count outgoing/incoming edges per node to distribute ports vertically
    const outEdgesOf = {};  // nodeId → [ edgeObj ]
    const inEdgesOf = {};   // nodeId → [ edgeObj ]
    edges.forEach(e => {
      if (e._isConfig) return;
      if (!outEdgesOf[e.source]) outEdgesOf[e.source] = [];
      outEdgesOf[e.source].push(e);
      if (!inEdgesOf[e.target]) inEdgesOf[e.target] = [];
      inEdgesOf[e.target].push(e);
    });

    // Sort edges by target/source Y position for clean non-crossing layout
    Object.keys(outEdgesOf).forEach(nid => {
      outEdgesOf[nid].sort((a, b) => {
        const ta = nodes[idx[a.target]], tb = nodes[idx[b.target]];
        return (ta ? ta._y : 0) - (tb ? tb._y : 0);
      });
    });
    Object.keys(inEdgesOf).forEach(nid => {
      inEdgesOf[nid].sort((a, b) => {
        const sa = nodes[idx[a.source]], sb = nodes[idx[b.source]];
        return (sa ? sa._y : 0) - (sb ? sb._y : 0);
      });
    });

    // Compute port Y for a given edge on source (right side) or target (left side)
    // ── Smart port selection: use all 4 faces based on relative position ──
    function getBestPorts(srcNode, tgtNode) {
      const dx = tgtNode._x - srcNode._x;
      const dy = tgtNode._y - srcNode._y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      let srcPort, tgtPort;

      // Determine primary direction
      if (absDy > absDx * 0.7) {
        // Primarily vertical connection
        if (dy > 0) {
          // Target is below source
          srcPort = { x: srcNode._x, y: srcNode._y + srcNode._h / 2, side: 'bottom' };
          tgtPort = { x: tgtNode._x, y: tgtNode._y - tgtNode._h / 2, side: 'top' };
        } else {
          // Target is above source
          srcPort = { x: srcNode._x, y: srcNode._y - srcNode._h / 2, side: 'top' };
          tgtPort = { x: tgtNode._x, y: tgtNode._y + tgtNode._h / 2, side: 'bottom' };
        }
      } else if (dx > 0) {
        // Target is to the right
        srcPort = { x: srcNode._x + srcNode._w / 2, y: srcNode._y, side: 'right' };
        tgtPort = { x: tgtNode._x - tgtNode._w / 2, y: tgtNode._y, side: 'left' };
      } else {
        // Target is to the left
        srcPort = { x: srcNode._x - srcNode._w / 2, y: srcNode._y, side: 'left' };
        tgtPort = { x: tgtNode._x + tgtNode._w / 2, y: tgtNode._y, side: 'right' };
      }

      return { srcPort, tgtPort };
    }

    // Legacy port functions for backward compatibility (kept for future use)
    // eslint-disable-next-line no-unused-vars -- reserved for multi-port routing
    function getOutPortY(node, edge) {
      const list = outEdgesOf[node.id] || [edge];
      const i = list.indexOf(edge);
      const count = list.length;
      const usableH = node._h * 0.7;  // use 70% of node height
      if (count === 1) return node._y;
      return node._y - usableH / 2 + (i / (count - 1)) * usableH;
    }
    // eslint-disable-next-line no-unused-vars -- reserved for multi-port routing
    function getInPortY(node, edge) {
      const list = inEdgesOf[node.id] || [edge];
      const i = list.indexOf(edge);
      const count = list.length;
      const usableH = node._h * 0.7;
      if (count === 1) return node._y;
      return node._y - usableH / 2 + (i / (count - 1)) * usableH;
    }

    // ── Edges: EDIFICIO impianti — routing ORTOGONALE (curve 90°, nei corridoi) ──
    // 3 tipi: ELETTRICO (3px solido), IDRAULICO (1.5px solido), GAS (1.5px tratteggiato)
    const drawnOutPort = {};
    const drawnInPort = {};

    // Classify edge type based on source/target nature
    // eslint-disable-next-line no-unused-vars -- tgtNode reserved for future edge classification
    function getEdgeType(e, srcNode, _tgtNode) {
      // GAS: config edges (dashed)
      if (e._isConfig) return 'gas';
      // ELETTRICO: event-based connections (SSE, event-bus, callbacks)
      const eventSources = ['event-bus.js', 'sse-manager.js', 'notifications.js'];
      if (eventSources.includes(srcNode.label)) return 'elettrico';
      // Default: IDRAULICO (static imports)
      return 'idraulico';
    }

    // Edge styling per impianto type (con colori distintivi)
    const IMPIANTO_STYLE = {
      elettrico: { width: 3, dash: null, offset: -6, color: '#6366F1' },      // viola - eventi
      idraulico: { width: 1.5, dash: null, offset: 0, color: '#10B981' },     // verde - import
      gas:       { width: 2, dash: '8,4', offset: 6, color: '#F59E0B' },      // arancione - config
    };

    // Orthogonal routing: 90° corners in corridors (no diagonals)
    function orthogonalPath(srcPort, tgtPort, offset = 0) {
      const sx = srcPort.x, sy = srcPort.y + offset;
      const tx = tgtPort.x, ty = tgtPort.y + offset;
      const r = 8; // corner radius for smooth 90° turns

      // Same horizontal position → straight vertical
      if (Math.abs(sx - tx) < 1) {
        return `M${sx},${sy} L${tx},${ty}`;
      }
      // Same vertical position → straight horizontal
      if (Math.abs(sy - ty) < 1) {
        return `M${sx},${sy} L${tx},${ty}`;
      }

      // Orthogonal routing with one bend
      if (srcPort.side === 'right' || srcPort.side === 'left') {
        // Horizontal first, then vertical
        const midX = (sx + tx) / 2;
        if (sy < ty) {
          // Going down-right or down-left
          return `M${sx},${sy} L${midX - r},${sy} Q${midX},${sy} ${midX},${sy + r} L${midX},${ty - r} Q${midX},${ty} ${midX + r},${ty} L${tx},${ty}`;
        } 
          // Going up-right or up-left
          return `M${sx},${sy} L${midX - r},${sy} Q${midX},${sy} ${midX},${sy - r} L${midX},${ty + r} Q${midX},${ty} ${midX + r},${ty} L${tx},${ty}`;
        
      } 
        // Vertical first, then horizontal (bottom/top ports)
        const midY = (sy + ty) / 2;
        if (sx < tx) {
          // Going right
          return `M${sx},${sy} L${sx},${midY - r} Q${sx},${midY} ${sx + r},${midY} L${tx - r},${midY} Q${tx},${midY} ${tx},${midY + r} L${tx},${ty}`;
        } 
          // Going left
          return `M${sx},${sy} L${sx},${midY - r} Q${sx},${midY} ${sx - r},${midY} L${tx + r},${midY} Q${tx},${midY} ${tx},${midY + r} L${tx},${ty}`;
        
      
    }

    edges.forEach((e) => {
      const si = idx[e.source];
      const ti = idx[e.target];
      if (si === undefined || ti === undefined) return;
      const s = nodes[si];
      const t = nodes[ti];
      if (s._x === undefined || t._x === undefined) return;

      // Edge color from target state
      const tErr = (t.errorCount || 0) > 0;
      const tWarn = (t.warningCount || 0) > 0;
      const tRunning = activityNodes.has(t.id) && activityNodes.get(t.id).pulseUntil > now;
      const sSuccess = !tErr && !tWarn && !tRunning;
      let markerId = 'arrow-neutral';
      if (tErr)            { markerId = 'arrow-error'; }
      else if (tWarn)      { markerId = 'arrow-warning'; }
      else if (tRunning)   { markerId = 'arrow-running'; }
      else if (sSuccess && (t._inDegree || 0) > 0) { markerId = 'arrow-success'; }

      // Determine impianto type
      const impiantoType = getEdgeType(e, s, t);
      const style = IMPIANTO_STYLE[impiantoType];
      
      // Edge color: use impianto color, override for errors/warnings
      let edgeColor = style.color;
      if (tErr) edgeColor = '#F04438';
      else if (tWarn) edgeColor = '#F79009';
      else if (tRunning) edgeColor = '#7B61FF';

      // ── Config connections (GAS): special handling ──
      if (e._isConfig) {
        const sx = s._x, sy = s._y + (s._h || 80) / 2;
        const tx = t._x, ty = t._y - (t._h || 96) / 2;
        // Orthogonal path for config
        const path = orthogonalPath(
          { x: sx, y: sy, side: 'bottom' },
          { x: tx, y: ty, side: 'top' },
          style.offset
        );
        svg += `<path d="${path}" fill="none" stroke="${edgeColor}" stroke-width="${style.width}" stroke-dasharray="${style.dash || ''}" opacity=".7"/>`;
        return;
      }

      // ── Main connections using smart 4-face ports + orthogonal routing ──
      const { srcPort, tgtPort } = getBestPorts(s, t);
      const path = orthogonalPath(srcPort, tgtPort, style.offset);

      svg += `<path d="${path}" fill="none" stroke="${edgeColor}" stroke-width="${style.width}" ${style.dash ? `stroke-dasharray="${style.dash}"` : ''} marker-end="url(#${markerId})" stroke-linecap="round" opacity=".8"/>`;

      // Track ports for handle dots
      if (!drawnOutPort[s.id]) drawnOutPort[s.id] = [];
      drawnOutPort[s.id].push({ x: srcPort.x, y: srcPort.y });
      if (!drawnInPort[t.id]) drawnInPort[t.id] = [];
      drawnInPort[t.id].push({ x: tgtPort.x, y: tgtPort.y });
    });

    // ── Handle dots (n8n CanvasHandleDot — circles at connection points) ──
    Object.values(drawnOutPort).forEach(pts => {
      pts.forEach(p => { svg += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="white" stroke="#D0D5DD" stroke-width="1.5"/>`; });
    });
    Object.values(drawnInPort).forEach(pts => {
      pts.forEach(p => { svg += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="white" stroke="#D0D5DD" stroke-width="1.5"/>`; });
    });

    // ── Nodes: THREE distinct render types (like n8n's CanvasNodeRenderType) ──
    nodes.forEach((n) => {
      const act = activityNodes.get(n.id);
      const isActive      = act && act.pulseUntil > now;
      const isLiveError   = act && act.lastType === 'node_error' && act.pulseUntil > now;
      const isLiveWarning = act && act.lastType === 'node_warning' && act.pulseUntil > now;
      const hasStaticErrors   = (n.errorCount || 0) > 0;
      const hasStaticWarnings = (n.warningCount || 0) > 0;
      const isError   = isLiveError || hasStaticErrors;
      const isWarning = !isError && (isLiveWarning || hasStaticWarnings);
      const isSelected = _selectedNodeId === n.id;
      const escapedId = n.id.replace(/'/g, "\\'").replace(/"/g, '&quot;');

      // State-based styling
      // Node border: use extension color as default border
      const extColor = n._isAuditNode ? '#E040FB' : (EXT_COLORS[n.extension] || groupColor(n.group));
      let borderColor = extColor;
      let borderWidth = 2;
      let shadowFilter = 'url(#card-shadow)';
      if (isError)         { borderColor = '#F04438'; borderWidth = 3; shadowFilter = 'url(#card-shadow-error)'; }
      else if (isWarning)  { borderColor = '#F79009'; borderWidth = 2.5; shadowFilter = 'url(#card-shadow-warning)'; }
      else if (isSelected) { borderColor = '#1456F0'; borderWidth = 2.5; shadowFilter = 'url(#card-shadow-selected)'; }
      else if (isActive)   { borderColor = '#7B61FF'; borderWidth = 2.5; shadowFilter = 'url(#card-shadow-running)'; }

      // Light tint for node background (10% of extColor)
      const nodeFill = `${extColor}18`;

      // Tooltip
      const sizeLabel = n.size > 1024 ? `${Math.round(n.size / 1024)}KB` : `${n.size || 0}B`;
      const issueCount = (n.errorCount || 0) + (n.warningCount || 0);
      const linterLabel = n.linter ? ` [${n.linter}]` : '';
      const issueLabel = issueCount > 0 ? `\n${n.errorCount || 0} errors, ${n.warningCount || 0} warnings${linterLabel}` : '';
      const realLabel = n.realLinterData ? ' (real linter)' : '';
      const titleText = `${n.id} (${n.group}, ${sizeLabel})${issueLabel}${realLabel}`;

      const nw = n._w;
      const nh = n._h;
      // State color for status dot (mock v2 style)
      let stateColor = '#D0D5DD'; // idle
      if (isError) stateColor = '#F04438';
      else if (isWarning) stateColor = '#F79009';
      else if (isActive) stateColor = '#7B61FF';
      else if ((n.errorCount || 0) === 0 && (n.warningCount || 0) === 0 && n._inDegree > 0) stateColor = '#17B26A'; // success for non-entry nodes with no issues

      const displayLabel = n._isAuditNode
        ? 'Dependencies'
        : (n.label.length > 14 ? `${n.label.substring(0, 13)  }..` : n.label);
      const renderType = n._renderType || 'default_';

      const left = -nw / 2;
      const top  = -nh / 2;

      svg += `<g class="graph-node" style="cursor:pointer;" transform="translate(${n._x},${n._y})" onclick="SynapseApp.tabs.canvas.inspectNode('${escapedId}')">`;

      // ── Running animation ring (n8n-style rotating dashes) ──
      if (isActive && !isError && !isWarning) {
        const ringR = renderType === 'config' ? CONFIG_RADIUS + 5 : Math.max(nw, nh) / 2 + 5;
        svg += `<circle cx="0" cy="0" r="${ringR}" fill="none" stroke="#7B61FF" stroke-width="2.5" stroke-dasharray="${ringR * 0.8} ${ringR * 1.6}" opacity=".6">`;
        svg += `<animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="2s" repeatCount="indefinite"/>`;
        svg += '</circle>';
      }

      if (renderType === 'trigger') {
        // ━━━━━━ TRIGGER: capsule-left 96×96 ━━━━━━
        const r = nh / 2;
        const rr = CARD_R;
        const triggerPath = `M${left + r},${top} L${left + nw - rr},${top} Q${left + nw},${top} ${left + nw},${top + rr} L${left + nw},${top + nh - rr} Q${left + nw},${top + nh} ${left + nw - rr},${top + nh} L${left + r},${top + nh} A${r},${r} 0 0,1 ${left + r},${top} Z`;
        svg += `<path d="${triggerPath}" fill="${nodeFill}" stroke="${borderColor}" stroke-width="${borderWidth}" filter="${shadowFilter}"><title>${titleText}</title></path>`;
        // Filled circle icon (left capsule area)
        svg += `<circle cx="${left + r}" cy="0" r="${r - borderWidth}" fill="${extColor}"/>`;
        svg += `<g transform="translate(${left + r},0)">${_cardIcon(n.extension)}</g>`;
        // Trigger indicator (top-right corner): small arrow pointing down-right (SVG pure)
        svg += `<g transform="translate(${left + nw - 12},${top + 12})"><path d="M-4,-4 L4,0 L0,4" fill="${stateColor}" stroke="none"/></g>`;
        // Label BELOW node
        svg += `<text x="0" y="${nh / 2 + 18}" text-anchor="middle" fill="#1a1a2e" font-size="11" font-weight="700" font-family="var(--font-main)">${displayLabel}</text>`;
        svg += `<text x="0" y="${nh / 2 + 32}" text-anchor="middle" fill="#4a5568" font-size="9" font-weight="500" font-family="var(--font-main)">${n.group}</text>`;

      } else if (renderType === 'config') {
        // ━━━━━━ CONFIGURATION: circle r=40 ━━━━━━
        svg += `<circle cx="0" cy="0" r="${CONFIG_RADIUS}" fill="${nodeFill}" stroke="${borderColor}" stroke-width="${borderWidth}" filter="${shadowFilter}"><title>${titleText}</title></circle>`;
        const iconR = ICON_SIZE / 2 - 2;
        svg += `<circle cx="0" cy="0" r="${iconR}" fill="${extColor}" opacity=".85"/>`;
        // Pure SVG icon instead of text glyph
        svg += `<g transform="translate(0,0)">${_cardIcon(n.extension)}</g>`;
        // Label BELOW circle
        const cfgLabel = n.label.length > 14 ? `${n.label.substring(0, 13)  }..` : n.label;
        svg += `<text x="0" y="${CONFIG_RADIUS + 18}" text-anchor="middle" fill="#1a1a2e" font-size="11" font-weight="600" font-family="var(--font-main)">${cfgLabel}</text>`;

      } else if (renderType === 'configurable') {
        // ━━━━━━ CONFIGURABLE: wide rectangle 256×96 (hub nodes) ━━━━━━
        svg += `<rect x="${left}" y="${top}" width="${nw}" height="${nh}" rx="${CARD_R}" fill="${nodeFill}" stroke="${borderColor}" stroke-width="${borderWidth}" filter="${shadowFilter}"><title>${titleText}</title></rect>`;
        // Left-side icon circle
        const iconR = ICON_SIZE / 2;
        const iconCx = left + iconR + 8;
        svg += `<circle cx="${iconCx}" cy="0" r="${iconR}" fill="${extColor}"/>`;
        svg += `<g transform="translate(${iconCx},0)">${_cardIcon(n.extension)}</g>`;
        // Label INSIDE node (to the right of icon)
        svg += `<text x="${iconCx + iconR + 12}" y="4" text-anchor="start" fill="#1a1a2e" font-size="12" font-weight="700" font-family="var(--font-main)">${displayLabel}</text>`;
        // Hub indicator: small grid dots on right side
        const dotR = 3, dotGap = 12;
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 3; col++) {
            const dx = left + nw - 20 - col * dotGap;
            const dy = -dotGap / 2 + row * dotGap;
            svg += `<circle cx="${dx}" cy="${dy}" r="${dotR}" fill="${extColor}" opacity="0.4"/>`;
          }
        }
        // Label BELOW node
        svg += `<text x="0" y="${nh / 2 + 18}" text-anchor="middle" fill="#1a1a2e" font-size="11" font-weight="600" font-family="var(--font-main)">${displayLabel}</text>`;

      } else {
        // ━━━━━━ DEFAULT: square 96×96 ━━━━━━
        svg += `<rect x="${left}" y="${top}" width="${nw}" height="${nh}" rx="${CARD_R}" fill="${nodeFill}" stroke="${borderColor}" stroke-width="${borderWidth}" filter="${shadowFilter}"><title>${titleText}</title></rect>`;
        // Centered circle icon
        const iconR = ICON_SIZE / 2;
        svg += `<circle cx="0" cy="-8" r="${iconR}" fill="${extColor}"/>`;
        svg += `<g transform="translate(0,-8)">${_cardIcon(n.extension)}</g>`;
        // Label BELOW node
        svg += `<text x="0" y="${nh / 2 + 18}" text-anchor="middle" fill="#1a1a2e" font-size="11" font-weight="700" font-family="var(--font-main)">${displayLabel}</text>`;
      }

      // ── Status dot (state-based, like mock v2) ──
      if (stateColor !== '#D0D5DD') {
        const bx = renderType === 'config' ? CONFIG_RADIUS - 6 : left + nw - 6;
        const by = renderType === 'config' ? -CONFIG_RADIUS + 6 : top + 6;
        svg += `<circle cx="${bx}" cy="${by}" r="4.5" fill="${stateColor}" stroke="white" stroke-width="1.5"/>`;
      }

      // ── Error/Warning TRIANGOLO STRADALE (al lato destro del nodo) ──
      const errCount = n.errorCount || 0;
      const warnCount = n.warningCount || 0;
      if (errCount > 0) {
        // Triangolo rosso tipo segnale stradale con ! 
        const tx = renderType === 'config' ? CONFIG_RADIUS + 10 : left + nw + 10;
        const ty = renderType === 'config' ? -8 : top + 16;
        const ts = 28; // triangle size
        svg += `<g transform="translate(${tx},${ty})">`;
        svg += `<path d="M0,${-ts*0.5} L${ts*0.5},${ts*0.4} L${-ts*0.5},${ts*0.4} Z" fill="#DC2626" stroke="#991B1B" stroke-width="2.5" stroke-linejoin="round"/>`;
        svg += `<text x="0" y="3" text-anchor="middle" fill="white" font-size="16" font-weight="900" font-family="var(--font-mono)">!</text>`;
        svg += `<text x="0" y="${ts*0.4 + 14}" text-anchor="middle" fill="#DC2626" font-size="11" font-weight="800" font-family="var(--font-mono)">${errCount}</text>`;
        svg += `</g>`;
      } else if (warnCount > 0) {
        // Triangolo arancione tipo segnale stradale con ! 
        const tx = renderType === 'config' ? CONFIG_RADIUS + 10 : left + nw + 10;
        const ty = renderType === 'config' ? -8 : top + 16;
        const ts = 28; // triangle size
        svg += `<g transform="translate(${tx},${ty})">`;
        svg += `<path d="M0,${-ts*0.5} L${ts*0.5},${ts*0.4} L${-ts*0.5},${ts*0.4} Z" fill="#F59E0B" stroke="#D97706" stroke-width="2.5" stroke-linejoin="round"/>`;
        svg += `<text x="0" y="3" text-anchor="middle" fill="#1a1a2e" font-size="16" font-weight="900" font-family="var(--font-mono)">!</text>`;
        svg += `<text x="0" y="${ts*0.4 + 14}" text-anchor="middle" fill="#D97706" font-size="11" font-weight="800" font-family="var(--font-mono)">${warnCount}</text>`;
        svg += `</g>`;
      }

      // ── Error/warning pulse animation ──
      if (isError) {
        if (renderType === 'config') {
          svg += `<circle cx="0" cy="0" r="${CONFIG_RADIUS + 4}" fill="none" stroke="#F04438" stroke-width="1.5" opacity="0.6"><animate attributeName="opacity" values="0.6;0;0.6" dur="1.5s" repeatCount="indefinite"/></circle>`;
        } else {
          svg += `<rect x="${left - 3}" y="${top - 3}" width="${nw + 6}" height="${nh + 6}" rx="${CARD_R + 2}" fill="none" stroke="#F04438" stroke-width="1.5" opacity="0.6"><animate attributeName="opacity" values="0.6;0;0.6" dur="1.5s" repeatCount="indefinite"/></rect>`;
        }
      } else if (isWarning) {
        if (renderType === 'config') {
          svg += `<circle cx="0" cy="0" r="${CONFIG_RADIUS + 4}" fill="none" stroke="#F79009" stroke-width="1.5" opacity="0.5"><animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite"/></circle>`;
        } else {
          svg += `<rect x="${left - 3}" y="${top - 3}" width="${nw + 6}" height="${nh + 6}" rx="${CARD_R + 2}" fill="none" stroke="#F79009" stroke-width="1.5" opacity="0.5"><animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite"/></rect>`;
        }
      }

      svg += '</g>';
    });

    svg += '</g>'; // close transform layer
    svg += '</svg>';

    // ── Legend: node types + extension colours + groups + status ──
    const groups = [];
    const seenGroups = {};
    nodes.forEach((n) => { if (!seenGroups[n.group]) { seenGroups[n.group] = true; groups.push(n.group); } });
    let legend = '<div style="display:flex;gap:14px;padding:8px 0;flex-wrap:wrap;align-items:center;">';
    // Node type legend (like n8n's node render types)
    legend += '<span style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-secondary);"><span style="display:inline-block;width:22px;height:14px;border-radius:7px 3px 3px 7px;background:#3572A5;opacity:0.4;"></span>Trigger</span>';
    legend += '<span style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-secondary);"><span style="display:inline-block;width:18px;height:14px;border-radius:3px;background:#3178C6;opacity:0.4;"></span>Default</span>';
    legend += '<span style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-secondary);"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#292929;opacity:0.4;"></span>Config</span>';
    legend += '<span style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-secondary);"><span style="display:inline-block;width:28px;height:14px;border-radius:3px;background:#607D8B;opacity:0.4;"></span>Hub</span>';
    legend += '<span style="color:var(--border-primary);margin:0 6px;">|</span>';
    // Extension badges
    const extLegend = [
      { ext: '.py',  label: 'Python',     color: '#3572A5' },
      { ext: '.js',  label: 'JavaScript', color: '#F0DB4F' },
      { ext: '.ts',  label: 'TypeScript', color: '#3178C6' },
      { ext: '.css', label: 'CSS',        color: '#663399' },
      { ext: '.html',label: 'HTML',       color: '#E34C26' },
      { ext: '.md',  label: 'Config/Doc', color: '#607D8B' },
    ];
    extLegend.forEach((el) => {
      legend += `<span style="display:flex;align-items:center;gap:5px;font-size:0.7rem;color:var(--text-secondary);">`;
      legend += `<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:18px;border-radius:4px;background:${el.color};color:white;font-size:8px;font-weight:700;font-family:var(--font-mono);">${_cardGlyph(el.ext)}</span>`;
      legend += `${el.label}</span>`;
    });
    legend += '<span style="color:var(--border-primary);margin:0 6px;">|</span>';
    // EDIFICIO Piani
    const pianoLegend = [
      { label: 'P5', color: '#6366F1', title: 'Entry Points' },
      { label: 'P4', color: '#3B82F6', title: 'Orchestratori' },
      { label: 'P3', color: '#10B981', title: 'Tabs/Moduli' },
      { label: 'P2', color: '#F59E0B', title: 'Utilities' },
      { label: 'P1', color: '#8B5CF6', title: 'Config' },
      { label: 'P0', color: '#6B7280', title: 'Isolati' },
    ];
    pianoLegend.forEach((p) => {
      legend += `<span style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-secondary);" title="${p.title}"><span style="width:18px;height:12px;border-radius:2px;background:${p.color};opacity:0.3;display:inline-block;"></span>${p.label}</span>`;
    });
    legend += '<span style="color:var(--border-primary);margin:0 6px;">|</span>';
    // Impianti (connection types) con spiegazione
    legend += '<span style="font-size:0.68rem;color:var(--text-tertiary);margin-right:4px;">Connessioni:</span>';
    legend += '<span style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-secondary);" title="Eventi, SSE, Callbacks - flusso dati real-time"><span style="display:inline-block;width:24px;height:3px;background:#6366F1;border-radius:1px;"></span><b>Elettrico</b> <span style="font-size:0.6rem;color:var(--text-tertiary);">(eventi)</span></span>';
    legend += '<span style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-secondary);" title="Import diretti, require, include - dipendenze statiche"><span style="display:inline-block;width:24px;height:1.5px;background:#10B981;border-radius:1px;"></span><b>Idraulico</b> <span style="font-size:0.6rem;color:var(--text-tertiary);">(import)</span></span>';
    legend += '<span style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-secondary);" title="Configurazioni, settings, env - dipendenze indirette"><span style="display:inline-block;width:24px;height:0;border-top:2px dashed #F59E0B;"></span><b>Gas</b> <span style="font-size:0.6rem;color:var(--text-tertiary);">(config)</span></span>';
    legend += '<span style="color:var(--border-primary);margin:0 6px;">|</span>';
    // State indicators
    legend += '<span style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-secondary);"><span style="width:7px;height:7px;border-radius:50%;background:#17B26A;display:inline-block;"></span>OK</span>';
    legend += '<span style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-secondary);"><span style="width:7px;height:7px;border-radius:50%;background:#F04438;display:inline-block;"></span>Err</span>';
    legend += '<span style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-secondary);"><span style="width:7px;height:7px;border-radius:50%;background:#F79009;display:inline-block;"></span>Warn</span>';
    legend += '<span style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-secondary);"><span style="width:7px;height:7px;border-radius:50%;background:#7B61FF;display:inline-block;"></span>Run</span>';
    legend += '</div>';

    // Stats
    const pianoStats = graphData._pianoBands ? graphData._pianoBands.filter(b => b.nodeCount > 0).map(b => `P${b.piano}:${b.nodeCount}`).join(' ') : '';
    const stats = `<div style="font-size:0.72rem;color:var(--text-secondary);padding:4px 0;">${
      nodes.length} files  |  ${edges.length} deps  |  6 piani  |  ${activityNodes.size} active  |  ${pianoStats}</div>`;

    // Zoom controls bar
    let controls = '<div id="synapse-zoom-controls" style="display:flex;gap:6px;align-items:center;padding:4px 0;flex-wrap:wrap;">';
    controls += '<button onclick="SynapseApp.tabs.canvas._zoomIn()" style="padding:2px 10px;font-size:1rem;border:1px solid var(--border-primary);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;" title="Zoom In">+</button>';
    controls += '<button onclick="SynapseApp.tabs.canvas._zoomOut()" style="padding:2px 10px;font-size:1rem;border:1px solid var(--border-primary);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;" title="Zoom Out">&minus;</button>';
    controls += '<button onclick="SynapseApp.tabs.canvas._zoomFit()" style="padding:2px 10px;font-size:0.75rem;border:1px solid var(--border-primary);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;" title="Fit to view">Fit</button>';
    controls += '<button onclick="SynapseApp.tabs.canvas._zoomReset()" style="padding:2px 10px;font-size:0.75rem;border:1px solid var(--border-primary);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;" title="Reset zoom">1:1</button>';
    controls += `<span id="synapse-zoom-label" style="font-size:0.7rem;color:var(--text-secondary);margin-left:4px;">${Math.round(_zoomScale * 100)}%</span>`;
    // Piano navigation buttons
    controls += '<span style="margin-left:16px;border-left:1px solid var(--border-primary);padding-left:12px;font-size:0.7rem;color:var(--text-secondary);">Piano:</span>';
    controls += '<button onclick="SynapseApp.tabs.canvas._scrollToPiano(5)" style="padding:2px 8px;font-size:0.7rem;border:1px solid #4338ca;border-radius:4px;background:#eef2ff;color:#4338ca;cursor:pointer;" title="Entry Points">P5</button>';
    controls += '<button onclick="SynapseApp.tabs.canvas._scrollToPiano(4)" style="padding:2px 8px;font-size:0.7rem;border:1px solid #7c3aed;border-radius:4px;background:#f5f3ff;color:#7c3aed;cursor:pointer;" title="Orchestratori">P4</button>';
    controls += '<button onclick="SynapseApp.tabs.canvas._scrollToPiano(3)" style="padding:2px 8px;font-size:0.7rem;border:1px solid #0891b2;border-radius:4px;background:#ecfeff;color:#0891b2;cursor:pointer;" title="Tabs/Moduli">P3</button>';
    controls += '<button onclick="SynapseApp.tabs.canvas._scrollToPiano(2)" style="padding:2px 8px;font-size:0.7rem;border:1px solid #059669;border-radius:4px;background:#ecfdf5;color:#059669;cursor:pointer;" title="Utilities">P2</button>';
    controls += '<button onclick="SynapseApp.tabs.canvas._scrollToPiano(1)" style="padding:2px 8px;font-size:0.7rem;border:1px solid #d97706;border-radius:4px;background:#fffbeb;color:#d97706;cursor:pointer;" title="Config">P1</button>';
    controls += '<button onclick="SynapseApp.tabs.canvas._scrollToPiano(0)" style="padding:2px 8px;font-size:0.7rem;border:1px solid #6b7280;border-radius:4px;background:#f9fafb;color:#6b7280;cursor:pointer;" title="Isolati">P0</button>';
    controls += '</div>';

    // Graph container — EDIFICIO layout: 6 piani, scroll verticale 
    const containerH = Math.max(600, Math.min(1200, H * 0.85));
    const graphHtml = `<div id="synapse-graph-container" style="position:relative;width:100%;height:${containerH}px;overflow:auto;border:1px solid var(--border-primary);border-radius:8px;background:#FAFBFC;scroll-behavior:smooth;cursor:default;">${svg}</div>`;

    wrap.innerHTML = legend + controls + graphHtml + stats;

    // ── Attach zoom/pan (with cleanup) ──
    _attachGraphInteraction();
  }

  // ── Zoom/pan event handler references (for cleanup) ──
  let _wheelHandler = null;
  let _mousedownHandler = null;
  let _mousemoveHandler = null;
  let _mouseupHandler = null;

  /** Attach mouse wheel zoom + drag pan to the graph SVG.
   *  FIXED: removes old handlers before adding new ones to prevent accumulation. */
  function _attachGraphInteraction() {
    const container = document.getElementById('synapse-graph-container');
    const svgNode = document.getElementById('synapse-graph-svg');
    if (!container || !svgNode) return;

    // ── Remove old window-level handlers if any ──
    if (_mousemoveHandler) window.removeEventListener('mousemove', _mousemoveHandler);
    if (_mouseupHandler)   window.removeEventListener('mouseup', _mouseupHandler);

    // ── Helper: get viewBox dimensions safely ──
    function _getViewBox() {
      try {
        const vbb = svgNode.viewBox.baseVal;
        return { x: vbb.x, y: vbb.y, w: vbb.width, h: vbb.height };
      } catch {
        return { x: 0, y: 0, w: 4800, h: 3200 };  // fallback
      }
    }

    // ── Wheel zoom (centered on cursor) ──
    _wheelHandler = function(e) {
      e.preventDefault();
      e.stopPropagation();
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const vb = _getViewBox();

      const oldScale = _zoomScale;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      _zoomScale = Math.max(0.1, Math.min(10, _zoomScale * delta));

      // Convert mouse position to SVG coordinate space
      const ratioX = vb.w / rect.width;
      const ratioY = vb.h / rect.height;
      const mxSvg = mx * ratioX;
      const mySvg = my * ratioY;

      // Adjust pan so the point under the cursor stays fixed
      _panX = mxSvg - (mxSvg - _panX) * (_zoomScale / oldScale);
      _panY = mySvg - (mySvg - _panY) * (_zoomScale / oldScale);

      _applyTransform();
    };
    container.addEventListener('wheel', _wheelHandler, { passive: false });

    // ── Drag pan (mousedown on container) ──
    _mousedownHandler = function(e) {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('.graph-node')) return;
      _isPanning = true;
      _panStartX = e.clientX;
      _panStartY = e.clientY;
      container.style.cursor = 'move';
      e.preventDefault();
    };
    container.addEventListener('mousedown', _mousedownHandler);

    // ── Window-level mousemove (works even when cursor leaves container) ──
    _mousemoveHandler = function(e) {
      if (!_isPanning) return;
      const rect = container.getBoundingClientRect();
      const vb = _getViewBox();
      const ratio = vb.w / rect.width;
      _panX += (e.clientX - _panStartX) * ratio;
      _panY += (e.clientY - _panStartY) * ratio;
      _panStartX = e.clientX;
      _panStartY = e.clientY;
      _applyTransform();
    };
    window.addEventListener('mousemove', _mousemoveHandler);

    // ── Window-level mouseup ──
    _mouseupHandler = function() {
      if (_isPanning) {
        _isPanning = false;
        const c = document.getElementById('synapse-graph-container');
        if (c) c.style.cursor = 'default';
      }
    };
    window.addEventListener('mouseup', _mouseupHandler);
  }

  /** Apply current zoom/pan transform to the SVG layer */
  function _applyTransform() {
    const layer = document.getElementById('synapse-graph-layer');
    if (layer) {
      layer.setAttribute('transform', `translate(${_panX},${_panY}) scale(${_zoomScale})`);
    }
    const label = document.getElementById('synapse-zoom-label');
    if (label) label.textContent = `${Math.round(_zoomScale * 100)}%`;
  }

  // Zoom control functions (exposed on tab API)
  function _zoomIn() {
    _zoomScale = Math.min(10, _zoomScale * 1.25);
    _applyTransform();
  }
  function _zoomOut() {
    _zoomScale = Math.max(0.1, _zoomScale * 0.8);
    _applyTransform();
  }
  function _zoomReset() {
    _zoomScale = 1;
    _panX = 0;
    _panY = 0;
    _applyTransform();
  }
  function _zoomFit() {
    // Fit all nodes + swimlane lanes inside the visible container
    const nodes = graphData.nodes;
    if (!nodes.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      const hw = (n._w || 172) / 2;
      const hh = (n._h || 44) / 2;
      if (n._x - hw < minX) minX = n._x - hw;
      if (n._x + hw > maxX) maxX = n._x + hw;
      if (n._y - hh < minY) minY = n._y - hh;
      if (n._y + hh > maxY) maxY = n._y + hh;
    });
    const pad = 80;
    const contentW = (maxX - minX) + pad * 2;
    const contentH = (maxY - minY) + pad * 2;
    const svgNode = document.getElementById('synapse-graph-svg');
    if (!svgNode) return;
    let svgW = 4800, svgH = 3200, svgX = 0, svgY = 0;
    try {
      const vbb = svgNode.viewBox.baseVal;
      svgW = vbb.width; svgH = vbb.height;
      svgX = vbb.x; svgY = vbb.y;
    } catch { /* ignored */ }
    const scaleX = svgW / contentW;
    const scaleY = svgH / contentH;
    _zoomScale = Math.min(scaleX, scaleY, 3);
    // Center the content within the viewBox
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    _panX = (svgX + svgW / 2) - cx * _zoomScale;
    _panY = (svgY + svgH / 2) - cy * _zoomScale;
    _applyTransform();
  }

  /** Scroll container to show a specific piano (floor) */
  function _scrollToPiano(pianoNum) {
    const container = document.getElementById('synapse-graph-container');
    if (!container || !graphData._pianoBands) return;
    const band = graphData._pianoBands.find(b => b.piano === pianoNum);
    if (!band) return;
    // Scroll to piano Y position (accounting for scale)
    const targetY = band.y * _zoomScale;
    container.scrollTo({ top: targetY - 20, behavior: 'smooth' });
  }

  // ---- FLOW VIEW: Render ----------------------------------------------------
  function renderFlow() {
    const wrap = document.getElementById('canvasFlowWrap');
    if (!wrap) return;
    if (!flowEvents.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-state-text">No events yet</div><div class="empty-state-hint">Events will appear as debug activity occurs</div></div>';
      return;
    }

    let html = '<div class="canvas-flow-list">';
    flowEvents.forEach(ev => {
      const typeColor = ev.eventType === 'file_change' ? '#00B42A' :
                        ev.eventType === 'node_error'  ? '#F53F3F' :
                        ev.eventType === 'node_warning' ? '#FF7D00' :
                        ev.eventType === 'node_activity' ? '#1456F0' : '#607D8B';
      const catLabel = ev.category === 'initial-scan' ? 'scan' :
                       ev.category === 'system' ? 'sys' : ev.category || 'debug';
      const age = Date.now() - ev._ts;
      const opacity = ev.category === 'initial-scan' || ev.category === 'system' ? 0.85 : Math.max(0.3, 1 - age / 60000);  // scan events stay visible
      const time = new Date(ev._ts).toLocaleTimeString();

      html += `<div class="canvas-flow-item" style="opacity:${  opacity  };border-left:3px solid ${  typeColor  };">`;
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      html += `<span style="font-weight:600;font-size:0.78rem;color:var(--text-primary);">${  ev.label || ev.nodeId  }</span>`;
      html += `<span style="font-size:0.65rem;color:var(--text-tertiary);">${  time  }</span>`;
      html += '</div>';
      html += '<div style="font-size:0.68rem;color:var(--text-secondary);margin-top:2px;">';
      html += `<span class="canvas-flow-badge" style="background:${  typeColor  }18;color:${  typeColor  };border:1px solid ${  typeColor  }44;">${  ev.eventType.replace('_', ' ')  }</span>`;
      html += `<span style="margin-left:8px;color:var(--text-tertiary);">${  catLabel  }</span>`;
      if (ev.meta) {
        const detail = ev.meta.action || ev.meta.message || ev.meta.type || '';
        if (detail) html += ` -- ${  (`${  detail}`).substring(0, 80)}`;
      }
      html += '</div></div>';
    });
    html += '</div>';
    wrap.innerHTML = html;
  }

  // ---- SSE CONNECTION -------------------------------------------------------
  function connectCanvasSSE() {
    if (canvasEventSource) { try { canvasEventSource.close(); } catch { /* ignore */ } }
    const statusEl = document.getElementById('canvasSSEStatus');
    if (statusEl) { statusEl.textContent = 'Connecting...'; statusEl.style.color = 'var(--text-tertiary)'; }

    canvasEventSource = new EventSource(`${CONFIG.API_BASE  }/debug/canvas/stream`);

    canvasEventSource.onopen = function () {
      if (statusEl) { statusEl.textContent = 'Connected'; statusEl.style.color = 'var(--accent-green)'; }
      connectCanvasSSE._retries = 0;  // reset backoff on successful connect
      // Add a synthetic connection event to Flow
      handleCanvasEvent({
        eventType: 'node_activity',
        nodeId: 'canvas-sse',
        label: 'SSE Stream Connected',
        category: 'system',
        meta: { type: 'connection', message: 'Real-time event stream active' },
      });
    };

    canvasEventSource.onmessage = function (e) {
      try {
        if (!e.data || e.data.indexOf(':keepalive') !== -1) return;
        const event = JSON.parse(e.data);
        handleCanvasEvent(event);
      } catch { /* ignore parse errors */ }
    };

    canvasEventSource.onerror = function () {
      if (statusEl) { statusEl.textContent = 'Disconnected'; statusEl.style.color = 'var(--accent-red)'; }
      canvasEventSource.close();
      canvasEventSource = null;
      // Auto-reconnect with exponential backoff (5s, 10s, 20s, max 30s)
      if (!connectCanvasSSE._retries) connectCanvasSSE._retries = 0;
      connectCanvasSSE._retries++;
      const delay = Math.min(5000 * 2**(connectCanvasSSE._retries - 1), 30000);
      setTimeout(() => {
        if (!canvasEventSource) connectCanvasSSE();
      }, delay);
    };
  }

  // Track which file is waiting for a Quick Fix result
  let _pendingFixFile = null;
  let _pendingFixTimer = null;
  let _lastInspectorInfo = null; // store last inspected file info for prompt generation

  function handleCanvasEvent(event) {
    const nodeId = event.nodeId;
    const eventType = event.eventType || 'node_activity';

    // ★ Auto-Scan Agent: live diagnostics update from backend auto-lint
    if (eventType === 'node_diagnostics' && nodeId && graphData && graphData.nodes) {
      const meta = event.meta || {};
      const normalId = nodeId.replace(/\\/g, '/');

      // Update matching node in graphData
      const node = graphData.nodes.find(n => n.id.replace(/\\/g, '/') === normalId);
      if (node) {
        const prevIssues = (node.errorCount || 0) + (node.warningCount || 0);
        node.errorCount = meta.errorCount || 0;
        node.warningCount = meta.warningCount || 0;
        node.issueCount = meta.issueCount || 0;
        node.fixableCount = meta.fixableCount || 0;
        node.linter = meta.linter || node.linter;
        node.realLinterData = meta.realLinterData !== undefined ? meta.realLinterData : node.realLinterData;
        const newIssues = node.errorCount + node.warningCount;

        // Trigger graph redraw to update badges
        scheduleGraphRedraw();

        // Auto-refresh inspector if this node is selected
        if (_selectedNodeId && _selectedNodeId.replace(/\\/g, '/') === normalId) {
          setTimeout(() => inspectNode(_selectedNodeId), 300);
        }

        // Notification: only when new issues appear (avoid spam on every save)
        if (typeof Notifications !== 'undefined' && newIssues > prevIssues) {
          const label = event.label || nodeId;
          const diff = newIssues - prevIssues;
          Notifications.addAlert('warning',
            `Auto-Scan: ${label} — ${newIssues} issues (+${diff} new)`,
            'Auto-Scan Agent');
          if (meta.errorCount > 0) Notifications.playBeep('warning');
        }

        // Toast feedback
        if (newIssues === 0 && prevIssues > 0) {
          _showAutoScanToast(event.label || nodeId, 0, 'clean');
        } else if (newIssues > 0) {
          _showAutoScanToast(event.label || nodeId, newIssues, meta.errorCount > 0 ? 'error' : 'warning');
        }
      }

      // Track in flow list but don't do the normal activity/notification handling
      event._ts = Date.now();
      flowEvents.unshift(event);
      while (flowEvents.length > 200) flowEvents.pop();
      if (currentView === 'flow') renderFlow();
      updateCounters();
      return; // ← early return: node_diagnostics is fully handled
    }

    // ★ Audit Result: live update from audit scan
    if (eventType === 'audit_result') {
      // SSE carries only summary — fetch full cached data from GET endpoint
      // so we have vulnerability details for Inspector panel
      fetch(`${CONFIG.API_BASE}/v1/canvas/audit`)
        .then((r) => r.ok ? r.json() : null)
        .then((fullData) => {
          if (fullData) _auditData = fullData;
          else {_auditData = {
            npm: event.npm || {},
            pip: event.pip || {},
            totalVulns: event.totalVulns || 0,
            critical: event.critical || 0,
            high: event.high || 0,
            timestamp: Date.now() / 1000,
          };}
          _injectAuditNode(_auditData);
          scheduleGraphRedraw();

          // Update button badge
          const btn = document.getElementById('auditBtn');
          if (btn) {
            btn.innerHTML = _auditData.totalVulns > 0
              ? `${SynapseIcons.html('shield', {size: 14})} ${_auditData.totalVulns} vulns`
              : `${SynapseIcons.html('shield', {size: 14})} No vulns`;
          }

          // Notification
          if (typeof Notifications !== 'undefined' && _auditData.totalVulns > 0) {
            Notifications.addAlert(
              _auditData.critical > 0 ? 'error' : 'warning',
              `Audit: ${_auditData.totalVulns} vulnerabilities (${_auditData.critical} critical, ${_auditData.high} high)`,
              'Security Audit'
            );
            if (_auditData.critical > 0) Notifications.playBeep('critical');
          }

          // Auto-refresh inspector if Dependencies node is selected
          if (_selectedNodeId === '__dependencies__') {
            _renderAuditInspector(_auditData);
          }
        })
        .catch(() => { /* ignore fetch errors */ });
      return;
    }

    // Track in activityNodes for graph highlighting
    if (nodeId) {
      const existing = activityNodes.get(nodeId) || { hits: 0 };
      existing.hits++;
      existing.lastType = eventType;
      existing.pulseUntil = Date.now() + 4000; // glow for 4 seconds
      existing.label = event.label || nodeId;
      activityNodes.set(nodeId, existing);
    }

    // ★ Auto-refresh inspector when the inspected file changes
    if (eventType === 'file_change' && nodeId && _selectedNodeId) {
      // Normalize both paths for comparison
      const normalNode = nodeId.replace(/\\/g, '/');
      const normalSelected = _selectedNodeId.replace(/\\/g, '/');
      if (normalNode === normalSelected) {
        // Check if this was a pending Quick Fix
        const wasQuickFix = (_pendingFixFile && _pendingFixFile.replace(/\\/g, '/') === normalNode);
        _clearPendingFix();
        // Debounce: wait 800ms for the tool to flush writes, then reload
        setTimeout(() => {
          inspectNode(_selectedNodeId);
          if (wasQuickFix) {
            // Show success feedback after inspector reloads
            setTimeout(() => {
              _showTerminalFeedback('Fix applicato! File aggiornato.', '', 'success', [
                { label: `${SynapseIcons.html('refresh', {size: 14})  } Ri-scansiona progetto`, action: 'rescan' },
                { label: `${SynapseIcons.html('folder', {size: 14})  } Aggiorna grafo`, action: 'refresh' },
              ]);
            }, 500);
          }
        }, 800);
      }
    }

    // Send live events to Notification Center
    if (typeof Notifications !== 'undefined') {
      const label = event.label || nodeId || 'unknown';
      if (eventType === 'node_error') {
        const msg = (event.meta && event.meta.message) ? event.meta.message : 'Error detected';
        Notifications.addAlert('error', `Live Error: ${  label  } -- ${  msg.substring(0, 100)}`, 'Canvas SSE');
        Notifications.playBeep('critical');
        Notifications.sendDesktop('Live Error', `${label  }: ${  msg.substring(0, 60)}`);
      } else if (eventType === 'node_warning') {
        const wmsg = (event.meta && event.meta.message) ? event.meta.message : 'Warning detected';
        Notifications.addAlert('warning', `Live Warning: ${  label  } -- ${  wmsg.substring(0, 100)}`, 'Canvas SSE');
        Notifications.playBeep('warning');
      }
    }

    // Track in flow list
    event._ts = Date.now();
    flowEvents.unshift(event);
    while (flowEvents.length > 200) flowEvents.pop();

    // Update active view
    if (currentView === 'graph') scheduleGraphRedraw();
    if (currentView === 'flow') renderFlow();

    // Update counters
    updateCounters();
  }

  let _graphRedrawTimer = null;
  function scheduleGraphRedraw() {
    if (_graphRedrawTimer) return;
    _graphRedrawTimer = setTimeout(() => {
      _graphRedrawTimer = null;
      renderGraph();
    }, 300); // throttle redraws to ~3fps max
  }

  function updateCounters() {
    const now = Date.now();
    let activeCount = 0;
    activityNodes.forEach((v) => { if (v.pulseUntil > now) activeCount++; });
    const counterEl = document.getElementById('canvasActiveCount');
    if (counterEl) counterEl.textContent = `${activeCount  } active`;
    const flowCountEl = document.getElementById('canvasFlowCount');
    if (flowCountEl) flowCountEl.textContent = `${flowEvents.length  } events`;
  }

  // ---- NODE INSPECTOR (click-to-inspect) ------------------------------------

  function inspectNode(nodeId) {
    _selectedNodeId = nodeId;
    renderGraph(); // re-render to highlight selected node

    // Special handling for audit Dependencies node
    if (nodeId === '__dependencies__') {
      if (_auditData) {
        _renderAuditInspector(_auditData);
      } else {
        // No audit data yet — run the audit
        runAudit();
      }
      return;
    }

    // Show loading state in inspector panel
    _ensureInspectorPanel();
    const panel = document.getElementById('canvasInspectorPanel');
    panel.style.display = 'flex';
    panel.innerHTML = _inspectorShell(nodeId, '<div style="padding:24px;text-align:center;color:var(--text-tertiary);">Loading file info...</div>');

    // Fetch file info from backend
    fetch(`${CONFIG.API_BASE  }/debug/canvas/file-info?path=${  encodeURIComponent(nodeId)}`)
      .then((resp) => {
        if (!resp.ok) throw new Error(`HTTP ${  resp.status}`);
        return resp.json();
      })
      .then((info) => {
        _renderInspector(info);
      })
      .catch((err) => {
        panel.innerHTML = _inspectorShell(nodeId, `<div style="padding:24px;text-align:center;color:var(--accent-red);">Failed to load: ${  err.message  }</div>`);
      });
  }

  function closeInspector() {
    _selectedNodeId = null;
    const panel = document.getElementById('canvasInspectorPanel');
    if (panel) panel.style.display = 'none';
    renderGraph(); // re-render to remove highlight
  }

  // ---- AUDIT: vulnerability scan -------------------------------------------

  async function runAudit() {
    const btn = document.getElementById('auditBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `${SynapseIcons.html('shield', {size: 14})} Scanning...`;
    }

    try {
      const resp = await fetch(`${CONFIG.API_BASE}/v1/canvas/audit`, { method: 'POST' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      _auditData = data;

      // Add or update Dependencies node in graphData
      _injectAuditNode(data);
      renderGraph();

      // Auto-open the audit inspector
      _selectedNodeId = '__dependencies__';
      _renderAuditInspector(data);

      if (btn) {btn.innerHTML = data.totalVulns > 0
        ? `${SynapseIcons.html('shield', {size: 14})} ${data.totalVulns} vulns`
        : `${SynapseIcons.html('shield', {size: 14})} No vulns`;}
    } catch (err) {
      if (btn) btn.innerHTML = `${SynapseIcons.html('shield', {size: 14})} Audit failed`;
      // eslint-disable-next-line no-console
      console.error('Audit error:', err);
    } finally {
      if (btn) {
        btn.disabled = false;
        setTimeout(() => {
          if (btn) btn.innerHTML = `${SynapseIcons.html('shield', {size: 14})} Audit`;
        }, 8000);
      }
    }
  }

  function _injectAuditNode(auditData) {
    if (!graphData || !graphData.nodes) return;
    // Remove existing audit node if present
    graphData.nodes = graphData.nodes.filter((n) => n.id !== '__dependencies__');

    const totalVulns = auditData.totalVulns || 0;
    const critical = auditData.critical || 0;
    const high = auditData.high || 0;

    graphData.nodes.push({
      id: '__dependencies__',
      label: `${SynapseIcons.html('package', {size: 14})  } Dependencies`,
      group: '__audit__',
      extension: '',
      size: 2000,
      errorCount: critical + high,
      warningCount: totalVulns - critical - high,
      issueCount: totalVulns,
      fixableCount: 0,
      linter: 'audit',
      realLinterData: true,
      _isAuditNode: true,
    });
  }

  function _renderAuditInspector(data) {
    _ensureInspectorPanel();
    const panel = document.getElementById('canvasInspectorPanel');
    if (!panel) return;
    panel.style.display = 'flex';

    let body = '';

    // Summary section
    body += '<div class="canvas-inspector-meta">';
    body += `<div class="canvas-inspector-meta-row"><span class="meta-label">Total Vulnerabilities</span><span class="meta-value audit-total">${data.totalVulns || 0}</span></div>`;
    if (data.critical) body += `<div class="canvas-inspector-meta-row"><span class="meta-label">${SynapseIcons.html('dot-red', {size: 14})} Critical</span><span class="meta-value" style="color:#F53F3F;font-weight:700;">${data.critical}</span></div>`;
    if (data.high) body += `<div class="canvas-inspector-meta-row"><span class="meta-label">${SynapseIcons.html('dot-yellow', {size: 14, color: '#FF7D00'})} High</span><span class="meta-value" style="color:#FF7D00;font-weight:700;">${data.high}</span></div>`;
    const moderate = (data.npm?.moderate || 0) + (data.pip?.moderate || 0);
    const low = (data.npm?.low || 0) + (data.pip?.low || 0);
    if (moderate) body += `<div class="canvas-inspector-meta-row"><span class="meta-label">${SynapseIcons.html('dot-yellow', {size: 14})} Moderate</span><span class="meta-value" style="color:#FAAD14;">${moderate}</span></div>`;
    if (low) body += `<div class="canvas-inspector-meta-row"><span class="meta-label">${SynapseIcons.html('dot-green', {size: 14})} Low</span><span class="meta-value" style="color:#52C41A;">${low}</span></div>`;
    if (data.timestamp) {
      body += `<div class="canvas-inspector-meta-row"><span class="meta-label">Scanned</span><span class="meta-value">${new Date(data.timestamp * 1000).toLocaleString()}</span></div>`;
    }
    body += '</div>';

    // npm audit section
    if (data.npm && data.npm.available) {
      body += '<div class="canvas-inspector-section">';
      body += '<div class="canvas-inspector-section-title" style="display:flex;align-items:center;justify-content:space-between;">';
      body += `<span>${SynapseIcons.html('package', {size: 14})} npm audit <span class="diag-count ${data.npm.total > 0 ? 'diag-error' : 'diag-info'}">${data.npm.total}</span></span>`;
      if (data.npm.total > 0 && data.npm.fixCmd) {
        body += `<button class="pkg-install-btn" onclick="SynapseApp.tabs.canvas._sendToTerminal('${_escHtml(data.npm.fixCmd)}')">${SynapseIcons.html('wrench', {size: 14})} ${_escHtml(data.npm.fixCmd)}</button>`;
      }
      body += '</div>';

      if (data.npm.vulnerabilities && data.npm.vulnerabilities.length) {
        data.npm.vulnerabilities.forEach((v) => {
          const sevClass = v.severity === 'critical' ? 'audit-sev-critical'
            : v.severity === 'high' ? 'audit-sev-high'
            : v.severity === 'moderate' ? 'audit-sev-moderate' : 'audit-sev-low';
          body += `<div class="audit-vuln-row ${sevClass}">`;
          body += `<span class="audit-vuln-pkg">${_escHtml(v.package)}</span>`;
          body += `<span class="audit-vuln-sev">${v.severity}</span>`;
          body += `<span class="audit-vuln-title">${_escHtml(v.title)}</span>`;
          if (v.fixAvailable) body += '<span class="diag-fixable-badge" title="Fix available">✓fix</span>';
          if (v.isDirect) body += '<span class="audit-direct-badge">direct</span>';
          body += '</div>';
        });
      } else {
        body += `<div style="color:var(--accent-green);font-size:0.75rem;padding:4px 0;">${SynapseIcons.html('check', {size: 14})} No npm vulnerabilities found</div>`;
      }
      body += '</div>';
    } else if (data.npm) {
      body += '<div class="canvas-inspector-section">';
      body += `<div class="canvas-inspector-section-title">${SynapseIcons.html('package', {size: 14})} npm audit</div>`;
      body += `<div style="font-size:0.72rem;color:var(--text-tertiary);padding:4px 0;">${_escHtml(data.npm.reason || 'Not available')}</div>`;
      body += '</div>';
    }

    // pip audit section
    if (data.pip && data.pip.available) {
      body += '<div class="canvas-inspector-section">';
      body += '<div class="canvas-inspector-section-title" style="display:flex;align-items:center;justify-content:space-between;">';
      body += `<span>PY pip-audit <span class="diag-count ${data.pip.total > 0 ? 'diag-error' : 'diag-info'}">${data.pip.total}</span></span>`;
      if (data.pip.total > 0 && data.pip.fixCmd) {
        body += `<button class="pkg-install-btn" onclick="SynapseApp.tabs.canvas._sendToTerminal('${_escHtml(data.pip.fixCmd)}')">${SynapseIcons.html('wrench', {size: 14})} ${_escHtml(data.pip.fixCmd)}</button>`;
      }
      body += '</div>';

      if (data.pip.vulnerabilities && data.pip.vulnerabilities.length) {
        data.pip.vulnerabilities.forEach((v) => {
          body += '<div class="audit-vuln-row audit-sev-high">';
          body += `<span class="audit-vuln-pkg">${_escHtml(v.package)}</span>`;
          body += `<span class="audit-vuln-sev">${v.severity}</span>`;
          body += `<span class="audit-vuln-title">${_escHtml(v.title)}</span>`;
          if (v.fixAvailable) body += '<span class="diag-fixable-badge" title="Fix available">✓fix</span>';
          body += '</div>';
        });
      } else {
        body += `<div style="color:var(--accent-green);font-size:0.75rem;padding:4px 0;">${SynapseIcons.html('check', {size: 14})} No Python vulnerabilities found</div>`;
      }
      body += '</div>';
    } else if (data.pip) {
      body += '<div class="canvas-inspector-section">';
      body += `<div class="canvas-inspector-section-title">PY pip-audit</div>`;
      body += `<div style="font-size:0.72rem;color:var(--text-tertiary);padding:4px 0;">${_escHtml(data.pip.reason || 'Not available')}</div>`;
      if (data.pip.reason && data.pip.reason.includes('not installed')) {
        body += '<button class="pkg-install-btn" onclick="SynapseApp.tabs.canvas._sendToTerminal(\'pip install pip-audit\')">⬇ pip install pip-audit</button>';
      }
      body += '</div>';
    }

    // Force fix section
    if (data.totalVulns > 0) {
      body += '<div class="canvas-inspector-section">';
      body += `<div class="canvas-inspector-section-title">${SynapseIcons.html('wrench', {size: 14})} Fix Actions</div>`;
      body += '<div class="pkg-suggestion-actions" style="flex-direction:column;gap:6px;">';
      if (data.npm && data.npm.available && data.npm.total > 0) {
        body += `<button class="pkg-install-btn" style="width:100%;" onclick="SynapseApp.tabs.canvas._sendToTerminal('npm audit fix')">npm audit fix</button>`;
        body += `<button class="pkg-install-btn" style="width:100%;opacity:0.7;" onclick="SynapseApp.tabs.canvas._sendToTerminal('npm audit fix --force')" title="${SynapseIcons.html('warning', {size: 12})} May install semver-major updates">npm audit fix --force (breaking changes)</button>`;
      }
      if (data.pip && data.pip.available && data.pip.total > 0) {
        body += `<button class="pkg-install-btn" style="width:100%;" onclick="SynapseApp.tabs.canvas._sendToTerminal('pip-audit --fix')">pip-audit --fix</button>`;
      }
      body += '</div>';
      body += '</div>';
    }

    panel.innerHTML = _inspectorShell('__dependencies__', body);
  }

  function _ensureInspectorPanel() {
    if (document.getElementById('canvasInspectorPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'canvasInspectorPanel';
    panel.className = 'canvas-inspector-panel';
    panel.style.display = 'none';
    const wrap = document.getElementById('canvasGraphWrap');
    if (wrap && wrap.parentElement) {
      wrap.parentElement.appendChild(panel);
    }
  }

  function _inspectorShell(nodeId, bodyHtml) {
    const node = graphData.nodes.find((n) => { return n.id === nodeId; });
    const name = node ? node.label : nodeId;
    const groupBadge = node ? `<span class="canvas-inspector-group" style="background:${  groupColor(node.group)  }18;color:${  groupColor(node.group)  };border:1px solid ${  groupColor(node.group)  }44;">${  node.group  }</span>` : '';

    return `<div class="canvas-inspector-header">` +
      `<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">` +
        `<span class="canvas-inspector-title">${  name  }</span>${ 
        groupBadge 
      }</div>` +
      `<button class="btn btn-ghost btn-sm canvas-inspector-close" onclick="SynapseApp.tabs.canvas.closeInspector()" title="Close">&times;</button>` +
    `</div>` +
    `<div class="canvas-inspector-body">${  bodyHtml  }</div>`;
  }

  function _renderInspector(info) {
    _lastInspectorInfo = info; // cache for prompt generation
    const panel = document.getElementById('canvasInspectorPanel');
    if (!panel) return;

    // File metadata section
    let meta = '<div class="canvas-inspector-meta">';
    meta += `<div class="canvas-inspector-meta-row"><span class="meta-label">Path</span><span class="meta-value">${  _escHtml(info.path)  }</span></div>`;
    meta += `<div class="canvas-inspector-meta-row"><span class="meta-label">Size</span><span class="meta-value">${  info.size > 1024 ? `${Math.round(info.size / 1024)  } KB` : `${info.size  } B`  }</span></div>`;
    meta += `<div class="canvas-inspector-meta-row"><span class="meta-label">Lines</span><span class="meta-value">${  info.lines  }</span></div>`;
    meta += `<div class="canvas-inspector-meta-row"><span class="meta-label">Extension</span><span class="meta-value">${  info.extension  }</span></div>`;
    const modDate = info.modified ? new Date(info.modified * 1000).toLocaleString() : 'unknown';
    meta += `<div class="canvas-inspector-meta-row"><span class="meta-label">Modified</span><span class="meta-value">${  modDate  }</span></div>`;
    meta += '</div>';

    // Dependencies section
    let deps = '';
    if (info.importsFrom.length || info.importedBy.length) {
      deps = '<div class="canvas-inspector-section">';
      deps += '<div class="canvas-inspector-section-title">Dependencies</div>';
      if (info.importsFrom.length) {
        deps += '<div style="margin-bottom:6px;"><span style="font-size:0.7rem;color:var(--text-tertiary);">Imports:</span></div>';
        info.importsFrom.forEach((dep) => {
          deps += `<span class="canvas-inspector-dep" onclick="SynapseApp.tabs.canvas.inspectNode('${  dep.replace(/'/g, "\\'")  }')">${  dep.split('/').pop()  }</span>`;
        });
      }
      if (info.importedBy.length) {
        deps += '<div style="margin-bottom:6px;margin-top:8px;"><span style="font-size:0.7rem;color:var(--text-tertiary);">Imported by:</span></div>';
        info.importedBy.forEach((dep) => {
          deps += `<span class="canvas-inspector-dep" onclick="SynapseApp.tabs.canvas.inspectNode('${  dep.replace(/'/g, "\\'")  }')">${  dep.split('/').pop()  }</span>`;
        });
      }
      deps += '</div>';
    }

    // Diagnostics section
    let diag = '';
    const hasRealLinter = info.lintTool && info.diagnosticsSource !== 'regex';
    const fixableCount = info.fixableCount || 0;

    if (info.diagnostics.length) {
      diag = '<div class="canvas-inspector-section">';
      diag += '<div class="canvas-inspector-section-title" style="display:flex;align-items:center;justify-content:space-between;">';
      diag += '<span>';
      diag += 'Diagnostics ';
      if (info.errorCount) diag += `<span class="diag-count diag-error">${  info.errorCount  } error${  info.errorCount > 1 ? 's' : ''  }</span> `;
      if (info.warningCount) diag += `<span class="diag-count diag-warning">${  info.warningCount  } warning${  info.warningCount > 1 ? 's' : ''  }</span> `;
      if (info.infoCount) diag += `<span class="diag-count diag-info">${  info.infoCount  } info</span> `;
      diag += '</span>';
      // ★ Smart Fix button — uses real linter --fix when available
      if (hasRealLinter) {
        diag += `<button class="smart-fix-btn" onclick="SynapseApp.tabs.canvas._smartFix('${  _escHtml(info.path).replace(/'/g, "\\'")  }')" title="${  info.lintTool.id  } --fix">`;
        diag += `${SynapseIcons.html('hammer', {size: 14})  } Smart Fix`;
        if (fixableCount > 0) diag += ` <span class="smart-fix-count">${  fixableCount  }</span>`;
        diag += '</button>';
      } else {
        diag += `<button class="auto-fix-all-btn" onclick="SynapseApp.tabs.canvas._autoFixAll('${  _escHtml(info.path).replace(/'/g, "\\'")  }')">${SynapseIcons.html('wrench', {size: 14})} Fix All</button>`;
      }
      // ★ Generate Copilot Prompt — builds a prompt from ALL diagnostics
      diag += `<button class="gen-prompt-btn" onclick="SynapseApp.tabs.canvas._genPromptAll('${  _escHtml(info.path).replace(/'/g, "\\'")  }')" title="Genera un prompt per Copilot con tutti gli errori">`;
      diag += `${SynapseIcons.html('robot', {size: 14})  } Prompt`;
      diag += '</button>';
      diag += '</div>';

      // Linter tool badge
      if (hasRealLinter) {
        diag += '<div class="smart-fix-tool-badge">';
        diag += `<span class="sft-icon">${SynapseIcons.html('search', {size: 12})}</span>`;
        diag += `<span class="sft-name">${  _escHtml(info.lintTool.id)  }</span>`;
        diag += '<span class="sft-label">real-time analysis</span>';
        if (fixableCount > 0) {
          diag += `<span class="sft-fixable">${  fixableCount  }/${  info.diagnostics.length  } auto-fixable</span>`;
        }
        diag += '</div>';
      } else if (info.diagnosticsSource === 'regex') {
        diag += '<div class="smart-fix-tool-badge sft-fallback">';
        diag += `<span class="sft-icon">${SynapseIcons.html('bolt', {size: 12})}</span>`;
        diag += '<span class="sft-name">regex scan</span>';
        diag += '<span class="sft-label">install a linter for smart detection</span>';
        diag += '</div>';
      }

      // Quick Fix bar (external tools) — loads suggestions dynamically
      diag += `<div class="quick-fix-bar" id="quickFixBar" data-filepath="${  _escHtml(info.path)  }">`;
      diag += '<div class="quick-fix-loading">Loading fix suggestions...</div>';
      diag += '</div>';

      // Smart fix result area
      diag += '<div class="smart-fix-result" id="smartFixResult" style="display:none;"></div>';

      // Auto-fix result area
      diag += '<div class="quick-fix-result" id="autoFixResult" style="display:none;"></div>';

      info.diagnostics.forEach((d) => {
        const sevClass = d.severity === 'error' ? 'diag-row-error' : d.severity === 'warning' ? 'diag-row-warning' : 'diag-row-info';
        diag += `<div class="canvas-inspector-diag-row ${  sevClass  }">`;
        diag += `<span class="diag-line" onclick="SynapseApp.tabs.canvas._scrollToLine(${  d.line  })" style="cursor:pointer;">L${  d.line  }</span>`;
        diag += `<span class="diag-sev">${  d.severity  }</span>`;
        diag += `<span class="diag-msg">${  _escHtml(d.message)  }</span>`;
        diag += `<span class="diag-src">${  _escHtml(d.source || '')  }</span>`;
        // Fixable badge
        if (d.fixable) {
          diag += '<span class="diag-fixable-badge" title="Auto-fixable">✓fix</span>';
        }
        // Per-row prompt button
        diag += `<span class="diag-prompt-btn" title="Genera prompt per questo errore" onclick="event.stopPropagation(); SynapseApp.tabs.canvas._genPromptSingle('${  
          _escHtml(info.path).replace(/'/g, "\\'")  }', ${  d.line  }, '${  
          _escHtml(d.message).replace(/'/g, "\\'")  }', '${  _escHtml(d.rule || d.source || '').replace(/'/g, "\\'")  }', '${  
          _escHtml(d.severity)  }')">${SynapseIcons.html('robot', {size: 12})}</span>`;
        diag += '</div>';
      });
      diag += '</div>';
    } else {
      diag = '<div class="canvas-inspector-section"><div class="canvas-inspector-section-title">Diagnostics</div>';
      if (hasRealLinter) {
        diag += `<div class="smart-fix-tool-badge"><span class="sft-icon">${SynapseIcons.html('check', {size: 12})}</span><span class="sft-name">${  _escHtml(info.lintTool.id)  }</span><span class="sft-label">no issues found</span></div>`;
      } else {
        diag += '<div style="color:var(--accent-green);font-size:0.75rem;padding:4px 0;">No issues found</div>';
      }
      diag += '</div>';
    }

    // Package Intelligence section — suggested packages based on diagnostics
    let pkgSec = '';
    if (info.suggestedPackages && info.suggestedPackages.length) {
      pkgSec = '<div class="canvas-inspector-section">';
      pkgSec += '<div class="canvas-inspector-section-title" style="display:flex;align-items:center;gap:6px;">';
      pkgSec += `<span>${SynapseIcons.html('package', {size: 14})} Suggested Packages</span>`;
      pkgSec += `<span class="diag-count diag-info">${  info.suggestedPackages.length  }</span>`;
      pkgSec += '</div>';

      info.suggestedPackages.forEach((s) => {
        const langIcon = s.lang === 'py' ? SynapseIcons.html('document', {size: 13, color: '#3572A5'}) : s.lang === 'css' ? SynapseIcons.html('palette', {size: 13, color: '#563D7C'}) : SynapseIcons.html('package', {size: 13});
        const installedBadge = s.installed
          ? '<span class="pkg-installed-badge">✓ installed</span>'
          : '';
        const stdlibBadge = s.isStdlib
          ? '<span class="pkg-stdlib-badge">stdlib</span>'
          : '';

        pkgSec += '<div class="pkg-suggestion-row">';

        // Package name + badges
        pkgSec += '<div class="pkg-suggestion-header">';
        pkgSec += `<span class="pkg-suggestion-icon">${  langIcon  }</span>`;
        pkgSec += `<span class="pkg-suggestion-name">${  _escHtml(s.pkg)  }</span>`;
        pkgSec += installedBadge + stdlibBadge;
        pkgSec += '</div>';

        // Why / explanation
        pkgSec += `<div class="pkg-suggestion-why">${  _escHtml(s.why)  }</div>`;

        // Actions row: install button + link
        pkgSec += '<div class="pkg-suggestion-actions">';
        if (s.installCmd && !s.installed && !s.isStdlib) {
          pkgSec += `<button class="pkg-install-btn" onclick="SynapseApp.tabs.canvas._sendToTerminal('${ 
            _escHtml(s.installCmd).replace(/'/g, "\\'")  }')">`;
          pkgSec += `⬇ ${  _escHtml(s.installCmd)  }</button>`;
        }
        if (s.url) {
          pkgSec += `<a class="pkg-link" href="${  _escHtml(s.url)  }" target="_blank" rel="noopener">docs ↗</a>`;
        }
        pkgSec += '</div>';

        pkgSec += '</div>';
      });

      pkgSec += '</div>';
    }

    // Code viewer section
    let code = '<div class="canvas-inspector-section">';
    code += '<div class="canvas-inspector-section-title">Source Code</div>';
    code += '<div class="canvas-inspector-code" id="canvasInspectorCode">';
    code += _renderCodeWithErrors(info.content, info.diagnostics, info.extension);
    code += '</div></div>';

    panel.innerHTML = _inspectorShell(info.path, meta + deps + diag + pkgSec + code);

    // Load Quick Fix suggestions after rendering
    if (info.diagnostics.length) {
      _loadFixSuggestions(info.path);
    }
  }

  // ---- QUICK FIX: Load, Render, Execute ------------------------------------

  function _loadFixSuggestions(filePath) {
    fetch(`${CONFIG.API_BASE  }/v1/canvas/quick-fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, action: 'suggest' }),
    })
    .then((resp) => { return resp.json(); })
    .then((data) => {
      _renderFixBar(data.suggestions || [], filePath, data.projectInfo || null);
    })
    .catch(() => {
      const bar = document.getElementById('quickFixBar');
      if (bar) bar.innerHTML = '<div class="quick-fix-error">Could not load suggestions</div>';
    });
  }

  function _renderFixBar(suggestions, filePath, projectInfo) {
    const bar = document.getElementById('quickFixBar');
    if (!bar) return;

    if (!suggestions.length) {
      bar.innerHTML = '<div class="quick-fix-empty">No auto-fix tools available for this file type</div>';
      return;
    }

    let html = `<div class="quick-fix-title">${SynapseIcons.html('bolt', {size: 14})} Quick Fix</div>`;

    // Project detection header
    if (projectInfo) {
      html += '<div class="quick-fix-project-info">';
      const badges = [];
      if (projectInfo.jsPackageManager) {
        badges.push(`<span class="qf-badge qf-badge-pm">${SynapseIcons.html('package', {size: 14})} ${  _escHtml(projectInfo.jsPackageManager)  }</span>`);
      }
      if (projectInfo.pyPackageManager) {
        badges.push(`<span class="qf-badge qf-badge-pm">PY ${  _escHtml(projectInfo.pyPackageManager)  }</span>`);
      }
      if (projectInfo.configuredTools && projectInfo.configuredTools.length) {
        const cfgC = projectInfo.configuredTools.length;
        badges.push(`<span class="qf-badge qf-badge-cfg" title="${  _escHtml(projectInfo.configuredTools.join(', '))  }">${SynapseIcons.html('gear', {size: 12})} ${  cfgC  } configured</span>`);
      }
      if (badges.length) {
        html += badges.join(' ');
      }
      html += '</div>';
    }

    html += '<div class="quick-fix-buttons">';

    suggestions.forEach((s) => {
      const isConfigured = s.configured;
      const isInProject = s.inProject;
      const isAvailable = s.available;

      // Priority class: configured > in-project > available > missing
      let itemClass = 'quick-fix-item';
      if (isConfigured) {
        itemClass += ' quick-fix-btn-configured';
      } else if (isInProject) {
        itemClass += ' quick-fix-btn-inproject';
      } else if (isAvailable) {
        itemClass += ' quick-fix-btn-available';
      } else {
        itemClass += ' quick-fix-btn-missing';
      }

      // Status badge
      let statusBadge = '';
      if (isConfigured && isAvailable) {
        statusBadge = `<span class="qf-status-badge qf-st-configured" title="Configured in project">${SynapseIcons.html('gear', {size: 12})}✓</span>`;
      } else if (isInProject && isAvailable) {
        statusBadge = `<span class="qf-status-badge qf-st-inproject" title="In devDependencies">${SynapseIcons.html('package', {size: 12})}✓</span>`;
      } else if (isAvailable) {
        statusBadge = '<span class="qf-status-badge qf-st-available" title="Available on system">✓</span>';
      } else if (isConfigured || isInProject) {
        statusBadge = `<span class="qf-status-badge qf-st-notinstalled" title="In project but not installed">${SynapseIcons.html('warning', {size: 12})}</span>`;
      } else {
        statusBadge = '<span class="qf-status-badge qf-st-missing" title="Not installed">✗</span>';
      }

      html += `<div class="${  itemClass  }">`;

      // Main fix button — always enabled, sends to terminal
      html += `<button class="quick-fix-btn" onclick="SynapseApp.tabs.canvas._runQuickFix('${ 
        _escHtml(s.id)  }', '${  _escHtml(filePath).replace(/'/g, "\\'")  }', '${ 
        _escHtml(s.display).replace(/'/g, "\\'")  }')">`;
      html += `<span class="quick-fix-icon">${  s.icon  }</span>`;
      html += `<span class="quick-fix-label">${  _escHtml(s.label)  }</span>`;
      html += statusBadge;
      html += '</button>';

      // Command preview — clickable to send to terminal
      html += `<div class="quick-fix-cmd quick-fix-cmd-click" title="Click to send to terminal" onclick="SynapseApp.tabs.canvas._sendToTerminal('${ 
        _escHtml(s.display).replace(/'/g, "\\'")  }')">` +
        `<span class="qf-terminal-icon">▶</span> ${  _escHtml(s.display)  }</div>`;

      // Install button if not available (sends install command to terminal)
      if (!isAvailable && s.installCmd) {
        html += `<button class="quick-fix-install-btn" onclick="SynapseApp.tabs.canvas._sendToTerminal('${ 
          _escHtml(s.installCmd).replace(/'/g, "\\'")  }')">`;
        html += `${SynapseIcons.html('package', {size: 14})} Install: <code>${  _escHtml(s.installCmd)  }</code>`;
        html += '</button>';
      }

      html += '</div>';
    });

    html += '</div>';

    // Result area (initially hidden)
    html += '<div class="quick-fix-result" id="quickFixResult" style="display:none;"></div>';

    bar.innerHTML = html;
  }

  // ---- Send command to VS Code terminal (or fallback to backend) ----

  /**
   * Detect if we're running inside a VS Code webview iframe.
   * In that case window.parent will relay postMessage to the extension host.
   */
  function _isInVSCodeWebview() {
    try {
      return window !== window.parent;
    } catch {
      return false;
    }
  }

  /**
   * Send a command to the VS Code terminal via the backend queue.
   * Works in BOTH browser mode and VS Code panel mode.
   * The VS Code extension polls /v1/terminal/pending every ~2 seconds.
   */
  tab._sendToTerminal = function(command, filePath) {
    // Track pending fix for auto-refresh feedback
    if (filePath) {
      _pendingFixFile = filePath;
      _clearPendingFixTimer();
      // Timeout: if no file_change arrives within 30s, clear pending state
      _pendingFixTimer = setTimeout(() => { _clearPendingFix(); }, 30000);
    }

    // Primary path: send to backend → extension picks it up → runs in terminal
    fetch('/v1/terminal/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    })
    .then((res) => {
      if (res.ok) {
        return res.json().then((data) => {
          _showTerminalFeedback('Inviato al terminale VS Code...', command, 'waiting');
          // Poll for ACK from the extension
          if (data.id) {
            _pollTerminalAck(data.id, command, filePath);
          }
        });
      } 
        _clearPendingFix();
        _clipboardFallback(command);
      
    })
    .catch(() => {
      _clearPendingFix();
      _clipboardFallback(command);
    });

    // Also try iframe postMessage as fast-path (panel mode)
    if (_isInVSCodeWebview()) {
      window.parent.postMessage({
        type: 'runInTerminal',
        command,
      }, '*');
    }
  };

  /**
   * Poll /v1/terminal/status/{id} until the command is acknowledged as executed.
   * Shows clear success/timeout feedback to the user with actionable next steps.
   */
  function _pollTerminalAck(cmdId, command, filePath) {
    const POLL_MS = 1500;
    const MAX_POLLS = 12; // ~18 seconds max
    let polls = 0;

    // Determine what kind of command this is for smart next-step actions
    const isInstall = /\b(npm|yarn|pnpm|pip)\s+(install|add|i)\b/i.test(command);
    const isLintFix = /\b(--fix|autofix|format)\b/i.test(command);

    const timer = setInterval(() => {
      polls++;
      fetch(`/v1/terminal/status/${  cmdId}`)
        .then((res) => { return res.ok ? res.json() : null; })
        .then((data) => {
          if (data && data.status === 'executed') {
            clearInterval(timer);

            if (filePath && _pendingFixFile && isLintFix) {
              // Lint fix — file will change, wait for file_change SSE
              _showTerminalFeedback(
                'Comando eseguito nel terminale ✓',
                'In attesa di aggiornamento file...',
                'success',
                []
              );
            } else {
              // Install or generic command — show actionable next steps
              _clearPendingFix();
              const actions = [];
              if (isInstall) {
                actions.push({ label: `${SynapseIcons.html('refresh', {size: 14})  } Ri-scansiona progetto`, action: 'rescan' });
                actions.push({ label: `${SynapseIcons.html('folder', {size: 14})  } Aggiorna grafo`, action: 'refresh' });
              } else if (isLintFix) {
                actions.push({ label: `${SynapseIcons.html('refresh', {size: 14})  } Ri-scansiona file`, action: 'rescan-file', file: filePath });
                actions.push({ label: `${SynapseIcons.html('folder', {size: 14})  } Aggiorna grafo`, action: 'refresh' });
              } else {
                actions.push({ label: `${SynapseIcons.html('folder', {size: 14})  } Aggiorna grafo`, action: 'refresh' });
              }
              _showTerminalFeedback(
                'Comando eseguito nel terminale ✓',
                command,
                'success',
                actions
              );
            }
          } else if (polls >= MAX_POLLS) {
            clearInterval(timer);
            _clearPendingFix();
            _showTerminalFeedback(
              'Controlla il terminale VS Code',
              command,
              'info',
              [{ label: `${SynapseIcons.html('folder', {size: 14})  } Aggiorna grafo`, action: 'refresh' }]
            );
          }
        })
        .catch(() => {
          if (polls >= MAX_POLLS) {
            clearInterval(timer);
            _clearPendingFix();
            _showTerminalFeedback(
              'Controlla il terminale VS Code',
              command,
              'info',
              [{ label: `${SynapseIcons.html('folder', {size: 14})  } Aggiorna grafo`, action: 'refresh' }]
            );
          }
        });
    }, POLL_MS);
  }

  function _clearPendingFixTimer() {
    if (_pendingFixTimer) { clearTimeout(_pendingFixTimer); _pendingFixTimer = null; }
  }
  function _clearPendingFix() {
    _pendingFixFile = null;
    _clearPendingFixTimer();
  }

  function _clipboardFallback(command) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(command).then(() => {
        _showTerminalFeedback('Copied to clipboard — paste in terminal', command, 'info');
      });
    } else {
      _showTerminalFeedback('Copy this command:', command, 'info');
    }
  }

  tab._runQuickFix = function(toolId, filePath, displayCmd) {
    const command = displayCmd || toolId;
    tab._sendToTerminal(command, filePath);
  };

  // ---- Smart Fix: real linter detect → fix → verify ----

  tab._smartFix = function(filePath) {
    const resultDiv = document.getElementById('smartFixResult');
    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.className = 'smart-fix-result smart-fix-running';
      resultDiv.innerHTML =
        `<div class="smart-fix-header">${SynapseIcons.html('hammer', {size: 14})} Smart Fix in corso...</div>` +
        '<div class="smart-fix-steps">' +
          '<div class="smart-fix-step active"><span class="sfs-dot"></span> DETECT — analisi con linter reale</div>' +
          '<div class="smart-fix-step"><span class="sfs-dot"></span> FIX — applicazione correzioni automatiche</div>' +
          '<div class="smart-fix-step"><span class="sfs-dot"></span> VERIFY — verifica risultato</div>' +
        '</div>' +
        '<div class="quick-fix-waiting-bar"><div class="quick-fix-waiting-progress"></div></div>';
    }

    fetch(`${CONFIG.API_BASE  }/v1/canvas/smart-fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, action: 'fix' }),
    })
    .then((resp) => { return resp.json(); })
    .then((data) => {
      if (data.error) {
        _showSmartFixResult(`${SynapseIcons.html('warning', {size: 14, color: '#F53F3F'})} ${  data.error}`, null, 'failure');
        return;
      }
      if (!data.success && data.message) {
        _showSmartFixResult(`${SynapseIcons.html('warning', {size: 14})} ${  data.message}`, data, 'warning');
        return;
      }
      // Success! Show the DETECT → FIX → VERIFY pipeline result
      _showSmartFixResult(data.message || `${SynapseIcons.html('check', {size: 14})} Fix completato`, data, 'success');
      // Refresh inspector to show updated diagnostics
      setTimeout(() => {
        if (_selectedNodeId) inspectNode(_selectedNodeId);
      }, 500);
    })
    .catch((err) => {
      _showSmartFixResult(`${SynapseIcons.html('warning', {size: 14, color: '#F53F3F'})} Errore: ${  err.message}`, null, 'failure');
    });
  };

  function _showSmartFixResult(title, data, type) {
    const resultDiv = document.getElementById('smartFixResult');
    if (!resultDiv) return;
    resultDiv.style.display = 'block';
    resultDiv.className = `smart-fix-result smart-fix-${  type}`;

    let html = `<div class="smart-fix-header">${  title  }</div>`;

    if (data) {
      // Pipeline summary
      html += '<div class="smart-fix-summary">';
      if (data.tool) {
        html += `<span class="sfsum-tool">${SynapseIcons.html('wrench', {size: 14})} ${  _escHtml(data.tool.id)  }</span>`;
      }
      if (typeof data.beforeCount === 'number') {
        html += `<span class="sfsum-before">${  data.beforeCount  } issues</span>`;
        html += '<span class="sfsum-arrow">→</span>';
        html += `<span class="sfsum-after">${  data.afterCount  } issues</span>`;
      }
      if (data.fixedCount > 0) {
        html += `<span class="sfsum-fixed">${SynapseIcons.html('check', {size: 14})} ${  data.fixedCount  } fixed</span>`;
      }
      html += '</div>';

      // Pipeline steps visualization
      html += '<div class="smart-fix-steps done">';
      html += `<div class="smart-fix-step completed"><span class="sfs-dot"></span> DETECT — ${  data.beforeCount || 0  } issues found</div>`;
      html += `<div class="smart-fix-step completed"><span class="sfs-dot"></span> FIX — ${  data.tool.id  } --fix executed</div>`;
      html += `<div class="smart-fix-step completed"><span class="sfs-dot"></span> VERIFY — ${  data.afterCount || 0  } issues remaining</div>`;
      html += '</div>';

      // Remaining diagnostics preview
      if (data.diagnostics && data.diagnostics.length) {
        html += '<div class="smart-fix-remaining">';
        html += `<div class="sfr-title">${SynapseIcons.html('warning', {size: 14})} ${  data.diagnostics.length  } issue${  data.diagnostics.length !== 1 ? 's' : ''  } remaining (require manual fix):</div>`;
        data.diagnostics.slice(0, 10).forEach((d) => {
          html += `<div class="sfr-item"><span class="sfr-line">L${  d.line  }</span> <span class="sfr-msg">${  _escHtml(d.message)  }</span></div>`;
        });
        if (data.diagnostics.length > 10) {
          html += `<div class="sfr-more">... and ${  data.diagnostics.length - 10  } more</div>`;
        }
        html += '</div>';
      }
    }

    resultDiv.innerHTML = html;

    // Pipe summary to Command Runner panel (if available)
    if (data && window.CommandRunner && typeof window.CommandRunner.showOutput === 'function') {
      let summary = '';
      if (data.tool) summary += `[${  data.tool.id  }] `;
      summary += `${data.beforeCount || 0  } issues \u2192 ${  data.afterCount || 0  } remaining`;
      if (data.fixedCount > 0) summary += ` (${  data.fixedCount  } fixed)`;
      if (data.diagnostics && data.diagnostics.length) {
        summary += '\n\nRemaining:\n';
        data.diagnostics.slice(0, 8).forEach((d) => {
          summary += `  L${  d.line  }: ${  d.message  }\n`;
        });
      }
      window.CommandRunner.showOutput(
        `Smart Fix: ${  title.replace(/[\u274C\u2705\u26A0] ?/, '')}`,
        summary,
        type === 'success' ? 'stdout' : 'stderr'
      );
    }
  }

  // ---- Auto-Fix: backend resolves diagnostics directly ----

  tab._autoFixAll = function(filePath) {
    _autoFix(filePath, null);
  };

  tab._autoFixOne = function(filePath, fixType) {
    _autoFix(filePath, fixType);
  };

  function _autoFix(filePath, fixType) {
    const resultDiv = document.getElementById('autoFixResult');
    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.className = 'quick-fix-result quick-fix-waiting';
      resultDiv.innerHTML = `<div class="quick-fix-result-header">${SynapseIcons.html('hourglass', {size: 14})} Applying fix...</div>` +
        '<div class="quick-fix-waiting-bar"><div class="quick-fix-waiting-progress"></div></div>';
    }

    const body = { filePath };
    if (fixType) body.fixType = fixType;

    fetch(`${CONFIG.API_BASE  }/v1/canvas/auto-fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    .then((resp) => { return resp.json(); })
    .then((data) => {
      if (data.error) {
        _showAutoFixResult(`${SynapseIcons.html('warning', {size: 14, color: '#F53F3F'})} ${  data.error}`, [], 'failure');
        return;
      }
      if (!data.applied || !data.applied.length) {
        _showAutoFixResult(`${SynapseIcons.html('info', {size: 14})} ${  data.message || 'Nessun fix applicabile'}`, [], 'info');
        return;
      }
      // Success! Show result and refresh inspector
      _showAutoFixResult(
        `${SynapseIcons.html('check', {size: 14})} ${  data.message}`,
        data.applied,
        'success'
      );
      // Refresh inspector to show updated content & diagnostics
      setTimeout(() => {
        if (_selectedNodeId) inspectNode(_selectedNodeId);
      }, 500);
    })
    .catch((err) => {
      _showAutoFixResult(`${SynapseIcons.html('warning', {size: 14, color: '#F53F3F'})} Errore: ${  err.message}`, [], 'failure');
    });
  }

  function _showAutoFixResult(title, applied, type) {
    const resultDiv = document.getElementById('autoFixResult');
    if (!resultDiv) return;
    resultDiv.style.display = 'block';
    const cls = type === 'success' ? 'quick-fix-success' : type === 'failure' ? 'quick-fix-failure' : 'quick-fix-info';
    resultDiv.className = `quick-fix-result ${  cls}`;
    let html = `<div class="quick-fix-result-header">${  title  }</div>`;
    if (applied && applied.length) {
      html += '<div class="auto-fix-details">';
      applied.forEach((fix) => {
        const icon = fix.action === 'delete' ? SynapseIcons.html('trash', {size: 14}) : SynapseIcons.html('pencil', {size: 14});
        html += `<div class="auto-fix-item">${  icon  } <strong>L${  fix.line  }</strong>: ${  _escHtml(fix.message)  }</div>`;
      });
      html += '</div>';
    }
    resultDiv.innerHTML = html;
  }

  tab._installTool = function(installCmd) {
    tab._sendToTerminal(installCmd);
  };

  // ── Auto-Scan Agent Toast ──────────────────────────────────────────────────
  let _autoScanToastTimer = null;
  function _showAutoScanToast(fileName, issueCount, severity) {
    // Debounce: avoid rapid toasts when multiple files change at once
    if (_autoScanToastTimer) clearTimeout(_autoScanToastTimer);
    _autoScanToastTimer = setTimeout(() => { _autoScanToastTimer = null; }, 3000);

    const container = document.getElementById('canvasGraphWrap') || document.body;
    // Remove old toast if present
    const old = container.querySelector('.auto-scan-toast');
    if (old) old.remove();

    const icon = severity === 'clean' ? SynapseIcons.html('check', {size: 14, color: 'var(--accent-green)'}) : severity === 'error' ? SynapseIcons.html('dot-red', {size: 14}) : SynapseIcons.html('dot-yellow', {size: 14});
    const label = severity === 'clean'
      ? `${fileName} — Clean! No issues.`
      : `${fileName} — ${issueCount} issue${issueCount !== 1 ? 's' : ''} found`;
    const bgColor = severity === 'clean' ? '#00B42A22' : severity === 'error' ? '#F53F3F22' : '#FF7D0022';
    const borderColor = severity === 'clean' ? '#00B42A66' : severity === 'error' ? '#F53F3F66' : '#FF7D0066';
    const textColor = severity === 'clean' ? '#00B42A' : severity === 'error' ? '#F53F3F' : '#FF7D00';

    const toast = document.createElement('div');
    toast.className = 'auto-scan-toast';
    toast.style.cssText = `
      position: absolute; top: 12px; right: 12px; z-index: 100;
      background: ${bgColor}; border: 1px solid ${borderColor};
      border-radius: 8px; padding: 8px 14px; color: ${textColor};
      font-size: 12px; font-weight: 600; font-family: var(--font-mono);
      backdrop-filter: blur(8px); pointer-events: none;
      animation: fadeInOut 4s ease forwards;
    `;
    toast.innerHTML = `<span style="margin-right:6px">${icon}</span>${SynapseIcons.html('search', {size: 14})} Auto-Scan: ${_escHtml(label)}`;
    container.style.position = container.style.position || 'relative';
    container.appendChild(toast);

    // Add CSS animation if not already present
    if (!document.getElementById('autoScanToastStyle')) {
      const style = document.createElement('style');
      style.id = 'autoScanToastStyle';
      style.textContent = `
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(-8px); }
          10% { opacity: 1; transform: translateY(0); }
          80% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-4px); }
        }
      `;
      document.head.appendChild(style);
    }

    // Remove after animation
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4200);
  }

  function _showTerminalFeedback(title, command, type, actions) {
    const resultDiv = document.getElementById('quickFixResult');
    if (!resultDiv) return;
    resultDiv.style.display = 'block';
    const cls = `quick-fix-${  type === 'success' ? 'success' : type === 'waiting' ? 'waiting' : 'info'}`;
    resultDiv.className = `quick-fix-result ${  cls}`;
    const icon = type === 'success' ? SynapseIcons.html('check', {size: 14}) : type === 'waiting' ? SynapseIcons.html('hourglass', {size: 14}) : SynapseIcons.html('info', {size: 14});
    let html = `<div class="quick-fix-result-header">${  icon  } ${  _escHtml(title)  }`;
    // Add dismiss button for success and info states
    if (type === 'success' || type === 'info') {
      html += '<button class="quick-fix-dismiss" onclick="this.closest(\'.quick-fix-result\').style.display=\'none\'" title="Chiudi">✕</button>';
    }
    html += '</div>';
    if (command) {
      html += `<pre class="quick-fix-output">${  _escHtml(command)  }</pre>`;
    }
    if (type === 'waiting') {
      html += '<div class="quick-fix-waiting-bar"><div class="quick-fix-waiting-progress"></div></div>';
    }
    // Action buttons — "Cosa vuoi fare adesso?"
    if (actions && actions.length) {
      html += '<div class="quick-fix-actions">';
      html += '<div class="quick-fix-actions-label">Prossimo passo:</div>';
      actions.forEach((a) => {
        html += `<button class="quick-fix-action-btn" onclick="SynapseApp.tabs.canvas._handleFixAction('${  
          _escHtml(a.action)  }', '${  _escHtml(a.file || '')  }')">${  a.label  }</button>`;
      });
      html += '</div>';
    }
    // Auto-hide success after 15 seconds (longer to give time for actions)
    if (type === 'success') {
      setTimeout(() => {
        if (resultDiv.classList.contains('quick-fix-success')) {
          resultDiv.style.display = 'none';
        }
      }, 15000);
    }
    resultDiv.innerHTML = html;
  }

  /**
   * Handle post-fix action buttons: rescan, refresh graph, re-inspect file.
   */
  tab._handleFixAction = function(action, filePath) {
    const resultDiv = document.getElementById('quickFixResult');
    if (action === 'refresh') {
      // Reload the whole graph
      loadGraph();
      if (resultDiv) resultDiv.style.display = 'none';
    } else if (action === 'rescan') {
      // Trigger full project rescan via the backend, then reload graph
      _showTerminalFeedback(`${SynapseIcons.html('refresh', {size: 14})} Ri-scansione in corso...`, '', 'waiting');
      fetch(`${CONFIG.API_BASE  }/v1/ops/scan-all`, { method: 'POST' })
        .then((res) => {
          if (res.ok) {
            // Wait a moment for the scan to complete, then refresh
            setTimeout(() => {
              loadGraph();
              if (_selectedNodeId) inspectNode(_selectedNodeId);
              _showTerminalFeedback('Scansione completata ✓', 'Grafo aggiornato con i nuovi risultati', 'success', []);
            }, 3000);
          } else {
            // Fallback: just refresh the graph
            loadGraph();
            if (resultDiv) resultDiv.style.display = 'none';
          }
        })
        .catch(() => {
          loadGraph();
          if (resultDiv) resultDiv.style.display = 'none';
        });
    } else if (action === 'rescan-file' && filePath) {
      // Re-inspect the specific file
      loadGraph();
      setTimeout(() => {
        if (_selectedNodeId) inspectNode(_selectedNodeId);
        if (resultDiv) resultDiv.style.display = 'none';
      }, 1500);
    }
  };

  // ── Prompt Generator — builds Copilot prompts from diagnostics ──────────

  /**
   * Generate a prompt for ALL diagnostics in the current file.
   * Copies to clipboard and shows a toast.
   */
  tab._genPromptAll = function(filePath) {
    const info = _lastInspectorInfo;
    if (!info || !info.diagnostics || !info.diagnostics.length) {
      _promptCopyToast('Nessun errore da correggere', false);
      return;
    }

    const errCount = info.errorCount || 0;
    const warnCount = info.warningCount || 0;
    const linter = (info.lintTool && info.lintTool.id) ? info.lintTool.id : 'linter';

    let prompt = `Fix all ${  linter  } errors in the file \`${  filePath  }\`.\n\n`;
    prompt += `The file has ${  errCount  } error${  errCount !== 1 ? 's' : ''  }`;
    if (warnCount) prompt += ` and ${  warnCount  } warning${  warnCount !== 1 ? 's' : ''  }`;
    prompt += `. Here are the diagnostics:\n\n`;

    info.diagnostics.forEach((d) => {
      const rule = d.rule || d.source || '';
      prompt += `- **Line ${  d.line  }** (${  d.severity  })`;
      if (rule) prompt += ` [${  rule  }]`;
      prompt += `: ${  d.message  }\n`;
    });

    prompt += '\nPlease fix each issue while keeping the existing functionality intact. ';
    prompt += 'Show the corrected code for each change.';

    _copyPromptToClipboard(prompt);
  };

  /**
   * Generate a prompt for a SINGLE diagnostic.
   */
  tab._genPromptSingle = function(filePath, line, message, rule, severity) {
    let prompt = `Fix the ${  severity  } in the file \`${  filePath  }\` at line ${  line  }.\n\n`;
    prompt += `**Error**: ${  message  }\n`;
    if (rule) prompt += `**Rule**: ${  rule  }\n`;
    prompt += `\nPlease show the corrected code for line ${  line  } and surrounding context.`;

    _copyPromptToClipboard(prompt);
  };

  /**
   * Copy prompt to clipboard and show feedback toast.
   */
  function _copyPromptToClipboard(prompt) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(prompt).then(() => {
        _promptCopyToast('Prompt copiato! Incollalo in Copilot Chat', true);
      }).catch(() => {
        _promptCopyFallback(prompt);
      });
    } else {
      _promptCopyFallback(prompt);
    }
  }

  function _promptCopyFallback(prompt) {
    // Fallback: show prompt in a modal for manual copy
    const resultDiv = document.getElementById('quickFixResult') || document.getElementById('autoFixResult');
    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.className = 'quick-fix-result quick-fix-info';
      resultDiv.innerHTML =
        `<div class="quick-fix-result-header">${SynapseIcons.html('robot', {size: 14})} Prompt generato <button class="quick-fix-dismiss" onclick="this.closest('.quick-fix-result').style.display='none'" title="Chiudi">✕</button></div>` +
        `<pre class="quick-fix-output" style="user-select:all;cursor:text;">${  _escHtml(prompt)  }</pre>` +
        `<div class="quick-fix-actions-label">Seleziona tutto e copia manualmente (Ctrl+C)</div>`;
    }
  }

  function _promptCopyToast(message, success) {
    const existing = document.querySelector('.prompt-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `prompt-toast${  success ? ' prompt-toast-success' : ' prompt-toast-error'}`;
    toast.innerHTML = (success ? `${SynapseIcons.html('check', {size: 14})  } ` : `${SynapseIcons.html('warning', {size: 14})  } `) + _escHtml(message);
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => { toast.classList.add('prompt-toast-show'); });
    // Remove after 3s
    setTimeout(() => {
      toast.classList.remove('prompt-toast-show');
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400);
    }, 3000);
  }

  function _renderCodeWithErrors(content, diagnostics) {
    const lines = content.split('\n');
    // Build error map: line -> [diagnostics]
    const errorMap = {};
    diagnostics.forEach((d) => {
      if (!errorMap[d.line]) errorMap[d.line] = [];
      errorMap[d.line].push(d);
    });

    let html = '<table class="code-table"><tbody>';
    const maxLines = Math.min(lines.length, 500); // cap at 500 lines for performance
    for (let i = 0; i < maxLines; i++) {
      const lineNum = i + 1;
      const lineErrors = errorMap[lineNum];
      const hasError = lineErrors && lineErrors.some((d) => { return d.severity === 'error'; });
      const hasWarning = lineErrors && lineErrors.some((d) => { return d.severity === 'warning'; });
      const hasInfo = lineErrors && !hasError && !hasWarning;
      const rowClass = hasError ? 'code-line-error' : hasWarning ? 'code-line-warning' : hasInfo ? 'code-line-info' : '';

      html += `<tr class="code-line ${  rowClass  }" id="code-line-${  lineNum  }">`;
      html += `<td class="code-gutter">${  lineNum  }</td>`;
      html += `<td class="code-content">${  _escHtml(lines[i])}`;

      // Inline error annotations
      if (lineErrors) {
        lineErrors.forEach((d) => {
          const sevIcon = d.severity === 'error' ? '!!' : d.severity === 'warning' ? '!' : 'i';
          const sevClass = `code-annotation-${  d.severity}`;
          html += `<span class="code-annotation ${  sevClass  }" title="[${  d.source  }] ${  _escHtml(d.message)  }">`;
          html += ` ${  sevIcon  } ${  _escHtml(d.message)}`;
          html += '</span>';
        });
      }

      html += '</td></tr>';
    }
    if (lines.length > 500) {
      html += `<tr><td class="code-gutter">...</td><td class="code-content" style="color:var(--text-tertiary);">(${  lines.length - 500  } more lines truncated)</td></tr>`;
    }
    html += '</tbody></table>';
    return html;
  }

  // Scroll to a specific line in the code viewer
  tab._scrollToLine = function(lineNum) {
    const el = document.getElementById(`code-line-${  lineNum}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('code-line-flash');
      setTimeout(() => { el.classList.remove('code-line-flash'); }, 2000);
    }
  };

  function _escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---- SEND TEST EVENT (prove Flow works) ------------------------------------
  async function sendTestEvent() {
    const testFiles = ['main.py', 'app.js', 'base.css', 'index.html', 'canvas-sse.js'];
    const testFile = testFiles[Math.floor(Math.random() * testFiles.length)];
    const testEvent = {
      type: 'file-write',
      component: 'test-generator',
      data: {
        path: `test/${  testFile}`,
        extension: testFile.split('.').pop(),
        action: 'modified',
      },
    };
    try {
      const resp = await fetch(`${CONFIG.API_BASE  }/debug/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testEvent),
      });
      if (!resp.ok) {
        // Fallback: inject locally if backend rejects
        handleCanvasEvent({
          eventType: 'file_change',
          nodeId: `test/${  testFile}`,
          label: testFile,
          category: 'test',
          meta: { action: 'modified', path: `test/${  testFile}` },
        });
      }
    } catch {
      // Offline fallback
      handleCanvasEvent({
        eventType: 'file_change',
        nodeId: `test/${  testFile}`,
        label: `${testFile  } (local)`,
        category: 'test',
        meta: { action: 'modified', path: `test/${  testFile}` },
      });
    }
  }

  // ---- CLEAR ----------------------------------------------------------------
  function clearCanvas() {
    activityNodes.clear();
    flowEvents.length = 0;
    if (currentView === 'graph') renderGraph();
    if (currentView === 'flow') renderFlow();
    updateCounters();
  }

  // ---- AUTO-REFRESH every 10 s while tab is active --------------------------
  const GRAPH_REFRESH_MS = 10000;          // 10 seconds
  let _graphRefreshTimer = null;

  function _startGraphRefresh() {
    if (_graphRefreshTimer) return;        // already running
    _graphRefreshTimer = setInterval(() => {
      const panel = document.getElementById('panel-canvas');
      if (panel && panel.classList.contains('active')) {
        loadGraph();                       // silent re-fetch + re-render
      }
    }, GRAPH_REFRESH_MS);
  }

  function _stopGraphRefresh() { // eslint-disable-line no-unused-vars
    if (_graphRefreshTimer) { clearInterval(_graphRefreshTimer); _graphRefreshTimer = null; }
  }

  // ---- AUTO-INIT on tab render ----------------------------------------------
  // Observe when the canvas panel becomes visible
  const observer = new MutationObserver(() => {
    const panel = document.getElementById('panel-canvas');
    if (panel && panel.classList.contains('active') && !autoConnected) {
      autoConnected = true;
      loadGraph();
      connectCanvasSSE();
      _startGraphRefresh();
    }
  });

  // Start observing once DOM ready
  function initObserver() {
    const panel = document.getElementById('panel-canvas');
    if (panel) {
      observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
      // Also check if already active
      if (panel.classList.contains('active') && !autoConnected) {
        autoConnected = true;
        loadGraph();
        connectCanvasSSE();
        _startGraphRefresh();
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObserver);
  } else {
    setTimeout(initObserver, 100);
  }
})();
