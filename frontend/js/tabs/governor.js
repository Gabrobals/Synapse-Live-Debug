/**
 * Live Debug — Tab 8: Governor
 * Fetch live state, render assessment/health grid/performance/recommendations,
 * auto-heal with dry-run support, AI fix integration, polling
 */
(function () {
  'use strict';

  let _lastState = null;
  let _pollingInterval = null;

  SynapseApp.tabs.governor = {
    fetch: fetchGovernorState,
    startPolling,
    stopPolling,
    triggerAutoFix,
    triggerAutoFixAll,
    triggerAIFix,
    runAutoHeal,
    renderState: renderGovernorState,
    renderRecommendations: renderGovernorRecommendations,
    _lastState,
  };

  // ════════════════════════════════════════════════════════════════════════════
  // FETCH STATE
  // ════════════════════════════════════════════════════════════════════════════

  async function fetchGovernorState() {
    const indicator = document.getElementById('govLoadingIndicator');
    if (indicator) indicator.style.display = 'inline-block';

    try {
      const res = await fetch(`${CONFIG.API_V1}/governor/dashboard`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _lastState = data;
      renderGovernorState(data);
    } catch (err) {
      const container = document.getElementById('govContent');
      if (container) container.innerHTML = `<div style="text-align:center;padding:var(--space-xl);color:var(--accent-red);">Failed to fetch: ${err.message}</div>`;
    }

    if (indicator) indicator.style.display = 'none';
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER STATE
  // ════════════════════════════════════════════════════════════════════════════

  function renderGovernorState(data) {
    const container = document.getElementById('govContent');
    if (!container) return;

    const assessment = data.assessment || {};
    const health = data.health || {};
    const performance = data.performance || {};
    const problems = data.problems || [];
    const recommendations = data.recommendations || data.fixes || [];

    const gradeColor = assessment.grade === 'A' ? 'var(--accent-green)' :
      assessment.grade === 'B' ? 'var(--accent-cyan)' :
      assessment.grade === 'C' ? 'var(--accent-yellow)' :
      assessment.grade === 'D' ? 'var(--accent-orange)' : 'var(--accent-red)';

    container.innerHTML = `
      <!-- Assessment Banner -->
      <div class="glass-card" style="border-left:4px solid ${gradeColor};margin-bottom:var(--space-md);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="font-size:1.8rem;font-weight:800;color:${gradeColor};">${assessment.grade || '?'}</span>
            <span style="font-size:0.85rem;margin-left:var(--space-sm);color:var(--text-secondary);">${assessment.label || 'Unknown State'}</span>
          </div>
          <div style="text-align:right;font-size:0.72rem;color:var(--text-tertiary);">
            Score: ${assessment.score ?? '—'}/100<br>
            ${problems.length} problems · ${recommendations.length} recommendations
          </div>
        </div>
      </div>

      <!-- Health Grid -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:var(--space-sm);margin-bottom:var(--space-md);">
        ${renderHealthCards(health)}
      </div>

      <!-- Performance -->
      <div class="glass-card" style="margin-bottom:var(--space-md);">
        <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Performance</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:var(--space-xs);">
          ${Object.entries(performance).map(([k, v]) => `<div style="font-size:0.68rem;"><span style="color:var(--text-dim);">${k}:</span> <span style="color:var(--text-secondary);">${typeof v === 'number' ? v.toFixed(1) : v}</span></div>`).join('')}
        </div>
      </div>

      <!-- Problems -->
      ${problems.length > 0 ? `
        <div class="glass-card" style="border-left:3px solid var(--accent-red);margin-bottom:var(--space-md);">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Problems (${problems.length})</div>
          ${problems.slice(0, 15).map(p => `
            <div style="padding:var(--space-xs) 0;border-bottom:1px solid var(--border-subtle);font-size:0.68rem;">
              <span style="color:${p.severity === 'error' ? 'var(--accent-red)' : 'var(--accent-yellow)'};">[${p.severity || 'warn'}]</span>
              <span style="color:var(--text-secondary);">${p.message || p.description || '—'}</span>
              ${p.file ? `<span style="color:var(--text-dim);"> — ${p.file}</span>` : ''}
            </div>
          `).join('')}
        </div>` : ''}

      <!-- Recommendations -->
      <div id="govRecommendations"></div>

      <!-- Raw JSON -->
      <details style="margin-top:var(--space-md);">
        <summary style="cursor:pointer;font-size:0.72rem;color:var(--text-tertiary);">Raw JSON</summary>
        <pre style="font-size:0.6rem;max-height:300px;overflow:auto;margin-top:var(--space-xs);color:var(--text-dim);white-space:pre-wrap;">${JSON.stringify(data, null, 2)}</pre>
      </details>`;

    if (recommendations.length > 0) renderGovernorRecommendations(recommendations);

    // Update footer status
    const dot = document.getElementById('governorDot');
    const assessmentEl = document.getElementById('governorAssessment');
    const lastFetchEl = document.getElementById('governorLastFetch');
    
    if (dot) {
      dot.classList.remove('unknown', 'healthy', 'degraded', 'unhealthy');
      if (assessment.grade === 'A' || assessment.grade === 'B') dot.classList.add('healthy');
      else if (assessment.grade === 'C') dot.classList.add('degraded');
      else dot.classList.add('unhealthy');
    }
    if (assessmentEl) assessmentEl.textContent = `${assessment.grade || '?'} - ${assessment.label || 'Unknown'}`;
    if (lastFetchEl) lastFetchEl.textContent = `Last: ${new Date().toLocaleTimeString()}`;
  }

  function renderHealthCards(health) {
    const entries = Object.entries(health);
    if (entries.length === 0) return '<div style="grid-column:1/-1;font-size:0.68rem;color:var(--text-dim);">No health data</div>';

    return entries.map(([key, val]) => {
      const ok = val === true || val === 'ok' || val === 'healthy' || (typeof val === 'number' && val > 0.8);
      const color = ok ? 'var(--accent-green)' : 'var(--accent-red)';
      return `<div class="glass-card" style="border-left:3px solid ${color};">
        <div style="font-size:0.68rem;color:var(--text-dim);">${key}</div>
        <div style="font-size:0.85rem;font-weight:600;color:${color};">${typeof val === 'boolean' ? (val ? 'OK' : 'Fail') : val}</div>
      </div>`;
    }).join('');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RECOMMENDATIONS WITH AUTO-FIX BUTTONS
  // ════════════════════════════════════════════════════════════════════════════

  function renderGovernorRecommendations(recommendations) {
    const container = document.getElementById('govRecommendations');
    if (!container) return;

    container.innerHTML = `
      <div class="glass-card" style="border-left:3px solid var(--accent-cyan);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-sm);">
          <span style="font-weight:600;font-size:0.78rem;">Recommendations (${recommendations.length})</span>
          <button class="btn btn-ghost btn-sm" onclick="SynapseApp.tabs.governor.triggerAutoFixAll()">Fix All</button>
        </div>
        ${(Array.isArray(recommendations) ? recommendations : []).map((r, i) => `
          <div style="padding:var(--space-xs) 0;border-bottom:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center;">
            <div style="flex:1;font-size:0.68rem;">
              <span style="color:var(--text-secondary);">${r.message || r.description || r}</span>
              ${r.file ? `<span style="color:var(--text-dim);"> (${r.file})</span>` : ''}
            </div>
            <div style="display:flex;gap:var(--space-xs);flex-shrink:0;">
              ${r.autoFix !== false ? `<button class="btn btn-ghost btn-sm" onclick="SynapseApp.tabs.governor.triggerAutoFix(${i})">Fix</button>` : ''}
              ${r.aiFixable ? `<button class="btn btn-ghost btn-sm" onclick="SynapseApp.tabs.governor.triggerAIFix(${i})">AI Fix</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>`;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AUTO-FIX & AI-FIX
  // ════════════════════════════════════════════════════════════════════════════

  async function triggerAutoFix(index) {
    if (!_lastState) return;
    const rec = (_lastState.recommendations || _lastState.fixes || [])[index];
    if (!rec) return;

    try {
      const res = await fetch(`${CONFIG.API_V1}/governor/auto-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fix: rec }),
      });
      const data = await res.json();
      if (data.diff) {
        SynapseApp.showDiffPreview(data.diff, data.file || rec.file);
      }
      // Refresh state
      await fetchGovernorState();
    } catch (err) {
      Notifications.addAlert('error', `Auto-fix failed: ${err.message}`);
    }
  }

  async function triggerAutoFixAll() {
    if (!_lastState) return;
    const recs = _lastState.recommendations || _lastState.fixes || [];
    for (let i = 0; i < recs.length; i++) {
      if (recs[i].autoFix !== false) await triggerAutoFix(i);
    }
  }

  async function triggerAIFix(index) {
    if (!_lastState) return;
    const rec = (_lastState.recommendations || _lastState.fixes || [])[index];
    if (!rec) return;

    try {
      const res = await fetch(`${CONFIG.API_V1}/governor/ai-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue: rec }),
      });
      const data = await res.json();
      if (data.diff) {
        SynapseApp.showDiffPreview(data.diff, data.file || rec.file);
      }
      await fetchGovernorState();
    } catch (err) {
      Notifications.addAlert('error', `AI fix failed: ${err.message}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AUTO-HEAL (FULL CYCLE)
  // ════════════════════════════════════════════════════════════════════════════

  async function runAutoHeal(dryRun = true) {
    const log = document.getElementById('govAutoHealLog');
    if (!log) return;
    log.innerHTML = '';

    const steps = ['scan', 'filter', 'generate', 'validate', dryRun ? 'preview' : 'apply', 'rescan'];

    for (const step of steps) {
      const entry = document.createElement('div');
      entry.style.cssText = 'font-size:0.68rem;padding:2px 0;';
      entry.innerHTML = `<span style="color:var(--accent-yellow);"></span> ${step}…`;
      log.appendChild(entry);

      try {
        const res = await fetch(`${CONFIG.API_V1}/governor/auto-heal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step, dryRun }),
        });
        const data = await res.json();
        entry.innerHTML = `<span style="color:var(--accent-green);"></span> ${step} — ${data.message || 'OK'}`;
      } catch (err) {
        entry.innerHTML = `<span style="color:var(--accent-red);"></span> ${step} — ${err.message}`;
        break;
      }
    }

    await fetchGovernorState();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // POLLING
  // ════════════════════════════════════════════════════════════════════════════

  function startPolling(intervalMs = 10000) {
    stopPolling();
    fetchGovernorState();
    _pollingInterval = setInterval(fetchGovernorState, intervalMs);
    const btn = document.getElementById('govPollToggle');
    if (btn) { btn.textContent = 'Stop Polling'; btn.classList.add('active'); }
    const pollStatus = document.getElementById('governorPollStatus');
    if (pollStatus) pollStatus.textContent = 'Monitoring (10s)';
  }

  function stopPolling() {
    if (_pollingInterval) { clearInterval(_pollingInterval); _pollingInterval = null; }
    const btn = document.getElementById('govPollToggle');
    if (btn) { btn.textContent = 'Start Polling'; btn.classList.remove('active'); }
    const pollStatus = document.getElementById('governorPollStatus');
    if (pollStatus) pollStatus.textContent = 'Manual mode';
  }
})();
