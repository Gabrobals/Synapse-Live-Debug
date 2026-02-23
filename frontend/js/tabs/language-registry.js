/**
 * Live Debug — Tab 16: Language Registry
 * REAL PROJECT SCAN - fetches actual languages from backend
 */
(function () {
  'use strict';

  SynapseApp.tabs.langreg = {
    scan: scanLanguageRegistry,
    refresh: scanLanguageRegistry,
  };

  async function scanLanguageRegistry() {
    const container = document.getElementById('langregBody');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:var(--space-xl);color:var(--text-dim);">Scanning project languages...</div>';

    try {
      const res = await fetch(`${CONFIG.API_V1}/introspect/language-registry`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderLanguageRegistry(container, data);
    } catch (err) {
      container.innerHTML = `<div style="text-align:center;padding:var(--space-xl);color:var(--accent-red);">Failed: ${err.message}</div>`;
    }
  }

  function renderLanguageRegistry(container, data) {
    const summary = data.summary || {};
    const detected = data.detected || [];
    const byTier = data.byTier || {};
    const integrations = data.integrations || [];
    const testPatterns = data.testPatterns || [];
    const configFiles = data.configFiles || [];
    const projectRoot = data.projectRoot || 'Unknown';
    const scannedAt = data.scannedAt || '--:--:--';

    const tierColors = {
      'Tier 1 - Core': 'var(--accent-cyan)',
      'Tier 2 - Enterprise': 'var(--accent-purple)',
      'Tier 3 - Modern': 'var(--accent-green)',
      'Tier 4 - Functional': 'var(--accent-orange)',
      'Tier 5 - Config': 'var(--text-tertiary)',
    };

    container.innerHTML = `
      <!-- Project Info -->
      <div class="glass-card" style="margin-bottom:var(--space-md);border-left:3px solid var(--accent-cyan);">
        <div style="font-size:0.68rem;color:var(--text-dim);">Project Root</div>
        <div style="font-size:0.78rem;color:var(--text-primary);font-family:var(--font-mono);word-break:break-all;">${escapeHTML(projectRoot)}</div>
        <div style="font-size:0.62rem;color:var(--text-dim);margin-top:4px;">Scanned at ${scannedAt}</div>
      </div>

      <!-- Summary Cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:var(--space-sm);margin-bottom:var(--space-md);">
        <div class="glass-card" style="text-align:center;">
          <div style="font-size:1.5rem;font-weight:700;color:var(--accent-cyan);">${summary.totalLanguages || 0}</div>
          <div style="font-size:0.62rem;color:var(--text-dim);">Languages Detected</div>
        </div>
        <div class="glass-card" style="text-align:center;">
          <div style="font-size:1.5rem;font-weight:700;color:var(--accent-purple);">${summary.totalExtensions || 0}</div>
          <div style="font-size:0.62rem;color:var(--text-dim);">Extensions Used</div>
        </div>
        <div class="glass-card" style="text-align:center;">
          <div style="font-size:1.5rem;font-weight:700;color:var(--accent-green);">${summary.totalFiles || 0}</div>
          <div style="font-size:0.62rem;color:var(--text-dim);">Total Files</div>
        </div>
        <div class="glass-card" style="text-align:center;">
          <div style="font-size:1.5rem;font-weight:700;color:var(--accent-orange);">${summary.tiers || 0}</div>
          <div style="font-size:0.62rem;color:var(--text-dim);">Active Tiers</div>
        </div>
      </div>

      <!-- Detected Languages Table -->
      ${detected.length > 0 ? `
        <div class="glass-card" style="margin-bottom:var(--space-md);">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Detected Languages (${detected.length})</div>
          <div style="overflow-x:auto;">
            <table style="width:100%;font-size:0.65rem;border-collapse:collapse;">
              <thead><tr style="color:var(--text-dim);border-bottom:1px solid var(--border-subtle);">
                <th style="text-align:left;padding:4px;">Language</th>
                <th style="text-align:left;padding:4px;">Extension</th>
                <th style="text-align:right;padding:4px;">Files</th>
                <th style="text-align:left;padding:4px;">Test Runner</th>
                <th style="text-align:left;padding:4px;">Linter</th>
              </tr></thead>
              <tbody>
                ${detected.map(d => `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:4px;color:var(--text-secondary);font-weight:600;">${escapeHTML(d.lang)}</td>
                    <td style="padding:4px;color:var(--accent-cyan);font-family:var(--font-mono);">${escapeHTML(d.extension)}</td>
                    <td style="padding:4px;text-align:right;color:var(--text-primary);font-weight:600;">${d.fileCount}</td>
                    <td style="padding:4px;color:var(--text-tertiary);">${escapeHTML(d.testRunner)}</td>
                    <td style="padding:4px;color:var(--text-tertiary);">${escapeHTML(d.linter)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}

      <!-- By Tier -->
      ${Object.keys(byTier).length > 0 ? `
        <div class="glass-card" style="margin-bottom:var(--space-md);">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Languages by Tier</div>
          ${Object.entries(byTier).map(([tier, langs]) => {
            const color = tierColors[tier] || 'var(--text-dim)';
            return `
              <div style="margin-bottom:var(--space-sm);padding:var(--space-xs);border-left:3px solid ${color};background:var(--surface-secondary);border-radius:0 var(--radius-sm) var(--radius-sm) 0;">
                <div style="font-size:0.72rem;font-weight:600;color:${color};margin-bottom:4px;">${escapeHTML(tier)} (${langs.length})</div>
                <div style="display:flex;flex-wrap:wrap;gap:var(--space-xs);">
                  ${langs.map(l => `<span style="font-size:0.62rem;padding:2px 6px;background:var(--surface-primary);border-radius:var(--radius-sm);color:var(--text-secondary);">${escapeHTML(l.lang)} <span style="color:var(--accent-cyan);">${l.fileCount}</span></span>`).join('')}
                </div>
              </div>`;
          }).join('')}
        </div>` : ''}

      <!-- File Samples -->
      ${detected.length > 0 ? `
        <div class="glass-card" style="margin-bottom:var(--space-md);">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Sample Files</div>
          ${detected.slice(0, 5).map(d => d.samples && d.samples.length > 0 ? `
            <div style="margin-bottom:var(--space-xs);">
              <span style="font-size:0.68rem;font-weight:600;color:var(--text-secondary);">${escapeHTML(d.lang)}</span>
              <div style="font-size:0.6rem;color:var(--text-dim);font-family:var(--font-mono);margin-left:var(--space-sm);">
                ${d.samples.slice(0, 3).map(s => `<div>${escapeHTML(s)}</div>`).join('')}
              </div>
            </div>` : '').join('')}
        </div>` : ''}

      <!-- Config Files -->
      ${configFiles.length > 0 ? `
        <div class="glass-card" style="margin-bottom:var(--space-md);">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Config Files Detected</div>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-xs);">
            ${configFiles.map(f => `<span style="font-size:0.65rem;padding:3px 8px;background:var(--surface-secondary);border-radius:var(--radius-sm);color:var(--accent-purple);font-family:var(--font-mono);">${escapeHTML(f)}</span>`).join('')}
          </div>
        </div>` : ''}

      <!-- Test Patterns -->
      ${testPatterns.length > 0 ? `
        <div class="glass-card" style="margin-bottom:var(--space-md);">
          <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Test Patterns Detected</div>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-xs);">
            ${testPatterns.map(t => `<span style="font-size:0.65rem;padding:3px 8px;background:var(--accent-green);color:#000;border-radius:var(--radius-sm);font-weight:600;">${escapeHTML(t)}</span>`).join('')}
          </div>
        </div>` : '<div class="glass-card" style="margin-bottom:var(--space-md);border-left:3px solid var(--accent-yellow);"><div style="font-size:0.72rem;color:var(--accent-yellow);">No test files detected in project</div></div>'}

      <!-- Integration Status -->
      <div class="glass-card">
        <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Integration Status</div>
        <table style="width:100%;font-size:0.65rem;border-collapse:collapse;">
          <thead><tr style="color:var(--text-dim);border-bottom:1px solid var(--border-subtle);">
            <th style="text-align:left;padding:3px;">Integration</th>
            <th style="text-align:left;padding:3px;">Description</th>
            <th style="text-align:center;padding:3px;">Status</th>
          </tr></thead>
          <tbody>
            ${integrations.map(i => `
              <tr style="border-bottom:1px solid var(--border-subtle);">
                <td style="padding:4px;color:var(--text-secondary);font-weight:600;">${escapeHTML(i.name)}</td>
                <td style="padding:4px;color:var(--text-tertiary);">${escapeHTML(i.description)}</td>
                <td style="padding:4px;text-align:center;"><span style="padding:2px 6px;border-radius:var(--radius-sm);font-size:0.6rem;font-weight:600;background:${i.status === 'active' ? 'var(--accent-green)' : i.status === 'partial' ? 'var(--accent-yellow)' : 'var(--accent-red)'};color:#000;">${i.status.toUpperCase()}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
