/**
 * Live Debug — Tab 11: Quality & Coverage Dashboard
 * Enterprise thresholds, 9-layer file classification, gap analysis
 */
(function () {
  'use strict';

  const ENTERPRISE_THRESHOLDS = { lines: 80, statements: 80, branches: 70, functions: 80 };
  const ENTERPRISE_TARGET = 90;

  function classifyFile(filepath) {
    const p = filepath.toLowerCase();
    if (p.includes('/component') || p.endsWith('.tsx') || p.endsWith('.vue') || p.endsWith('.svelte')) return 'UI Components';
    if (p.includes('/hook') || p.includes('use')) return 'Hooks';
    if (p.includes('/store') || p.includes('zustand') || p.includes('pinia')) return 'Stores';
    if (p.includes('/service') || p.includes('/api/')) return 'Services';
    if (p.includes('/engine') || p.includes('/core/')) return 'Engine';
    if (p.includes('route') || p.includes('router')) return 'Routes';
    if (p.includes('backend') || p.includes('.py')) return 'Backend';
    if (p.includes('util') || p.includes('helper') || p.includes('lib/')) return 'Utilities';
    return 'Other';
  }

  function gradeColor(pct) {
    if (pct >= 90) return 'var(--accent-green)';
    if (pct >= 75) return 'var(--accent-cyan)';
    if (pct >= 60) return 'var(--accent-yellow)';
    if (pct >= 40) return 'var(--accent-orange)';
    return 'var(--accent-red)';
  }

  function gradeLabel(pct) {
    if (pct >= 90) return 'A';
    if (pct >= 75) return 'B';
    if (pct >= 60) return 'C';
    if (pct >= 40) return 'D';
    return 'F';
  }

  SynapseApp.tabs.quality = {
    load: loadQualityDashboard,
    refresh: loadQualityDashboard,
  };

  async function loadQualityDashboard() {
    const container = document.getElementById('qualityBody');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:var(--space-xl);color:var(--text-dim);">Loading coverage data…</div>';

    try {
      const res = await fetch(`${CONFIG.API_V1}/coverage`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderQualityDashboard(container, data);
    } catch (err) {
      container.innerHTML = `<div style="text-align:center;padding:var(--space-xl);color:var(--accent-red);">Failed: ${err.message}</div>`;
    }
  }

  function renderQualityDashboard(container, data) {
    const files = data.files || data.coverage || [];
    const summary = data.summary || data.totals || {};

    // Per-layer aggregation
    const layers = {};
    for (const file of files) {
      const layer = classifyFile(file.file || file.path || '');
      if (!layers[layer]) layers[layer] = { files: 0, totalLines: 0, coveredLines: 0, totalBranches: 0, coveredBranches: 0, totalFns: 0, coveredFns: 0 };
      const l = layers[layer];
      l.files++;
      l.totalLines += file.lines?.total || file.totalLines || 0;
      l.coveredLines += file.lines?.covered || file.coveredLines || 0;
      l.totalBranches += file.branches?.total || file.totalBranches || 0;
      l.coveredBranches += file.branches?.covered || file.coveredBranches || 0;
      l.totalFns += file.functions?.total || file.totalFunctions || 0;
      l.coveredFns += file.functions?.covered || file.coveredFunctions || 0;
    }

    // Overall
    const overallPct = summary.lines?.pct || summary.lineCoverage || 0;

    // Untested files
    const untested = files.filter(f => {
      const pct = f.lines?.pct ?? f.lineCoverage ?? 0;
      return pct === 0;
    });

    // Low coverage
    const lowCoverage = files.filter(f => {
      const pct = f.lines?.pct ?? f.lineCoverage ?? 0;
      return pct > 0 && pct < ENTERPRISE_THRESHOLDS.lines;
    }).sort((a, b) => (a.lines?.pct ?? a.lineCoverage ?? 0) - (b.lines?.pct ?? b.lineCoverage ?? 0));

    // Enterprise gap analysis
    const gaps = analyzeEnterpriseGaps(files, summary);

    container.innerHTML = `
      <!-- Overall Grade -->
      <div class="glass-card" style="text-align:center;margin-bottom:var(--space-md);border:1px solid ${gradeColor(overallPct)};">
        <div style="font-size:2.5rem;font-weight:800;color:${gradeColor(overallPct)};">${gradeLabel(overallPct)}</div>
        <div style="font-size:1.2rem;color:var(--text-primary);">${overallPct.toFixed(1)}% Line Coverage</div>
        <div style="font-size:0.72rem;color:var(--text-tertiary);">${files.length} files · Target: ${ENTERPRISE_TARGET}%</div>
        <div style="margin-top:var(--space-sm);height:8px;background:var(--surface-secondary);border-radius:var(--radius-sm);overflow:hidden;">
          <div style="height:100%;width:${Math.min(overallPct, 100)}%;background:${gradeColor(overallPct)};border-radius:var(--radius-sm);"></div>
        </div>
      </div>

      <!-- Layer Breakdown -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:var(--space-sm);margin-bottom:var(--space-md);">
        ${Object.entries(layers).map(([name, l]) => {
          const pct = l.totalLines > 0 ? (l.coveredLines / l.totalLines * 100) : 0;
          const branchPct = l.totalBranches > 0 ? (l.coveredBranches / l.totalBranches * 100) : 0;
          return `<div class="glass-card" style="border-left:3px solid ${gradeColor(pct)};">
            <div style="font-weight:600;font-size:0.75rem;">${name}</div>
            <div style="font-size:1.1rem;font-weight:700;color:${gradeColor(pct)};">${pct.toFixed(1)}%</div>
            <div style="font-size:0.62rem;color:var(--text-dim);">${l.files} files · Branches: ${branchPct.toFixed(0)}%</div>
            <div style="margin-top:4px;height:4px;background:var(--surface-secondary);border-radius:2px;overflow:hidden;">
              <div style="height:100%;width:${Math.min(pct, 100)}%;background:${gradeColor(pct)};"></div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <!-- Untested Files -->
      ${untested.length > 0 ? `
        <div class="glass-card" style="border-left:3px solid var(--accent-red);margin-bottom:var(--space-md);">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Untested Files (${untested.length})</div>
          ${untested.slice(0, 20).map(f => `<div style="font-size:0.65rem;color:var(--text-tertiary);padding:1px 0;">${f.file || f.path}</div>`).join('')}
          ${untested.length > 20 ? `<div style="font-size:0.62rem;color:var(--text-dim);">… and ${untested.length - 20} more</div>` : ''}
        </div>` : ''}

      <!-- Low Coverage -->
      ${lowCoverage.length > 0 ? `
        <div class="glass-card" style="border-left:3px solid var(--accent-orange);margin-bottom:var(--space-md);">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Low Coverage (${lowCoverage.length})</div>
          ${lowCoverage.slice(0, 15).map(f => {
            const pct = f.lines?.pct ?? f.lineCoverage ?? 0;
            return `<div style="font-size:0.65rem;display:flex;justify-content:space-between;padding:1px 0;">
              <span style="color:var(--text-tertiary);">${f.file || f.path}</span>
              <span style="color:${gradeColor(pct)};font-weight:600;">${pct.toFixed(0)}%</span>
            </div>`;
          }).join('')}
        </div>` : ''}

      <!-- Enterprise Gap Analysis -->
      <div class="glass-card" style="border-left:3px solid var(--accent-purple);">
        <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Enterprise Gap Analysis</div>
        ${gaps.map(gap => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-xs) 0;border-bottom:1px solid var(--border-subtle);">
            <div>
              <div style="font-size:0.72rem;color:var(--text-secondary);">${gap.name}</div>
              <div style="font-size:0.6rem;color:var(--text-dim);">${gap.detail}</div>
            </div>
            <div style="font-size:0.72rem;font-weight:600;color:${gap.met ? 'var(--accent-green)' : 'var(--accent-red)'};">
              ${gap.met ? '' : ''} ${gap.value}
            </div>
          </div>
        `).join('')}
      </div>`;
  }

  function analyzeEnterpriseGaps(files, summary) {
    const linePct = summary.lines?.pct ?? summary.lineCoverage ?? 0;
    const branchPct = summary.branches?.pct ?? summary.branchCoverage ?? 0;
    const fnPct = summary.functions?.pct ?? summary.functionCoverage ?? 0;

    return [
      { name: 'Unit Test Coverage', detail: `Target: ${ENTERPRISE_THRESHOLDS.lines}% lines`, value: `${linePct.toFixed(0)}%`, met: linePct >= ENTERPRISE_THRESHOLDS.lines },
      { name: 'Branch Coverage', detail: `Target: ${ENTERPRISE_THRESHOLDS.branches}% branches`, value: `${branchPct.toFixed(0)}%`, met: branchPct >= ENTERPRISE_THRESHOLDS.branches },
      { name: 'Function Coverage', detail: `Target: ${ENTERPRISE_THRESHOLDS.functions}% functions`, value: `${fnPct.toFixed(0)}%`, met: fnPct >= ENTERPRISE_THRESHOLDS.functions },
      { name: 'E2E Tests', detail: 'Playwright test suite exists', value: files.some(f => (f.file||'').includes('e2e')) ? 'Yes' : 'No', met: files.some(f => (f.file||'').includes('e2e')) },
      { name: 'Backend Tests', detail: 'pytest or backend test files', value: files.some(f => (f.file||'').includes('.py') || (f.file||'').includes('test_')) ? 'Yes' : 'No', met: files.some(f => (f.file||'').includes('test_')) },
      { name: 'Security Tests', detail: 'Security audit tests', value: 'Pending', met: false },
      { name: 'Performance Tests', detail: 'Performance benchmarks', value: 'Pending', met: false },
      { name: 'Accessibility', detail: 'A11y audit tests', value: 'Pending', met: false },
      { name: 'API Contract', detail: 'OpenAPI contract tests', value: 'Pending', met: false },
    ];
  }
})();
