/**
 * Synapse Live Debug — Agent Intelligence (Unified Tab)
 * ═══════════════════════════════════════════════════════
 * Merges: Agent Infrastructure + Agent Flow Tracer + Chat Pipeline Diagnostic
 *
 * Three views:
 *   1) Infrastructure — detected IDE (process + filesystem), project analysis, MCP, providers
 *   2) Prompt Flow    — LIVE animated pipeline: type a prompt → see it flow through stages in real-time
 *   3) Diagnostics    — Health probes for the AI pipeline + live connectivity
 *
 * Data source:  GET  /v1/introspect/agent-intelligence
 * Live trace:   POST /v1/prompt-trace  → emits SSE events per pipeline stage
 * SSE routing:  prompt-trace:start / prompt-trace:step / prompt-trace:complete
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════
  let _data = null;               // Full detection data from backend
  let _currentView = 'infra';     // 'infra' | 'flow' | 'diag'
  let _loading = false;
  const _liveTraces = [];           // Completed prompt traces
  let _activeFlowId = null;       // Current live trace flowId
  const _activeSteps = {};          // flowId → { stepIndex, steps[] }
  const _traceRunning = false;
  const MAX_TRACES = 30;
  let _selectedStep = null;        // Currently expanded step number
  let _expandedTraceIdx = -1;     // Which completed trace is expanded

  const PHASE_COLORS = {
    frontend: { bg: 'rgba(88,166,255,0.12)',  border: '#58a6ff', text: '#58a6ff', label: 'Frontend', glow: 'rgba(88,166,255,0.4)' },
    engine:   { bg: 'rgba(188,140,255,0.12)', border: '#bc8cff', text: '#bc8cff', label: 'Engine',   glow: 'rgba(188,140,255,0.4)' },
    backend:  { bg: 'rgba(63,185,80,0.12)',   border: '#3fb950', text: '#3fb950', label: 'Backend',  glow: 'rgba(63,185,80,0.4)' },
    response: { bg: 'rgba(240,136,62,0.12)',  border: '#f0883e', text: '#f0883e', label: 'Response', glow: 'rgba(240,136,62,0.4)' },
  };

  const DIAG_STATUS = {
    pass: { color: 'var(--accent-green)', icon: '\u2713', label: 'Pass' },
    fail: { color: 'var(--accent-red)',   icon: '\u2717', label: 'Fail' },
    warn: { color: 'var(--accent-yellow)',icon: '\u26A0', label: 'Warning' },
    info: { color: 'var(--accent-cyan)',  icon: '\u2139', label: 'Info' },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════
  SynapseApp.tabs.agentIntel = {
    scan: scanAgentIntelligence,
    setView,
    routeEvent: routeEventToFlow,
    refreshDiagnostics,
    selectStep,
    expandTrace,
    _runLiveProbe: runLiveProbe,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW SWITCH
  // ═══════════════════════════════════════════════════════════════════════════
  function setView(view) {
    _currentView = view;
    document.querySelectorAll('.ai-view-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    ['infra', 'flow', 'diag'].forEach((v) => {
      const el = document.getElementById(`aiView-${  v}`);
      if (el) el.style.display = v === view ? '' : 'none';
    });
    render();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCAN (Fetch from backend)
  // ═══════════════════════════════════════════════════════════════════════════
  async function scanAgentIntelligence() {
    const statusEl = document.getElementById('aiScanStatus');
    if (statusEl) statusEl.textContent = 'Scanning\u2026';
    _loading = true;
    render();

    try {
      const res = await fetch(`${CONFIG.API_V1  }/introspect/agent-intelligence`);
      if (!res.ok) throw new Error(`HTTP ${  res.status}`);
      _data = await res.json();
      if (statusEl) {
        const ide = _data.primaryIDE ? _data.primaryIDE.name : 'Unknown';
        const running = _data.runningIDE && _data.runningIDE.primary ? ' (\u25CF running)' : ' (filesystem)';
        const proj = _data.project ? _data.project.projectName : '';
        statusEl.textContent = `${ide + running  } | ${  proj  } | ${ 
          _data.mcpServers ? _data.mcpServers.length : 0  } MCP | ${ 
          _data.promptPipeline ? _data.promptPipeline.length : 0  } pipeline stages`;
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `Error: ${  err.message}`;
      _data = null;
    }

    _loading = false;
    render();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESPONSE → ARCHITECTURE CROSS-LINKS
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Parse the agent response text and wrap recognised technical terms
   * (components, pipeline concepts, architecture keywords) in clickable
   * spans that navigate to the Architecture Graph tab.
   */
  function linkifyResponseToArch(text) {
    if (!text) return '';
    // Escape HTML first
    let safe = esc(text);
    // Keywords that map to architecture graph nodes / concepts
    const keywords = [
      'pipeline', 'context', 'embeddings', 'model', 'routing', 'LLM',
      'API call', 'streaming', 'tool', 'MCP', 'agent', 'workspace',
      'indexing', 'diff', 'instructions', 'system prompt',
      'response', 'code search', 'terminal', 'file ops',
      'prompt assembly', 'prompt', 'governor', 'memory',
      'AST', 'PSI', 'codebase', 'selection', 'git',
      'provider', 'completion', 'inference', 'tokens',
      'frontend', 'backend', 'engine'
    ];
    // Sort longest first so "system prompt" matches before "prompt"
    keywords.sort((a, b) => { return b.length - a.length; });
    // Build one regex from all keywords (case-insensitive, word-boundary)
    const pat = new RegExp(`\\b(${  keywords.map((k) => {
      return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('|')  })\\b`, 'gi');
    safe = safe.replace(pat, (m) => {
      return `<span class="arch-link" style="cursor:pointer;color:var(--accent-cyan);` +
        `border-bottom:1px dashed var(--accent-cyan);padding-bottom:1px;" ` +
        `onclick="SynapseApp.switchToTab('arch');setTimeout(function(){` +
        `if(SynapseApp.tabs.arch&&SynapseApp.tabs.arch.scan)SynapseApp.tabs.arch.scan();},200);" ` +
        `title="View in Architecture Graph">${  m  }</span>`;
    });
    return safe;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SSE EVENT ROUTING — Live prompt animation
  // ═══════════════════════════════════════════════════════════════════════════
  function routeEventToFlow(event) {
    const type = event.type || '';

    // ── Auto-capture from IDE chat (extension sends chat-intercepted) ──
    if (type === 'chat-intercepted') {
      const chatPrompt = event.data ? event.data.prompt || '' : '';
      if (chatPrompt && !_traceRunning) {
        // Auto-switch to Agent Intelligence tab + Prompt Flow view
        if (SynapseApp.switchToTab) SynapseApp.switchToTab('agentintel');
        if (_currentView !== 'flow') setView('flow');
        SynapseApp.notify && SynapseApp.notify('\u26A1 Prompt captured from IDE chat', 'info');
      }
      if (_currentView === 'flow') renderPromptFlow();
      return;
    }

    if (type === 'prompt-trace:start') {
      _activeFlowId = event.flowId;
      _activeSteps[event.flowId] = {
        prompt: event.data ? event.data.prompt : '',
        ide: event.data ? event.data.ide : '',
        source: event.data ? event.data.source || '' : '',
        agents: event.data ? event.data.agents || [] : [],
        steps: [],
        startTime: Date.now(),
        status: 'active',
      };
      // Auto-switch to Prompt Flow when a trace starts
      if (SynapseApp.switchToTab) SynapseApp.switchToTab('agentintel');
      if (_currentView !== 'flow') setView('flow');
      if (_currentView === 'flow') renderPromptFlow();
      return;
    }

    if (type === 'prompt-trace:step') {
      const flow = _activeSteps[event.flowId];
      if (flow) {
        const stepAgents = event.data ? event.data.agents || [] : [];
        flow.steps.push({
          step: event.step,
          name: event.data ? event.data.name : '',
          phase: event.data ? event.data.phase : 'engine',
          component: event.component || '',
          detail: event.data ? event.data.detail : '',
          transformation: event.data ? event.data.transformation || '' : '',
          prompt: event.data ? event.data.prompt || '' : '',
          annotations: event.data ? event.data.annotations || [] : [],
          agents: stepAgents,
          timestamp: Date.now(),
        });
        // Auto-expand the currently processing step
        _selectedStep = event.step;
      }
      if (_currentView === 'flow') renderPromptFlow();
      return;
    }

    if (type === 'prompt-trace:complete') {
      const cflow = _activeSteps[event.flowId];
      if (cflow) {
        cflow.status = 'complete';
        cflow.endTime = Date.now();
        cflow.duration = cflow.endTime - cflow.startTime;
        cflow.response = event.data ? event.data.response || '' : '';
        cflow.agents = event.data ? event.data.agents || cflow.agents || [] : cflow.agents || [];
        cflow.recentErrors = event.data ? event.data.recentErrors || [] : [];
        _liveTraces.unshift(cflow);
        if (_liveTraces.length > MAX_TRACES) _liveTraces.pop();
      }
      _activeFlowId = null;
      _selectedStep = null;
      if (_currentView === 'flow') renderPromptFlow();
      return;
    }

    // Route generic SSE events
    if (!_data || !_data.promptPipeline) return;
    let phase = 'engine';
    if (/user|chat:message|input/.test(type)) phase = 'frontend';
    else if (/llm|api|tool/.test(type)) phase = 'backend';
    else if (/response|complete/.test(type)) phase = 'response';
    else if (/context|model|prompt/.test(type)) phase = 'engine';

    if (!_activeSteps._generic) {
      _activeSteps._generic = { prompt: '', ide: '', steps: [], startTime: Date.now(), status: 'passive' };
    }
    const gflow = _activeSteps._generic;
    gflow.steps.push({
      step: gflow.steps.length + 1,
      name: type.replace(/[_:.-]/g, ' '),
      phase,
      component: event.component || '',
      detail: '',
      annotations: [],
      timestamp: Date.now(),
    });
    if (gflow.steps.length > 50) gflow.steps.shift();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER (dispatches to active view)
  // ═══════════════════════════════════════════════════════════════════════════
  function render() {
    if (_loading) {
      ['aiView-infra', 'aiView-flow', 'aiView-diag'].forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.style.display !== 'none') {
          el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">Scanning IDE agent infrastructure\u2026</div>';
        }
      });
      return;
    }
    if (!_data) { renderEmpty(); return; }
    if (_currentView === 'infra') renderInfrastructure();
    if (_currentView === 'flow')  renderPromptFlow();
    if (_currentView === 'diag')  renderDiagnostics();
  }

  function renderEmpty() {
    const el = document.getElementById(`aiView-${  _currentView}`);
    if (el) {
      el.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-dim);">' +
        '<div style="font-size:2rem;margin-bottom:12px;">\uD83D\uDD0D</div>' +
        '<div style="font-size:0.85rem;">Agent Intelligence</div>' +
        '<div style="font-size:0.72rem;color:var(--text-tertiary);margin-top:8px;">Click <b>Scan</b> to detect IDE agent infrastructure, prompt pipeline, MCP, and project structure.</div></div>';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW 1: INFRASTRUCTURE + PROJECT REALITY
  // ═══════════════════════════════════════════════════════════════════════════
  function renderInfrastructure() {
    const el = document.getElementById('aiView-infra');
    if (!el) return;
    const d = _data;
    let h = '';

    // ── Running IDE Banner ──
    const isRunning = d.runningIDE && d.runningIDE.primary;
    h += `<div class="glass-card" style="border-left:4px solid ${ 
      isRunning ? 'var(--accent-green)' : d.primaryIDE.id !== 'generic' ? 'var(--accent-cyan)' : 'var(--accent-yellow)' 
      };margin-bottom:var(--space-md);padding:12px 16px;">`;
    h += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    h += `<div><span style="font-size:1.1rem;font-weight:700;color:var(--text-primary);">${  esc(d.primaryIDE.name)  }</span>`;
    if (isRunning) {
      h += ' <span class="pill" style="background:rgba(63,185,80,0.15);color:var(--accent-green);font-size:0.62rem;">\u25CF Running</span>';
    }
    if (d.detectedIDEs && d.detectedIDEs.length > 1) {
      h += ` <span style="font-size:0.68rem;color:var(--text-tertiary);">+ ${  d.detectedIDEs.length - 1  } other IDE(s)</span>`;
    }
    h += '</div>';
    if (d.agentSettings && d.agentSettings.agentMode !== null) {
      const am = d.agentSettings.agentMode;
      h += `<span class="pill" style="background:${  am ? 'rgba(63,185,80,0.15)' : 'rgba(255,68,68,0.15)' 
        };color:${  am ? 'var(--accent-green)' : 'var(--accent-red)'  };font-size:0.68rem;">${ 
        am ? '\u25CF Agent Mode ON' : '\u25CB Agent Mode OFF'  }</span>`;
    }
    h += '</div>';
    const sp = [];
    if (d.agentSettings) {
      if (d.agentSettings.maxIterations) sp.push(`Max iterations: ${  d.agentSettings.maxIterations}`);
      if (d.agentSettings.model) sp.push(`Model: ${  d.agentSettings.model}`);
      if (d.agentSettings.thinkingEnabled) sp.push('Thinking: ON');
    }
    if (sp.length) h += `<div style="font-size:0.68rem;color:var(--text-tertiary);margin-top:6px;">${  sp.join(' \u00B7 ')  }</div>`;
    h += '</div>';

    // ── Project Analysis ──
    if (d.project) {
      const p = d.project;
      h += '<div class="glass-card" style="border-left:4px solid var(--accent-purple);margin-bottom:var(--space-md);padding:12px 16px;">';
      h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
      h += `<span style="font-size:0.82rem;font-weight:700;color:var(--accent-purple);">\uD83D\uDCC1 ${  esc(p.projectName)  }</span>`;
      h += `<span style="font-size:0.68rem;color:var(--text-dim);">${  p.totalFiles  } files | ${  p.directories  } dirs</span>`;
      h += '</div>';
      if (p.languages && p.languages.length) {
        const maxFiles = p.languages[0].files;
        h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">';
        p.languages.forEach((lang) => {
          const pct = Math.round(lang.files / maxFiles * 100);
          h += '<div style="min-width:80px;flex:0 0 auto;">';
          h += `<div style="font-size:0.65rem;color:var(--text-secondary);margin-bottom:2px;">${  esc(lang.name)  } <span style="color:var(--text-dim);">(${  lang.files  })</span></div>`;
          h += '<div style="height:4px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;">';
          h += `<div style="width:${  pct  }%;height:100%;background:var(--accent-purple);border-radius:2px;"></div>`;
          h += '</div></div>';
        });
        h += '</div>';
      }
      if (p.dependencies && p.dependencies.length) {
        p.dependencies.forEach((dep) => {
          h += `<div style="font-size:0.62rem;color:var(--text-dim);margin-top:4px;"><span style="color:var(--accent-cyan);">${  esc(dep.source)  }</span>`;
          if (dep.production !== undefined) h += ` \u2014 ${  dep.production  } prod, ${  dep.dev  } dev`;
          if (dep.count !== undefined) h += ` \u2014 ${  dep.count  } packages`;
          if (dep.top && dep.top.length) h += ` \u2014 ${  dep.top.slice(0, 5).map(esc).join(', ')}`;
          h += '</div>';
        });
      }
      if (p.keyFiles && p.keyFiles.length) {
        h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">';
        p.keyFiles.forEach((kf) => {
          h += `<span class="pill" style="font-size:0.58rem;font-family:var(--font-mono);">${  esc(kf.name)  }</span>`;
        });
        h += '</div>';
      }
      h += '</div>';
    }

    // ── Multi-IDE Detection ──
    if (d.detectedIDEs && d.detectedIDEs.length > 0) {
      h += sectionLabel(`Detected IDEs (${  d.detectedIDEs.length  })`);
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:var(--space-sm);margin-bottom:var(--space-md);">';
      d.detectedIDEs.forEach((ide) => {
        const isPrimary = ide.id === d.primaryIDE.id;
        h += `<div class="glass-card" style="border-left:3px solid ${ 
          isPrimary ? 'var(--accent-cyan)' : 'var(--border-subtle)'  };padding:10px;">`;
        h += `<div style="font-size:0.78rem;font-weight:600;color:${  isPrimary ? 'var(--accent-cyan)' : 'var(--text-secondary)'  };">${ 
          esc(ide.name)  }${isPrimary ? ' (primary)' : ''  }</div>`;
        h += `<div style="font-size:0.65rem;color:var(--text-dim);margin-top:2px;">Confidence: ${  ide.confidence  }</div>`;
        if (ide.runningProcess) h += `<div style="font-size:0.62rem;color:var(--accent-green);">\u25CF Process: ${  esc(ide.runningProcess)  }</div>`;
        if (ide.configDir) h += `<div style="font-size:0.62rem;color:var(--text-dim);font-family:var(--font-mono);">${  esc(ide.configDir)  }/</div>`;
        if (ide.aiIndicators && ide.aiIndicators.length) {
          ide.aiIndicators.forEach((f) => {
            h += `<div style="font-size:0.6rem;color:var(--accent-green);font-family:var(--font-mono);">\u2713 ${  esc(f)  }</div>`;
          });
        }
        h += '</div>';
      });
      h += '</div>';
    }

    // ── Infrastructure Components ──
    if (d.infrastructure && d.infrastructure.length) {
      h += sectionLabel('Infrastructure Components');
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:var(--space-sm);margin-bottom:var(--space-md);">';
      d.infrastructure.forEach((comp) => {
        h += '<div class="glass-card" style="padding:10px;">';
        h += `<div style="font-size:0.78rem;font-weight:600;color:var(--text-primary);margin-bottom:6px;">${ 
          comp.icon || '\uD83D\uDCE6'  } ${  esc(comp.name)  }</div>`;
        if (comp.items && comp.items.length) {
          h += '<div style="font-size:0.65rem;color:var(--text-tertiary);">';
          comp.items.forEach((item) => { h += `<div style="padding:1px 0;">\u2022 ${  esc(item)  }</div>`; });
          h += '</div>';
        }
        h += '</div>';
      });
      h += '</div>';
    }

    // ── MCP Servers ──
    if (d.mcpServers && d.mcpServers.length) {
      h += sectionLabel(`MCP Servers (${  d.mcpServers.length  })`);
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-sm);margin-bottom:var(--space-md);">';
      d.mcpServers.forEach((srv) => {
        h += '<div class="glass-card" style="border-left:3px solid var(--accent-purple);padding:10px;">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        h += `<span style="font-size:0.78rem;font-weight:600;color:var(--accent-purple);font-family:var(--font-mono);">${  esc(srv.name)  }</span>`;
        h += `<span class="pill" style="font-size:0.6rem;">${  esc(srv.transport)  }</span></div>`;
        if (srv.command) h += `<div style="font-size:0.62rem;color:var(--text-dim);font-family:var(--font-mono);margin-top:4px;">${  esc(srv.command + (srv.args && srv.args.length ? ` ${  srv.args.join(' ')}` : ''))  }</div>`;
        if (srv.url) h += `<div style="font-size:0.62rem;color:var(--text-dim);font-family:var(--font-mono);margin-top:4px;">${  esc(srv.url)  }</div>`;
        h += `<div style="font-size:0.58rem;color:var(--text-dim);margin-top:2px;">Source: ${  esc(srv.sourceFile)  } (${  esc(srv.ide)  })</div>`;
        h += '</div>';
      });
      h += '</div>';
    }

    // ── Model Providers ──
    if (d.modelProviders && d.modelProviders.length) {
      h += sectionLabel(`Model Providers (${  d.modelProviders.length  })`);
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-sm);margin-bottom:var(--space-md);">';
      d.modelProviders.forEach((prov) => {
        h += '<div class="glass-card" style="border-left:3px solid var(--accent-orange);padding:10px;">';
        h += `<div style="font-size:0.78rem;font-weight:600;color:var(--accent-orange);">${  esc(prov.name)  }</div>`;
        h += `<div style="font-size:0.62rem;color:var(--text-dim);margin-top:2px;">Detected in: ${  esc(prov.detectedIn)  }</div>`;
        h += '</div>';
      });
      h += '</div>';
    }

    // ── Custom Instructions ──
    if (d.customInstructions && d.customInstructions.length) {
      h += sectionLabel(`Custom Instructions (${  d.customInstructions.length  })`);
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:var(--space-sm);margin-bottom:var(--space-md);">';
      d.customInstructions.forEach((inst) => {
        h += '<div class="glass-card" style="border-left:3px solid var(--accent-green);padding:10px;">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        h += `<span style="font-size:0.75rem;font-weight:600;color:var(--accent-green);font-family:var(--font-mono);">${  esc(inst.file)  }</span>`;
        h += `<span class="pill" style="font-size:0.6rem;">${  inst.lines  } lines</span></div>`;
        if (inst.preview) {
          h += `<div style="font-size:0.6rem;color:var(--text-tertiary);margin-top:6px;padding:6px;background:rgba(255,255,255,0.02);border-radius:4px;font-family:var(--font-mono);white-space:pre-wrap;max-height:80px;overflow:hidden;">${ 
            esc(inst.preview.substring(0, 200))  }${inst.preview.length > 200 ? '\u2026' : ''  }</div>`;
        }
        h += '</div>';
      });
      h += '</div>';
    }

    el.innerHTML = h;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERACTIVE HELPERS — Step selection & trace expansion
  // ═══════════════════════════════════════════════════════════════════════════
  function selectStep(stepNum) {
    _selectedStep = _selectedStep === stepNum ? null : stepNum;
    if (_currentView === 'flow') renderPromptFlow();
  }

  function expandTrace(idx) {
    _expandedTraceIdx = _expandedTraceIdx === idx ? -1 : idx;
    if (_currentView === 'flow') renderPromptFlow();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW 2: PROMPT FLOW — LIVE Interactive Pipeline
  // ═══════════════════════════════════════════════════════════════════════════
  function renderPromptFlow() {
    const el = document.getElementById('aiView-flow');
    if (!el) return;
    let h = '';
    const pipeline = _data ? _data.promptPipeline || [] : [];
    const activeFlow = _activeFlowId ? _activeSteps[_activeFlowId] : null;
    const displayFlow = activeFlow || (_liveTraces.length ? _liveTraces[0] : null);

    // ── Agent icons map ──
    const AGENT_ICONS = {
      UserProxy: '\uD83D\uDC64', ContextAgent: '\uD83D\uDCC2', RulesAgent: '\uD83D\uDCDC',
      MCPAgent: '\uD83D\uDD0C', AssemblerAgent: '\uD83E\uDDE9', RouterAgent: '\uD83D\uDEE4\uFE0F',
      InferenceAgent: '\uD83E\uDD16', ExecutorAgent: '\u2699\uFE0F', PlannerAgent: '\uD83D\uDDFA\uFE0F',
      RendererAgent: '\uD83C\uDFA8', GovernorAgent: '\uD83D\uDC41\uFE0F', MemoryAgent: '\uD83D\uDCBE',
      DispatchAgent: '\uD83D\uDCE8'
    };

    // ── CSS Animations ──
    h += '<style>';
    h += '@keyframes aiFPulse{0%,100%{box-shadow:0 0 8px rgba(63,185,80,0.2)}50%{box-shadow:0 0 20px rgba(63,185,80,0.5)}}';
    h += '@keyframes aiFDot{0%{opacity:0;transform:translateY(-4px)}40%{opacity:1}60%{opacity:1}100%{opacity:0;transform:translateY(20px)}}';
    h += '@keyframes aiFTyping{0%{opacity:0.3}50%{opacity:1}100%{opacity:0.3}}';
    h += '@keyframes agentGlow{0%,100%{box-shadow:0 0 4px rgba(188,140,255,0.3)}50%{box-shadow:0 0 12px rgba(188,140,255,0.6)}}';
    h += '@keyframes slideIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}';
    h += '.ai-step-row{transition:all 0.15s ease;cursor:pointer;border-radius:8px;border:1px solid transparent;}';
    h += '.ai-step-row:hover{background:rgba(255,255,255,0.03)!important;border-color:rgba(255,255,255,0.08);transform:translateX(3px);}';
    h += '.ai-step-active{animation:aiFPulse 2s ease-in-out infinite;}';
    h += '.agent-badge{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:10px;font-size:0.58rem;font-weight:600;' +
      'background:rgba(188,140,255,0.10);color:#bc8cff;border:1px solid rgba(188,140,255,0.25);animation:slideIn 0.3s ease;}';
    h += '.agent-badge.active{animation:agentGlow 1.5s ease-in-out infinite;background:rgba(188,140,255,0.18);}';
    h += '.arch-link{color:var(--accent-cyan);cursor:pointer;text-decoration:underline;text-decoration-style:dotted;}';
    h += '.arch-link:hover{color:var(--accent-green);text-decoration-style:solid;}';
    h += '.error-cross-link{display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(255,68,68,0.06);' +
      'border-radius:6px;border:1px solid rgba(255,68,68,0.2);cursor:pointer;transition:all 0.15s ease;margin-bottom:4px;}';
    h += '.error-cross-link:hover{background:rgba(255,68,68,0.12);border-color:rgba(255,68,68,0.4);transform:translateX(3px);}';
    h += '</style>';

    // ── Auto-Listen Banner ──
    const ideName = _data && _data.primaryIDE ? esc(_data.primaryIDE.name) : 'IDE';
    const isListening = !_activeFlowId && !_traceRunning;
    h += `<div class="glass-card" style="margin-bottom:var(--space-md);padding:14px 18px;` +
      `border-left:4px solid ${  isListening ? 'var(--accent-green)' : 'var(--accent-cyan)'  };` +
      `background:${  isListening ? 'rgba(63,185,80,0.04)' : 'rgba(88,166,255,0.04)'  };">`;
    h += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    h += '<div style="display:flex;align-items:center;gap:10px;">';
    if (isListening) {
      h += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent-green);' +
        'box-shadow:0 0 8px rgba(63,185,80,0.6);animation:aiFPulse 2s ease-in-out infinite;"></span>';
      h += '<span style="font-size:0.82rem;font-weight:700;color:var(--accent-green);">LISTENING</span>';
    } else {
      h += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent-cyan);' +
        'animation:aiFTyping 1s ease infinite;"></span>';
      h += '<span style="font-size:0.82rem;font-weight:700;color:var(--accent-cyan);">TRACING\u2026</span>';
    }
    h += '</div>';
    h += `<span style="font-size:0.68rem;color:var(--text-dim);">${  ideName  } Pipeline (${  pipeline.length || '?'  } stages)</span>`;
    h += '</div>';
    h += '<div style="font-size:0.72rem;color:var(--text-secondary);margin-top:8px;line-height:1.5;">';
    h += `Every prompt is intercepted via the <b>@synapse</b> chat participant (isSticky) \u2192 ` +
      `it flows through all ${  pipeline.length || '?'  } pipeline stages in <b>real-time</b>. No manual action — fully transparent.`;
    h += '</div>';
    // Supported IDEs chips
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">';
    const ideChips = ['VS Code', 'Cursor', 'Windsurf', 'JetBrains', 'Zed'];
    ideChips.forEach((ide) => {
      const isActive = ideName.toLowerCase().indexOf(ide.toLowerCase().split(' ')[0]) >= 0;
      h += `<span style="font-size:0.58rem;padding:2px 8px;border-radius:10px;` +
        `background:${  isActive ? 'rgba(63,185,80,0.15)' : 'rgba(255,255,255,0.04)'  };` +
        `color:${  isActive ? 'var(--accent-green)' : 'var(--text-dim)'  };` +
        `border:1px solid ${  isActive ? 'rgba(63,185,80,0.3)' : 'rgba(255,255,255,0.06)'  };">${ 
        isActive ? '\u25CF ' : ''  }${ide  }</span>`;
    });
    h += '</div>';
    h += '</div>';



    // ── Empty state ──
    if (pipeline.length === 0 && !displayFlow) {
      h += '<div style="text-align:center;padding:40px;color:var(--text-dim);">';
      h += '<div style="font-size:1.5rem;margin-bottom:8px;">\u26A1</div>';
      h += 'Click <b>Scan</b> first \u2014 then write anything in the @synapse chat. Every prompt is captured automatically.</div>';
      el.innerHTML = h;
      return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // PROMINENT PROMPT DISPLAY — The user's prompt, big and readable
    // ═══════════════════════════════════════════════════════════════════
    if (displayFlow && displayFlow.prompt) {
      const isLive = activeFlow && activeFlow.status === 'active';
      h += `<div class="glass-card" style="margin-bottom:var(--space-md);padding:16px 20px;` +
        `border:1px solid ${  isLive ? 'var(--accent-green)' : 'var(--accent-cyan)'  };` +
        `background:${  isLive ? 'rgba(63,185,80,0.06)' : 'rgba(88,166,255,0.04)'  };">`;
      // Header
      h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
      h += '<div style="display:flex;align-items:center;gap:8px;">';
      h += '<span style="font-size:1.2rem;">\uD83D\uDCDD</span>';
      h += `<span style="font-size:0.82rem;font-weight:700;color:${ 
        isLive ? 'var(--accent-green)' : 'var(--accent-cyan)'  };text-transform:uppercase;letter-spacing:1px;">Your Prompt</span>`;
      if (isLive) {
        h += '<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.62rem;color:var(--accent-green);font-weight:600;' +
          'padding:2px 8px;border-radius:10px;background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.3);">\u25CF LIVE</span>';
      }
      h += '</div>';
      h += '<div style="display:flex;align-items:center;gap:8px;">';
      // Source badge
      if (displayFlow.source) {
        h += `<span style="font-size:0.62rem;padding:2px 8px;border-radius:10px;background:rgba(88,166,255,0.10);` +
          `color:var(--accent-cyan);border:1px solid rgba(88,166,255,0.25);">\uD83D\uDCE1 ${  esc(displayFlow.source)  }</span>`;
      }
      if (_data && _data.primaryIDE) {
        h += `<span style="font-size:0.68rem;color:var(--text-secondary);font-weight:600;">${  esc(_data.primaryIDE.name)  } Pipeline</span>`;
      }
      h += '</div></div>';
      // THE PROMPT TEXT — BIG AND READABLE
      h += '<div style="padding:14px 18px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border-primary);' +
        'font-family:var(--font-mono);font-size:0.92rem;line-height:1.5;color:var(--text-primary);word-wrap:break-word;">';
      h += `<span style="color:var(--accent-cyan);font-size:0.72rem;">\u00BB </span>${  esc(displayFlow.prompt)}`;
      h += '</div>';

      // ═══════════════════════════════════════════════════════════════════
      // MULTI-AGENT PANEL — Show all agents operating on this trace
      // ═══════════════════════════════════════════════════════════════════
      let allAgents = displayFlow.agents || [];
      // Also collect agents from steps
      if (displayFlow.steps && displayFlow.steps.length) {
        const agentSet = {};
        allAgents.forEach((a) => { agentSet[a.name] = a; });
        displayFlow.steps.forEach((s) => {
          if (s.agents) s.agents.forEach((a) => { agentSet[a.name] = a; });
        });
        allAgents = Object.keys(agentSet).map((k) => { return agentSet[k]; });
      }
      if (allAgents.length > 0) {
        h += '<div style="margin-top:12px;padding:10px 14px;background:rgba(188,140,255,0.04);border-radius:8px;border:1px solid rgba(188,140,255,0.15);">';
        h += `<div style="font-size:0.68rem;font-weight:700;color:#bc8cff;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">` +
          `\uD83E\uDD16 Active Agents (${  allAgents.length  })</div>`;
        h += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
        allAgents.forEach((agent) => {
          const icon = AGENT_ICONS[agent.name] || '\uD83E\uDD16';
          const isActive = isLive;
          h += `<span class="agent-badge${  isActive ? ' active' : ''  }">` +
            `<span>${  icon  }</span>` +
            `<span>${  esc(agent.name)  }</span>` +
            `<span style="font-size:0.5rem;color:var(--text-dim);">${  esc(agent.role || '')  }</span>` +
            `</span>`;
        });
        h += '</div></div>';
      }

      // Progress bar (live)
      if (isLive && activeFlow) {
        const done = activeFlow.steps.length;
        const total = pipeline.length || 1;
        const pct = Math.round(done / total * 100);
        h += '<div style="margin-top:10px;">';
        h += '<div style="display:flex;justify-content:space-between;font-size:0.62rem;color:var(--text-dim);margin-bottom:4px;">';
        h += `<span>Processing through ${  esc(_data && _data.primaryIDE ? _data.primaryIDE.name : 'IDE')  } pipeline\u2026</span>`;
        h += `<span>${  done  } / ${  total  } stages (${  pct  }%)</span></div>`;
        h += '<div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;">';
        h += `<div style="width:${  pct  }%;height:100%;background:var(--accent-green);border-radius:2px;transition:width 0.3s ease;"></div>`;
        h += '</div></div>';
      } else if (displayFlow.status === 'complete' && displayFlow.duration) {
        h += `<div style="margin-top:8px;font-size:0.62rem;color:var(--text-dim);">\u2713 Completed in ${  displayFlow.duration  }ms through ${  displayFlow.steps ? displayFlow.steps.length : '?'  } stages \u2014 ${  esc(displayFlow.ide)  }</div>`;
      }
      h += '</div>';
    }

    // ── Phase Legend ──
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-sm);">';
    if (_data && _data.primaryIDE) {
      h += `<div style="font-size:0.72rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">${ 
        esc(_data.primaryIDE.name)  } Pipeline (${  pipeline.length  } stages)</div>`;
    }
    h += '<div style="display:flex;gap:var(--space-sm);">';
    Object.keys(PHASE_COLORS).forEach((phase) => {
      const pc = PHASE_COLORS[phase];
      h += `<span style="font-size:0.62rem;display:flex;align-items:center;gap:4px;">` +
        `<span style="width:8px;height:8px;border-radius:50%;background:${  pc.border  };"></span>` +
        `<span style="color:${  pc.text  };">${  pc.label  }</span></span>`;
    });
    h += '</div></div>';

    // ═══════════════════════════════════════════════════════════════════
    // INTERACTIVE VERTICAL PIPELINE (with multi-agent badges)
    // ═══════════════════════════════════════════════════════════════════
    h += buildInteractivePipeline(pipeline, activeFlow, AGENT_ICONS);

    // ═══════════════════════════════════════════════════════════════════
    // AGENT RESPONSE PANEL
    // ═══════════════════════════════════════════════════════════════════
    if (displayFlow && displayFlow.status === 'complete' && displayFlow.response) {
      h += '<div class="glass-card" style="margin-top:var(--space-md);border-left:4px solid var(--accent-orange);padding:16px 20px;">';
      h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">';
      h += '<span style="font-size:1.1rem;">\uD83D\uDCAC</span>';
      h += '<span style="font-size:0.78rem;font-weight:700;color:var(--accent-orange);text-transform:uppercase;letter-spacing:1px;">Agent Response</span>';
      h += '<span class="pill" style="font-size:0.56rem;background:rgba(240,136,62,0.12);color:var(--accent-orange);border:1px solid rgba(240,136,62,0.3);">Generated</span>';
      h += '</div>';
      h += '<div style="padding:12px 16px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border-primary);' +
        'font-size:0.78rem;line-height:1.6;color:var(--text-secondary);white-space:pre-wrap;">';
      h += linkifyResponseToArch(displayFlow.response);
      h += '</div></div>';
    } else if (activeFlow && activeFlow.status === 'active') {
      h += '<div class="glass-card" style="margin-top:var(--space-md);border-left:4px solid var(--accent-orange);padding:14px 18px;opacity:0.5;">';
      h += '<div style="display:flex;align-items:center;gap:8px;">';
      h += '<span style="font-size:1.1rem;">\uD83D\uDCAC</span>';
      h += '<span style="font-size:0.75rem;font-weight:600;color:var(--accent-orange);">Response</span>';
      h += '<span style="font-size:0.68rem;color:var(--text-dim);animation:aiFTyping 1.2s ease infinite;">Awaiting pipeline completion\u2026</span>';
      h += '</div></div>';
    }

    // ═══════════════════════════════════════════════════════════════════
    // ERROR CROSS-LINKS — Navigate to Architecture Live Graph
    // ═══════════════════════════════════════════════════════════════════
    const recentErrors = displayFlow ? displayFlow.recentErrors || [] : [];
    if (recentErrors.length > 0) {
      h += '<div class="glass-card" style="margin-top:var(--space-md);border-left:4px solid var(--accent-red);padding:14px 18px;">';
      h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">';
      h += '<span style="font-size:1.1rem;">\u26A0\uFE0F</span>';
      h += '<span style="font-size:0.78rem;font-weight:700;color:var(--accent-red);text-transform:uppercase;letter-spacing:1px;">Errors Detected</span>';
      h += `<span class="pill" style="font-size:0.56rem;background:rgba(255,68,68,0.12);color:var(--accent-red);border:1px solid rgba(255,68,68,0.3);">${  recentErrors.length  }</span>`;
      h += '</div>';
      recentErrors.forEach((err) => {
        h += '<div class="error-cross-link" onclick="SynapseApp.switchToTab(\'arch\');setTimeout(function(){if(SynapseApp.tabs.arch&&SynapseApp.tabs.arch.scan)SynapseApp.tabs.arch.scan();},200);">';
        h += '<span style="color:var(--accent-red);font-size:0.82rem;">\u2717</span>';
        h += '<div style="flex:1;">';
        h += `<div style="font-size:0.72rem;font-weight:600;color:var(--text-primary);">${  esc(err.component || 'Unknown')  }</div>`;
        h += `<div style="font-size:0.62rem;color:var(--text-dim);">${  esc(err.message || err.type || '')  }</div>`;
        h += '</div>';
        h += '<span class="arch-link" style="font-size:0.62rem;white-space:nowrap;">\u2192 Architecture Graph</span>';
        h += '</div>';
      });
      h += '</div>';
    }

    // ═══════════════════════════════════════════════════════════════════
    // INTERCONNECTION PANEL — Quick links to other tabs
    // ═══════════════════════════════════════════════════════════════════
    if (displayFlow && displayFlow.status === 'complete') {
      h += '<div style="margin-top:var(--space-md);display:flex;gap:var(--space-sm);flex-wrap:wrap;">';
      // Link to Architecture
      h += '<div class="glass-card" style="flex:1;min-width:140px;padding:10px 14px;cursor:pointer;border:1px solid rgba(88,166,255,0.15);' +
        'transition:all 0.15s ease;" onclick="SynapseApp.switchToTab(\'arch\');setTimeout(function(){if(SynapseApp.tabs.arch&&SynapseApp.tabs.arch.scan)SynapseApp.tabs.arch.scan();},200);" ' +
        'onmouseenter="this.style.borderColor=\'var(--accent-cyan)\'" onmouseleave="this.style.borderColor=\'rgba(88,166,255,0.15)\'">';
      h += '<div style="font-size:0.72rem;font-weight:600;color:var(--accent-cyan);">\uD83C\uDF10 Architecture Graph</div>';
      h += '<div style="font-size:0.58rem;color:var(--text-dim);">View component connections</div>';
      h += '</div>';
      // Link to Metrics
      h += '<div class="glass-card" style="flex:1;min-width:140px;padding:10px 14px;cursor:pointer;border:1px solid rgba(63,185,80,0.15);' +
        'transition:all 0.15s ease;" onclick="SynapseApp.switchToTab(\'metrics\')" ' +
        'onmouseenter="this.style.borderColor=\'var(--accent-green)\'" onmouseleave="this.style.borderColor=\'rgba(63,185,80,0.15)\'">';
      h += '<div style="font-size:0.72rem;font-weight:600;color:var(--accent-green);">\uD83D\uDCCA Metrics</div>';
      h += '<div style="font-size:0.58rem;color:var(--text-dim);">Performance data</div>';
      h += '</div>';
      // Link to Quality
      h += '<div class="glass-card" style="flex:1;min-width:140px;padding:10px 14px;cursor:pointer;border:1px solid rgba(240,136,62,0.15);' +
        'transition:all 0.15s ease;" onclick="SynapseApp.switchToTab(\'quality\')" ' +
        'onmouseenter="this.style.borderColor=\'var(--accent-orange)\'" onmouseleave="this.style.borderColor=\'rgba(240,136,62,0.15)\'">';
      h += '<div style="font-size:0.72rem;font-weight:600;color:var(--accent-orange);">\u2705 Quality</div>';
      h += '<div style="font-size:0.58rem;color:var(--text-dim);">Code quality gates</div>';
      h += '</div>';
      h += '</div>';
    }

    // ═══════════════════════════════════════════════════════════════════
    // COMPLETED TRACES HISTORY — Expandable
    // ═══════════════════════════════════════════════════════════════════
    if (_liveTraces.length > 0) {
      h += '<div style="margin-top:var(--space-lg);">';
      h += sectionLabel(`Completed Traces (${  _liveTraces.length  })`);
      _liveTraces.slice(0, 8).forEach((trace, idx) => {
        const isTrExp = _expandedTraceIdx === idx;
        h += `<div class="glass-card" style="padding:10px 14px;margin-bottom:var(--space-xs);border-left:3px solid var(--accent-cyan);cursor:pointer;${ 
          isTrExp ? 'background:rgba(88,166,255,0.04);' : ''  }" onclick="SynapseApp.tabs.agentIntel.expandTrace(${  idx  })">`;
        h += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        h += '<span style="font-size:0.72rem;font-weight:600;color:var(--text-primary);">';
        if (trace.prompt) h += `\u201C${  esc(trace.prompt.substring(0, 50))  }${trace.prompt.length > 50 ? '\u2026' : ''  }\u201D`;
        else h += `Trace #${  _liveTraces.length - idx}`;
        h += '</span>';
        h += '<div style="display:flex;gap:8px;align-items:center;">';
        h += `<span style="font-size:0.62rem;color:var(--text-dim);">${  trace.steps.length  } steps \u00B7 ${ 
          trace.duration ? `${trace.duration  }ms` : '-'  }</span>`;
        h += `<span style="font-size:0.72rem;color:var(--text-secondary);">${  isTrExp ? '\u25BE' : '\u25B8'  }</span>`;
        h += '</div></div>';
        // Mini progress bar
        h += '<div style="display:flex;gap:2px;margin-top:6px;height:4px;border-radius:2px;overflow:hidden;">';
        trace.steps.forEach((s) => {
          const pcs = PHASE_COLORS[s.phase] || PHASE_COLORS.engine;
          h += `<div style="flex:1;background:${  pcs.border  };opacity:0.8;" title="${  esc(s.name)  }"></div>`;
        });
        h += '</div>';
        // Expanded details
        if (isTrExp) {
          h += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);">';
          if (trace.prompt) {
            h += '<div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:4px;">Prompt:</div>';
            h += `<div style="padding:8px 12px;background:var(--bg-primary);border-radius:6px;font-family:var(--font-mono);font-size:0.78rem;color:var(--text-primary);margin-bottom:10px;word-wrap:break-word;">\u00BB ${  esc(trace.prompt)  }</div>`;
          }
          trace.steps.forEach((s) => {
            const pcx = PHASE_COLORS[s.phase] || PHASE_COLORS.engine;
            h += '<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:4px;">';
            h += `<span style="flex:0 0 auto;font-size:0.6rem;padding:1px 6px;border-radius:3px;background:${  pcx.bg  };color:${  pcx.text  };border:1px solid ${  pcx.border  };">${  s.step  }</span>`;
            h += '<div style="flex:1;">';
            h += `<span style="font-size:0.68rem;font-weight:600;color:${  pcx.text  };">${  esc(s.name)  }</span>`;
            h += `<span style="font-size:0.62rem;color:var(--text-dim);margin-left:6px;">${  esc(s.component)  }</span>`;
            if (s.transformation) h += `<div style="font-size:0.6rem;color:var(--text-tertiary);margin-top:1px;">\u26A1 ${  esc(s.transformation)  }</div>`;
            h += '</div></div>';
          });
          if (trace.response) {
            h += `<div style="margin-top:8px;padding:8px 12px;background:rgba(240,136,62,0.04);border-radius:6px;border:1px solid rgba(240,136,62,0.15);font-size:0.68rem;color:var(--text-secondary);white-space:pre-wrap;">` +
              `<span style="color:var(--accent-orange);font-weight:600;">\uD83D\uDCAC Response:</span>\n${  esc(trace.response)  }</div>`;
          }
          h += '</div>';
        }
        h += '</div>';
      });
      h += '</div>';
    }

    el.innerHTML = h;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERACTIVE VERTICAL PIPELINE — clickable steps with multi-agent badges
  // ═══════════════════════════════════════════════════════════════════════════
  function buildInteractivePipeline(pipeline, activeFlow, AGENT_ICONS) {
    if (!pipeline.length) return '';
    AGENT_ICONS = AGENT_ICONS || {};

    const completedStepNums = {};
    let latestStep = 0;
    const flowStepsMap = {};
    if (activeFlow) {
      activeFlow.steps.forEach((s) => {
        completedStepNums[s.step] = true;
        flowStepsMap[s.step] = s;
        if (s.step > latestStep) latestStep = s.step;
      });
    }
    const lastTrace = !activeFlow && _liveTraces.length ? _liveTraces[0] : null;
    if (lastTrace) {
      lastTrace.steps.forEach((s) => {
        completedStepNums[s.step] = true;
        flowStepsMap[s.step] = s;
        if (s.step > latestStep) latestStep = s.step;
      });
    }

    const displayFlow = activeFlow || lastTrace;
    let h = '<div style="position:relative;padding:2px 0;">';

    pipeline.forEach((step, i) => {
      const pc = PHASE_COLORS[step.phase] || PHASE_COLORS.engine;
      const isCompleted = !!completedStepNums[step.step];
      const isLatest = step.step === latestStep && activeFlow && activeFlow.status === 'active';
      const isSel = _selectedStep === step.step;
      const isWaiting = !isCompleted && !isLatest;
      const flowStep = flowStepsMap[step.step];

      // ── Connector with agent handoff arrow ──
      if (i > 0) {
        h += '<div style="display:flex;align-items:stretch;padding-left:15px;">';
        h += `<div style="width:2px;min-height:20px;` +
          `background:${  isCompleted || isLatest ? pc.border : 'rgba(255,255,255,0.08)'  };${ 
          isWaiting ? 'opacity:0.3;background:repeating-linear-gradient(to bottom,rgba(255,255,255,0.1) 0px,rgba(255,255,255,0.1) 3px,transparent 3px,transparent 6px);' : '' 
          }"></div>`;
        // Agent handoff indicator between steps
        if (flowStep && flowStep.agents && flowStep.agents.length > 0 && isCompleted) {
          h += '<div style="margin-left:12px;display:flex;align-items:center;gap:4px;">';
          h += '<span style="font-size:0.5rem;color:var(--text-dim);">\u2193</span>';
          flowStep.agents.forEach((a) => {
            const aIcon = AGENT_ICONS[a.name] || '\uD83E\uDD16';
            h += `<span style="font-size:0.55rem;color:#bc8cff;" title="${  esc(`${a.name  }: ${  a.role || ''}`)  }">${  aIcon  }</span>`;
          });
          h += '</div>';
        }
        h += '</div>';
      }

      // ── Step Row ──
      h += `<div class="ai-step-row${  isLatest ? ' ai-step-active' : ''  }" ` +
        `onclick="SynapseApp.tabs.agentIntel.selectStep(${  step.step  })" ` +
        `style="display:flex;gap:12px;align-items:flex-start;padding:10px 14px;` +
        `border-color:${  isSel ? pc.border : isLatest ? pc.border : 'transparent'  };` +
        `background:${  isSel ? pc.bg : isLatest ? pc.bg : 'transparent'  };">`;

      // ── Status Circle ──
      h += `<div style="flex:0 0 32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;` +
        `border:2px ${  isWaiting ? 'dashed' : 'solid'  } ${  pc.border  };` +
        `background:${  isCompleted ? pc.bg.replace('0.12', '0.25') : 'transparent'  };` +
        `color:${  pc.text  };font-size:0.72rem;font-weight:700;${ 
        isLatest ? `box-shadow:0 0 12px ${  pc.glow  };` : '' 
        }${isWaiting ? 'opacity:0.35;' : ''  }">`;
      if (isCompleted && !isLatest) h += '\u2713';
      else if (isLatest) h += `<div style="width:8px;height:8px;border-radius:50%;background:${  pc.border  };"></div>`;
      else h += step.step;
      h += '</div>';

      // ── Card Body ──
      h += '<div style="flex:1;min-width:0;">';

      // Row 1: Name + Phase + Agent count
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">';
      h += '<div style="display:flex;align-items:center;gap:8px;min-width:0;">';
      h += `<span style="font-size:0.82rem;font-weight:600;color:${  isWaiting ? 'var(--text-dim)' : pc.text  };">${ 
        step.step  }. ${  esc(step.name)  }</span>`;
      h += '</div>';
      h += '<div style="display:flex;align-items:center;gap:6px;flex:0 0 auto;">';
      h += `<span class="pill" style="font-size:0.54rem;background:${  pc.bg  };color:${  pc.text  };border:1px solid ${  pc.border  };">${  pc.label  }</span>`;
      if (isLatest) h += '<span style="font-size:0.58rem;color:var(--accent-green);font-weight:700;">\u25CF PROCESSING</span>';
      else if (isCompleted) h += `<span style="font-size:0.58rem;color:${  pc.text  };">\u2713</span>`;
      h += '</div></div>';

      // Row 2: Component
      h += `<div style="font-size:0.68rem;color:${  isWaiting ? 'var(--text-dim)' : 'var(--accent-cyan)' 
        };font-family:var(--font-mono);margin-top:3px;opacity:${  isWaiting ? '0.35' : '1'  };">${  esc(step.component)  }</div>`;

      // Row 3: Agent badges for this step
      const stepAgents = flowStep && flowStep.agents ? flowStep.agents : [];
      if (stepAgents.length > 0 && (isCompleted || isLatest)) {
        h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;">';
        stepAgents.forEach((agent) => {
          const aIcon = AGENT_ICONS[agent.name] || '\uD83E\uDD16';
          h += `<span class="agent-badge${  isLatest ? ' active' : ''  }" title="${  esc(agent.role || '')  }">${ 
            aIcon  } ${  esc(agent.name) 
            }</span>`;
        });
        h += '</div>';
      }

      // Row 4: Transformation (for processed steps)
      if (flowStep && flowStep.transformation) {
        h += `<div style="font-size:0.68rem;color:var(--text-secondary);margin-top:5px;padding:5px 10px;` +
          `background:rgba(255,255,255,0.02);border-radius:4px;border-left:2px solid ${  pc.border  };">\u26A1 ${  esc(flowStep.transformation)  }</div>`;
      }

      // Row 5: Prompt text prominently on step 1
      if (step.step === 1 && displayFlow && displayFlow.prompt) {
        h += '<div style="margin-top:6px;padding:8px 12px;background:rgba(88,166,255,0.06);border-radius:6px;border:1px solid rgba(88,166,255,0.15);">';
        h += '<div style="font-size:0.6rem;color:var(--text-dim);margin-bottom:2px;">\uD83D\uDCDD Prompt received:</div>';
        h += `<div style="font-size:0.78rem;color:var(--text-primary);font-family:var(--font-mono);word-wrap:break-word;line-height:1.4;">\u201C${  esc(displayFlow.prompt)  }\u201D</div>`;
        h += '</div>';
      }

      // Expanded detail (when selected or active)
      if (isSel || isLatest) {
        h += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">';
        h += `<div style="font-size:0.65rem;color:var(--text-tertiary);line-height:1.4;">${  esc(step.detail)  }</div>`;
        if (step.annotations && step.annotations.length) {
          h += '<div style="margin-top:6px;">';
          step.annotations.forEach((a) => {
            h += `<div style="font-size:0.6rem;color:var(--accent-green);">\u2B50 ${  esc(a)  }</div>`;
          });
          h += '</div>';
        }
        // Show prompt data flowing through if this step has it
        if (flowStep && flowStep.prompt) {
          h += '<div style="margin-top:6px;padding:6px 10px;background:rgba(255,255,255,0.02);border-radius:4px;">';
          h += '<div style="font-size:0.58rem;color:var(--text-dim);">\uD83D\uDCE8 Prompt data at this stage:</div>';
          h += `<div style="font-size:0.68rem;color:var(--text-primary);font-family:var(--font-mono);margin-top:2px;">\u201C${  esc(flowStep.prompt)  }\u201D</div>`;
          h += '</div>';
        }
        // Show agent details when expanded
        if (stepAgents.length > 0) {
          h += '<div style="margin-top:6px;padding:6px 10px;background:rgba(188,140,255,0.04);border-radius:4px;border:1px solid rgba(188,140,255,0.1);">';
          h += '<div style="font-size:0.58rem;color:#bc8cff;font-weight:600;margin-bottom:4px;">\uD83E\uDD16 Agents at this stage:</div>';
          stepAgents.forEach((agent) => {
            const aIcon = AGENT_ICONS[agent.name] || '\uD83E\uDD16';
            h += `<div style="font-size:0.62rem;color:var(--text-secondary);padding:1px 0;">${ 
              aIcon  } <b style="color:#bc8cff;">${  esc(agent.name)  }</b> \u2014 ${  esc(agent.role || 'Processing')  }</div>`;
          });
          h += '</div>';
        }
        // Cross-link to architecture if error-related terms detected
        if (step.phase === 'backend' || (step.detail && /error|fail|timeout|exception/i.test(step.detail))) {
          h += '<div style="margin-top:6px;">';
          h += '<span class="arch-link" style="font-size:0.6rem;" ' +
            'onclick="event.stopPropagation();SynapseApp.switchToTab(\'arch\');setTimeout(function(){if(SynapseApp.tabs.arch&&SynapseApp.tabs.arch.scan)SynapseApp.tabs.arch.scan();},200);">' +
            '\uD83C\uDF10 View in Architecture Graph \u2192</span>';
          h += '</div>';
        }
        h += '</div>';
      }

      h += '</div>'; // card body

      // Expand indicator
      h += '<div style="flex:0 0 auto;color:var(--text-dim);font-size:0.72rem;padding-top:6px;">';
      h += isSel ? '\u25BE' : '\u25B8';
      h += '</div>';

      h += '</div>'; // step row
    });

    h += '</div>';
    return h;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW 3: DIAGNOSTICS
  // ═══════════════════════════════════════════════════════════════════════════
  function renderDiagnostics() {
    const el = document.getElementById('aiView-diag');
    if (!el || !_data) return;
    const diags = _data.diagnostics || [];
    let h = '';

    const allPass = diags.every((d) => { return d.status === 'pass'; });
    const anyFail = diags.some((d) => { return d.status === 'fail'; });
    const warnCount = diags.filter((d) => { return d.status === 'warn'; }).length;

    if (allPass) {
      h += '<div class="glass-card" style="border-left:4px solid var(--accent-green);margin-bottom:var(--space-md);padding:12px 16px;">' +
        '<span style="color:var(--accent-green);font-weight:700;">\u2713 All Probes Passed</span> \u2014 Agent infrastructure is healthy</div>';
    } else if (anyFail) {
      const failCount = diags.filter((d) => { return d.status === 'fail'; }).length;
      h += `<div class="glass-card" style="border-left:4px solid var(--accent-red);margin-bottom:var(--space-md);padding:12px 16px;">` +
        `<span style="color:var(--accent-red);font-weight:700;">\u2717 ${  failCount  } Probe(s) Failed</span> \u2014 Investigation needed</div>`;
    } else {
      h += `<div class="glass-card" style="border-left:4px solid var(--accent-yellow);margin-bottom:var(--space-md);padding:12px 16px;">` +
        `<span style="color:var(--accent-yellow);font-weight:700;">\u26A0 ${  warnCount  } Warning(s)</span> \u2014 Review recommended</div>`;
    }

    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-sm);margin-bottom:var(--space-lg);">';
    diags.forEach((probe) => {
      const st = DIAG_STATUS[probe.status] || DIAG_STATUS.info;
      h += `<div class="glass-card" style="border-left:3px solid ${  st.color  };padding:10px;">`;
      h += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      h += `<span style="font-size:0.78rem;font-weight:600;color:var(--text-primary);">${  esc(probe.name)  }</span>`;
      h += `<span style="color:${  st.color  };font-weight:700;font-size:0.85rem;">${  st.icon  }</span></div>`;
      h += `<div style="font-size:0.68rem;color:var(--text-tertiary);margin-top:6px;">${  esc(probe.detail)  }</div>`;
      h += '</div>';
    });
    h += '</div>';

    h += sectionLabel('Live Connectivity Probes');
    h += '<div id="aiLiveProbes" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:var(--space-sm);">';
    h += buildLiveProbesHTML();
    h += '</div>';

    el.innerHTML = h;
  }

  const _liveProbeResults = {};

  function buildLiveProbesHTML() {
    const probes = [
      { id: 'backend', name: 'Backend Health', desc: 'GET /health' },
      { id: 'ollama', name: 'Ollama Local', desc: 'GET http://127.0.0.1:11434/api/tags' },
      { id: 'sse', name: 'SSE Stream', desc: 'GET /debug/events' },
      { id: 'models', name: 'Model Availability', desc: 'GET /v1/models' },
    ];
    let html = '';
    probes.forEach((probe) => {
      const result = _liveProbeResults[probe.id];
      const status = result ? result.status : 'idle';
      const colors = { idle: 'var(--border-subtle)', running: 'var(--accent-yellow)', pass: 'var(--accent-green)', fail: 'var(--accent-red)' };
      const icons = { idle: '\u25CB', running: '\u25CC', pass: '\u2713', fail: '\u2717' };
      html += `<div class="glass-card" style="border-left:3px solid ${  colors[status] || colors.idle  };padding:10px;cursor:pointer;" ` +
        `onclick="SynapseApp.tabs.agentIntel._runLiveProbe('${  probe.id  }')">`;
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      html += `<span style="font-size:0.75rem;font-weight:600;">${  esc(probe.name)  }</span>`;
      html += `<span style="color:${  colors[status] || colors.idle  };font-weight:700;">${  icons[status] || '\u25CB'  }</span></div>`;
      html += `<div style="font-size:0.62rem;color:var(--text-dim);margin-top:4px;">${  esc(probe.desc)  }</div>`;
      if (result && result.detail) {
        html += `<div style="font-size:0.62rem;color:${  colors[status] || 'var(--text-dim)'  };margin-top:2px;">${  esc(result.detail)  }</div>`;
      }
      html += '</div>';
    });
    return html;
  }

  async function runLiveProbe(probeId) {
    _liveProbeResults[probeId] = { status: 'running', detail: 'Checking\u2026' };
    refreshLiveProbes();
    try {
      if (probeId === 'backend') {
        const r = await fetch(`${CONFIG.API_BASE  }/health`, { signal: AbortSignal.timeout(5000) });
        const d = await r.json();
        _liveProbeResults[probeId] = { status: r.ok ? 'pass' : 'fail', detail: d.status || 'unknown' };
      } else if (probeId === 'ollama') {
        const r2 = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) }).catch(() => { return null; });
        if (r2 && r2.ok) {
          const tags = await r2.json();
          _liveProbeResults[probeId] = { status: 'pass', detail: `${(tags.models || []).length  } model(s)` };
        } else {
          _liveProbeResults[probeId] = { status: 'fail', detail: 'Ollama not running on :11434' };
        }
      } else if (probeId === 'sse') {
        const r3 = await fetch(`${CONFIG.API_BASE  }/debug/events`, { signal: AbortSignal.timeout(3000) });
        _liveProbeResults[probeId] = { status: r3.ok ? 'pass' : 'fail', detail: r3.ok ? 'Event store accessible' : `HTTP ${  r3.status}` };
      } else if (probeId === 'models') {
        const r4 = await fetch(`${CONFIG.API_V1  }/models`, { signal: AbortSignal.timeout(3000) }).catch(() => { return null; });
        if (r4 && r4.ok) {
          const md = await r4.json();
          _liveProbeResults[probeId] = { status: 'pass', detail: `${(md.models || md || []).length  } model(s)` };
        } else {
          _liveProbeResults[probeId] = { status: 'fail', detail: 'No /v1/models endpoint' };
        }
      }
    } catch (err) {
      _liveProbeResults[probeId] = { status: 'fail', detail: err.message };
    }
    refreshLiveProbes();
  }

  function refreshLiveProbes() {
    const el = document.getElementById('aiLiveProbes');
    if (el) el.innerHTML = buildLiveProbesHTML();
  }

  async function refreshDiagnostics() {
    const probeIds = ['backend', 'ollama', 'sse', 'models'];
    for (let i = 0; i < probeIds.length; i++) {
      await runLiveProbe(probeIds[i]);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function sectionLabel(text) {
    return `<div style="font-size:0.72rem;font-weight:600;color:var(--text-secondary);margin-bottom:var(--space-xs);text-transform:uppercase;letter-spacing:0.5px;">${  text  }</div>`;
  }

})();
