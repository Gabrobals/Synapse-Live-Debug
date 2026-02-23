/**
 * Live Debug -- Tab 6: Agent Flow / Live Pipeline
 * Routes 50+ event types into a live pipeline visualization
 * Shows frontend->engine->backend flow with step collapsing.
 * Pipeline steps are built dynamically by CONFIG_IDE.buildPipelineStepMap()
 * to adapt to any IDE + LLM provider combination.
 */
(function () {
  'use strict';

  // Pipeline step map is built dynamically from the IDE adapter layer.
  // CONFIG_IDE.buildPipelineStepMap() returns a map that includes
  // LLM-specific events (Ollama, OpenAI, etc.) based on detected provider.
  const PIPELINE_STEP_MAP = (typeof CONFIG_IDE !== 'undefined' && CONFIG_IDE.buildPipelineStepMap)
    ? CONFIG_IDE.buildPipelineStepMap()
    : {};

  const PHASE_COLORS = {
    frontend: 'var(--accent-cyan)',
    engine: 'var(--accent-purple)',
    backend: 'var(--accent-green)',
    response: 'var(--accent-orange)',
  };

  let _flows = [];
  let _metrics = { totalEvents: 0, avgLatency: 0, errors: 0, latencies: [] };
  const MAX_FLOWS = 100;

  SynapseApp.tabs.agentflow = {
    routeEvent: routeEventToLivePipeline,
    scan: scanAgentFlow,
    clearFlows() { _flows = []; _metrics = { totalEvents: 0, avgLatency: 0, errors: 0, latencies: [] }; renderLivePipeline(); },
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ROUTE EVENT → LIVE PIPELINE
  // ════════════════════════════════════════════════════════════════════════════

  function routeEventToLivePipeline(event) {
    const type = event.type || event.event_type || '';
    const mapping = PIPELINE_STEP_MAP[type];
    if (!mapping) return;

    _metrics.totalEvents++;

    const latency = event.latency || event.duration || 0;
    if (latency > 0) {
      _metrics.latencies.push(latency);
      _metrics.avgLatency = _metrics.latencies.reduce((a, b) => a + b, 0) / _metrics.latencies.length;
    }

    if (type.includes('error')) _metrics.errors++;

    // Try to group with existing flow (same conversation/request)
    const flowId = event.conversationId || event.requestId || event.correlationId || `flow-${Date.now()}`;
    let flow = _flows.find(f => f.id === flowId && Date.now() - f.lastUpdate < 30000);
    if (!flow) {
      flow = { id: flowId, steps: [], startTime: Date.now(), lastUpdate: Date.now(), status: 'running' };
      _flows.unshift(flow);
      if (_flows.length >MAX_FLOWS) _flows.pop();
    }

    flow.steps.push({
      ...mapping,
      type,
      timestamp: Date.now(),
      data: event.data || event.details || null,
      latency,
    });
    flow.lastUpdate = Date.now();

    // Determine flow status
    if (type.includes('error')) flow.status = 'error';
    else if (type.includes('complete') && mapping.phase === 'response') flow.status = 'success';
    else flow.status = 'running';

    renderLivePipeline();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER PIPELINE
  // ════════════════════════════════════════════════════════════════════════════

  function renderLivePipeline() {
    const container = document.getElementById('agentFlowPipeline');
    const statsEl = document.getElementById('agentFlowStats');
    if (!container) return;

    // Stats bar
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="pill"> ${_metrics.totalEvents} events</div>
        <div class="pill"> ${_metrics.avgLatency.toFixed(0)}ms avg</div>
        <div class="pill" style="color:${_metrics.errors > 0 ? 'var(--accent-red)' : 'var(--text-dim)'}"> ${_metrics.errors} errors</div>
        <div class="pill">${_flows.length} flows</div>`;
    }

    if (_flows.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:var(--space-xl);color:var(--text-dim);">No flows captured yet. Events will appear here as they route through the pipeline.</div>';
      return;
    }

    container.innerHTML = _flows.slice(0, 20).map(flow => {
      const statusIcon = flow.status === 'success' ? '' : flow.status === 'error' ? '' : '';
      const statusColor = flow.status === 'success' ? 'var(--accent-green)' : flow.status === 'error' ? 'var(--accent-red)' : 'var(--accent-yellow)';
      const elapsed = flow.steps.length > 1 ? `${flow.lastUpdate - flow.startTime  }ms` : '—';

      return `<div class="glass-card" style="margin-bottom:var(--space-sm);border-left:3px solid ${statusColor};">
        <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-xs);">
          <span style="font-weight:600;font-size:0.75rem;color:var(--text-primary);">${statusIcon} Flow ${flow.id.substring(0, 12)}…</span>
          <span style="font-size:0.68rem;color:var(--text-dim);">${elapsed} · ${flow.steps.length} steps</span>
        </div>
        <div style="display:flex;gap:var(--space-xs);flex-wrap:wrap;">
          ${flow.steps.map(s => `<div style="background:rgba(255,255,255,0.03);padding:2px 6px;border-radius:var(--radius-sm);font-size:0.65rem;display:flex;align-items:center;gap:4px;border:1px solid ${PHASE_COLORS[s.phase] || 'var(--border-subtle)'};border-opacity:0.3;">
            <span>${s.icon}</span>
            <span style="color:${PHASE_COLORS[s.phase] || 'var(--text-dim)'};">${s.step}</span>
            ${s.latency > 0 ? `<span style="color:var(--text-dim);font-size:0.6rem;">${s.latency}ms</span>` : ''}
          </div>`).join('<span style="color:var(--text-dim);">→</span>')}
        </div>
      </div>`;
    }).join('');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCAN AGENT FLOW (INTROSPECT)
  // ════════════════════════════════════════════════════════════════════════════

  async function scanAgentFlow() {
    const container = document.getElementById('agentFlowIntrospect');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:var(--space-md);color:var(--text-dim);">Scanning…</div>';

    try {
      const res = await fetch(`${CONFIG.API_V1}/introspect/agent-flow`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const sections = [
        { key: 'sdps', title: 'SDPS Layers', color: 'var(--accent-purple)' },
        { key: 'agents', title: 'Active Agents', color: 'var(--accent-cyan)' },
        { key: 'memory', title: 'Memory Systems', color: 'var(--accent-green)' },
        { key: 'e2eFlow', title: 'E2E Flow', color: 'var(--accent-orange)' },
      ];

      container.innerHTML = sections.map(s => {
        const items = data[s.key] || [];
        return `<div class="glass-card" style="border-left:3px solid ${s.color};margin-bottom:var(--space-sm);">
          <div style="font-weight:600;font-size:0.75rem;color:${s.color};margin-bottom:var(--space-xs);">${s.title}</div>
          ${items.length === 0 ? '<div style="font-size:0.68rem;color:var(--text-dim);">No data</div>'
            : items.map(i => `<div style="font-size:0.68rem;color:var(--text-secondary);padding:2px 0;">• ${typeof i === 'string' ? i : (i.name || i.label || JSON.stringify(i))}</div>`).join('')}
        </div>`;
      }).join('');
    } catch (err) {
      container.innerHTML = `<div style="text-align:center;padding:var(--space-md);color:var(--accent-red);">Error: ${err.message}</div>`;
    }
  }
})();
