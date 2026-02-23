/**
 * Live Debug — Tab 7: Test Center / Runner
 * 14 test suites: vitest, tsc, eslint, integration, e2e, pytest,
 * OpenAPI audit, TLA+, coverage, security, a11y, perf, contract, dependency
 */
(function () {
  'use strict';

  const TEST_SUITES = [
    { id: 'vitest', name: 'Vitest Unit', icon: '', endpoint: '/v1/tests/run/vitest', color: 'var(--accent-green)' },
    { id: 'tsc', name: 'TypeScript', icon: '', endpoint: '/v1/tests/run/tsc', color: 'var(--accent-cyan)' },
    { id: 'eslint', name: 'ESLint', icon: '', endpoint: '/v1/tests/run/eslint', color: 'var(--accent-purple)' },
    { id: 'integration', name: 'Integration (18)', icon: '', endpoint: '/v1/tests/run/integration', color: 'var(--accent-orange)' },
    { id: 'e2e', name: 'E2E Playwright', icon: '', endpoint: '/v1/tests/run/e2e', color: 'var(--accent-pink)' },
    { id: 'pytest', name: 'Pytest Backend', icon: '', endpoint: '/v1/tests/run/pytest', color: 'var(--accent-yellow)' },
    { id: 'openapi', name: 'OpenAPI Audit', icon: '', endpoint: '/v1/tests/run/openapi', color: 'var(--accent-cyan)' },
    { id: 'tlaplus', name: 'TLA+ Specs', icon: '', endpoint: '/v1/tests/run/tlaplus', color: 'var(--accent-purple)' },
    { id: 'coverage', name: 'Coverage', icon: '', endpoint: '/v1/tests/run/coverage', color: 'var(--accent-green)' },
    { id: 'security', name: 'Security', icon: '', endpoint: '/v1/tests/run/security', color: 'var(--accent-red)' },
    { id: 'a11y', name: 'Accessibility', icon: '', endpoint: '/v1/tests/run/a11y', color: 'var(--accent-cyan)' },
    { id: 'perf', name: 'Performance', icon: '', endpoint: '/v1/tests/run/perf', color: 'var(--accent-orange)' },
    { id: 'contract', name: 'API Contract', icon: '', endpoint: '/v1/tests/run/contract', color: 'var(--accent-yellow)' },
    { id: 'dependency', name: 'Dependency Audit', icon: '', endpoint: '/v1/tests/run/dependency', color: 'var(--accent-purple)' },
  ];

  let _results = {};
  const _running = new Set();

  SynapseApp.tabs.runner = {
    render: renderTestSuites,
    run: runTestSuite,
    runAll: runAllTestSuites,
    clear: clearRunnerOutput,
  };

  function renderTestSuites() {
    const container = document.getElementById('testSuiteGrid');
    if (!container) return;

    container.innerHTML = TEST_SUITES.map(suite => {
      const result = _results[suite.id];
      const isRunning = _running.has(suite.id);
      const status = isRunning ? 'running' : result ? (result.pass ? 'pass' : 'fail') : 'idle';
      const statusColors = { idle: 'var(--border-subtle)', running: 'var(--accent-yellow)', pass: 'var(--accent-green)', fail: 'var(--accent-red)' };
      const statusIcons = { idle: '', running: '', pass: '', fail: '' };

      return `<div class="glass-card" style="border-left:3px solid ${statusColors[status]};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-xs);">
          <span style="font-size:0.78rem;font-weight:600;">${suite.icon} ${suite.name}</span>
          <span style="font-size:0.7rem;">${statusIcons[status]}</span>
        </div>
        ${result ? `
          <div style="font-size:0.68rem;color:var(--text-tertiary);margin-bottom:var(--space-xs);">
            ${result.passed || 0} passed · ${result.failed || 0} failed · ${result.duration || '—'}
          </div>
          ${result.output ? `<pre style="font-size:0.62rem;max-height:100px;overflow:auto;color:var(--text-dim);margin:0;white-space:pre-wrap;">${escapeHTML(result.output.substring(0, 500))}</pre>` : ''}
        ` : '<div style="font-size:0.68rem;color:var(--text-dim);">Not run yet</div>'}
        <div style="margin-top:var(--space-xs);">
          <button class="btn btn-ghost btn-sm" onclick="SynapseApp.tabs.runner.run('${suite.id}')" ${isRunning ? 'disabled' : ''}>
            ${isRunning ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>`;
    }).join('');

    updateRunnerTotals();
  }

  async function runTestSuite(suiteId) {
    const suite = TEST_SUITES.find(s => s.id === suiteId);
    if (!suite || _running.has(suiteId)) return;

    _running.add(suiteId);
    renderTestSuites();

    try {
      const res = await fetch(`${CONFIG.API_BASE}${suite.endpoint}`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _results[suiteId] = {
        pass: data.success !== false && (data.failed || 0) === 0,
        passed: data.passed || data.pass_count || 0,
        failed: data.failed || data.fail_count || 0,
        duration: data.duration || data.elapsed || '—',
        output: data.output || data.stdout || data.message || '',
        timestamp: Date.now(),
      };
    } catch (err) {
      _results[suiteId] = { pass: false, passed: 0, failed: 1, duration: '—', output: err.message, timestamp: Date.now() };
    }

    _running.delete(suiteId);
    renderTestSuites();
  }

  async function runAllTestSuites() {
    const btn = document.getElementById('runAllTestsBtn');
    if (btn) btn.disabled = true;
    for (const suite of TEST_SUITES) {
      await runTestSuite(suite.id);
    }
    if (btn) btn.disabled = false;
  }

  function updateRunnerTotals() {
    const totalEl = document.getElementById('runnerTotals');
    if (!totalEl) return;

    const results = Object.values(_results);
    if (results.length === 0) { totalEl.textContent = 'No results'; return; }

    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    const totalTests = results.reduce((a, r) => a + (r.passed || 0) + (r.failed || 0), 0);
    totalEl.innerHTML = `<span style="color:var(--accent-green);"> ${passed} suites passed</span> · <span style="color:var(--accent-red);"> ${failed} failed</span> · ${totalTests} total tests`;
  }

  function clearRunnerOutput() {
    _results = {};
    _running.clear();
    renderTestSuites();
  }

  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
