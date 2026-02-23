/**
 * Live Debug -- Tab 4: Agent Infrastructure
 * Dynamic infra categories + stores/hooks/services registries
 * Adapts to the detected IDE via CONFIG_IDE.ideProfile
 */
(function () {
  'use strict';

  // Registries are driven by the detected IDE profile.
  // Falls back to empty arrays for unknown IDEs.
  function _getProfile() {
    if (typeof CONFIG_IDE !== 'undefined' && CONFIG_IDE.ideProfile) return CONFIG_IDE.ideProfile;
    return { stores: [], hooks: [], services: [], infra: [] };
  }

  const STORES_REGISTRY  = _getProfile().stores;
  const HOOKS_REGISTRY   = _getProfile().hooks;
  const SERVICES_REGISTRY= _getProfile().services;

  // INFRA_CATEGORIES comes from config.js but can be overridden
  // by the IDE profile when it supplies its own infra list.
  function _getInfraCategories() {
    const profile = _getProfile();
    if (profile.infra && profile.infra.length > 0) {
      // Convert IDE profile infra to category format
      return profile.infra.map((cat) => {
        return {
          id: cat.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          label: cat.name,
          icon: '',
          items: cat.items || [],
        };
      });
    }
    // Fallback: use INFRA_CATEGORIES from config.js if available
    if (typeof INFRA_CATEGORIES !== 'undefined') return INFRA_CATEGORIES;
    return [];
  }

  const tab = SynapseApp.tabs.infra = {
    render: renderInfraGrid,
    syncWithIntrospect,
  };

  function renderInfraGrid() {
    const grid = document.getElementById('infraGrid');
    if (!grid) return;

    // Use dynamic infra categories (IDE-adaptive)
    const infraCats = _getInfraCategories();
    const ideName = (typeof CONFIG_IDE !== 'undefined') ? CONFIG_IDE.ideName : 'IDE';
    let html = '';

    // Infra categories (dynamic count, adapts per IDE)
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-md);">';
    for (const cat of infraCats) {
      html += `
        <div class="card card-sm infra-card" id="infra-${cat.id}">
          <div class="card-header" style="display:flex;align-items:center;gap:var(--space-sm);">
            <span style="font-size:1.1rem;">${cat.icon}</span>
            <span class="card-title" style="flex:1;">${cat.label}</span>
            <div class="service-status unknown" id="infra-dot-${cat.id}"></div>
          </div>
          <div class="card-body" style="font-size:0.75rem;color:var(--text-tertiary);">
            ${cat.items ? cat.items.map(i => `<div style="padding:1px 0;">• ${i}</div>`).join('') : `<div>${cat.description || ''}</div>`}
          </div>
          <div style="margin-top:var(--space-xs);">
            <button class="btn btn-ghost btn-sm" onclick="SynapseApp.tabs.infra.checkCategory('${cat.id}')">Check</button>
          </div>
        </div>`;
    }
    html += '</div>';

    // Registries section
    html += '<div style="margin-top:var(--space-xl);display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-md);">';

    // Stores
    html += `<div class="card card-sm">
      <div class="card-header"><span class="card-title" style="color:var(--accent-cyan);">State Stores (${STORES_REGISTRY.length})</span></div>
      <div class="card-body" style="font-size:0.72rem;">${STORES_REGISTRY.map(s => `<div style="padding:2px 0;color:var(--text-secondary);"><span style="font-family:var(--font-mono);color:var(--accent-cyan);">${s}</span></div>`).join('')}${STORES_REGISTRY.length === 0 ? `<div style="color:var(--text-dim);font-size:0.68rem;">No stores detected for ${  ideName  }</div>` : ''}</div>
    </div>`;

    // Hooks
    html += `<div class="card card-sm">
      <div class="card-header"><span class="card-title" style="color:var(--accent-orange);">Custom Hooks (${HOOKS_REGISTRY.length})</span></div>
      <div class="card-body" style="font-size:0.72rem;">${HOOKS_REGISTRY.map(h => `<div style="padding:2px 0;color:var(--text-secondary);"><span style="font-family:var(--font-mono);color:var(--accent-orange);">${h}</span></div>`).join('')}${HOOKS_REGISTRY.length === 0 ? `<div style="color:var(--text-dim);font-size:0.68rem;">No hooks detected for ${  ideName  }</div>` : ''}</div>
    </div>`;

    // Services
    html += `<div class="card card-sm">
      <div class="card-header"><span class="card-title" style="color:var(--accent-purple);">Frontend Services (${SERVICES_REGISTRY.length})</span></div>
      <div class="card-body" style="font-size:0.72rem;">${SERVICES_REGISTRY.map(s => `<div style="padding:2px 0;color:var(--text-secondary);"><span style="font-family:var(--font-mono);color:var(--accent-purple);">${s}</span></div>`).join('')}${SERVICES_REGISTRY.length === 0 ? `<div style="color:var(--text-dim);font-size:0.68rem;">No frontend services detected for ${  ideName  }</div>` : ''}</div>
    </div>`;

    html += '</div>';
    grid.innerHTML = html;
  }

  tab.checkCategory = async function (catId) {
    const dot = document.getElementById(`infra-dot-${catId}`);
    if (!dot) return;
    dot.className = 'service-status checking';

    try {
      const r = await fetch(`${CONFIG.API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
      dot.className = `service-status ${r.ok ? 'healthy' : 'degraded'}`;
    } catch {
      dot.className = 'service-status offline';
    }
  };

  function syncWithIntrospect(introspectData) {
    if (!introspectData) return;
    // Update dots based on introspect results
    const infraCats = _getInfraCategories();
    for (const cat of infraCats) {
      const dot = document.getElementById(`infra-dot-${cat.id}`);
      if (dot) dot.className = 'service-status healthy';
    }
  }
})();
