/**
 * Live Debug — Tab 13: Metrics History
 * All-time stats, latency trend chart, hourly history, endpoint performance,
 * fix history, problem trend
 */
(function () {
  'use strict';

  SynapseApp.tabs.metrics = {
    load: fetchMetricsHistory,
    refresh: fetchMetricsHistory,
  };

  async function fetchMetricsHistory() {
    const container = document.getElementById('metricsBody');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:var(--space-xl);color:var(--text-dim);">Loading metrics…</div>';

    try {
      const res = await fetch(`${CONFIG.API_V1}/metrics/history`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderMetricsDashboard(container, data);
    } catch (err) {
      container.innerHTML = `<div style="text-align:center;padding:var(--space-xl);color:var(--accent-red);">Failed: ${err.message}</div>`;
    }
  }

  function renderMetricsDashboard(container, data) {
    const allTime = data.allTime || data.summary || {};
    const hourly = data.hourly || data.history || [];
    const endpoints = data.endpoints || data.endpointStats || [];
    const fixes = data.fixes || data.fixHistory || [];
    const problemTrend = data.problemTrend || data.problems || [];

    container.innerHTML = `
      <!-- All-Time Stats -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:var(--space-sm);margin-bottom:var(--space-md);">
        ${renderStatCard('', 'Total Events', allTime.totalEvents || 0, 'var(--accent-cyan)')}
        ${renderStatCard('', 'Avg Latency', `${(allTime.avgLatency || 0).toFixed(0)}ms`, 'var(--accent-purple)')}
        ${renderStatCard('', 'Total Errors', allTime.totalErrors || 0, 'var(--accent-red)')}
        ${renderStatCard('', 'Fixes Applied', allTime.fixesApplied || 0, 'var(--accent-green)')}
        ${renderStatCard('', 'Peak Problems', allTime.peakProblems || 0, 'var(--accent-orange)')}
        ${renderStatCard('', 'Uptime', allTime.uptime || '—', 'var(--accent-cyan)')}
      </div>

      <!-- Latency Trend Bar Chart -->
      ${hourly.length > 0 ? `
        <div class="glass-card" style="margin-bottom:var(--space-md);">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Latency Trend</div>
          <div style="display:flex;align-items:flex-end;gap:2px;height:120px;padding-top:var(--space-sm);">
            ${hourly.slice(-48).map(h => {
              const val = h.avgLatency || h.latency || 0;
              const maxVal = Math.max(...hourly.map(x => x.avgLatency || x.latency || 0), 1);
              const height = Math.max((val / maxVal) * 100, 2);
              const color = val > 500 ? 'var(--accent-red)' : val > 200 ? 'var(--accent-yellow)' : 'var(--accent-green)';
              return `<div style="flex:1;min-width:8px;height:${height}px;background:${color};border-radius:2px 2px 0 0;" title="${h.hour || h.timestamp || ''}: ${val.toFixed(0)}ms"></div>`;
            }).join('')}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.58rem;color:var(--text-dim);margin-top:4px;">
            <span>${hourly[0]?.hour || hourly[0]?.timestamp || ''}</span>
            <span>${hourly[hourly.length - 1]?.hour || hourly[hourly.length - 1]?.timestamp || ''}</span>
          </div>
        </div>` : ''}

      <!-- Hourly History Table -->
      ${hourly.length > 0 ? `
        <div class="glass-card" style="margin-bottom:var(--space-md);">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Hourly History</div>
          <div style="max-height:200px;overflow-y:auto;">
            <table style="width:100%;font-size:0.62rem;border-collapse:collapse;">
              <thead><tr style="color:var(--text-dim);border-bottom:1px solid var(--border-subtle);position:sticky;top:0;background:var(--surface-primary);">
                <th style="text-align:left;padding:3px;">Time</th>
                <th style="text-align:right;padding:3px;">Events</th>
                <th style="text-align:right;padding:3px;">Latency</th>
                <th style="text-align:right;padding:3px;">Errors</th>
              </tr></thead>
              <tbody>
                ${hourly.slice(-24).reverse().map(h => `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:3px;color:var(--text-tertiary);">${h.hour || h.timestamp || '—'}</td>
                    <td style="padding:3px;text-align:right;color:var(--accent-cyan);">${h.events || 0}</td>
                    <td style="padding:3px;text-align:right;color:var(--text-secondary);">${(h.avgLatency || h.latency || 0).toFixed(0)}ms</td>
                    <td style="padding:3px;text-align:right;color:${(h.errors || 0) > 0 ? 'var(--accent-red)' : 'var(--text-dim)'};">${h.errors || 0}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}

      <!-- Endpoint Stats -->
      ${endpoints.length > 0 ? `
        <div class="glass-card" style="margin-bottom:var(--space-md);">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Endpoint Performance</div>
          ${endpoints.slice(0, 15).map(ep => {
            const latency = ep.avgLatency || ep.latency || 0;
            const maxLatency = Math.max(...endpoints.map(e => e.avgLatency || e.latency || 0), 1);
            return `<div style="margin-bottom:var(--space-xs);">
              <div style="display:flex;justify-content:space-between;font-size:0.65rem;margin-bottom:2px;">
                <span style="color:var(--text-tertiary);">${ep.endpoint || ep.path || '—'}</span>
                <span style="color:var(--text-secondary);">${latency.toFixed(0)}ms · ${ep.calls || ep.count || 0} calls</span>
              </div>
              <div style="height:4px;background:var(--surface-secondary);border-radius:2px;overflow:hidden;">
                <div style="height:100%;width:${(latency / maxLatency * 100).toFixed(0)}%;background:${latency > 500 ? 'var(--accent-red)' : latency > 200 ? 'var(--accent-yellow)' : 'var(--accent-green)'};"></div>
              </div>
            </div>`;
          }).join('')}
        </div>` : ''}

      <!-- Fix History -->
      ${fixes.length > 0 ? `
        <div class="glass-card" style="margin-bottom:var(--space-md);">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Fix History</div>
          ${fixes.slice(0, 10).map(f => `
            <div style="padding:var(--space-xs) 0;border-bottom:1px solid var(--border-subtle);font-size:0.65rem;">
              <span style="color:var(--text-dim);">${f.timestamp || f.time || '—'}</span>
              <span style="color:var(--accent-green);"></span>
              <span style="color:var(--text-secondary);">${f.description || f.message || '—'}</span>
              ${f.file ? `<span style="color:var(--text-dim);"> (${f.file})</span>` : ''}
            </div>
          `).join('')}
        </div>` : ''}

      <!-- Problem Trend -->
      ${problemTrend.length > 0 ? `
        <div class="glass-card">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Problem Trend</div>
          <div style="display:flex;align-items:flex-end;gap:4px;height:80px;">
            ${problemTrend.slice(-30).map(p => {
              const val = p.count || p.problems || 0;
              const max = Math.max(...problemTrend.map(x => x.count || x.problems || 0), 1);
              const height = Math.max((val / max) * 70, 2);
              return `<div style="flex:1;min-width:6px;height:${height}px;background:${val > 5 ? 'var(--accent-red)' : val > 2 ? 'var(--accent-yellow)' : 'var(--accent-green)'};border-radius:2px 2px 0 0;" title="${val} problems"></div>`;
            }).join('')}
          </div>
        </div>` : ''}`;
  }

  function renderStatCard(icon, label, value, color) {
    return `<div class="glass-card" style="text-align:center;">
      <div style="font-size:1.2rem;">${icon}</div>
      <div style="font-size:1.1rem;font-weight:700;color:${color};">${value}</div>
      <div style="font-size:0.62rem;color:var(--text-dim);">${label}</div>
    </div>`;
  }
})();
