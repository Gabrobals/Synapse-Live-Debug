/**
 * Live Debug -- Tab 10: Chat Diagnostics Pipeline
 * Dynamic diagnostic probes built by CONFIG_IDE.buildChatProbes()
 * Adapts automatically to any IDE + LLM provider combination.
 */
(function () {
  'use strict';

  // Probes are built dynamically from the IDE adapter layer.
  // CONFIG_IDE.buildChatProbes() returns IDE/LLM-aware probes
  // instead of hardcoding Ollama or any single provider.
  const PROBES = (typeof CONFIG_IDE !== 'undefined' && CONFIG_IDE.buildChatProbes)
    ? CONFIG_IDE.buildChatProbes()
    : [];

  const _probeResults = {};
  let _running = false;

  SynapseApp.tabs.chatdiag = {
    render: renderChatDiag,
    runAll: runAllProbes,
    run: runProbe,
  };

  async function runAllProbes() {
    _running = true;
    renderChatDiag();

    for (const probe of PROBES) {
      await runProbe(probe.id);
    }

    _running = false;
    renderChatDiag();
  }

  async function runProbe(probeId) {
    const probe = PROBES.find(p => p.id === probeId);
    if (!probe) return;

    _probeResults[probeId] = { status: 'running' };
    renderChatDiag();

    try {
      const result = await probe.run();
      _probeResults[probeId] = { status: result.ok ? 'pass' : 'fail', detail: result.detail };
    } catch (err) {
      _probeResults[probeId] = { status: 'fail', detail: err.message };
    }

    renderChatDiag();
  }

  function renderChatDiag() {
    const container = document.getElementById('chatDiagContent');
    if (!container) return;

    // Verdict
    const results = Object.values(_probeResults);
    const allDone = results.length === PROBES.length && results.every(r => r.status !== 'running');
    const allPass = results.length === PROBES.length && results.every(r => r.status === 'pass');

    let verdict = '';
    if (allDone) {
      verdict = allPass
        ? '<div class="glass-card" style="border-left:4px solid var(--accent-green);margin-bottom:var(--space-md);"><span style="color:var(--accent-green);font-weight:700;">All Probes Passed</span> — Chat pipeline is healthy</div>'
        : `<div class="glass-card" style="border-left:4px solid var(--accent-red);margin-bottom:var(--space-md);"><span style="color:var(--accent-red);font-weight:700;"> ${results.filter(r => r.status === 'fail').length} Probes Failed</span> — Investigation needed</div>`;
    }

    container.innerHTML = `
      ${verdict}
      <div style="display:flex;gap:var(--space-xs);margin-bottom:var(--space-md);">
        <button class="btn btn-ghost btn-sm" onclick="SynapseApp.tabs.chatdiag.runAll()" ${_running ? 'disabled' : ''}>
          ${_running ? 'Running…' : 'Run All Probes'}
        </button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:var(--space-sm);">
        ${PROBES.map(probe => {
          const result = _probeResults[probe.id];
          const status = result ? result.status : 'idle';
          const statusColors = { idle: 'var(--border-subtle)', running: 'var(--accent-yellow)', pass: 'var(--accent-green)', fail: 'var(--accent-red)' };
          const statusIcons = { idle: '', running: '', pass: '', fail: '' };

          return `<div class="glass-card" style="border-left:3px solid ${statusColors[status]};">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:0.78rem;font-weight:600;">${probe.icon} ${probe.name}</span>
              <span>${statusIcons[status]}</span>
            </div>
            <div style="margin-top:var(--space-xs);font-size:0.68rem;color:var(--text-tertiary);">
              ${result ? result.detail || '—' : 'Not run yet'}
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }
})();
