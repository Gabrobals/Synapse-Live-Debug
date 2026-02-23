"""
Synapse Live Debug — IDE Agent Infrastructure Detector
========================================================
Scans the project filesystem to detect:
  1. Which IDE(s) are being used (VS Code, Cursor, Windsurf, JetBrains, Zed)
  2. Agent/AI configuration (models, providers, MCP servers)
  3. Custom instruction files
  4. The prompt pipeline architecture specific to each IDE

Returns a normalized data structure consumed by the frontend
Agent Intelligence tab.

Detection is filesystem-based — no IDE API access required.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger("synapse-debug.ide-detector")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  IDE MARKER DEFINITIONS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IDE_MARKERS: dict[str, dict[str, Any]] = {
    "vscode": {
        "directories": [".vscode"],
        "files": [
            ".vscode/settings.json",
            ".vscode/extensions.json",
            ".vscode/mcp.json",
            ".vscode/tasks.json",
            ".vscode/launch.json",
        ],
        "ai_indicators": [
            ".github/copilot-instructions.md",
            ".vscode/copilot-chat-instructions.md",
        ],
    },
    "cursor": {
        "directories": [".cursor", ".cursor/rules"],
        "files": [
            ".cursorrules",
            ".cursorignore",
            ".cursorindexingignore",
            ".cursor/mcp.json",
        ],
        "ai_indicators": [
            ".cursorrules",
        ],
        "ai_globs": [".cursor/rules/*.mdc"],
    },
    "windsurf": {
        "directories": [".windsurf", ".windsurf/rules"],
        "files": [
            ".windsurfrules",
            ".windsurf/mcp.json",
        ],
        "ai_indicators": [
            ".windsurfrules",
        ],
        "ai_globs": [".windsurf/rules/*.md"],
    },
    "jetbrains": {
        "directories": [".idea", ".idea/inspectionProfiles"],
        "files": [
            ".idea/workspace.xml",
            ".idea/misc.xml",
            ".idea/modules.xml",
        ],
        "ai_indicators": [
            ".idea/ai-assistant.xml",
            ".junie/guidelines.md",
        ],
    },
    "zed": {
        "directories": [".zed"],
        "files": [
            ".zed/settings.json",
            ".zed/tasks.json",
        ],
        "ai_indicators": [
            ".zed/settings.json",
        ],
    },
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  MCP SERVER LOCATION MAP
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MCP_LOCATIONS: dict[str, list[tuple[str, list[str]]]] = {
    "vscode": [
        (".vscode/mcp.json", ["servers"]),
        (".vscode/settings.json", ["mcp", "servers"]),
    ],
    "cursor": [
        (".cursor/mcp.json", ["mcpServers"]),
    ],
    "windsurf": [
        (".windsurf/mcp.json", ["mcpServers"]),
    ],
    "zed": [
        (".zed/settings.json", ["context_servers"]),
    ],
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  MODEL PROVIDER SIGNALS (for scanning config file contents)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MODEL_PROVIDER_SIGNALS: dict[str, list[str]] = {
    "openai": ["openai", "gpt-4", "gpt-3.5", "o1-", "o3-", "dall-e"],
    "anthropic": ["anthropic", "claude", "sonnet", "opus", "haiku"],
    "google": ["gemini", "palm", "google"],
    "ollama": ["ollama", "localhost:11434", "127.0.0.1:11434"],
    "azure_openai": ["azure", "openai.azure.com", "cognitiveservices"],
    "copilot": ["copilot", "github.copilot"],
    "codeium": ["codeium", "windsurf"],
    "cursor_ai": ["cursor-small"],
    "zed_dev": ["zed.dev"],
    "mistral": ["mistral"],
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PIPELINE TEMPLATES PER IDE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PIPELINE_TEMPLATES: dict[str, list[dict[str, Any]]] = {
    "vscode": [
        {"step": 1, "name": "User Input",           "phase": "frontend",  "component": "Chat Panel / Inline Chat",
         "detail": "Natural language prompt entered in Copilot Chat, inline chat, or voice input"},
        {"step": 2, "name": "Context Gathering",     "phase": "frontend",  "component": "Context Engine",
         "detail": "Active file, selection, open editors, @workspace index, git diff, diagnostics, terminal output"},
        {"step": 3, "name": "Custom Instructions",   "phase": "engine",    "component": "Instruction Loader",
         "detail": ".github/copilot-instructions.md, .vscode/*.instructions.md loaded into system prompt"},
        {"step": 4, "name": "MCP Tool Discovery",    "phase": "engine",    "component": "MCP Client",
         "detail": "MCP servers enumerated, tools/list called, schemas injected into prompt"},
        {"step": 5, "name": "Prompt Assembly",        "phase": "engine",    "component": "Prompt Assembler",
         "detail": "System prompt + tool definitions + custom instructions + context + history + user message"},
        {"step": 6, "name": "Model Routing",          "phase": "engine",    "component": "Model Router",
         "detail": "Model selected via chat.models config or user picker (GPT-4o, Claude, Gemini, etc.)"},
        {"step": 7, "name": "LLM API Call",           "phase": "backend",   "component": "GitHub Copilot API",
         "detail": "POST to api.github.com/copilot with streaming SSE response"},
        {"step": 8, "name": "Tool Execution Loop",    "phase": "backend",   "component": "Agent Executor",
         "detail": "If LLM returns tool_calls: execute tools → collect results → call LLM again (max chat.agent.maxRequests iterations)"},
        {"step": 9, "name": "Response Streaming",     "phase": "response",  "component": "Chat Renderer",
         "detail": "Markdown rendering, code blocks with Apply/Insert, file diffs, follow-up suggestions"},
    ],
    "cursor": [
        {"step": 1, "name": "User Input",           "phase": "frontend",  "component": "Chat / Composer Panel",
         "detail": "Prompt via Chat (Cmd+L) for conversation or Composer (Cmd+I) for multi-file agent mode"},
        {"step": 2, "name": "Codebase Indexing",     "phase": "frontend",  "component": "Embedding Index",
         "detail": "Semantic search over full project via embeddings (always-on indexing)"},
        {"step": 3, "name": "Context Retrieval",     "phase": "frontend",  "component": "Context Engine",
         "detail": "Active file, @-references, .cursorignore filtering, relevant files via semantic search"},
        {"step": 4, "name": "Rules Loading",          "phase": "engine",    "component": "Rules Engine",
         "detail": ".cursorrules (legacy) or .cursor/rules/*.mdc with frontmatter (globs, alwaysApply, description)"},
        {"step": 5, "name": "MCP Tool Discovery",    "phase": "engine",    "component": "MCP Client",
         "detail": ".cursor/mcp.json → mcpServers enumerated, tools injected into prompt"},
        {"step": 6, "name": "Prompt Assembly",        "phase": "engine",    "component": "Prompt Assembler",
         "detail": "System prompt + rules + tool schemas + codebase context + conversation history + user message"},
        {"step": 7, "name": "Model Selection",        "phase": "engine",    "component": "Model Router",
         "detail": "User-selected model (GPT-4o, Claude, o3-mini, cursor-small for Tab)"},
        {"step": 8, "name": "LLM API Call",           "phase": "backend",   "component": "Cursor API Proxy",
         "detail": "POST to Cursor's API infrastructure with streaming response"},
        {"step": 9, "name": "Tool Execution Loop",    "phase": "backend",   "component": "Composer Agent",
         "detail": "Composer: read files, search codebase, edit files (diffs), run terminal, MCP tools (~25 max iterations)"},
        {"step": 10, "name": "Diff Preview",          "phase": "response",  "component": "Diff Renderer",
         "detail": "Multi-file diff preview, user accepts/rejects per file, inline code application"},
    ],
    "windsurf": [
        {"step": 1, "name": "User Input",           "phase": "frontend",  "component": "Cascade Panel",
         "detail": "Prompt entered in Cascade (Write/Chat/Command Flow)"},
        {"step": 2, "name": "Codebase Indexing",     "phase": "frontend",  "component": "Codeium Index",
         "detail": "Local embeddings index (powered by Codeium's indexing engine)"},
        {"step": 3, "name": "Context Gathering",     "phase": "frontend",  "component": "Context Engine",
         "detail": "Active file, recent edits, terminal output, .windsurfrules, conversation history"},
        {"step": 4, "name": "Rules Loading",          "phase": "engine",    "component": "Rules Engine",
         "detail": ".windsurfrules (legacy) or .windsurf/rules/*.md with YAML frontmatter (trigger, globs)"},
        {"step": 5, "name": "MCP Tool Discovery",    "phase": "engine",    "component": "MCP Client",
         "detail": ".windsurf/mcp.json → mcpServers enumerated"},
        {"step": 6, "name": "Prompt Assembly",        "phase": "engine",    "component": "Cascade Prompt Assembler",
         "detail": "System prompt + rules + tool schemas + codebase context + Flow history"},
        {"step": 7, "name": "Model Selection",        "phase": "engine",    "component": "Model Router",
         "detail": "Claude 3.5 Sonnet (default), GPT-4o, or Codeium models"},
        {"step": 8, "name": "LLM API Call",           "phase": "backend",   "component": "Codeium API",
         "detail": "Streaming call through Codeium infrastructure"},
        {"step": 9, "name": "Flow Execution",         "phase": "backend",   "component": "Cascade Flow Engine",
         "detail": "Step-by-step action sequence: read → edit → terminal → MCP tools (~20 max iterations)"},
        {"step": 10, "name": "Response & Diffs",      "phase": "response",  "component": "Cascade Renderer",
         "detail": "Step-by-step execution visibility, inline diffs, accept/reject per change"},
    ],
    "jetbrains": [
        {"step": 1, "name": "User Input",           "phase": "frontend",  "component": "AI Chat / Junie Panel",
         "detail": "Prompt in AI Assistant chat, or Junie agentic panel, or context menu actions"},
        {"step": 2, "name": "PSI Analysis",          "phase": "frontend",  "component": "PSI Engine",
         "detail": "Full AST-level code understanding via Program Structure Interface (not just text)"},
        {"step": 3, "name": "Context Gathering",     "phase": "frontend",  "component": "Context Engine",
         "detail": "PSI types, symbols, inspection results, call graph, .junie/guidelines.md"},
        {"step": 4, "name": "Prompt Assembly",        "phase": "engine",    "component": "Prompt Assembler",
         "detail": "System prompt + PSI context + inspection data + conversation history + guidelines"},
        {"step": 5, "name": "Model Selection",        "phase": "engine",    "component": "JetBrains AI Router",
         "detail": "Model via JetBrains AI infrastructure (GPT-4o, Claude, Gemini, or Ollama)"},
        {"step": 6, "name": "LLM API Call",           "phase": "backend",   "component": "JetBrains AI API",
         "detail": "Proxied through JetBrains infrastructure (requires AI subscription)"},
        {"step": 7, "name": "IDE Refactoring",        "phase": "backend",   "component": "Refactoring Engine",
         "detail": "AI triggers IDE's native refactoring engine (Rename, Extract, Move) — not text diffs"},
        {"step": 8, "name": "Junie Tool Loop",        "phase": "backend",   "component": "Junie Agent",
         "detail": "Multi-file edits, terminal commands, test execution with iteration on failures"},
        {"step": 9, "name": "Response Rendering",     "phase": "response",  "component": "AI Tool Window",
         "detail": "Chat response with code blocks, refactoring previews, commit message generation"},
    ],
    "zed": [
        {"step": 1, "name": "User Input",           "phase": "frontend",  "component": "Assistant Panel",
         "detail": "Document-based assistant panel (editable), inline assist (Ctrl+Enter), slash commands"},
        {"step": 2, "name": "Context via Slash Cmds", "phase": "frontend",  "component": "Slash Command Engine",
         "detail": "/file, /tab, /diagnostics, /fetch, /search, /symbols, /terminal — context added explicitly"},
        {"step": 3, "name": "Context Servers",        "phase": "engine",    "component": "MCP/Context Servers",
         "detail": "context_servers from .zed/settings.json — MCP protocol for external tools"},
        {"step": 4, "name": "Prompt Assembly",        "phase": "engine",    "component": "Prompt Assembler",
         "detail": "Editable system prompt + slash command context + conversation + tool schemas"},
        {"step": 5, "name": "Model Selection",        "phase": "engine",    "component": "Language Model Selector",
         "detail": "Configured in settings.json: Anthropic, OpenAI, Google, Ollama, or zed.dev hosted"},
        {"step": 6, "name": "LLM API Call",           "phase": "backend",   "component": "Direct API Call",
         "detail": "Direct call to provider API (no proxy unless zed.dev hosted)"},
        {"step": 7, "name": "Agent Tool Loop",        "phase": "backend",   "component": "Zed Agent",
         "detail": "File read/write, search, terminal — similar to other agent modes"},
        {"step": 8, "name": "Response in Document",   "phase": "response",  "component": "Assistant Panel",
         "detail": "Response appears inline in the assistant document (fully editable)"},
    ],
    "synapse": [
        {"step": 1, "name": "User Input",           "phase": "frontend",  "component": "Chat Panel / Floating Chat",
         "detail": "Multi-mode input: main chat, floating chat, inline chat, voice input, canvas interaction"},
        {"step": 2, "name": "SDPS Pipeline Init",    "phase": "engine",    "component": "SDPSEngine",
         "detail": "Synapse Deep Processing System initializes processing chain"},
        {"step": 3, "name": "Context Engine",         "phase": "engine",    "component": "ContextEngine",
         "detail": "Project files, editor state, memory layers, active canvas nodes"},
        {"step": 4, "name": "Agent Dispatch",         "phase": "engine",    "component": "MultiAgentRouter",
         "detail": "14 specialized agents: Router, Planner, Executor, Memory, Context, Model, Validator, Debugger, Governor, Tester, Deployer, Monitor, Security, Reporter"},
        {"step": 5, "name": "Memory Layers",          "phase": "engine",    "component": "Memory System",
         "detail": "EpisodicMemory, SemanticMemory, WorkingMemoryManager, ConversationSummarizer"},
        {"step": 6, "name": "Prompt Synthesis",       "phase": "engine",    "component": "PromptSynthesizer",
         "detail": "Multi-agent context merged, SDPS chain assembled, system prompt generated"},
        {"step": 7, "name": "Model Routing",          "phase": "engine",    "component": "ModelRouter",
         "detail": "Ollama (local), OpenAI, Anthropic — selected per task type"},
        {"step": 8, "name": "MCP & Tool Execution",   "phase": "backend",   "component": "MCPClient / ToolParser",
         "detail": "MCP servers, function calling, tool result handling, NES Engine"},
        {"step": 9, "name": "LLM API Call",           "phase": "backend",   "component": "InferenceService",
         "detail": "Streaming call to selected provider with full SDPS context"},
        {"step": 10, "name": "Governor Assessment",   "phase": "backend",   "component": "GovernorAPI",
         "detail": "AutoHeal, diagnostic probes, runtime supervision of response quality"},
        {"step": 11, "name": "Response Rendering",    "phase": "response",  "component": "MessageStreamManager",
         "detail": "Markdown + canvas integration + code blocks + agent status indicators"},
    ],
    "generic": [
        {"step": 1, "name": "User Input",           "phase": "frontend",  "component": "Chat Panel",
         "detail": "Natural language prompt"},
        {"step": 2, "name": "Context Gathering",     "phase": "frontend",  "component": "Context Engine",
         "detail": "Active file, selection, open tabs"},
        {"step": 3, "name": "Prompt Assembly",        "phase": "engine",    "component": "Prompt Assembler",
         "detail": "System prompt + context + history + user message"},
        {"step": 4, "name": "LLM API Call",           "phase": "backend",   "component": "API Client",
         "detail": "HTTP POST to model provider"},
        {"step": 5, "name": "Response Rendering",     "phase": "response",  "component": "Chat Renderer",
         "detail": "Streaming text + code blocks"},
    ],
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  INFRASTRUCTURE COMPONENTS PER IDE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INFRA_COMPONENTS: dict[str, list[dict[str, Any]]] = {
    "vscode": [
        {"name": "Extension Host",   "icon": "🧩", "items": ["ExtensionHost", "LanguageClient", "LSP Protocol", "Activation Events"]},
        {"name": "Copilot Core",     "icon": "🤖", "items": ["CopilotChat", "CopilotCompletions", "CopilotAgent", "InlineSuggestions"]},
        {"name": "Chat Agents",      "icon": "💬", "items": ["@workspace (Embeddings Index)", "@terminal (Terminal Context)", "@vscode (IDE API)", "@github (GitHub Search)"]},
        {"name": "Agent Tools",      "icon": "🔧", "items": ["read_file", "replace_string_in_file", "create_file", "run_in_terminal", "grep_search", "file_search", "semantic_search", "get_errors"]},
        {"name": "MCP Layer",        "icon": "🔌", "items": ["MCP Client (stdio/SSE)", "tools/list Discovery", "tools/call Execution", "Dynamic Tool Injection"]},
        {"name": "Editor Core",      "icon": "📝", "items": ["Monaco Editor", "TextModel", "Decorations", "Commands", "Language Server"]},
        {"name": "Debug Adapter",    "icon": "🐛", "items": ["DAP Client", "Breakpoints", "CallStack", "Variables", "Watch Expressions"]},
    ],
    "cursor": [
        {"name": "Cursor AI Engine", "icon": "⚡", "items": ["Composer (Multi-file Agent)", "CursorTab (Autocomplete)", "Chat (Conversation)", "CodeLens AI"]},
        {"name": "Context System",   "icon": "🔍", "items": ["Embedding Index (Always-on)", "Semantic Search", ".cursorignore Filtering", "@-Reference Resolution"]},
        {"name": "Rules Engine",     "icon": "📜", "items": [".cursorrules (Legacy)", ".cursor/rules/*.mdc (Frontmatter)", "Glob-based Auto Rules", "Agent-Requested Rules"]},
        {"name": "MCP Layer",        "icon": "🔌", "items": ["MCP Client", ".cursor/mcp.json", "mcpServers Configuration", "Tool Schema Injection"]},
        {"name": "Editor Core",      "icon": "📝", "items": ["Monaco Editor (VS Code Fork)", "TextModel", "Multi-file Diff Engine"]},
    ],
    "windsurf": [
        {"name": "Cascade Engine",   "icon": "🌊", "items": ["Write Flow (Code Changes)", "Chat Flow (Conversation)", "Command Flow (Terminal)", "Step-by-Step Execution"]},
        {"name": "Supercomplete",    "icon": "⚡", "items": ["Multi-line Prediction", "Next-Edit Prediction", "Codeium Models", "Pattern Recognition"]},
        {"name": "Context System",   "icon": "🔍", "items": ["Codeium Embeddings Index", "Recent Edits Tracking", "Terminal Output", "File Change History"]},
        {"name": "Rules Engine",     "icon": "📜", "items": [".windsurfrules (Legacy)", ".windsurf/rules/*.md (YAML Frontmatter)", "Trigger Types (always/glob/manual)"]},
        {"name": "MCP Layer",        "icon": "🔌", "items": ["MCP Client", ".windsurf/mcp.json", "mcpServers Configuration"]},
    ],
    "jetbrains": [
        {"name": "PSI Engine",       "icon": "🏗️", "items": ["PsiFile (Full AST)", "PsiElement References", "Type Resolution", "Inspections Engine"]},
        {"name": "AI Assistant",     "icon": "🤖", "items": ["Chat Completion", "Code Generation", "AI Refactoring", "Commit Messages", "Documentation Gen"]},
        {"name": "Junie Agent",      "icon": "🧠", "items": ["Multi-file Editing", "Terminal Commands", "Test Execution & Iteration", ".junie/guidelines.md"]},
        {"name": "Refactoring",      "icon": "🔄", "items": ["Rename (PSI-aware)", "Extract Method/Variable", "Move/Copy", "Inline", "Change Signature"]},
        {"name": "Inspection System","icon": "🔬", "items": ["Project Inspections", "AI-powered Fixes", "Severity Levels", "Custom Profiles"]},
    ],
    "zed": [
        {"name": "Assistant Panel",  "icon": "📄", "items": ["Document-based Chat", "Editable System Prompt", "Inline Assist", "Slash Commands"]},
        {"name": "Context System",   "icon": "🔍", "items": ["/file, /tab, /diagnostics", "/fetch, /search, /symbols", "/terminal, /now, /prompt", "Drag-and-Drop Context"]},
        {"name": "Language Models",  "icon": "🧠", "items": ["Anthropic (Claude)", "OpenAI (GPT-4o)", "Google (Gemini)", "Ollama (Local)", "zed.dev (Hosted)"]},
        {"name": "Context Servers",  "icon": "🔌", "items": ["MCP Protocol", "context_servers Config", "Stdio Transport", "Tool Discovery"]},
    ],
    "synapse": [
        {"name": "Chat Engine",      "icon": "💬", "items": ["ChatStore", "SDPSEngine", "SDPS Pipeline", "PromptSynthesizer", "ContextEngine", "MessageStreamManager"]},
        {"name": "Agent System",     "icon": "🤖", "items": ["AgentBridge", "AgentOrchestrator", "MultiAgentRouter", "CopilotDriver", "NES Engine"]},
        {"name": "Memory Layers",    "icon": "🧠", "items": ["EpisodicMemory", "SemanticMemory", "ConversationSummarizer", "WorkingMemoryManager"]},
        {"name": "Tool System",      "icon": "🔧", "items": ["ToolParser", "MCPClient", "MCPCommandRouter", "FunctionCaller", "ToolResultHandler"]},
        {"name": "UI Layer",         "icon": "🖥️", "items": ["CanvasFlow", "ReactFlowGraph", "NodeEditor", "SidePanel", "FloatingChat", "InlineChat"]},
        {"name": "Governor",         "icon": "🛡️", "items": ["GovernorAPI", "AutoHealEngine", "DiagnosticProbes", "RuntimeSupervisor"]},
    ],
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  HELPERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _read_json(path: Path) -> dict | None:
    """Safely read and parse a JSON/JSONC file."""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
        # Strip JSONC comments (// and /* */)
        text = re.sub(r'//.*?$', '', text, flags=re.MULTILINE)
        text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
        return json.loads(text)
    except Exception:
        return None


def _read_text(path: Path) -> str:
    """Safely read a text file."""
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def _get_nested(data: dict, keys: list[str]) -> Any:
    """Traverse a nested dict by key path."""
    current = data
    for k in keys:
        if isinstance(current, dict) and k in current:
            current = current[k]
        else:
            return None
    return current


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  RUNNING IDE DETECTION (Process-based)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_IDE_PROCESS_MAP = {
    "code": "vscode", "code.exe": "vscode", "code - insiders": "vscode",
    "code-insiders.exe": "vscode", "code-insiders": "vscode",
    "cursor": "cursor", "cursor.exe": "cursor",
    "windsurf": "windsurf", "windsurf.exe": "windsurf",
    "idea64.exe": "jetbrains", "idea": "jetbrains", "pycharm64.exe": "jetbrains",
    "pycharm": "jetbrains", "webstorm64.exe": "jetbrains", "webstorm": "jetbrains",
    "goland64.exe": "jetbrains", "goland": "jetbrains", "rider64.exe": "jetbrains",
    "clion64.exe": "jetbrains", "clion": "jetbrains", "rubymine64.exe": "jetbrains",
    "phpstorm64.exe": "jetbrains", "phpstorm": "jetbrains",
    "zed": "zed", "zed.exe": "zed",
}


def detect_running_ide() -> dict[str, Any]:
    """Detect which IDE is currently running by scanning OS processes."""
    import subprocess
    running = []
    try:
        if os.name == "nt":
            # Windows: use tasklist
            result = subprocess.run(
                ["tasklist", "/FO", "CSV", "/NH"],
                capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.splitlines():
                parts = line.strip().strip('"').split('","')
                if parts:
                    proc_name = parts[0].lower().strip('"')
                    for pattern, ide_id in _IDE_PROCESS_MAP.items():
                        if proc_name == pattern.lower():
                            if ide_id not in [r["id"] for r in running]:
                                running.append({"id": ide_id, "process": proc_name, "name": _IDE_DISPLAY_NAMES.get(ide_id, ide_id)})
        else:
            # Unix/Mac: use ps
            result = subprocess.run(
                ["ps", "-eo", "comm"],
                capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.splitlines():
                proc_name = line.strip().lower()
                for pattern, ide_id in _IDE_PROCESS_MAP.items():
                    if pattern.lower() in proc_name:
                        if ide_id not in [r["id"] for r in running]:
                            running.append({"id": ide_id, "process": proc_name, "name": _IDE_DISPLAY_NAMES.get(ide_id, ide_id)})
    except Exception as e:
        logger.debug(f"Process scan failed: {e}")

    return {
        "running": running,
        "primary": running[0] if running else None,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PROJECT ANALYSIS (Languages, Frameworks, Structure)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_LANG_EXTENSIONS = {
    ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript", ".jsx": "React JSX",
    ".tsx": "React TSX", ".rs": "Rust", ".go": "Go", ".java": "Java",
    ".kt": "Kotlin", ".cs": "C#", ".rb": "Ruby", ".php": "PHP",
    ".swift": "Swift", ".dart": "Dart", ".cpp": "C++", ".c": "C",
    ".html": "HTML", ".css": "CSS", ".scss": "SCSS", ".vue": "Vue",
    ".svelte": "Svelte", ".sql": "SQL", ".sh": "Shell", ".ps1": "PowerShell",
    ".yaml": "YAML", ".yml": "YAML", ".toml": "TOML", ".json": "JSON",
    ".md": "Markdown", ".bat": "Batch",
}

_IGNORE_DIRS = {"node_modules", ".git", "__pycache__", ".venv", "venv", "dist", "build",
                ".next", ".nuxt", "target", ".idea", ".vscode", ".cursor", ".windsurf", ".zed"}


def analyze_project(root: Path) -> dict[str, Any]:
    """Analyze project structure: languages, file counts, key files, deps."""
    lang_counts: dict[str, int] = {}
    total_files = 0
    key_files = []
    dirs_scanned = 0

    for item in root.rglob("*"):
        # Skip ignored directories
        if any(part in _IGNORE_DIRS for part in item.parts):
            continue
        if item.is_file():
            total_files += 1
            ext = item.suffix.lower()
            if ext in _LANG_EXTENSIONS:
                lang = _LANG_EXTENSIONS[ext]
                lang_counts[lang] = lang_counts.get(lang, 0) + 1
        elif item.is_dir():
            dirs_scanned += 1
        if total_files > 5000:
            break  # Safety limit

    # Sort languages by count
    languages = sorted(lang_counts.items(), key=lambda x: -x[1])
    primary_lang = languages[0][0] if languages else "Unknown"

    # Detect key project files
    KEY_FILES = ["package.json", "requirements.txt", "pyproject.toml", "Cargo.toml",
                 "go.mod", "tsconfig.json", "Makefile", "Dockerfile", "docker-compose.yml",
                 ".env", ".env.example", "README.md"]
    for kf in KEY_FILES:
        p = root / kf
        if p.exists():
            size = p.stat().st_size
            key_files.append({"name": kf, "size": size})

    # Detect dependencies
    deps_summary = []
    pkg = root / "package.json"
    if pkg.exists():
        try:
            data = json.loads(pkg.read_text(encoding="utf-8", errors="ignore"))
            d = data.get("dependencies", {})
            dd = data.get("devDependencies", {})
            deps_summary.append({"source": "package.json", "production": len(d), "dev": len(dd),
                                 "top": list(d.keys())[:8]})
        except Exception:
            pass
    req = root / "requirements.txt"
    if not req.exists():
        req = root / "backend" / "requirements.txt"
    if req.exists():
        try:
            lines = [ln.strip() for ln in req.read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.startswith("#")]
            deps_summary.append({"source": "requirements.txt", "count": len(lines),
                                 "top": [ln.split("==")[0].split(">=")[0] for ln in lines[:8]]})
        except Exception:
            pass

    return {
        "totalFiles": total_files,
        "directories": dirs_scanned,
        "primaryLanguage": primary_lang,
        "languages": [{"name": lang, "files": cnt} for lang, cnt in languages[:12]],
        "keyFiles": key_files,
        "dependencies": deps_summary,
        "projectName": root.name,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  IDE DETECTION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_ides(root: Path) -> list[dict[str, Any]]:
    """
    Scan project root for IDE markers and return a list of detected IDEs.
    Each entry includes: id, name, confidence, found files, AI indicators.
    """
    detected = []

    for ide_id, markers in IDE_MARKERS.items():
        found_dirs = []
        found_files = []
        ai_files = []
        ai_glob_files = []

        for d in markers.get("directories", []):
            if (root / d).is_dir():
                found_dirs.append(d)

        for f in markers.get("files", []):
            if (root / f).exists():
                found_files.append(f)

        for f in markers.get("ai_indicators", []):
            if (root / f).exists():
                ai_files.append(f)

        for glob_pat in markers.get("ai_globs", []):
            for p in root.glob(glob_pat):
                ai_glob_files.append(str(p.relative_to(root)))

        if found_dirs or found_files:
            confidence = "high" if found_dirs else "medium"
            if ai_files or ai_glob_files:
                confidence = "high"

            detected.append({
                "id": ide_id,
                "name": _IDE_DISPLAY_NAMES.get(ide_id, ide_id),
                "confidence": confidence,
                "configDir": found_dirs[0] if found_dirs else None,
                "foundFiles": found_files,
                "aiIndicators": ai_files + ai_glob_files,
            })

    return detected


_IDE_DISPLAY_NAMES = {
    "vscode": "VS Code",
    "cursor": "Cursor",
    "windsurf": "Windsurf",
    "jetbrains": "JetBrains",
    "zed": "Zed",
    "synapse": "Synapse IDE",
    "generic": "Unknown IDE",
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  MCP SERVER DETECTION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_mcp_servers(root: Path, ide_ids: list[str]) -> list[dict[str, Any]]:
    """
    Scan MCP configuration files for all detected IDEs.
    Returns normalized list of MCP servers.
    """
    servers = []

    for ide_id in ide_ids:
        locations = MCP_LOCATIONS.get(ide_id, [])
        for file_path, key_path in locations:
            full_path = root / file_path
            data = _read_json(full_path)
            if not data:
                continue

            mcp_obj = _get_nested(data, key_path)
            if not isinstance(mcp_obj, dict):
                continue

            for name, config in mcp_obj.items():
                transport = "stdio"
                command = ""
                url = ""

                if isinstance(config, dict):
                    if "url" in config:
                        transport = "sse"
                        url = config["url"]
                    elif "type" in config:
                        transport = config["type"]
                        command = config.get("command", "")
                    else:
                        command = config.get("command", "")
                        # Zed nests under command.path
                        if isinstance(command, dict):
                            command = command.get("path", "")

                    if not command and not url:
                        command = config.get("command", "")

                servers.append({
                    "name": name,
                    "ide": ide_id,
                    "transport": transport,
                    "command": command,
                    "url": url,
                    "sourceFile": file_path,
                    "args": config.get("args", []) if isinstance(config, dict) else [],
                })

    return servers


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CUSTOM INSTRUCTIONS DETECTION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_instructions(root: Path, ide_ids: list[str]) -> list[dict[str, Any]]:
    """
    Find custom instruction files for each detected IDE.
    Returns list with file path, IDE, content preview.
    """
    INSTRUCTION_MAP: dict[str, list[str]] = {
        "vscode": [".github/copilot-instructions.md", ".vscode/copilot-chat-instructions.md"],
        "cursor": [".cursorrules"],
        "windsurf": [".windsurfrules"],
        "jetbrains": [".junie/guidelines.md"],
    }
    INSTRUCTION_GLOBS: dict[str, list[str]] = {
        "vscode": [".vscode/*.instructions.md"],
        "cursor": [".cursor/rules/*.mdc"],
        "windsurf": [".windsurf/rules/*.md"],
    }

    instructions = []

    for ide_id in ide_ids:
        for file_path in INSTRUCTION_MAP.get(ide_id, []):
            full = root / file_path
            if full.exists():
                content = _read_text(full)
                instructions.append({
                    "ide": ide_id,
                    "file": file_path,
                    "type": "global",
                    "preview": content[:300] if content else "",
                    "lines": content.count("\n") + 1 if content else 0,
                })

        for glob_pat in INSTRUCTION_GLOBS.get(ide_id, []):
            for p in root.glob(glob_pat):
                rel = str(p.relative_to(root))
                content = _read_text(p)
                # Parse frontmatter for .mdc / .md rule files
                frontmatter = _parse_frontmatter(content)
                instructions.append({
                    "ide": ide_id,
                    "file": rel,
                    "type": "rule",
                    "preview": content[:300] if content else "",
                    "lines": content.count("\n") + 1 if content else 0,
                    "frontmatter": frontmatter,
                })

    return instructions


def _parse_frontmatter(text: str) -> dict | None:
    """Parse YAML-like frontmatter from --- delimited blocks."""
    m = re.match(r'^---\s*\n(.*?)\n---', text, re.DOTALL)
    if not m:
        return None
    fm = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            key, _, val = line.partition(":")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if val.startswith("[") and val.endswith("]"):
                # Parse simple list: ["a", "b"]
                val = [v.strip().strip('"').strip("'") for v in val[1:-1].split(",") if v.strip()]
            fm[key] = val
    return fm if fm else None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  MODEL PROVIDER DETECTION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_model_providers(root: Path, ide_ids: list[str]) -> list[dict[str, Any]]:
    """
    Analyze config files to determine which AI model providers are configured.
    """
    providers = []
    seen = set()

    # Collect all config file contents
    config_contents: list[tuple[str, str]] = []
    config_paths = [
        ".vscode/settings.json",
        ".cursor/mcp.json",
        ".windsurf/mcp.json",
        ".zed/settings.json",
        ".idea/workspace.xml",
    ]
    for cp in config_paths:
        full = root / cp
        if full.exists():
            config_contents.append((cp, _read_text(full).lower()))

    # Scan for provider signals in config contents
    for provider_id, signals in MODEL_PROVIDER_SIGNALS.items():
        for file_path, content in config_contents:
            for signal in signals:
                if signal.lower() in content and provider_id not in seen:
                    seen.add(provider_id)
                    providers.append({
                        "id": provider_id,
                        "name": _PROVIDER_DISPLAY_NAMES.get(provider_id, provider_id),
                        "detectedIn": file_path,
                        "signal": signal,
                    })
                    break

    # Special: VS Code + copilot extension implies Copilot provider
    ext_json = root / ".vscode" / "extensions.json"
    if ext_json.exists():
        ext_data = _read_json(ext_json)
        if ext_data:
            recs = ext_data.get("recommendations", [])
            if any("copilot" in r for r in recs) and "copilot" not in seen:
                seen.add("copilot")
                providers.append({
                    "id": "copilot",
                    "name": "GitHub Copilot",
                    "detectedIn": ".vscode/extensions.json",
                    "signal": "copilot in recommendations",
                })

    # VS Code settings.json deep scan for chat.models
    settings_path = root / ".vscode" / "settings.json"
    settings = _read_json(settings_path)
    if settings:
        chat_models = settings.get("chat.models", settings.get("chat", {}).get("models", []))
        if isinstance(chat_models, list):
            for model_entry in chat_models:
                if isinstance(model_entry, dict):
                    family = model_entry.get("family", model_entry.get("id", ""))
                    vendor = model_entry.get("vendor", "")
                    model_id = f"{vendor}/{family}" if vendor else family
                    if model_id and model_id not in seen:
                        seen.add(model_id)
                        providers.append({
                            "id": model_id,
                            "name": f"{family} ({vendor})" if vendor else family,
                            "detectedIn": ".vscode/settings.json",
                            "signal": f"chat.models entry: {family}",
                            "isModel": True,
                        })

    # Zed settings.json deep scan for language_models
    zed_settings_path = root / ".zed" / "settings.json"
    zed_settings = _read_json(zed_settings_path)
    if zed_settings:
        lang_models = zed_settings.get("language_models", {})
        for provider_key, _provider_conf in lang_models.items() if isinstance(lang_models, dict) else []:
            if provider_key not in seen:
                seen.add(provider_key)
                providers.append({
                    "id": provider_key,
                    "name": _PROVIDER_DISPLAY_NAMES.get(provider_key, provider_key),
                    "detectedIn": ".zed/settings.json",
                    "signal": f"language_models.{provider_key}",
                })

    return providers


_PROVIDER_DISPLAY_NAMES = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google": "Google AI",
    "ollama": "Ollama (Local)",
    "azure_openai": "Azure OpenAI",
    "copilot": "GitHub Copilot",
    "codeium": "Codeium",
    "cursor_ai": "Cursor AI",
    "zed_dev": "Zed Dev (Hosted)",
    "mistral": "Mistral",
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  AGENT SETTINGS EXTRACTION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_agent_settings(root: Path, primary_ide: str) -> dict[str, Any]:
    """
    Extract agent-specific settings from the IDE config files.
    """
    settings: dict[str, Any] = {
        "agentMode": None,
        "maxIterations": None,
        "model": None,
        "thinkingEnabled": None,
        "customInstructionsLoaded": False,
    }

    if primary_ide == "vscode":
        data = _read_json(root / ".vscode" / "settings.json")
        if data:
            # Agent mode
            agent_enabled = data.get("chat.agent.enabled",
                             _get_nested(data, ["chat", "agent", "enabled"]))
            if agent_enabled is not None:
                settings["agentMode"] = bool(agent_enabled)

            # Max requests
            max_req = data.get("chat.agent.maxRequests",
                       _get_nested(data, ["chat", "agent", "maxRequests"]))
            if max_req is not None:
                settings["maxIterations"] = int(max_req)

            # Thinking
            thinking = data.get("github.copilot.chat.agent.thinkingProcess",
                        _get_nested(data, ["github", "copilot", "chat", "agent", "thinkingProcess"]))
            if thinking is not None:
                settings["thinkingEnabled"] = bool(thinking)

            # Model from advanced settings
            model = _get_nested(data, ["github", "copilot", "advanced", "debug.overrideEngine"])
            if not model:
                model = data.get("github.copilot.advanced", {}).get("debug.overrideEngine")
            if model:
                settings["model"] = model

        # Check for custom instructions
        if (root / ".github" / "copilot-instructions.md").exists():
            settings["customInstructionsLoaded"] = True

    elif primary_ide == "cursor":
        settings["agentMode"] = True  # Composer is always available in Cursor
        settings["maxIterations"] = 25  # Cursor default
        if (root / ".cursorrules").exists() or list((root / ".cursor" / "rules").glob("*.mdc") if (root / ".cursor" / "rules").is_dir() else []):
            settings["customInstructionsLoaded"] = True

    elif primary_ide == "windsurf":
        settings["agentMode"] = True  # Cascade is always available
        settings["maxIterations"] = 20  # Windsurf default
        if (root / ".windsurfrules").exists():
            settings["customInstructionsLoaded"] = True

    elif primary_ide == "jetbrains":
        settings["agentMode"] = (root / ".junie").is_dir()
        if (root / ".junie" / "guidelines.md").exists():
            settings["customInstructionsLoaded"] = True

    elif primary_ide == "zed":
        data = _read_json(root / ".zed" / "settings.json")
        if data:
            assistant = data.get("assistant", {})
            settings["agentMode"] = assistant.get("enabled", True)
            default_model = assistant.get("default_model", {})
            if isinstance(default_model, dict):
                settings["model"] = default_model.get("model")

    return settings


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  MAIN DETECTION FUNCTION (Full Introspect)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def detect_agent_intelligence(root: Path) -> dict[str, Any]:
    """
    Full agent infrastructure detection.
    Returns normalized data consumed by the frontend Agent Intelligence tab.
    """
    root = root.resolve()

    # 0. Detect running IDE (process-level)
    running_ide = detect_running_ide()

    # 1. Detect IDEs (filesystem-level)
    detected_ides = detect_ides(root)
    ide_ids = [ide["id"] for ide in detected_ides]

    # Merge process detection: if a running IDE isn't in filesystem detection, add it
    if running_ide["running"]:
        for ri in running_ide["running"]:
            if ri["id"] not in ide_ids:
                detected_ides.append({
                    "id": ri["id"],
                    "name": ri["name"],
                    "confidence": "process",
                    "configDir": None,
                    "foundFiles": [],
                    "aiIndicators": [],
                    "runningProcess": ri["process"],
                })
                ide_ids.append(ri["id"])
            else:
                # Annotate existing detection with process info
                for d in detected_ides:
                    if d["id"] == ri["id"]:
                        d["runningProcess"] = ri["process"]

    # Primary IDE: prefer running process, then filesystem
    primary_ide = "generic"
    if running_ide["primary"]:
        primary_ide = running_ide["primary"]["id"]
    elif ide_ids:
        primary_ide = ide_ids[0]

    # 2. Detect MCP Servers
    mcp_servers = detect_mcp_servers(root, ide_ids)

    # 3. Detect Custom Instructions
    instructions = detect_instructions(root, ide_ids)

    # 4. Detect Model Providers
    model_providers = detect_model_providers(root, ide_ids)

    # 5. Agent Settings
    agent_settings = detect_agent_settings(root, primary_ide)

    # 6. Project Analysis
    project = analyze_project(root)

    # 7. Build Pipeline (based on primary IDE)
    pipeline = PIPELINE_TEMPLATES.get(primary_ide, PIPELINE_TEMPLATES["generic"])

    # Enrich pipeline with real detected data
    pipeline = _enrich_pipeline(pipeline, mcp_servers, instructions, model_providers, agent_settings)

    # 8. Infrastructure Components
    infra = INFRA_COMPONENTS.get(primary_ide, INFRA_COMPONENTS.get("vscode", []))

    # 9. Build diagnostic probes
    diagnostics = _build_diagnostics(root, primary_ide, mcp_servers, instructions, model_providers, agent_settings)

    return {
        "detectedIDEs": detected_ides,
        "runningIDE": running_ide,
        "primaryIDE": {
            "id": primary_ide,
            "name": _IDE_DISPLAY_NAMES.get(primary_ide, primary_ide),
        },
        "project": project,
        "agentSettings": agent_settings,
        "mcpServers": mcp_servers,
        "customInstructions": instructions,
        "modelProviders": model_providers,
        "promptPipeline": pipeline,
        "infrastructure": infra,
        "diagnostics": diagnostics,
    }


def _enrich_pipeline(
    pipeline: list[dict],
    mcp_servers: list[dict],
    instructions: list[dict],
    providers: list[dict],
    settings: dict,
) -> list[dict]:
    """Add real detected data as annotations to pipeline steps."""
    enriched = []
    for step in pipeline:
        step = dict(step)  # copy
        annotations = []

        name_lower = step["name"].lower()

        if "mcp" in name_lower and mcp_servers:
            annotations.append(f"{len(mcp_servers)} MCP server(s): {', '.join(s['name'] for s in mcp_servers[:5])}")

        if "instruction" in name_lower or "rules" in name_lower:
            if instructions:
                annotations.append(f"{len(instructions)} instruction file(s): {', '.join(i['file'] for i in instructions[:5])}")

        if "model" in name_lower and "routing" in name_lower or "selection" in name_lower:
            if providers:
                annotations.append(f"Providers: {', '.join(p['name'] for p in providers[:5])}")
            if settings.get("model"):
                annotations.append(f"Active model: {settings['model']}")

        if "tool" in name_lower and "execution" in name_lower or "loop" in name_lower:
            if settings.get("maxIterations"):
                annotations.append(f"Max iterations: {settings['maxIterations']}")
            if settings.get("agentMode") is not None:
                annotations.append(f"Agent mode: {'enabled' if settings['agentMode'] else 'disabled'}")

        if annotations:
            step["annotations"] = annotations

        enriched.append(step)
    return enriched


def _build_diagnostics(
    root: Path,
    primary_ide: str,
    mcp_servers: list[dict],
    instructions: list[dict],
    providers: list[dict],
    settings: dict,
) -> list[dict[str, Any]]:
    """Build diagnostic probe results (static, filesystem-based checks)."""
    probes = []

    # Probe 1: IDE Detection
    probes.append({
        "id": "ide-detection",
        "name": "IDE Detection",
        "status": "pass" if primary_ide != "generic" else "warn",
        "detail": f"Detected: {_IDE_DISPLAY_NAMES.get(primary_ide, primary_ide)}" if primary_ide != "generic" else "No IDE markers found in project",
    })

    # Probe 2: Agent Mode
    if settings.get("agentMode") is not None:
        probes.append({
            "id": "agent-mode",
            "name": "Agent Mode",
            "status": "pass" if settings["agentMode"] else "warn",
            "detail": f"Agent mode {'enabled' if settings['agentMode'] else 'disabled'}" +
                      (f", max {settings['maxIterations']} iterations" if settings.get("maxIterations") else ""),
        })

    # Probe 3: Custom Instructions
    probes.append({
        "id": "custom-instructions",
        "name": "Custom Instructions",
        "status": "pass" if instructions else "info",
        "detail": f"{len(instructions)} instruction file(s) detected" if instructions else "No custom instruction files found",
    })

    # Probe 4: MCP Configuration
    probes.append({
        "id": "mcp-config",
        "name": "MCP Servers",
        "status": "pass" if mcp_servers else "info",
        "detail": f"{len(mcp_servers)} MCP server(s) configured: {', '.join(s['name'] for s in mcp_servers[:3])}" if mcp_servers else "No MCP servers configured",
    })

    # Probe 5: Model Providers
    probes.append({
        "id": "model-providers",
        "name": "Model Providers",
        "status": "pass" if providers else "warn",
        "detail": f"{len(providers)} provider(s): {', '.join(p['name'] for p in providers[:3])}" if providers else "No model providers detected",
    })

    # Probe 6: Config integrity checks
    config_issues = []
    if primary_ide == "vscode":
        settings_path = root / ".vscode" / "settings.json"
        if settings_path.exists():
            data = _read_json(settings_path)
            if data is None:
                config_issues.append("settings.json has JSON parse errors")
        mcp_path = root / ".vscode" / "mcp.json"
        if mcp_path.exists():
            data = _read_json(mcp_path)
            if data is None:
                config_issues.append("mcp.json has JSON parse errors")

    probes.append({
        "id": "config-integrity",
        "name": "Config Integrity",
        "status": "fail" if config_issues else "pass",
        "detail": "; ".join(config_issues) if config_issues else "All config files parse correctly",
    })

    # Probe 7: Backend connectivity (placeholder — actual check done in frontend)
    probes.append({
        "id": "backend-health",
        "name": "Backend Health",
        "status": "pass",
        "detail": "Live Debug backend is running",
    })

    return probes
