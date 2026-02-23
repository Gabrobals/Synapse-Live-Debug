/**
 * Live Debug -- Configuration
 * All constants, event maps, service definitions.
 * IDE-specific infra categories are now driven by CONFIG_IDE.ideProfile.infra
 * when available; these remain as defaults for the Synapse IDE profile.
 */

// Bootstrap — create SynapseApp early so tab modules can register
window.SynapseApp = window.SynapseApp || { tabs: {} };

// eslint-disable-next-line no-unused-vars
const CONFIG = {
  // Backend base URL — defaults to the dashboard's own backend (port 8421).
  // Override in localStorage with key 'synapse_api_base' to point at another project.
  API_BASE: localStorage.getItem('synapse_api_base') || 'http://127.0.0.1:8421',
  get API_V1() { return `${this.API_BASE}/v1`; },
  MAX_EVENTS: 500,
  MAX_UI_EVENTS: 200,
  HEALTH_POLL_INTERVAL: 10000,
  KEEPALIVE_TIMEOUT: 30000,
  RECONNECT_BASE_DELAY: 2000,
  MAX_RECONNECT_DELAY: 30000,
};

// Event type → category mapping
// eslint-disable-next-line no-unused-vars
const EVENT_CATEGORIES = {
  'error': 'error', 'user-input': 'user-input', 'message-add': 'user-input',
  'llm-call': 'llm', 'llm-response': 'llm', 'api-request': 'llm', 'api-response': 'llm',
  'tool-parse': 'tool', 'tool-execute': 'tool', 'tool-result': 'tool',
  'terminal-exec': 'terminal', 'file-read': 'file', 'file-write': 'file',
  'settings-change': 'settings-change', 'graph-update': 'canvas',
  'memory-read': 'memory', 'memory-write': 'memory',
  'mcp-call': 'mcp', 'mcp-response': 'mcp',
  'context-build': 'llm', 'agent-status': 'agent', 'security-check': 'security',
  'node_start': 'canvas', 'node_complete': 'canvas', 'node_error': 'canvas',
  'data_flow': 'canvas', 'pipeline_start': 'canvas', 'pipeline_complete': 'canvas',
  'token_update': 'canvas',
  'model-route': 'agent', 'context-compress': 'memory', 'episode-record': 'memory',
  'memory-persist': 'memory', 'governor-assess': 'agent',
  'chat-mode-change': 'user-input', 'message-queue': 'user-input', 'message-steer': 'user-input',
  'checkpoint-create': 'agent', 'checkpoint-restore': 'agent',
  'session-create': 'user-input', 'session-switch': 'user-input', 'session-export': 'user-input',
  'conversation-summarize': 'memory',
  'agent-stream-chunk': 'agent', 'agent-thinking-block': 'agent',
  'model-fallback': 'agent', 'agent-bridge': 'agent',
  'agent-dispatch': 'agent', 'agent-complete': 'agent',
  'inline-chat': 'user-input', 'floating-chat': 'user-input',
  'voice-input': 'user-input', 'ui-capture': 'user-input', 'nes-accept': 'agent',
  'autofix-start': 'agent', 'autofix-progress': 'agent', 'autofix-complete': 'agent', 'autofix-clean': 'agent',
  'plan-generate-start': 'agent', 'plan-generate-complete': 'agent',
  'plan-approve': 'agent', 'plan-cancel': 'agent', 'plan-step-activate': 'agent', 'plan-complete': 'agent',
};

// Event type → emoji icon
// eslint-disable-next-line no-unused-vars
const EVENT_ICONS = {
  'user-input': '', 'context-build': '', 'api-request': '', 'api-response': '',
  'llm-call': '', 'llm-response': '', 'tool-parse': '', 'tool-execute': '',
  'tool-result': '', 'message-add': '', 'agent-status': '', 'memory-read': '',
  'memory-write': '', 'mcp-call': '', 'mcp-response': '', 'file-read': '',
  'file-write': '', 'terminal-exec': '', 'graph-update': '', 'security-check': '',
  'settings-change': '', 'error': '',
  'node_start': '', 'node_complete': '', 'node_error': '', 'data_flow': '',
  'pipeline_start': '', 'pipeline_complete': '', 'token_update': '',
  'model-route': '', 'context-compress': '', 'episode-record': '',
  'memory-persist': '', 'governor-assess': '',
  'chat-mode-change': '', 'message-queue': '', 'message-steer': '',
  'checkpoint-create': '', 'checkpoint-restore': '',
  'session-create': '', 'session-switch': '', 'session-export': '',
  'conversation-summarize': '',
  'agent-stream-chunk': '', 'agent-thinking-block': '',
  'model-fallback': '', 'agent-bridge': '',
  'agent-dispatch': '', 'agent-complete': '',
  'inline-chat': '', 'floating-chat': '', 'voice-input': '',
  'ui-capture': '', 'nes-accept': '',
  'autofix-start': '', 'autofix-progress': '', 'autofix-complete': '', 'autofix-clean': '',
  'plan-generate-start': '', 'plan-generate-complete': '',
  'plan-approve': '', 'plan-cancel': '', 'plan-step-activate': '', 'plan-complete': '',
};

// Event type → hex color
// eslint-disable-next-line no-unused-vars
const EVENT_COLORS = {
  'user-input': '#58a6ff', 'context-build': '#bc8cff', 'api-request': '#f0883e',
  'api-response': '#3fb950', 'llm-call': '#f778ba', 'llm-response': '#3fb950',
  'tool-parse': '#bc8cff', 'tool-execute': '#f0883e', 'tool-result': '#3fb950',
  'message-add': '#58a6ff', 'agent-status': '#56d4dd', 'memory-read': '#bc8cff',
  'memory-write': '#bc8cff', 'mcp-call': '#56d4dd', 'mcp-response': '#56d4dd',
  'file-read': '#f0883e', 'file-write': '#f0883e', 'terminal-exec': '#ffffff',
  'graph-update': '#f778ba', 'security-check': '#3fb950', 'settings-change': '#ff8800',
  'error': '#ff4444',
  'node_start': '#0088ff', 'node_complete': '#00ff88', 'node_error': '#ff4444',
  'data_flow': '#00dddd', 'pipeline_start': '#aa44ff', 'pipeline_complete': '#aa44ff',
  'token_update': '#ffdd00',
  'model-route': '#38bdf8', 'context-compress': '#c084fc', 'episode-record': '#fb923c',
  'memory-persist': '#22d3ee', 'governor-assess': '#facc15',
  'chat-mode-change': '#a78bfa', 'message-queue': '#38bdf8', 'message-steer': '#f59e0b',
  'checkpoint-create': '#fbbf24', 'checkpoint-restore': '#f97316',
  'session-create': '#34d399', 'session-switch': '#34d399', 'session-export': '#60a5fa',
  'conversation-summarize': '#c084fc',
  'agent-stream-chunk': '#38bdf8', 'agent-thinking-block': '#c084fc',
  'model-fallback': '#f59e0b', 'agent-bridge': '#a78bfa',
  'agent-dispatch': '#a855f7', 'agent-complete': '#22c55e',
  'inline-chat': '#58a6ff', 'floating-chat': '#a78bfa', 'voice-input': '#f472b6',
  'ui-capture': '#fb923c', 'nes-accept': '#34d399',
  'autofix-start': '#f59e0b', 'autofix-progress': '#38bdf8', 'autofix-complete': '#22c55e', 'autofix-clean': '#22c55e',
  'plan-generate-start': '#a78bfa', 'plan-generate-complete': '#a78bfa',
  'plan-approve': '#22c55e', 'plan-cancel': '#f87171', 'plan-step-activate': '#38bdf8', 'plan-complete': '#22c55e',
};

// Service definitions — REMOVED: hardcoded SERVICES array eliminated.
// Services are now discovered dynamically via GET /v1/services/discover
// (see services-health.js RADAR implementation).

// Infrastructure categories (defaults -- overridden by CONFIG_IDE.ideProfile.infra per IDE)
// eslint-disable-next-line no-unused-vars
const INFRA_CATEGORIES = [
  { name: 'Chat Engine',      icon: '', items: ['ChatStore', 'SDPSEngine', 'SDPS Pipeline', 'PromptSynthesizer', 'ContextEngine', 'MessageStreamManager'] },
  { name: 'Agent System',     icon: '', items: ['AgentBridge', 'AgentOrchestrator', 'MultiAgentRouter', 'CopilotDriver', 'NES Engine'] },
  { name: 'Memory Layers',    icon: '', items: ['EpisodicMemory', 'SemanticMemory', 'ConversationSummarizer', 'WorkingMemoryManager'] },
  { name: 'Tool System',      icon: '', items: ['ToolParser', 'MCPClient', 'MCPCommandRouter', 'FunctionCaller', 'ToolResultHandler'] },
  { name: 'UI Layer',         icon: '', items: ['CanvasFlow', 'ReactFlowGraph', 'NodeEditor', 'SidePanel', 'FloatingChat', 'InlineChat'] },
  { name: 'Code Intelligence',icon: '', items: ['LanguageRegistry', 'CodeAnalyzer', 'TestSuiteManager', 'ProjectScanner'] },
  { name: 'Settings',         icon: '', items: ['SettingsStore', 'ProviderManager', 'ModelRouter', 'ConfigValidator'] },
  { name: 'Transport',        icon: '', items: ['TauriCommands', 'EventBus', 'SSE Client', 'WebSocket Client', 'HTTP Fetch Layer'] },
  { name: 'Security',         icon: '', items: ['APIKeyManager', 'PermissionGuard', 'RateLimiter', 'InputSanitizer'] },
  { name: 'File System',      icon: '', items: ['FileWatcher', 'FilePersistence', 'ProjectTree', 'WorkspaceManager'] },
  { name: 'Notification',     icon: '', items: ['NotificationManager', 'DesktopNotifs', 'SoundAlerts', 'VoiceAlerts'] },
  { name: 'Performance',      icon: '', items: ['LatencyTracker', 'MetricsCollector', 'TokenCounter', 'PerformanceMonitor'] },
  { name: 'Governor',         icon: '', items: ['GovernorAPI', 'AutoHealEngine', 'DiagnosticProbes', 'RuntimeSupervisor'] },
  { name: 'Version Control',  icon: '', items: ['SessionManager', 'CheckpointManager', 'TraceReplay', 'SnapshotStore'] },
];
