/**
 * Live Debug — Tab 14: Project Reality Tracker
 * Parallel fetch roadmap + structural health, render overview stats,
 * codebase summary, documents by category with CATEGORY_META
 */
(function () {
  'use strict';

  const CATEGORY_META = {
    'architecture': { icon: '', color: 'var(--accent-purple)', priority: 1 },
    'api': { icon: '', color: 'var(--accent-cyan)', priority: 2 },
    'testing': { icon: '', color: 'var(--accent-green)', priority: 3 },
    'deployment': { icon: '', color: 'var(--accent-orange)', priority: 4 },
    'security': { icon: '', color: 'var(--accent-red)', priority: 5 },
    'performance': { icon: '', color: 'var(--accent-yellow)', priority: 6 },
    'documentation': { icon: '', color: 'var(--accent-cyan)', priority: 7 },
    'configuration': { icon: '', color: 'var(--text-secondary)', priority: 8 },
    'monitoring': { icon: '', color: 'var(--accent-purple)', priority: 9 },
    'ci-cd': { icon: '', color: 'var(--accent-green)', priority: 10 },
    'database': { icon: '', color: 'var(--accent-orange)', priority: 11 },
    'other': { icon: '', color: 'var(--text-dim)', priority: 99 },
  };

  SynapseApp.tabs.roadmap = {
    scan: scanProjectRoadmap,
  };

  async function scanProjectRoadmap() {
    const container = document.getElementById('roadmapBody');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:var(--space-xl);color:var(--text-dim);">Scanning project…</div>';

    try {
      const [roadmapRes, healthRes] = await Promise.all([
        fetch(`${CONFIG.API_V1}/introspect/roadmap`).catch(() => null),
        fetch(`${CONFIG.API_V1}/introspect/structural-health`).catch(() => null),
      ]);

      const roadmap = roadmapRes?.ok ? await roadmapRes.json() : {};
      const health = healthRes?.ok ? await healthRes.json() : {};

      renderProjectRoadmap(container, roadmap, health);
    } catch (err) {
      container.innerHTML = `<div style="text-align:center;padding:var(--space-xl);color:var(--accent-red);">Failed: ${err.message}</div>`;
    }
  }

  function renderProjectRoadmap(container, roadmap, health) {
    const overview = roadmap.overview || {};
    const codebase = roadmap.codebase || {};
    const documents = roadmap.documents || [];
    const healthSummary = health.summary || health;
    const grade = healthSummary.grade || '?';
    const score = healthSummary.score ?? 0;

    // Overview stats
    const stats = [
      { label: 'Components', value: codebase.components || overview.components || 0, color: 'var(--accent-cyan)' },
      { label: 'Engine Modules', value: codebase.engineModules || overview.engineModules || 0, color: 'var(--accent-purple)' },
      { label: 'Stores', value: codebase.stores || overview.stores || 0, color: 'var(--accent-green)' },
      { label: 'Services', value: codebase.services || overview.services || 0, color: 'var(--accent-orange)' },
      { label: 'Hooks', value: codebase.hooks || overview.hooks || 0, color: 'var(--accent-yellow)' },
      { label: 'Routes', value: codebase.routes || overview.routes || 0, color: 'var(--accent-pink)' },
    ];

    const totalImplemented = stats.reduce((a, s) => a + (typeof s.value === 'number' ? s.value : 0), 0);
    const targetTotal = overview.targetTotal || Math.max(totalImplemented, 100);
    const progressPct = Math.min((totalImplemented / targetTotal) * 100, 100);

    // Group documents by category
    const docsByCategory = {};
    for (const doc of documents) {
      const cat = doc.category || 'other';
      if (!docsByCategory[cat]) docsByCategory[cat] = [];
      docsByCategory[cat].push(doc);
    }

    // Sort categories by priority
    const sortedCategories = Object.entries(docsByCategory).sort((a, b) => {
      return (CATEGORY_META[a[0]]?.priority || 99) - (CATEGORY_META[b[0]]?.priority || 99);
    });

    const gradeColor = score >= 80 ? 'var(--accent-green)' : score >= 60 ? 'var(--accent-yellow)' : 'var(--accent-red)';

    container.innerHTML = `
      <!-- Structural Health Summary -->
      <div class="glass-card" style="border-left:4px solid ${gradeColor};margin-bottom:var(--space-md);display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-size:0.72rem;color:var(--text-dim);">Structural Health</span>
          <div style="font-size:1.4rem;font-weight:800;color:${gradeColor};">${grade} · ${score.toFixed(0)}/100</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="document.querySelector('[data-tab=\\'health\\']')?.click();">View Details →</button>
      </div>

      <!-- Overview Stats -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:var(--space-sm);margin-bottom:var(--space-md);">
        ${stats.map(s => `<div class="glass-card" style="text-align:center;">
          <div style="font-size:1.2rem;font-weight:700;color:${s.color};">${s.value}</div>
          <div style="font-size:0.62rem;color:var(--text-dim);">${s.label}</div>
        </div>`).join('')}
      </div>

      <!-- Overall Progress -->
      <div class="glass-card" style="margin-bottom:var(--space-md);">
        <div style="display:flex;justify-content:space-between;font-size:0.72rem;margin-bottom:var(--space-xs);">
          <span style="color:var(--text-secondary);">Implementation Progress</span>
          <span style="color:var(--accent-cyan);font-weight:600;">${totalImplemented} / ${targetTotal} (${progressPct.toFixed(0)}%)</span>
        </div>
        <div style="height:10px;background:var(--surface-secondary);border-radius:var(--radius-sm);overflow:hidden;">
          <div style="height:100%;width:${progressPct}%;background:linear-gradient(90deg, var(--accent-cyan), var(--accent-purple));border-radius:var(--radius-sm);transition:width 0.5s;"></div>
        </div>
      </div>

      <!-- Codebase Summary -->
      <div class="glass-card" style="margin-bottom:var(--space-md);">
        <div style="font-weight:600;font-size:0.78rem;margin-bottom:var(--space-sm);">Implemented Codebase</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:var(--space-xs);font-size:0.68rem;">
          ${Object.entries(codebase).map(([key, val]) => {
            if (typeof val === 'object' && val !== null) {
              return `<div style="color:var(--text-tertiary);"><strong>${key}:</strong> ${Array.isArray(val) ? `${val.length  } items` : JSON.stringify(val)}</div>`;
            }
            return `<div style="color:var(--text-tertiary);"><strong>${key}:</strong> ${val}</div>`;
          }).join('')}
        </div>
      </div>

      <!-- Documents by Category -->
      ${sortedCategories.length > 0 ? sortedCategories.map(([cat, docs]) => {
        const meta = CATEGORY_META[cat] || CATEGORY_META.other;
        return `<div class="glass-card" style="border-left:3px solid ${meta.color};margin-bottom:var(--space-sm);">
          <details>
            <summary style="cursor:pointer;font-weight:600;font-size:0.75rem;">
              ${meta.icon} ${cat.charAt(0).toUpperCase() + cat.slice(1)} (${docs.length})
            </summary>
            <div style="margin-top:var(--space-xs);">
              ${docs.map(d => `
                <div style="padding:var(--space-xs) 0;border-bottom:1px solid var(--border-subtle);">
                  <div style="font-size:0.68rem;color:var(--text-secondary);font-weight:600;">${d.title || d.name || d.file || '—'}</div>
                  ${d.description ? `<div style="font-size:0.6rem;color:var(--text-dim);">${d.description}</div>` : ''}
                  ${d.features ? `<div style="font-size:0.58rem;color:var(--accent-cyan);margin-top:2px;">Features: ${(Array.isArray(d.features) ? d.features : [d.features]).join(', ')}</div>` : ''}
                  ${d.headings ? `<div style="font-size:0.58rem;color:var(--text-dim);margin-top:2px;">${(Array.isArray(d.headings) ? d.headings : []).slice(0, 5).join(' → ')}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </details>
        </div>`;
      }).join('') : '<div style="font-size:0.68rem;color:var(--text-dim);text-align:center;">No documents found</div>'}`;
  }
})();
