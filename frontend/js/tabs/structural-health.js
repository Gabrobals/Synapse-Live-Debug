/**
 * Live Debug — Tab 15: Structural Health
 * Scan via /v1/introspect/structural-health, grade/score hero,
 * subsystem cards sorted by severity, findings, spec vs reality matrix
 */
(function () {
  'use strict';

  SynapseApp.tabs.health = {
    scan: scanStructuralHealth,
  };

  async function scanStructuralHealth() {
    const container = document.getElementById('healthBody');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:var(--space-xl);color:var(--text-dim);">Scanning structural health…</div>';

    try {
      const res = await fetch(`${CONFIG.API_V1}/introspect/structural-health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderStructuralHealth(container, data);
    } catch (err) {
      container.innerHTML = `<div style="text-align:center;padding:var(--space-xl);color:var(--accent-red);">Failed: ${err.message}</div>`;
    }
  }

  function renderStructuralHealth(container, data) {
    const grade = data.grade || '?';
    const score = data.score ?? 0;
    const subsystems = data.subsystems || data.layers || [];
    const findings = data.findings || data.issues || [];
    const matrix = data.matrix || data.specVsReality || [];

    const gradeColor = score >= 90 ? 'var(--accent-green)' :
      score >= 75 ? 'var(--accent-cyan)' :
      score >= 60 ? 'var(--accent-yellow)' :
      score >= 40 ? 'var(--accent-orange)' : 'var(--accent-red)';

    // Sort subsystems by severity (worst first)
    const sortedSubs = [...subsystems].sort((a, b) => (a.score ?? 100) - (b.score ?? 100));

    container.innerHTML = `
      <!-- Grade Hero -->
      <div class="glass-card" style="text-align:center;margin-bottom:var(--space-md);border:1px solid ${gradeColor};">
        <div style="font-size:3rem;font-weight:800;color:${gradeColor};">${grade}</div>
        <div style="font-size:1.2rem;color:var(--text-primary);">Structural Health Score: ${score.toFixed(0)}/100</div>
        <div style="margin-top:var(--space-sm);height:10px;background:var(--surface-secondary);border-radius:var(--radius-sm);overflow:hidden;max-width:300px;margin-left:auto;margin-right:auto;">
          <div style="height:100%;width:${Math.min(score, 100)}%;background:${gradeColor};border-radius:var(--radius-sm);transition:width 0.5s;"></div>
        </div>
        <div style="font-size:0.68rem;color:var(--text-dim);margin-top:var(--space-xs);">${subsystems.length} subsystems · ${findings.length} findings</div>
      </div>

      <!-- Subsystem Cards -->
      ${sortedSubs.length > 0 ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-sm);margin-bottom:var(--space-md);">
          ${sortedSubs.map(sub => {
            const subScore = sub.score ?? 0;
            const subColor = subScore >= 80 ? 'var(--accent-green)' : subScore >= 60 ? 'var(--accent-yellow)' : 'var(--accent-red)';
            const severity = sub.severity || (subScore >= 80 ? 'healthy' : subScore >= 60 ? 'warning' : 'critical');
            const sevIcons = { healthy: '', warning: '', critical: '' };

            return `<div class="glass-card" style="border-left:3px solid ${subColor};">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-xs);">
                <span style="font-size:0.75rem;font-weight:600;color:var(--text-primary);">${sub.name || sub.layer || '—'}</span>
                <span>${sevIcons[severity] || '—'}</span>
              </div>
              <div style="font-size:1.1rem;font-weight:700;color:${subColor};">${subScore.toFixed(0)}/100</div>
              ${sub.issues ? `<div style="font-size:0.62rem;color:var(--text-dim);margin-top:2px;">${sub.issues} issues</div>` : ''}
              ${sub.description ? `<div style="font-size:0.62rem;color:var(--text-tertiary);margin-top:2px;">${sub.description}</div>` : ''}
              <div style="margin-top:var(--space-xs);height:4px;background:var(--surface-secondary);border-radius:2px;overflow:hidden;">
                <div style="height:100%;width:${Math.min(subScore, 100)}%;background:${subColor};"></div>
              </div>
            </div>`;
          }).join('')}
        </div>` : ''}

      <!-- Findings -->
      ${findings.length > 0 ? `
        <div class="glass-card" style="margin-bottom:var(--space-md);">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Findings (${findings.length})</div>
          ${findings.slice(0, 20).map(f => {
            const fColor = f.severity === 'error' || f.severity === 'critical' ? 'var(--accent-red)' : f.severity === 'warning' ? 'var(--accent-yellow)' : 'var(--accent-cyan)';
            return `<div style="padding:var(--space-xs) 0;border-bottom:1px solid var(--border-subtle);font-size:0.68rem;">
              <span style="color:${fColor};font-weight:600;">[${f.severity || 'info'}]</span>
              <span style="color:var(--text-secondary);">${f.message || f.description || '—'}</span>
              ${f.subsystem || f.layer ? `<span style="color:var(--text-dim);"> (${f.subsystem || f.layer})</span>` : ''}
              ${f.file ? `<span style="color:var(--text-dim);"> — ${f.file}</span>` : ''}
            </div>`;
          }).join('')}
          ${findings.length > 20 ? `<div style="font-size:0.62rem;color:var(--text-dim);margin-top:var(--space-xs);">… and ${findings.length - 20} more findings</div>` : ''}
        </div>` : ''}

      <!-- Spec vs Reality Matrix -->
      ${matrix.length > 0 ? `
        <div class="glass-card">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Spec vs Reality</div>
          <div style="overflow-x:auto;">
            <table style="width:100%;font-size:0.62rem;border-collapse:collapse;">
              <thead><tr style="color:var(--text-dim);border-bottom:1px solid var(--border-subtle);">
                <th style="text-align:left;padding:4px;">Feature / Spec</th>
                <th style="text-align:center;padding:4px;">Specified</th>
                <th style="text-align:center;padding:4px;">Implemented</th>
                <th style="text-align:center;padding:4px;">Status</th>
              </tr></thead>
              <tbody>
                ${matrix.map(row => {
                  const spec = row.specified !== undefined ? row.specified : true;
                  const impl = row.implemented !== undefined ? row.implemented : false;
                  const match = spec === impl || (spec && impl);
                  return `<tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:4px;color:var(--text-secondary);">${row.feature || row.name || '—'}</td>
                    <td style="padding:4px;text-align:center;">${spec ? '' : '—'}</td>
                    <td style="padding:4px;text-align:center;">${impl ? '' : ''}</td>
                    <td style="padding:4px;text-align:center;color:${match ? 'var(--accent-green)' : 'var(--accent-red)'};">
                      ${match ? 'Match' : 'Gap'}
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}`;
  }
})();
