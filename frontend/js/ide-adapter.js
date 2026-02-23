/**
 * Live Debug -- IDE & LLM Adapter Layer
 * ================================================
 * Detects the active IDE, project type, and LLM provider,
 * then exposes a unified CONFIG_IDE object consumed by every tab.
 *
 * Supported IDEs:  VS Code (Copilot), Cursor, JetBrains (AI Assistant),
 *                  Windsurf, Zed, Neovim, Sublime, generic/unknown.
 * Supported LLMs:  Ollama, OpenAI, Anthropic, Google, Mistral, Copilot,
 *                  Cursor AI, local, custom.
 *
 * Detection strategy:
 *   1. Backend /v1/project/detect returns language, framework, IDE hints.
 *   2. Frontend probes well-known local ports (Ollama 11434, etc.).
 *   3. User can override via localStorage('synapse_ide') / ('synapse_llm').
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  IDE Profiles                                                       */
  /* ------------------------------------------------------------------ */
  const IDE_PROFILES = {
    vscode: {
      name: 'VS Code',
      chat: { probe: '/api/chat', label: 'Copilot Chat' },
      agents: ['Copilot', 'IntelliSense', 'GitLens', 'Extensions'],
      stores: ['workspaceState', 'globalState', 'secrets'],
      hooks: [],
      services: ['copilotService', 'extensionHost', 'languageServer'],
      infra: [
        { name: 'Extension Host', items: ['ExtensionHost', 'LanguageClient', 'LSP Protocol'] },
        { name: 'Copilot', items: ['CopilotChat', 'CopilotCompletions', 'CopilotAgent'] },
        { name: 'Editor Core', items: ['Monaco Editor', 'TextModel', 'Decorations', 'Commands'] },
        { name: 'Debug Adapter', items: ['DAP Client', 'Breakpoints', 'CallStack', 'Variables'] },
      ],
    },
    cursor: {
      name: 'Cursor',
      chat: { probe: '/api/chat', label: 'Cursor AI Chat' },
      agents: ['Cursor AI', 'Composer', 'Tab Autocomplete', 'CodeLens'],
      stores: ['cursorState', 'composerState'],
      hooks: [],
      services: ['cursorAIService', 'composerService', 'contextService'],
      infra: [
        { name: 'Cursor AI Engine', items: ['Composer', 'CursorTab', 'ContextBuilder', 'CodeSearch'] },
        { name: 'Editor Core', items: ['Monaco Editor', 'TextModel', 'Decorations'] },
        { name: 'Chat Pipeline', items: ['CursorChat', 'ToolCalling', 'FileEdits'] },
      ],
    },
    jetbrains: {
      name: 'JetBrains',
      chat: { probe: null, label: 'AI Assistant' },
      agents: ['AI Assistant', 'IntelliJ Analyzer', 'Inspections'],
      stores: [],
      hooks: [],
      services: ['aiAssistantService', 'inspectionService'],
      infra: [
        { name: 'PSI Engine', items: ['PsiFile', 'PsiElement', 'References', 'Inspections'] },
        { name: 'AI Assistant', items: ['ChatCompletion', 'CodeGeneration', 'Refactoring'] },
      ],
    },
    windsurf: {
      name: 'Windsurf',
      chat: { probe: '/api/chat', label: 'Cascade Chat' },
      agents: ['Cascade', 'Flows', 'Supercomplete'],
      stores: [],
      hooks: [],
      services: ['cascadeService', 'flowService'],
      infra: [
        { name: 'Cascade Engine', items: ['CascadeChat', 'Flows', 'Supercomplete', 'ContextEngine'] },
      ],
    },
    synapse: {
      name: 'Synapse IDE',
      chat: { probe: '/api/tags', label: 'Synapse Chat (Ollama)' },
      agents: ['Router', 'Planner', 'Executor', 'Memory', 'Context', 'Model',
               'Validator', 'Debugger', 'Governor', 'Tester', 'Deployer',
               'Monitor', 'Security', 'Reporter'],
      stores: ['editorStore', 'projectStore', 'chatStore', 'settingsStore',
               'memoryStore', 'uiStore', 'terminalStore', 'securityStore',
               'agentStore', 'canvasStore', 'noteStore', 'mcpStore', 'debugStore'],
      hooks: ['useDebugMonitor', 'useAutosave', 'useEditor', 'useCanvasEvents',
              'useChatInput', 'useOllamaStatus', 'useModelManager', 'useKeyboard',
              'useMarkdown', 'useAgentPanel', 'useAutoScroll', 'useErrorBoundary',
              'useProjectPicker', 'useDebounce', 'useThrottle', 'useElectronIPC'],
      services: ['chatService', 'settingsService', 'modelsService', 'healthService',
                 'codeService', 'memoryService', 'notesService', 'debugService',
                 'mcpService', 'inferenceService'],
      infra: [
        { name: 'Chat Engine', items: ['ChatStore', 'SDPSEngine', 'SDPS Pipeline', 'PromptSynthesizer', 'ContextEngine', 'MessageStreamManager'] },
        { name: 'Agent System', items: ['AgentBridge', 'AgentOrchestrator', 'MultiAgentRouter', 'CopilotDriver', 'NES Engine'] },
        { name: 'Memory Layers', items: ['EpisodicMemory', 'SemanticMemory', 'ConversationSummarizer', 'WorkingMemoryManager'] },
        { name: 'Tool System', items: ['ToolParser', 'MCPClient', 'MCPCommandRouter', 'FunctionCaller', 'ToolResultHandler'] },
        { name: 'UI Layer', items: ['CanvasFlow', 'ReactFlowGraph', 'NodeEditor', 'SidePanel', 'FloatingChat', 'InlineChat'] },
        { name: 'Code Intelligence', items: ['LanguageRegistry', 'CodeAnalyzer', 'TestSuiteManager', 'ProjectScanner'] },
        { name: 'Settings', items: ['SettingsStore', 'ProviderManager', 'ModelRouter', 'ConfigValidator'] },
        { name: 'Transport', items: ['TauriCommands', 'EventBus', 'SSE Client', 'WebSocket Client', 'HTTP Fetch Layer'] },
        { name: 'Security', items: ['APIKeyManager', 'PermissionGuard', 'RateLimiter', 'InputSanitizer'] },
        { name: 'File System', items: ['FileWatcher', 'FilePersistence', 'ProjectTree', 'WorkspaceManager'] },
        { name: 'Notification', items: ['NotificationManager', 'DesktopNotifs', 'SoundAlerts', 'VoiceAlerts'] },
        { name: 'Performance', items: ['LatencyTracker', 'MetricsCollector', 'TokenCounter', 'PerformanceMonitor'] },
        { name: 'Governor', items: ['GovernorAPI', 'AutoHealEngine', 'DiagnosticProbes', 'RuntimeSupervisor'] },
        { name: 'Version Control', items: ['SessionManager', 'CheckpointManager', 'TraceReplay', 'SnapshotStore'] },
      ],
    },
    generic: {
      name: 'Unknown IDE',
      chat: { probe: null, label: 'Chat' },
      agents: [],
      stores: [],
      hooks: [],
      services: [],
      infra: [],
    },
  };

  /* ------------------------------------------------------------------ */
  /*  LLM Provider Profiles                                              */
  /* ------------------------------------------------------------------ */
  const LLM_PROFILES = {
    ollama:    { name: 'Ollama',    port: 11434, probe: '/api/tags',   prefix: 'ollama/' },
    openai:    { name: 'OpenAI',    port: null,  probe: null,          prefix: 'openai/' },
    anthropic: { name: 'Anthropic', port: null,  probe: null,          prefix: 'anthropic/' },
    google:    { name: 'Google AI', port: null,  probe: null,          prefix: 'google/' },
    mistral:   { name: 'Mistral',   port: null,  probe: null,          prefix: 'mistral/' },
    copilot:   { name: 'Copilot',   port: null,  probe: null,          prefix: 'copilot/' },
    cursor:    { name: 'Cursor AI', port: null,  probe: null,          prefix: 'cursor/' },
    local:     { name: 'Local',     port: null,  probe: null,          prefix: 'local/' },
  };

  /* ------------------------------------------------------------------ */
  /*  Chat Pipeline Probes (generic, IDE-adapted at runtime)             */
  /* ------------------------------------------------------------------ */
  function buildChatProbes(ideId, llmId) {
    const ide = IDE_PROFILES[ideId] || IDE_PROFILES.generic;
    const llm = LLM_PROFILES[llmId] || null;
    const probes = [];

    // Probe 1 -- LLM connectivity (adapt to detected provider)
    if (llm && llm.port) {
      probes.push({
        id: 'llm',
        name: `${llm.name  } Connectivity`,
        async run () {
          const url = `http://127.0.0.1:${  llm.port  }${llm.probe || '/'}`;
          const res = await fetch(url).catch(() => { return null; });
          if (!res || !res.ok) return { ok: false, detail: `${llm.name  } not reachable at ${  url}` };
          return { ok: true, detail: `${llm.name  } is running` };
        },
      });
    } else if (llm) {
      probes.push({
        id: 'llm',
        name: `${llm.name  } API`,
        async run () {
          // For cloud providers, check via backend settings
          const res = await fetch(`${CONFIG.API_V1  }/settings`).catch(() => { return null; });
          if (!res || !res.ok) return { ok: false, detail: `Cannot verify ${  llm.name  } config` };
          await res.json();
          return { ok: true, detail: `${llm.name  } configured via backend settings` };
        },
      });
    } else {
      probes.push({
        id: 'llm',
        name: 'LLM Connectivity',
        async run () {
          // Try Ollama as fallback probe
          const res = await fetch('http://127.0.0.1:11434/api/tags').catch(() => { return null; });
          if (res && res.ok) return { ok: true, detail: 'Ollama detected on :11434' };
          return { ok: false, detail: 'No LLM backend detected. Configure in settings.' };
        },
      });
    }

    // Probe 2 -- Model availability
    probes.push({
      id: 'models',
      name: 'Model Availability',
      async run () {
        const res = await fetch(`${CONFIG.API_V1  }/models`).catch(() => { return null; });
        if (!res || !res.ok) return { ok: false, detail: 'Cannot fetch models' };
        const data = await res.json();
        const models = data.models || data || [];
        return { ok: models.length > 0, detail: `${models.length  } models loaded` };
      },
    });

    // Probe 3 -- Backend health
    probes.push({
      id: 'backend',
      name: 'Backend Health',
      async run () {
        const res = await fetch(`${CONFIG.API_BASE  }/health`).catch(() => { return null; });
        if (!res || !res.ok) return { ok: false, detail: 'Backend unreachable' };
        const data = await res.json();
        return { ok: data.status === 'ok' || data.status === 'healthy', detail: data.status || 'unknown' };
      },
    });

    // Probe 4 -- Settings config
    probes.push({
      id: 'settings',
      name: 'Settings Config',
      async run () {
        const res = await fetch(`${CONFIG.API_V1  }/settings`).catch(() => { return null; });
        if (!res || !res.ok) return { ok: false, detail: 'Cannot read settings' };
        const data = await res.json();
        const hasModel = !!(data.model || data.defaultModel || data.default_model);
        return { ok: hasModel, detail: hasModel ? `Model: ${  data.model || data.defaultModel || data.default_model}` : 'No model configured' };
      },
    });

    // Probe 5 -- Model routing
    probes.push({
      id: 'routing',
      name: 'Model Routing',
      async run () {
        const res = await fetch(`${CONFIG.API_V1  }/settings`).catch(() => { return null; });
        if (!res || !res.ok) return { ok: false, detail: 'Cannot validate routing' };
        const data = await res.json();
        const model = data.model || data.defaultModel || data.default_model || '';
        const allPrefixes = Object.values(LLM_PROFILES).map((p) => { return p.prefix; });
        const valid = allPrefixes.some((p) => { return model.toLowerCase().startsWith(p); });
        return { ok: valid || model.length > 0, detail: valid ? `Routed: ${  model}` : `Model: ${  model || 'none'}` };
      },
    });

    // Probe 6 -- E2E Chat test (ide-specific label)
    probes.push({
      id: 'e2e',
      name: `E2E ${  ide.chat.label || 'Chat'  } Test`,
      async run () {
        const res = await fetch(`${CONFIG.API_V1  }/chat/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'ping' }),
        }).catch(() => { return null; });
        if (!res || !res.ok) return { ok: false, detail: 'E2E chat test failed or not available' };
        const data = await res.json();
        return { ok: !!data.response, detail: data.response ? `Response: ${  data.response.substring(0, 60)}` : 'Empty response' };
      },
    });

    // Probe 7 -- API key audit
    probes.push({
      id: 'apikeys',
      name: 'API Key Audit',
      async run () {
        const res = await fetch(`${CONFIG.API_V1  }/settings`).catch(() => { return null; });
        if (!res || !res.ok) return { ok: false, detail: 'Cannot audit keys' };
        const data = await res.json();
        const keys = ['openaiKey', 'anthropicKey', 'googleKey', 'mistralKey', 'copilotToken', 'cursorToken'];
        const configured = keys.filter((k) => { return data[k] && data[k].length > 5; });
        return { ok: true, detail: `${configured.length  }/${  keys.length  } API keys configured` };
      },
    });

    return probes;
  }

  /* ------------------------------------------------------------------ */
  /*  Agent Flow pipeline steps (generic + IDE-specific extensions)       */
  /* ------------------------------------------------------------------ */
  function buildPipelineStepMap(ideId, llmId) {
    const llm = LLM_PROFILES[llmId] || { name: 'LLM' };
    const llmName = llm.name || 'LLM';

    // Base pipeline -- works with any IDE
    const map = {
      // Frontend Phase
      'chat:message:sent':    { phase: 'frontend', step: 'User Message' },
      'chat:input:changed':   { phase: 'frontend', step: 'Input Changed' },
      'settings:changed':     { phase: 'frontend', step: 'Settings Changed' },
      'theme:changed':        { phase: 'frontend', step: 'Theme Changed' },
      'file:opened':          { phase: 'frontend', step: 'File Opened' },
      'file:saved':           { phase: 'frontend', step: 'File Saved' },
      'editor:changed':       { phase: 'frontend', step: 'Editor Changed' },
      'canvas:node:created':  { phase: 'frontend', step: 'Canvas Node Created' },
      'canvas:node:updated':  { phase: 'frontend', step: 'Canvas Node Updated' },
      'canvas:edge:created':  { phase: 'frontend', step: 'Edge Created' },
      // Engine Phase
      'engine:routing:start':    { phase: 'engine', step: 'Routing Start' },
      'engine:routing:complete': { phase: 'engine', step: 'Routing Complete' },
      'engine:model:selected':   { phase: 'engine', step: 'Model Selected' },
      'engine:prompt:build':     { phase: 'engine', step: 'Prompt Build' },
      'engine:context:assembled':{ phase: 'engine', step: 'Context Assembled' },
      'engine:chain:start':      { phase: 'engine', step: 'Chain Start' },
      'engine:chain:complete':   { phase: 'engine', step: 'Chain Complete' },
      'engine:error':            { phase: 'engine', step: 'Engine Error' },
      'engine:fallback':         { phase: 'engine', step: 'Fallback Triggered' },
      'engine:cache:hit':        { phase: 'engine', step: 'Cache Hit' },
      'engine:cache:miss':       { phase: 'engine', step: 'Cache Miss' },
      // Backend Phase
      'api:request:start':    { phase: 'backend', step: 'API Request' },
      'api:request:complete': { phase: 'backend', step: 'API Response' },
      'api:error':            { phase: 'backend', step: 'API Error' },
      'db:query':             { phase: 'backend', step: 'DB Query' },
      'db:write':             { phase: 'backend', step: 'DB Write' },
      'governor:scan':        { phase: 'backend', step: 'Governor Scan' },
      'governor:fix:applied': { phase: 'backend', step: 'Fix Applied' },
      // Response Phase
      'chat:response:start':    { phase: 'response', step: 'Response Start' },
      'chat:response:chunk':    { phase: 'response', step: 'Response Chunk' },
      'chat:response:complete': { phase: 'response', step: 'Response Complete' },
      'chat:response:error':    { phase: 'response', step: 'Response Error' },
    };

    // LLM-specific steps (dynamic based on detected provider)
    map['llm:generate:start']    = { phase: 'backend', step: `${llmName  } Generate` };
    map['llm:generate:stream']   = { phase: 'backend', step: `${llmName  } Streaming` };
    map['llm:generate:complete'] = { phase: 'backend', step: `${llmName  } Complete` };
    map['llm:error']             = { phase: 'backend', step: `${llmName  } Error` };
    // Keep Ollama-specific for backward compat
    map['ollama:generate:start']    = { phase: 'backend', step: `${llmName  } Generate` };
    map['ollama:generate:stream']   = { phase: 'backend', step: `${llmName  } Streaming` };
    map['ollama:generate:complete'] = { phase: 'backend', step: `${llmName  } Complete` };
    map['ollama:error']             = { phase: 'backend', step: `${llmName  } Error` };

    return map;
  }

  /* ------------------------------------------------------------------ */
  /*  Orchestra agent map (dynamic based on IDE profile)                  */
  /* ------------------------------------------------------------------ */
  function buildOrchestraAgents(ideId) {
    const ide = IDE_PROFILES[ideId] || IDE_PROFILES.generic;
    const agents = ide.agents || [];
    if (agents.length === 0) return { agents: [], edges: [], eventMap: {}, tacMap: {} };

    // Default colors cycle
    const colors = ['#58a6ff','#bc8cff','#f0883e','#56d4dd','#3fb950','#f97316',
                  '#ff7b72','#f778ba','#facc15','#a78bfa','#22d3ee','#fb923c',
                  '#34d399','#f472b6'];

    // Layout agents in a grid
    const cols = Math.min(agents.length, 7);
    const orchAgents = agents.map((name, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        id: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
        name,
        icon: '',
        x: 100 + col * 120,
        y: 40 + row * 120,
        color: colors[i % colors.length],
      };
    });

    // Auto-generate edges (sequential chain)
    const orchEdges = [];
    for (let i = 0; i < orchAgents.length - 1; i++) {
      orchEdges.push({ from: orchAgents[i].id, to: orchAgents[i + 1].id });
    }
    if (orchAgents.length > 2) {
      orchEdges.push({ from: orchAgents[orchAgents.length - 1].id, to: orchAgents[0].id });
    }

    // Build basic event map
    const eventMap = {};
    orchAgents.forEach((a) => {
      eventMap[`${a.name.toLowerCase()  }:`] = a.id;
    });

    // TAC map
    const tacMap = {};
    orchAgents.forEach((a, i) => {
      if (i < orchAgents.length * 0.3) tacMap[a.id] = 'frontend';
      else if (i < orchAgents.length * 0.6) tacMap[a.id] = 'engine';
      else tacMap[a.id] = 'backend';
    });

    return { agents: orchAgents, edges: orchEdges, eventMap, tacMap };
  }

  /* ------------------------------------------------------------------ */
  /*  Detection Logic                                                     */
  /* ------------------------------------------------------------------ */
  const _detected = {
    ide: localStorage.getItem('synapse_ide') || 'auto',
    llm: localStorage.getItem('synapse_llm') || 'auto',
    projectType: null,
    frameworks: [],
    languages: [],
    ready: false,
  };

  async function detectEnvironment() {
    try {
      const res = await fetch(`${CONFIG.API_V1  }/project/detect`).catch(() => { return null; });
      if (res && res.ok) {
        const data = await res.json();
        _detected.projectType = data.primaryLanguage || data.language || null;
        _detected.frameworks = data.frameworks || [];
        _detected.languages = data.languages || [];

        // Auto-detect IDE from project structure hints
        if (_detected.ide === 'auto') {
          if (data.ide) {
            _detected.ide = data.ide;
          } else if (_detected.frameworks.some((f) => { return f.toLowerCase().indexOf('tauri') !== -1; })) {
            _detected.ide = 'synapse';
          } else if (_detected.frameworks.some((f) => { return f.toLowerCase().indexOf('cursor') !== -1; })) {
            _detected.ide = 'cursor';
          } else {
            _detected.ide = 'generic';
          }
        }
      }
    } catch { /* silent */ }

    // Auto-detect LLM
    if (_detected.llm === 'auto') {
      try {
        const ollamaRes = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2000) }).catch(() => { return null; });
        if (ollamaRes && ollamaRes.ok) {
          _detected.llm = 'ollama';
        } else {
          // Check backend settings for hints
          const settingsRes = await fetch(`${CONFIG.API_V1  }/settings`).catch(() => { return null; });
          if (settingsRes && settingsRes.ok) {
            const settings = await settingsRes.json();
            const provider = (settings.default_provider || settings.provider || '').toLowerCase();
            if (LLM_PROFILES[provider]) _detected.llm = provider;
            else _detected.llm = 'openai'; // sensible default
          } else {
            _detected.llm = 'openai';
          }
        }
      } catch {
        _detected.llm = 'openai';
      }
    }

    _detected.ready = true;
    return _detected;
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                          */
  /* ------------------------------------------------------------------ */
  const CONFIG_IDE = {
    /** Returns detected IDE id ('vscode', 'cursor', 'synapse', etc.) */
    get ide() { return _detected.ide === 'auto' ? 'generic' : _detected.ide; },
    /** Returns detected LLM id ('ollama', 'openai', 'anthropic', etc.) */
    get llm() { return _detected.llm === 'auto' ? 'openai' : _detected.llm; },
    /** Full IDE profile object */
    get ideProfile() { return IDE_PROFILES[this.ide] || IDE_PROFILES.generic; },
    /** Full LLM profile object */
    get llmProfile() { return LLM_PROFILES[this.llm] || null; },
    /** IDE display name */
    get ideName() { return this.ideProfile.name; },
    /** LLM display name */
    get llmName() { const p = this.llmProfile; return p ? p.name : 'LLM'; },
    /** Whether environment detection is complete */
    get ready() { return _detected.ready; },
    /** Detected project info */
    get project() { return { type: _detected.projectType, frameworks: _detected.frameworks, languages: _detected.languages }; },

    // Dynamic builders
    buildChatProbes () { return buildChatProbes(this.ide, this.llm); },
    buildPipelineStepMap () { return buildPipelineStepMap(this.ide, this.llm); },
    buildOrchestraAgents () { return buildOrchestraAgents(this.ide); },

    // Profile access
    IDE_PROFILES,
    LLM_PROFILES,

    // Manual override
    setIDE (id) { _detected.ide = id; localStorage.setItem('synapse_ide', id); },
    setLLM (id) { _detected.llm = id; localStorage.setItem('synapse_llm', id); },

    // Run detection
    detect: detectEnvironment,
  };

  // Expose globally
  window.CONFIG_IDE = CONFIG_IDE;

})();
