/**
 * Live Debug — Tab 12: TQI (Total Quality Index) Dashboard
 * Gauge, breakdown bars, coverage vs quality gap, pattern detection, worst files
 */
(function () {
  'use strict';

  const METRIC_LABELS = {
    coverage: 'Coverage', reliability: 'Reliability', maintainability: 'Maintainability',
    security: 'Security', performance: 'Performance', complexity: 'Complexity',
    duplication: 'Duplication', documentation: 'Documentation',
  };

  function tqiGradeColor(score) {
    if (score >= 90) return 'var(--accent-green)';
    if (score >= 70) return 'var(--accent-cyan)';
    if (score >= 50) return 'var(--accent-yellow)';
    if (score >= 30) return 'var(--accent-orange)';
    return 'var(--accent-red)';
  }

  SynapseApp.tabs.tqi = {
    load: loadTQIDashboard,
    refresh: loadTQIDashboard,
  };

  async function loadTQIDashboard() {
    const container = document.getElementById('tqiBody');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:var(--space-xl);color:var(--text-dim);">Loading TQI data…</div>';

    try {
      const res = await fetch(`${CONFIG.API_V1}/tqi`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderTQIDashboard(container, data);
    } catch (err) {
      container.innerHTML = `<div style="text-align:center;padding:var(--space-xl);color:var(--accent-red);">Failed: ${err.message}</div>`;
    }
  }

  function renderTQIDashboard(container, data) {
    const tqi = data.tqi ?? data.score ?? 0;
    const breakdown = data.breakdown || data.metrics || {};
    const patterns = data.patterns || [];
    const worstFiles = data.worstFiles || data.worst || [];
    const coverageScore = breakdown.coverage ?? 0;
    const qualityScore = breakdown.maintainability ?? breakdown.reliability ?? 0;

    container.innerHTML = `
      <!-- TQI Gauge -->
      <div class="glass-card" style="text-align:center;margin-bottom:var(--space-md);">
        <div style="width:160px;height:80px;margin:0 auto;position:relative;overflow:hidden;">
          <div style="width:160px;height:160px;border-radius:50%;background:conic-gradient(${tqiGradeColor(tqi)} ${tqi * 1.8}deg, var(--surface-secondary) 0deg);position:absolute;top:0;"></div>
          <div style="width:120px;height:120px;border-radius:50%;background:var(--surface-primary);position:absolute;top:20px;left:20px;"></div>
          <div style="position:absolute;top:30px;left:0;right:0;text-align:center;">
            <div style="font-size:1.8rem;font-weight:800;color:${tqiGradeColor(tqi)};">${tqi.toFixed(0)}</div>
            <div style="font-size:0.62rem;color:var(--text-dim);">TQI Score</div>
          </div>
        </div>
      </div>

      <!-- Breakdown Bars -->
      <div class="glass-card" style="margin-bottom:var(--space-md);">
        <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Quality Breakdown</div>
        ${Object.entries(breakdown).map(([key, value]) => {
          const label = METRIC_LABELS[key] || key;
          const val = typeof value === 'number' ? value : 0;
          return `<div style="margin-bottom:var(--space-xs);">
            <div style="display:flex;justify-content:space-between;font-size:0.68rem;margin-bottom:2px;">
              <span style="color:var(--text-secondary);">${label}</span>
              <span style="color:${tqiGradeColor(val)};font-weight:600;">${val.toFixed(0)}</span>
            </div>
            <div style="height:6px;background:var(--surface-secondary);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${Math.min(val, 100)}%;background:${tqiGradeColor(val)};border-radius:3px;transition:width 0.5s;"></div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <!-- Coverage vs Quality Gap -->
      <div class="glass-card" style="margin-bottom:var(--space-md);">
        <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Coverage vs Quality Gap</div>
        <div style="display:flex;gap:var(--space-md);align-items:flex-end;height:100px;">
          <div style="flex:1;text-align:center;">
            <div style="height:${Math.min(coverageScore, 100)}px;background:var(--accent-cyan);border-radius:var(--radius-sm) var(--radius-sm) 0 0;margin:0 auto;width:40px;"></div>
            <div style="font-size:0.65rem;margin-top:4px;color:var(--text-tertiary);">Coverage<br><span style="color:${tqiGradeColor(coverageScore)};">${coverageScore.toFixed(0)}</span></div>
          </div>
          <div style="flex:1;text-align:center;">
            <div style="height:${Math.min(qualityScore, 100)}px;background:var(--accent-purple);border-radius:var(--radius-sm) var(--radius-sm) 0 0;margin:0 auto;width:40px;"></div>
            <div style="font-size:0.65rem;margin-top:4px;color:var(--text-tertiary);">Quality<br><span style="color:${tqiGradeColor(qualityScore)};">${qualityScore.toFixed(0)}</span></div>
          </div>
          <div style="flex:1;text-align:center;">
            <div style="height:${Math.min(Math.abs(coverageScore - qualityScore), 100)}px;background:var(--accent-orange);border-radius:var(--radius-sm) var(--radius-sm) 0 0;margin:0 auto;width:40px;"></div>
            <div style="font-size:0.65rem;margin-top:4px;color:var(--text-tertiary);">Gap<br><span style="color:var(--accent-orange);">${Math.abs(coverageScore - qualityScore).toFixed(0)}</span></div>
          </div>
        </div>
      </div>

      <!-- Pattern Detection -->
      ${patterns.length > 0 ? `
        <div class="glass-card" style="margin-bottom:var(--space-md);">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Detected Patterns</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:var(--space-sm);">
            ${patterns.map(p => `
              <div class="glass-card" style="border-left:3px solid ${p.severity === 'critical' ? 'var(--accent-red)' : p.severity === 'warning' ? 'var(--accent-yellow)' : 'var(--accent-cyan)'};">
                <div style="font-size:0.72rem;font-weight:600;color:var(--text-primary);">${p.name || p.pattern || '—'}</div>
                <div style="font-size:0.62rem;color:var(--text-tertiary);margin-top:2px;">${p.description || p.detail || ''}</div>
                <div style="font-size:0.6rem;color:var(--text-dim);margin-top:2px;">${p.count || 0} occurrences</div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

      <!-- Worst Files -->
      ${worstFiles.length > 0 ? `
        <div class="glass-card">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Worst Files</div>
          <div style="overflow-x:auto;">
            <table style="width:100%;font-size:0.65rem;border-collapse:collapse;">
              <thead><tr style="color:var(--text-dim);border-bottom:1px solid var(--border-subtle);">
                <th style="text-align:left;padding:4px;">File</th>
                <th style="text-align:right;padding:4px;">Score</th>
                <th style="text-align:right;padding:4px;">Issues</th>
              </tr></thead>
              <tbody>
                ${worstFiles.slice(0, 15).map(f => `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:4px;color:var(--text-tertiary);">${f.file || f.path || '—'}</td>
                    <td style="padding:4px;text-align:right;color:${tqiGradeColor(f.score || 0)};font-weight:600;">${(f.score || 0).toFixed(0)}</td>
                    <td style="padding:4px;text-align:right;color:var(--text-dim);">${f.issues || f.problems || 0}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}`;
  }
})();
