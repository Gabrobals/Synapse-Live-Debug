/**
 * Live Debug -- Main Application Shell
 * Initializes all modules, tab switching, global event routing, trace management
 */

(function () {
  'use strict';
  /* eslint-disable no-console */

  // -- Global State ----------------------------------------------------------
  const events = [];
  const stats = { total: 0, errors: 0, userActions: 0, llmCalls: 0, toolsExecuted: 0, filesChanged: 0, canvasEvents: 0 };
  let currentFilter = 'all';
  const startTime = Date.now();
  let _backendAlive = false;
  let _dataLoaded = false; // eslint-disable-line no-unused-vars

  // -- WebSocket -------------------------------------------------------------
  let _ws = null;
  let _wsReconnectTimer = null; // eslint-disable-line no-unused-vars
  let _wsReconnectAttempts = 0;

  // -- Voice / TTS -----------------------------------------------------------
  let _voiceEnabled = false;

  // -- Notification toggles --------------------------------------------------
  let _desktopNotifsEnabled = false;
  let _soundNotifsEnabled = true;

  // -- Expose SynapseApp globally (extend bootstrap from config.js) --------
  const App = window.SynapseApp = Object.assign(window.SynapseApp || {}, {
    events,
    stats,
    get backendAlive() { return _backendAlive; },
    get currentFilter() { return currentFilter; },
    set currentFilter(v) { currentFilter = v; },

    // Preserve tabs already registered by tab modules
    tabs: { ...(window.SynapseApp || {}).tabs},

    // Public API
    handleEvent,
    clearAll,
    sendReportToDisk,
    copyReport: copyReportToClipboard,
    copyReportToClipboard,
    toggleDesktopNotifs,
    toggleSoundNotifs,
    toggleVoiceAlerts,
    closeDiff,
    applyDiffFix,

    // Trace management
    trace: {
      save: saveTraceSnapshot,
      exportJSON: exportTrace,
      importJSON: importTrace,
      handleImport: handleTraceImport,
      clearSnapshots: clearTraceSnapshots,
    },

    // WebSocket
    wsSend,
    wsRequestGovernorState,
  });

  // ---------------------------------------------------------------------------
  // TAB SWITCHING
  // ---------------------------------------------------------------------------

  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById(`panel-${  btn.dataset.tab}`);
        if (panel) panel.classList.add('active');
      });
    });
  }

  /**
   * Programmatic tab switch � used by Agent Intelligence for auto-activation
   * and cross-linking between tabs (e.g., jump to Architecture from error links)
   */
  function switchToTab(tabId) {
    const btn = document.querySelector(`.tab-btn[data-tab="${  tabId  }"]`);
    if (btn) btn.click();
  }
  // Expose on SynapseApp for cross-tab use
  Object.assign(App, { switchToTab });

  // ---------------------------------------------------------------------------
  // EVENT FILTERS
  // ---------------------------------------------------------------------------

  function setupFilters() {
    document.querySelectorAll('#filterPills .pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#filterPills .pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentFilter = pill.dataset.filter;
        document.querySelectorAll('#eventsContainer .event-item').forEach(item => {
          item.style.display = (currentFilter === 'all' || item.dataset.category === currentFilter) ? 'block' : 'none';
        });
      });
    });
  }

  // ---------------------------------------------------------------------------
  // CORE EVENT HANDLER � Routes events to all tab modules
  // ---------------------------------------------------------------------------

  function handleEvent(event) {
    // Hide empty state
    const empty = document.getElementById('emptyState');
    if (empty) empty.style.display = 'none';

    events.unshift(event);
    if (events.length >CONFIG.MAX_EVENTS) events.pop();

    updateStats(event);

    // Route to Live Events tab
    if (App.tabs.events) {
      App.tabs.events.addEventToUI(event);
      App.tabs.events.addToTimeline(event);
    }

    // Route to Agent Intelligence (Prompt Flow live events)
    if (App.tabs.agentIntel && App.tabs.agentIntel.routeEvent) {
      App.tabs.agentIntel.routeEvent(event);
    }

    // Route to Multi-Agent Orchestration
    if (App.tabs.orchestra && App.tabs.orchestra.routeEvent) {
      App.tabs.orchestra.routeEvent(event);
    }

    // Handle errors
    if (event.type === 'error') {
      if (App.tabs.events) App.tabs.events.addToErrorList(event);
      SynapseBus.emit('live:error', {
        component: event.component,
        message: event.data?.error || event.data?.message || event.type,
        timestamp: event.timestamp,
      });

      // Detect stub response from chatStore
      if (event.component && event.component.includes('stubDetected')) {
        Notifications.addAlert('critical', `STUB RESPONSE: ${event.data?.error || 'Model not connected'}`, 'Chat Pipeline');
        Notifications.playBeep('critical');
      }
    }

    // Detect stub in llm-response
    if (event.type === 'llm-response' && event.data?.output && (event.data.output.includes('[SYNAPSE stub') || event.data.output.includes('[STUB') || event.data.output.includes('[stub'))) {
      if (App.tabs.events) {
        App.tabs.events.addToErrorList({
          ...event, type: 'error',
          data: { ...event.data, error: `Stub response detected: ${event.data.output.substring(0, 100)}` },
        });
      }
      SynapseBus.emit('live:error', { component: event.component || 'LLM', message: 'Stub response', timestamp: event.timestamp });
      Notifications.addAlert('critical', 'LLM returned STUB response � check model routing', 'Chat Pipeline');
      Notifications.playBeep('critical');
    }
  }

  function updateStats(event) {
    stats.total++;
    const el = (id) => document.getElementById(id);
    el('totalEvents').textContent = stats.total;

    const type = event.type;
    if (type === 'error') {
      stats.errors++;
      el('totalErrors').textContent = stats.errors;
      el('statErrors').textContent = stats.errors;
    } else if (type === 'user-input' || type === 'message-add') {
      stats.userActions++;
      el('statUserActions').textContent = stats.userActions;
    } else if (type === 'llm-call') {
      stats.llmCalls++;
      el('statLLMCalls').textContent = stats.llmCalls;
    } else if (type === 'tool-execute') {
      stats.toolsExecuted++;
      el('statToolsExecuted').textContent = stats.toolsExecuted;
    } else if (type === 'file-write') {
      stats.filesChanged++;
      el('statFilesChanged').textContent = stats.filesChanged;
    } else if (EVENT_CATEGORIES[type] === 'canvas') {
      stats.canvasEvents++;
      el('statCanvasEvents').textContent = stats.canvasEvents;
    }
  }

  // ---------------------------------------------------------------------------
  // BACKEND LIFECYCLE
  // ---------------------------------------------------------------------------

  async function checkBackendAlive() {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 4000);
    let healthOk = false;
    try {
      console.log(`[LiveDebug] Health check ? ${  CONFIG.API_BASE  }/health`);
      const r = await fetch(`${CONFIG.API_BASE}/health`, { signal: ac.signal });
      clearTimeout(timer);
      healthOk = r.ok;
      console.log(`[LiveDebug] Health response: ${  r.status  } ok=${  r.ok}`);
    } catch (e) {
      clearTimeout(timer);
      healthOk = false;
      console.warn('[LiveDebug] Health check network error:', e.message || e);
    }

    // State transitions � SEPARATED from try/catch above so onBackendConnected
    // errors cannot trigger the catch block and flip us back to disconnected.
    if (healthOk && !_backendAlive) {
      _backendAlive = true;
      ConnectionManager.updateStatus('connected');
      try {
        onBackendConnected();
      } catch (e) {
        console.error('[LiveDebug] onBackendConnected CRASHED:', e);
        // Connection IS alive, keep _backendAlive = true
      }
    } else if (!healthOk && _backendAlive) {
      _backendAlive = false;
      ConnectionManager.updateStatus('disconnected');
      try { onBackendDisconnected(); } catch (e) { console.error('[LiveDebug] onBackendDisconnected error:', e); }
    }
  }

  function onBackendConnected() {
    console.log('[LiveDebug] onBackendConnected() -- hiding overlay, starting SSE');
    document.body.classList.remove('backend-offline');

    // Hide offline overlay
    const overlay = document.getElementById('offlineOverlay');
    if (overlay) overlay.classList.remove('visible');

    console.log('[LiveDebug] onBackendConnected: overlay hidden');

    // -- IDE / LLM Detection (universal adapter) --------------------------
    if (typeof CONFIG_IDE !== 'undefined' && CONFIG_IDE.detect) {
      CONFIG_IDE.detect().then(() => {
        console.log(`[LiveDebug] IDE detected: ${  CONFIG_IDE.ideName  } | LLM: ${  CONFIG_IDE.llmName}`);
      }).catch((e) => { console.warn('[LiveDebug] IDE detection error:', e); });
    }

    // Start SSE
    try { ConnectionManager.connectSSE(handleEvent); console.log('[LiveDebug] SSE started'); }
    catch (e) { console.error('[LiveDebug] SSE start failed:', e); }

    try { connectWebSocket(); console.log('[LiveDebug] WebSocket started'); }
    catch (e) { console.error('[LiveDebug] WebSocket start failed:', e); }

    // Load existing events
    fetch(`${CONFIG.API_BASE}/debug/events`)
      .then(r => r.json())
      .then(existing => {
        console.log(`[LiveDebug] Loaded ${  existing.length  } existing events`);
        if (existing.length > 0) {
          const empty = document.getElementById('emptyState');
          if (empty) empty.style.display = 'none';
          existing.reverse().forEach(e => { try { handleEvent(e); } catch (err) { console.error('[LiveDebug] handleEvent error:', err); } });
        }
      })
      .catch(e => console.warn('[LiveDebug] Load events failed:', e));

    // Initialize tab data � each protected individually
    const tabInits = [
      ['services.render', () => App.tabs.services?.render()],
      ['agentIntel.scan', () => App.tabs.agentIntel?.scan()],
      ['arch.scan', () => App.tabs.arch?.scan()],
      ['governor.fetch', () => App.tabs.governor?.fetch()],
      ['orchestra.refresh', () => App.tabs.orchestra?.refresh()],
    ];
    for (const [label, fn] of tabInits) {
      try { fn(); } catch (e) { console.error(`[LiveDebug] Tab init "${  label  }" crashed:`, e); }
    }

    setTimeout(() => {
      try { if (App.tabs.agentIntel) App.tabs.agentIntel.refreshDiagnostics(); }
      catch (e) { console.error('[LiveDebug] agentIntel diag init error:', e); }
    }, 2000);

    _dataLoaded = true;
    console.log('[LiveDebug] onBackendConnected() complete � _dataLoaded=true');
  }

  function onBackendDisconnected() {
    _dataLoaded = false;
    document.body.classList.add('backend-offline');

    // Show offline overlay
    const overlay = document.getElementById('offlineOverlay');
    if (overlay) overlay.classList.add('visible');

    // Close SSE
    ConnectionManager.disconnect();

    // Close WebSocket
    if (_ws) { try { _ws.close(); } catch { /* ignored */ } _ws = null; }
    updateWsStatus('disconnected');

    // Reset service grid to offline
    if (App.tabs.services) App.tabs.services.render();
    if (App.tabs.orchestra) App.tabs.orchestra.refresh();
  }

  // ---------------------------------------------------------------------------
  // WEBSOCKET
  // ---------------------------------------------------------------------------

  function connectWebSocket() {
    if (_ws && _ws.readyState <= 1) return;
    const wsUrl = `${CONFIG.API_BASE.replace('http', 'ws')  }/debug/ws`;
    try {
      _ws = new WebSocket(wsUrl);
      updateWsStatus('connecting');

      _ws.onopen = () => {
        _wsReconnectAttempts = 0;
        updateWsStatus('connected');
      };

      _ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'governor-state' && App.tabs.governor) {
            App.tabs.governor._lastState = msg.data;
            App.tabs.governor.renderState(msg.data);
            App.tabs.governor.renderRecommendations(msg.data);
          } else if (msg.type === 'governor-broadcast') {
            Notifications.addAlert('info', `Governor broadcast: ${JSON.stringify(msg.data).substring(0, 80)}`, 'Governor');
          } else if (msg.type && msg.timestamp && msg.component) {
            handleEvent(msg);
          }
        } catch (e) { console.warn('[WS] Parse error:', e); }
      };

      _ws.onclose = () => {
        updateWsStatus('disconnected');
        const delay = Math.min(2000 * 2**_wsReconnectAttempts, 30000);
        _wsReconnectAttempts++;
        _wsReconnectTimer = setTimeout(connectWebSocket, delay);
      };

      _ws.onerror = () => updateWsStatus('disconnected');
    } catch {
      updateWsStatus('disconnected');
    }
  }

  function updateWsStatus(status) {
    const el = document.getElementById('wsStatus');
    if (!el) return;
    if (status === 'connected') {
      el.className = 'badge badge-green';
      el.textContent = 'WS: live';
    } else if (status === 'connecting') {
      el.className = 'badge badge-yellow';
      el.textContent = 'WS: connecting...';
    } else {
      el.className = 'badge badge-dim';
      el.textContent = 'WS: off';
    }
  }

  function wsSend(command, extra) {
    if (_ws && _ws.readyState === 1) {
      _ws.send(JSON.stringify({ command, ...extra }));
    }
  }

  function wsRequestGovernorState() { wsSend('get-state'); }

  // ---------------------------------------------------------------------------
  // GOVERNOR REPORT ? AI BRIDGE
  // ---------------------------------------------------------------------------

  function _buildReportData() {
    const gs = (App.tabs.governor && App.tabs.governor._lastState) || {};
    const problems = gs?.introspect?.problems || [];
    const summary = gs?.introspect?.summary || {};
    const assessment = gs?.assessment || 'UNKNOWN';
    return {
      problems, summary, assessment,
      problemCount: problems.length,
      errors: problems.filter(p => p.severity === 'error').length,
      warnings: problems.filter(p => p.severity === 'warning').length,
      infos: problems.filter(p => p.severity === 'info').length,
    };
  }

  function _buildReportMarkdown(data) {
    let md = `# GOVERNOR REPORT\n\n`;
    md += `>Assessment: **${data.assessment}**\n`;
    md += `>Problems: **${data.problemCount}** (${data.errors} errors, ${data.warnings} warnings, ${data.infos} info)\n\n---\n\n`;
    if (data.problems.length === 0) {
      md += ` **No problems � codebase is clean.**\n`;
    } else {
      for (const sev of ['error', 'warning', 'info']) {
        const group = data.problems.filter(p => p.severity === sev);
        if (!group.length) continue;
        const icon = { error: '', warning: '', info: '' }[sev];
        md += `## ${icon} ${sev.toUpperCase()} (${group.length})\n\n`;
        for (const p of group) {
          md += `- **[${p.category || '?'}]** ${p.message || ''}\n`;
          if (p.file) md += `  - File: \`${p.file}\`\n`;
          if (p.suggestion) md += `  - Suggestion: ${p.suggestion}\n`;
        }
        md += `\n`;
      }
    }
    md += `---\n\n*Ask the AI: "Read .governor-report.md and fix the problems"*\n`;
    return md;
  }

  async function sendReportToDisk() {
    const btn = document.getElementById('btnSendReport');
    const data = _buildReportData();
    // eslint-disable-next-line no-alert
    if (data.problemCount === 0 && !confirm('No problems found. Send report anyway?')) return;
    if (btn) btn.textContent = 'Sending...';
    try {
      const res = await fetch(`${CONFIG.API_BASE}/debug/governor-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (btn) { btn.textContent = `Written! (${result.problems} problems)`; setTimeout(() => { btn.textContent = 'Report ? AI'; }, 3000); }
      Notifications.addAlert('resolved', `Governor report written to .governor-report.md (${result.size} bytes)`, 'Report');
    } catch (err) {
      if (btn) { btn.textContent = 'Error'; setTimeout(() => { btn.textContent = 'Report ? AI'; }, 2000); }
      Notifications.addAlert('warning', `Failed to write report: ${err.message}`, 'Report');
    }
  }

  async function copyReportToClipboard() {
    const btn = document.getElementById('btnCopyReport');
    const data = _buildReportData();
    const md = _buildReportMarkdown(data);
    const prompt = `Leggi questo Governor Report e risolvi tutti i problemi elencati:\n\n${md}`;
    try {
      await navigator.clipboard.writeText(prompt);
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy Report'; }, 3000); }
      Notifications.addAlert('info', `Report copied to clipboard (${data.problemCount} problems)`, 'Report');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy Report'; }, 3000); }
    }
  }

  // ---------------------------------------------------------------------------
  // DIFF VIEWER
  // ---------------------------------------------------------------------------

  let _currentDiffFix = null;

  App.showDiffPreview = function (title, oldCode, newCode, fixData) {
    _currentDiffFix = fixData;
    document.getElementById('diffTitle').textContent = title || 'Diff Viewer';
    renderDiff(oldCode || '', newCode || '');
    document.getElementById('diffOverlay').style.display = 'flex';
    document.getElementById('diffApplyBtn').style.display = fixData ? 'inline-flex' : 'none';
  };

  function renderDiff(oldCode, newCode) {
    const oldLines = oldCode.split('\n');
    const newLines = newCode.split('\n');
    const maxLen = Math.max(oldLines.length, newLines.length);
    let oldHTML = '', newHTML = '';
    for (let i = 0; i < maxLen; i++) {
      const ol = oldLines[i] ?? '';
      const nl = newLines[i] ?? '';
      const changed = ol !== nl;
      oldHTML += `<div class="${changed ? 'diff-removed' : ''}" style="padding:1px 8px;font-size:11px;font-family:var(--font-mono);white-space:pre-wrap;">${escapeHTML(ol)}</div>`;
      newHTML += `<div class="${changed ? 'diff-added' : ''}" style="padding:1px 8px;font-size:11px;font-family:var(--font-mono);white-space:pre-wrap;">${escapeHTML(nl)}</div>`;
    }
    document.getElementById('diffOld').innerHTML = `<div style="font-size:10px;font-weight:700;color:var(--accent-red);padding:6px 8px;">OLD</div>${oldHTML}`;
    document.getElementById('diffNew').innerHTML = `<div style="font-size:10px;font-weight:700;color:var(--accent-green);padding:6px 8px;">NEW</div>${newHTML}`;
    const added = newLines.filter((l, i) => l !== (oldLines[i] ?? '')).length;
    const removed = oldLines.filter((l, i) => l !== (newLines[i] ?? '')).length;
    document.getElementById('diffStats').textContent = `+${added} / -${removed} lines changed`;
  }

  function escapeHTML(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function closeDiff() {
    document.getElementById('diffOverlay').style.display = 'none';
    _currentDiffFix = null;
  }

  async function applyDiffFix() {
    if (!_currentDiffFix) return;
    try {
      const res = await fetch(`${CONFIG.API_V1}/governor/apply-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(_currentDiffFix),
      });
      const r = await res.json();
      Notifications.addAlert(r.status === 'applied' ? 'resolved' : 'warning', `Fix ${r.status}: ${r.message || ''}`, 'Governor');
      closeDiff();
      if (App.tabs.governor) App.tabs.governor.fetch();
    } catch (err) {
      Notifications.addAlert('warning', `Apply failed: ${err.message}`, 'Governor');
    }
  }

  // ---------------------------------------------------------------------------
  // CLEAR ALL
  // ---------------------------------------------------------------------------

  function clearAll() {
    events.length = 0;
    Object.keys(stats).forEach(k => { stats[k] = 0; });
    ['totalEvents', 'totalErrors', 'statErrors', 'statUserActions', 'statLLMCalls', 'statToolsExecuted', 'statFilesChanged', 'statCanvasEvents'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '0';
    });
    document.getElementById('eventsContainer').innerHTML = `
      <div class="empty-state" id="emptyState"><div class="empty-state-icon"></div><div class="empty-state-text">Waiting for IDE events...</div><div class="empty-state-hint">Backend: ${CONFIG.API_BASE}</div></div>`;
    document.getElementById('errorList').innerHTML = `
      <div class="empty-state" style="padding:var(--space-lg);"><div style="font-size:1.2rem;"></div><div class="empty-state-hint">No errors yet</div></div>`;
    document.getElementById('timeline').innerHTML = `
      <div style="display:flex;gap:var(--space-sm);font-size:0.78rem;color:var(--text-tertiary);"><span class="font-mono">--:--</span><span>Waiting for activity...</span></div>`;

    if (App.tabs.canvas) App.tabs.canvas.clear();
    if (App.tabs.runner) App.tabs.runner.clearOutput();

    fetch(`${CONFIG.API_BASE}/debug/events`, { method: 'DELETE' }).catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // TRACE REPLAY
  // ---------------------------------------------------------------------------

  const TRACE_KEY = 'synapse_debug_traces';

  function getTraceSnapshots() {
    try { return JSON.parse(localStorage.getItem(TRACE_KEY) || '[]'); }
    catch { return []; }
  }

  function saveTraceSnapshot() {
    const snapshot = {
      id: Date.now(),
      name: `Trace ${new Date().toLocaleTimeString()}`,
      timestamp: Date.now(),
      events: [...events].slice(-200),
      stats: { ...stats },
      governorState: App.tabs.governor?._lastState,
    };
    const traces = getTraceSnapshots();
    traces.push(snapshot);
    if (traces.length > 20) traces.shift();
    try {
      localStorage.setItem(TRACE_KEY, JSON.stringify(traces));
      renderTraceSnapshots();
      Notifications.addAlert('info', `Snapshot saved: ${snapshot.name} (${snapshot.events.length} events)`, 'Trace');
    } catch (e) {
      Notifications.addAlert('warning', `Failed to save snapshot: ${e.message}`, 'Trace');
    }
  }

  function loadTraceSnapshot(id) {
    const traces = getTraceSnapshots();
    const snap = traces.find(t => t.id === id);
    if (!snap) return;

    events.length = 0;
    events.push(...snap.events);
    Object.assign(stats, snap.stats);

    document.getElementById('totalEvents').textContent = stats.total;
    document.getElementById('totalErrors').textContent = stats.errors;

    const container = document.getElementById('eventsContainer');
    container.innerHTML = '';
    snap.events.slice(0, 100).forEach(e => {
      if (App.tabs.events) App.tabs.events.addEventToUI(e);
    });

    if (snap.governorState && App.tabs.governor) {
      App.tabs.governor._lastState = snap.governorState;
      App.tabs.governor.renderState(snap.governorState);
    }

    document.querySelectorAll('.trace-snap').forEach(el => el.classList.remove('active'));
    const el = document.querySelector(`.trace-snap[data-id="${id}"]`);
    if (el) el.classList.add('active');

    Notifications.addAlert('info', `Loaded snapshot: ${snap.name}`, 'Trace');
  }

  function renderTraceSnapshots() {
    const container = document.getElementById('traceSnapshots');
    const traces = getTraceSnapshots();
    if (traces.length === 0) {
      container.innerHTML = '<span style="color:var(--text-dim);">No snapshots yet</span>';
      return;
    }
    container.innerHTML = traces.map(t => {
      const time = new Date(t.timestamp).toLocaleTimeString();
      return `<span class="trace-snap badge badge-dim" style="cursor:pointer;" data-id="${t.id}" onclick="SynapseApp.trace._load(${t.id})"> ${time} (${(t.events || []).length})</span>`;
    }).join(' ');
  }
  App.trace._load = loadTraceSnapshot;

  function exportTrace() {
    const snapshot = {
      exported: new Date().toISOString(),
      tool: 'LIVE DEBUG v3.1',
      events: [...events],
      stats: { ...stats },
      governorState: App.tabs.governor?._lastState,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-trace-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importTrace() { document.getElementById('traceFileInput').click(); }

  function handleTraceImport(evt) {
    const file = evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.events) {
          events.length = 0;
          events.push(...data.events);
          const container = document.getElementById('eventsContainer');
          container.innerHTML = '';
          data.events.slice(0, 100).forEach(ev => {
            if (App.tabs.events) App.tabs.events.addEventToUI(ev);
          });
        }
        if (data.governorState && App.tabs.governor) {
          App.tabs.governor._lastState = data.governorState;
          App.tabs.governor.renderState(data.governorState);
        }
        Notifications.addAlert('info', `Imported trace: ${data.events?.length || 0} events`, 'Trace');
      } catch (err) {
        Notifications.addAlert('warning', `Import failed: ${err.message}`, 'Trace');
      }
    };
    reader.readAsText(file);
    evt.target.value = '';
  }

  function clearTraceSnapshots() {
    // eslint-disable-next-line no-alert
    if (confirm('Delete all saved trace snapshots?')) {
      localStorage.removeItem(TRACE_KEY);
      renderTraceSnapshots();
    }
  }

  // ---------------------------------------------------------------------------
  // UPTIME
  // ---------------------------------------------------------------------------

  function updateUptime() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const el = document.getElementById('uptime');
    if (el) el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ---------------------------------------------------------------------------
  // NOTIFICATION TOGGLES
  // ---------------------------------------------------------------------------

  function toggleDesktopNotifs() {
    _desktopNotifsEnabled = !_desktopNotifsEnabled;
    const btn = document.getElementById('notifDesktop');
    if (btn) {
      btn.style.color = _desktopNotifsEnabled ? 'var(--accent-green)' : 'var(--text-dim)';
    }
    if (_desktopNotifsEnabled && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function toggleSoundNotifs() {
    _soundNotifsEnabled = !_soundNotifsEnabled;
    const btn = document.getElementById('notifSound');
    if (btn) {
      btn.style.color = _soundNotifsEnabled ? 'var(--accent-blue)' : 'var(--text-dim)';
      btn.textContent = _soundNotifsEnabled ? '' : '';
    }
  }

  // ---------------------------------------------------------------------------
  // VOICE / TTS
  // ---------------------------------------------------------------------------

  function toggleVoiceAlerts() {
    _voiceEnabled = !_voiceEnabled;
    const btn = document.getElementById('voiceToggle');
    if (btn) {
      btn.classList.toggle('active', _voiceEnabled);
      btn.textContent = _voiceEnabled ? 'Voice ON' : 'Voice';
    }
  }

  function speakAlert(text) {
    if (!_voiceEnabled || !('speechSynthesis' in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = 1.1;
    utter.volume = 0.8;
    speechSynthesis.speak(utter);
  }

  // Wire bus events to voice
  SynapseBus.on('alert:offline', (d) => speakAlert(`Warning: ${d.service || d.name} is offline`));
  SynapseBus.on('alert:back-online', (d) => speakAlert(`${d.service || d.name} is back online`));

  // ---------------------------------------------------------------------------
  // INTER-TAB BUS WIRING
  // ---------------------------------------------------------------------------

  // Alerts ? Notifications
  SynapseBus.on('alert:offline', (d) => {
    Notifications.addAlert('critical', `SERVICE OFFLINE: ${d.service || d.name}`, d.service || d.name);
    Notifications.playBeep('critical');
    Notifications.sendDesktop('Live Debug -- Service Offline', `${d.service || d.name}: ${d.message || 'unreachable'}`);
  });

  SynapseBus.on('alert:back-online', (d) => {
    Notifications.addAlert('resolved', `SERVICE RESTORED: ${d.service || d.name}`, d.service || d.name);
    Notifications.playBeep('resolved');
    Notifications.sendDesktop('Live Debug -- Service Restored', `${d.service || d.name} is back online`);
  });

  SynapseBus.on('live:error', (d) => {
    Notifications.addAlert('warning', `Runtime error in ${d.component}: ${(d.message || '').substring(0, 80)}`, d.component);
    Notifications.playBeep('warning');
  });

  // TAC problem badges
  SynapseBus.on('tac:scan-complete', (d) => {
    if (d.problemCount > 0) {
      const badge = document.querySelector('[data-tab="arch"]');
      if (badge) {
        const base = badge.innerHTML.replace(/<span class="tab-badge.*?<\/span>/, '');
        badge.innerHTML = `${base  } <span class="tab-badge badge-red">${d.problemCount}</span>`;
      }
    }
  });

  // ---------------------------------------------------------------------------
  // INIT
  // ---------------------------------------------------------------------------

  function init() {
    console.log('[LiveDebug] init() started');

    // -- CRITICAL: Health polling FIRST � must run even if tab rendering fails --
    document.body.classList.add('backend-offline');
    const offTarget = document.getElementById('offlineTarget');
    if (offTarget) offTarget.textContent = CONFIG.API_BASE;

    console.log(`[LiveDebug] CONFIG.API_BASE=${  CONFIG.API_BASE}`);
    console.log(`[LiveDebug] Starting health polling every ${  CONFIG.HEALTH_POLL_INTERVAL  }ms`);
    checkBackendAlive();
    setInterval(checkBackendAlive, CONFIG.HEALTH_POLL_INTERVAL);

    // Uptime counter
    setInterval(updateUptime, 1000);

    // WebSocket heartbeat
    setInterval(() => { if (_backendAlive) wsSend('ping'); }, 30000);

    // Periodic service health (only if alive)
    setInterval(() => { if (_backendAlive && App.tabs.services) App.tabs.services.refresh(); }, 30000);

    // Preload TTS
    if ('speechSynthesis' in window) speechSynthesis.getVoices();

    // -- Tab setup (protected � errors here must not kill health polling) --
    try { setupTabs(); } catch (e) { console.error('[LiveDebug] setupTabs error:', e); }
    try { setupFilters(); } catch (e) { console.error('[LiveDebug] setupFilters error:', e); }

    // -- Tab module boot renders (each protected individually) --
    const bootTasks = [
      ['services.render', () => App.tabs.services?.render()],
      ['runner.render', () => App.tabs.runner?.render()],
      ['orchestra.refresh', () => App.tabs.orchestra?.refresh()],
      ['renderTraceSnapshots', () => renderTraceSnapshots()],
    ];
    for (const [label, fn] of bootTasks) {
      try { fn(); } catch (e) { console.error(`[LiveDebug] Boot task "${  label  }" failed:`, e); }
    }

    // -- Tab-triggered lazy loads --
    const tabTriggers = {
      services: () => { if (_backendAlive) App.tabs.services?.refresh(); },
      quality: () => App.tabs.quality?.load(),
      tqi: () => App.tabs.tqi?.load(),
      agentintel: () => { if (_backendAlive) App.tabs.agentIntel?.scan(); },
      chatdiag: () => { if (_backendAlive) App.tabs.agentIntel?.refreshDiagnostics(); },
      metrics: () => { if (_backendAlive) App.tabs.metrics?.load(); },
      roadmap: () => { if (_backendAlive) App.tabs.roadmap?.scan(); },
      health: () => { if (_backendAlive) App.tabs.health?.scan(); },
      guide: () => App.tabs.guide?.scan(),
    };

    for (const [tab, fn] of Object.entries(tabTriggers)) {
      const btn = document.querySelector(`[data-tab="${tab}"]`);
      if (btn) btn.addEventListener('click', fn);
    }

    // Auto-refresh active data tab every 60s
    setInterval(() => {
      if (!_backendAlive) return;
      const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
      if (tabTriggers[activeTab]) tabTriggers[activeTab]();
    }, 60000);

    console.log('[LiveDebug] init() complete');
  }

  // Boot
  try {
    init();
  } catch (e) {
    console.error('INIT CRASH:', e);
    document.title = `INIT ERROR: ${  e.message}`;
    // Last resort: try to start health polling even if init() crashed
    try {
      checkBackendAlive();
      setInterval(checkBackendAlive, CONFIG.HEALTH_POLL_INTERVAL);
    } catch (e2) { console.error('Health polling also failed:', e2); }
  }
})();
