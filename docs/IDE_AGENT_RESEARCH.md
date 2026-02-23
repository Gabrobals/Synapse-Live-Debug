# IDE Agent Infrastructure & Prompt Pipeline Research

> Deep technical research for the Synapse Live Debug introspection tool.  
> Compiled: 2026-02-18  
> Confidence legend: ✅ = High confidence (documented/verified), ⚠️ = Moderate confidence (inferred from public info), ❓ = Uncertain/may have changed

---

## Table of Contents

1. [VS Code + GitHub Copilot](#1-vs-code--github-copilot)
2. [Cursor](#2-cursor)
3. [Windsurf (Codeium)](#3-windsurf-codeium)
4. [JetBrains AI Assistant](#4-jetbrains-ai-assistant)
5. [Zed](#5-zed)
6. [Generic Prompt Pipeline Patterns](#6-generic-prompt-pipeline-patterns)
7. [Filesystem Detection Matrix](#7-filesystem-detection-matrix)

---

## 1. VS Code + GitHub Copilot

### 1.1 Configuration Files ✅

#### `.vscode/settings.json`
The primary per-workspace settings file. AI-related keys:

```jsonc
{
  // ── Copilot core ──────────────────────────────────────────────────
  "github.copilot.enable": {
    "*": true,
    "markdown": true,
    "plaintext": false
  },
  "github.copilot.advanced": {
    "debug.overrideEngine": "copilot-gpt-4",     // Override model
    "debug.overrideProxyUrl": "",                 // Custom proxy
    "debug.testOverrideProxyUrl": "",
    "length": 500,                                // Max completion length
    "temperature": "",                            // LLM temperature
    "top_p": 1,
    "stops": {},
    "inlineSuggestCount": 3,
    "listCount": 10
  },

  // ── Copilot Chat ──────────────────────────────────────────────────
  "github.copilot.chat.localeOverride": "en",
  "github.copilot.chat.agent.thinkingProcess": true,   // Show thinking
  "github.copilot.chat.scopeSelection": true,
  "github.copilot.chat.terminalChatLocation": "chatView",
  "github.copilot.chat.followUps": "firstOnly",
  "github.copilot.chat.codesearch.enabled": false,

  // ── Chat Agent Settings (newer) ───────────────────────────────────
  "chat.agent.enabled": true,                    // Enable agent mode
  "chat.agent.maxRequests": 15,                  // Max tool-use loop iterations
  "chat.commandCenter.enabled": true,

  // ── Chat Model Selection ──────────────────────────────────────────
  "chat.models": [
    {
      "vendor": "copilot",
      "family": "claude-sonnet-4",               // Claude via Copilot
      "id": "claude-sonnet-4"
    },
    {
      "vendor": "copilot",
      "family": "gpt-4o",
      "id": "gpt-4o-2024-08-06"
    },
    {
      "vendor": "copilot",
      "family": "o3-mini",
      "id": "o3-mini"
    },
    {
      "vendor": "copilot",
      "family": "gemini-2.5-pro",
      "id": "gemini-2.5-pro"
    }
  ],

  // ── MCP (Model Context Protocol) servers ─────────────────────────
  "mcp": {
    "servers": {
      "my-mcp-server": {
        "type": "stdio",
        "command": "node",
        "args": ["./mcp-server/index.js"],
        "env": {
          "API_KEY": "${env:MY_API_KEY}"
        }
      },
      "sqlite": {
        "type": "stdio",
        "command": "uvx",
        "args": ["mcp-server-sqlite", "--db-path", "./data.db"]
      },
      "github": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": {
          "GITHUB_PERSONAL_ACCESS_TOKEN": "${env:GITHUB_TOKEN}"
        }
      },
      "sse-server": {
        "type": "sse",
        "url": "http://localhost:3001/sse"
      }
    }
  }
}
```

#### `.vscode/mcp.json` ✅
Dedicated MCP configuration file (alternative to embedding in settings.json). Introduced ~2025:

```jsonc
{
  "servers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    },
    "brave-search": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "${env:BRAVE_API_KEY}"
      }
    }
  },
  "inputs": [
    {
      "id": "api-key",
      "type": "promptString",
      "description": "Enter your API key",
      "password": true
    }
  ]
}
```

#### `.vscode/extensions.json` ✅
Recommended extensions for workspace:

```jsonc
{
  "recommendations": [
    "github.copilot",
    "github.copilot-chat",
    "ms-vscode.vscode-copilot-vision",
    "github.vscode-pull-request-github"    // Copilot integrates with this
  ],
  "unwantedRecommendations": []
}
```

#### `.github/copilot-instructions.md` ✅
Custom instructions file that Copilot Chat reads as system-level context. Lives at the repository root:

```markdown
# Custom Copilot Instructions
When working in this codebase:
- Always use TypeScript strict mode
- Prefer functional components in React
- Use the project's custom logger instead of console.log
```

This file is automatically loaded into the system prompt when Copilot Chat processes messages.

#### `.vscode/copilot-chat-instructions.md` ⚠️
Per-workspace instruction file (may be merged with the above in newer versions). Check for either location.

#### `.github/copilot-chat.yml` ⚠️
Organization-level Copilot configuration for GitHub Copilot Business/Enterprise:

```yaml
version: 1
policies:
  suggestions:
    allow_public_code_references: false
  chat:
    allow_web_search: true
```

### 1.2 Agent Mode Architecture ✅

VS Code Copilot Chat operates in three principal modes:

| Mode | Description | Key Feature |
|------|-------------|-------------|
| **Ask** | Single-turn Q&A | Context from open files, selection |
| **Edit** | Multi-file code editing | Applies diffs inline |
| **Agent** | Autonomous multi-step | Tool use loop, terminal commands, file creation |

#### Built-in Chat Participants (Agents) ✅

These are the `@`-prefixed agents available in Copilot Chat:

| Participant | ID | Purpose |
|------------|----|---------|
| `@workspace` | `github.copilot.workspace` | Index & search entire workspace; uses embeddings |
| `@terminal` | `github.copilot.terminal` | Terminal context, command suggestions |
| `@vscode` | `github.copilot.vscode` | VS Code API help, settings, keybinding questions |
| `@github` | `github.copilot.github` | GitHub search, issues, PRs (requires GitHub extension) |

Extensions can register their own participants via the `vscode.chat.createChatParticipant()` API.

#### Agent Mode Tools ✅

When `chat.agent.enabled: true`, the agent has access to these built-in tools:

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `replace_string_in_file` | Edit files with search/replace |
| `create_file` | Create new files |
| `run_in_terminal` | Execute terminal commands |
| `grep_search` | Text search across workspace |
| `file_search` | Find files by glob pattern |
| `list_dir` | List directory contents |
| `semantic_search` | Semantic code search via embeddings |
| `get_errors` | Get diagnostics (compile/lint errors) |
| `get_terminal_output` | Read terminal output |
| `fetch_webpage` | Fetch web content |

MCP servers provide additional tools that are dynamically discovered and surfaced to the agent.

### 1.3 Prompt Pipeline ✅

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER INPUT                                       │
│  (Natural language prompt in chat, inline chat, or voice)               │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    CONTEXT GATHERING                                     │
│  1. Active file content + cursor position                               │
│  2. Selected text / visible range                                       │
│  3. Open editors / recently accessed files                              │
│  4. .github/copilot-instructions.md (custom instructions)              │
│  5. @workspace index results (if workspace participant invoked)        │
│  6. Diagnostics / errors from language servers                          │
│  7. Git diff / SCM state                                               │
│  8. Terminal output (if @terminal or agent mode)                        │
│  9. MCP server tool descriptions (tool schemas)                        │
│  10. Chat history (conversation context)                                │
│  11. VS Code prompt instructions files (.vscode/*.instructions.md)     │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   SYSTEM PROMPT ASSEMBLY                                 │
│  - Base system prompt (defines assistant role, capabilities, rules)     │
│  - Tool definitions (JSON schemas for each available tool)             │
│  - Custom instructions from copilot-instructions.md                    │
│  - Workspace context (truncated to fit context window)                 │
│  - Conversation history                                                │
│  - User message                                                         │
│                                                                         │
│  Token budget management: prioritize by recency + relevance            │
│  Context window: depends on model (128K for GPT-4o, 200K for Claude)   │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      LLM API CALL                                       │
│  POST to GitHub Copilot API (proxied through GitHub infrastructure)    │
│  - Model selection based on user preference or automatic routing       │
│  - Streaming response (Server-Sent Events internally)                  │
│  - Response includes text AND potential tool_calls                      │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
            [Text only]     [Tool calls]
                    │             │
                    ▼             ▼
┌──────────────────────┐  ┌──────────────────────────────────────────────┐
│   STREAM RESPONSE    │  │           TOOL EXECUTION LOOP                │
│   to chat UI         │  │  1. Parse tool_call from LLM response       │
│                      │  │  2. Execute tool (read_file, terminal, etc.) │
│                      │  │  3. Collect tool result                      │
│                      │  │  4. Append tool result to conversation       │
│                      │  │  5. Call LLM AGAIN with updated context      │
│                      │  │  6. Repeat until:                            │
│                      │  │     - LLM responds with text (no tool calls) │
│                      │  │     - Max iterations reached (maxRequests)   │
│                      │  │     - User cancels                           │
│                      │  │  7. Stream final response                    │
└──────────────────────┘  └──────────────────────────────────────────────┘
```

### 1.4 Model Providers ✅

As of early 2026, Copilot Chat supports these models via the model picker:

| Model | Provider | Notes |
|-------|----------|-------|
| GPT-4o | OpenAI (via GitHub) | Default for most tasks |
| GPT-4o-mini | OpenAI (via GitHub) | Faster, cheaper |
| o1 | OpenAI (via GitHub) | Reasoning model |
| o3-mini | OpenAI (via GitHub) | Faster reasoning |
| Claude 3.5 Sonnet | Anthropic (via GitHub) | Strong coding model |
| Claude Sonnet 4 | Anthropic (via GitHub) | Latest Claude |
| Claude Opus 4 | Anthropic (via GitHub) | Highest capability |
| Gemini 2.5 Pro | Google (via GitHub) | Multimodal |

All traffic goes through GitHub's API infrastructure (`https://api.github.com/copilot`).

Users can also configure custom models via `chat.models` in settings.json for Ollama, Azure OpenAI, or other OpenAI-compatible endpoints using VS Code's Language Model API.

### 1.5 Extension APIs for Agent Detection ✅

```typescript
// Key VS Code APIs for detecting agent infrastructure:

// 1. Language Model API — detect available LLM providers
vscode.lm.selectChatModels({ vendor: 'copilot' });  // Returns LanguageChatModel[]

// 2. Chat Participant API — detect registered agents
vscode.chat.createChatParticipant(id, handler);  // Register a participant
// Detection: enumerate via extension contributions in package.json

// 3. Tools API — detect available tools
// In package.json contributes.chatTools:
// { "name": "myTool", "displayName": "My Tool", "modelDescription": "..." }

// 4. MCP — list connected MCP servers and their tools
// Detected via settings.json "mcp" key or .vscode/mcp.json

// 5. Extension API
vscode.extensions.all  // List all installed extensions
vscode.extensions.getExtension('github.copilot')  // Check specific extension
```

#### Extension `package.json` contributions for chat:
```jsonc
{
  "contributes": {
    "chatParticipants": [
      {
        "id": "my-extension.agent",
        "fullName": "My Agent",
        "name": "myagent",
        "description": "Does things",
        "isSticky": true,
        "commands": [
          { "name": "explain", "description": "Explain code" }
        ]
      }
    ],
    "chatTools": [
      {
        "name": "fetchData",
        "tags": ["data", "api"],
        "displayName": "Fetch Data",
        "modelDescription": "Fetches data from an external API",
        "inputSchema": {
          "type": "object",
          "properties": {
            "url": { "type": "string", "description": "The URL to fetch" }
          },
          "required": ["url"]
        }
      }
    ],
    "languageModelTools": [
      {
        "name": "my_tool",
        "tags": ["search"],
        "toolReferenceName": "my_tool",
        "displayName": "My Tool",
        "modelDescription": "Searches for things",
        "inputSchema": { ... }
      }
    ]
  }
}
```

### 1.6 MCP in VS Code ✅

**Configuration locations** (checked in order):
1. `.vscode/mcp.json` — dedicated MCP config per workspace
2. `.vscode/settings.json` → `"mcp"` key — inline in settings
3. User-level `settings.json` → `"mcp"` key — global MCP servers

**MCP Transport Types:**
- `stdio` — spawns a subprocess, communicates via stdin/stdout
- `sse` — connects to an HTTP SSE endpoint
- `streamable-http` — newer HTTP-based streaming transport ⚠️

**MCP Server Discovery Flow:**
1. VS Code reads MCP config from the locations above
2. Spawns/connects to each server
3. Calls `tools/list` to discover available tools
4. Tool schemas are injected into the system prompt for agent mode
5. When agent decides to use an MCP tool, VS Code calls `tools/call`
6. Result is fed back into the conversation

### 1.7 Filesystem Detection Summary

Files to scan for VS Code + Copilot:

| Path | What It Reveals |
|------|----------------|
| `.vscode/settings.json` | All settings: Copilot config, MCP servers, model selection |
| `.vscode/mcp.json` | MCP server configurations |
| `.vscode/extensions.json` | Recommended extensions (Copilot, AI tools) |
| `.github/copilot-instructions.md` | Custom prompt instructions |
| `.vscode/*.instructions.md` | Additional instruction files |
| `.vscode/tasks.json` | Build tasks (tool context) |
| `.vscode/launch.json` | Debug configurations |
| `node_modules/@anthropic-ai/` | MCP SDK installed |
| `node_modules/@modelcontextprotocol/` | MCP server packages |

---

## 2. Cursor

### 2.1 Directory Structure ✅

```
project/
├── .cursor/
│   ├── rules/                  # Cursor rules directory (newer format)
│   │   ├── general.mdc         # .mdc = Markdown Cursor rule files
│   │   ├── typescript.mdc
│   │   └── testing.mdc
│   ├── mcp.json                # MCP server configuration
│   └── settings.json           # Cursor-specific workspace settings (⚠️ may vary)
├── .cursorrules                # Legacy: project-level prompt instructions
├── .cursorignore               # Files to exclude from Cursor's indexing
└── .cursorindexingignore       # Files to exclude from codebase indexing only
```

### 2.2 `.cursorrules` File ✅

Legacy format — a plain text/markdown file at the project root that is injected into the system prompt for all Cursor AI interactions:

```markdown
You are an expert TypeScript developer working on a Next.js 14 app.

Rules:
- Use server components by default
- Use Zod for all validation
- Never use `any` type
- Use Tailwind CSS for styling
- Write unit tests for all new functions
- Prefer composition over inheritance
```

Cursor reads this file and prepends its contents to the system prompt. It is equivalent to `.github/copilot-instructions.md` in VS Code.

### 2.3 `.cursor/rules/*.mdc` Files (Newer Format) ✅

The newer Cursor Rules system uses `.mdc` (Markdown Cursor) files with frontmatter:

```markdown
---
description: Rules for TypeScript API development
globs: ["src/api/**/*.ts", "src/services/**/*.ts"]
alwaysApply: false
---

# TypeScript API Rules

- Use Zod schemas for request/response validation
- Always return typed responses
- Use dependency injection pattern
- Handle errors with custom AppError class
```

**Frontmatter fields:**
| Field | Type | Purpose |
|-------|------|---------|
| `description` | string | When the rule should apply (used for automatic selection) |
| `globs` | string[] | File patterns that trigger this rule |
| `alwaysApply` | boolean | If true, always included in system prompt |

**Rule types:**
1. **Always** (`alwaysApply: true`) — always in system prompt
2. **Auto** (has `description` + `globs`) — applied when matching files are in context
3. **Agent Requested** (has `description`, no `globs`) — agent can decide to use it
4. **Manual** (no metadata) — user must explicitly reference with `@ruleName`

### 2.4 MCP in Cursor ✅

File: `.cursor/mcp.json`

```jsonc
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
      "env": {}
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
      }
    },
    "custom-sse": {
      "url": "http://localhost:3001/sse"
    }
  }
}
```

Note the key difference from VS Code: uses `"mcpServers"` (camelCase) instead of `"mcp.servers"`.

Global MCP config location:
- **macOS**: `~/.cursor/mcp.json`
- **Windows**: `%APPDATA%\Cursor\mcp.json` ⚠️
- **Linux**: `~/.config/cursor/mcp.json` ⚠️

### 2.5 Cursor Architecture: Tab vs Chat vs Composer ✅

| Feature | Cursor Tab | Chat | Composer (Agent) |
|---------|-----------|------|-------------------|
| **Trigger** | Automatic (keystroke) | Manual (Cmd+L) | Manual (Cmd+I) |
| **Scope** | Current line/block | Conversation-based | Multi-file project-wide |
| **Model** | Fast model (custom fine-tuned) | Configurable (GPT-4o, Claude, etc.) | Configurable |
| **Context** | Local file context, recent edits | Selected code + chat history | Full codebase index |
| **Output** | Inline ghost text | Chat panel text + code blocks | Direct file edits with diff |
| **Tool Use** | No | Limited | Yes (agent mode) |

#### Cursor Tab (Autocomplete) Pipeline:
```
Keystroke → Local context (current file ±200 lines, recent files, imports)
         → Fast model (Cursor's fine-tuned model, ~50ms target)
         → Ghost text suggestion
         → Accept/Reject
```

#### Cursor Chat Pipeline:
```
User prompt → Context: selected code, open files, @-references
           → System prompt + conversation history
           → LLM call (user-selected model)
           → Streaming response with code blocks
           → Optional: "Apply" button to insert code
```

#### Cursor Composer / Agent Pipeline ✅:
```
User prompt → Codebase indexing (embeddings-based search)
           → Relevant file retrieval (semantic search over project)
           → System prompt assembly:
               - Base instructions
               - .cursorrules / .cursor/rules/*.mdc
               - Retrieved file contents
               - Tool definitions
           → LLM call with tool definitions
           → TOOL USE LOOP:
               - Read files
               - Search codebase
               - Edit files (generates diffs)
               - Run terminal commands
               - List directory
               - Read terminal output
           → Apply changes (shows diff preview)
           → User accepts/rejects each file change
```

### 2.6 Models Supported ✅

Configure via Settings → Models:

| Model | Provider | Notes |
|-------|----------|-------|
| GPT-4o | OpenAI (via Cursor) | Default |
| GPT-4o-mini | OpenAI (via Cursor) | Fast |
| Claude 3.5 Sonnet | Anthropic (via Cursor) | Popular for code |
| Claude Sonnet 4 | Anthropic (via Cursor) | ⚠️ Availability varies |
| o1 | OpenAI (via Cursor) | Reasoning |
| o3-mini | OpenAI (via Cursor) | Fast reasoning |
| cursor-small | Cursor | Custom fine-tuned model for Tab |
| Custom | OpenAI-compatible API | User-provided endpoint |

Cursor also supports bringing your own API key for OpenAI, Anthropic, Google, and Azure OpenAI.

### 2.7 Filesystem Detection Summary

| Path | What It Reveals |
|------|----------------|
| `.cursor/` | Cursor is used for this project |
| `.cursor/rules/*.mdc` | Custom AI rules with metadata |
| `.cursor/mcp.json` | MCP server configurations |
| `.cursorrules` | Legacy custom instructions |
| `.cursorignore` | Indexing exclusions |
| `.cursorindexingignore` | Indexing-only exclusions |

---

## 3. Windsurf (Codeium)

### 3.1 Cascade Architecture ✅

Cascade is Windsurf's agentic AI system. It is architecturally distinct from simple chat-based assistants:

**Key Concepts:**
- **Cascade** = the agentic execution engine
- **Flows** = sequences of AI actions that form a coherent task
- **Supercomplete** = enhanced autocomplete beyond single-line predictions

#### Cascade Pipeline:
```
User prompt (in Cascade panel)
  │
  ▼
┌─────────────────────────────────────────────────────┐
│  CONTEXT ENGINE                                      │
│  - Codebase indexing (local embeddings)              │
│  - Active file + cursor position                    │
│  - Recent edits / changes                           │
│  - Terminal output                                   │
│  - Conversation history                              │
│  - Windsurf Rules (.windsurfrules)                  │
│  - MCP tool schemas                                  │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  FLOW EXECUTION ENGINE                               │
│  - Plans a sequence of steps                        │
│  - Each step can be:                                │
│    • Read/search files                              │
│    • Edit files (multi-file)                        │
│    • Run terminal commands                          │
│    • Use MCP tools                                  │
│    • Search the web                                 │
│  - Steps execute sequentially                       │
│  - Results feed into next step's context            │
│  - "Thinking" shown in real-time                    │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  OUTPUT                                              │
│  - File diffs applied inline                        │
│  - Chat explanation                                 │
│  - Terminal command results                          │
│  - User can accept/reject each change               │
└─────────────────────────────────────────────────────┘
```

### 3.2 Flows Architecture ⚠️

Flows are Windsurf's abstraction for multi-step agent tasks:

- **Write Flow**: Cascade generates and applies code changes across multiple files
- **Chat Flow**: Conversational Q&A without file modifications
- **Command Flow**: Terminal-focused operations

Each Flow maintains:
- A sequence of actions (file reads, edits, terminal commands)
- Running context that accumulates results
- A plan that can be previewed before execution

### 3.3 Configuration Files ✅

```
project/
├── .windsurf/
│   ├── rules/                  # Windsurf rules directory
│   │   ├── general.md          # Global rules
│   │   └── python.md           # Language-specific rules
│   ├── mcp.json                # MCP server configuration
│   └── cascade.json            # Cascade-specific settings (⚠️ may vary)
├── .windsurfrules              # Project-level AI rules (like .cursorrules)
```

#### `.windsurfrules` ✅

Plain text/markdown file at project root:

```markdown
You are working on a Python FastAPI project.

Guidelines:
- Use async/await for all endpoint handlers
- Use SQLAlchemy 2.0 style with async sessions
- Follow the repository pattern for data access
- All API responses use Pydantic v2 models
```

#### `.windsurf/rules/*.md` ⚠️

Similar to Cursor's `.cursor/rules/*.mdc` but using standard `.md` files with YAML frontmatter:

```markdown
---
trigger: glob
globs: ["**/*.py"]
---

# Python Rules
- Use type hints for all function signatures
- Use dataclasses or Pydantic models for data structures
```

**Rule trigger types:**
- `always` — always included
- `glob` — when matching files are in context
- `manual` — user explicitly references

#### `.windsurf/mcp.json` ✅

```jsonc
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

### 3.4 Supercomplete ⚠️

Supercomplete is Windsurf's enhanced code completion:
- Goes beyond single-line: predicts multi-line edits, refactors
- Uses local context + recent changes
- Can predict the "next edit" based on the pattern of recent changes
- Separate from Cascade; runs on Codeium's own models

### 3.5 Models Supported ⚠️

| Model | Notes |
|-------|-------|
| GPT-4o | Via Codeium infrastructure |
| Claude 3.5 Sonnet | Default for Cascade |
| Claude Sonnet 4 | ⚠️ Availability varies |
| Codeium's own models | For autocomplete/Supercomplete |

Windsurf Pro subscribers get access to premium models. Free tier has limited usage.

### 3.6 Filesystem Detection Summary

| Path | What It Reveals |
|------|----------------|
| `.windsurf/` | Windsurf is used for this project |
| `.windsurf/rules/*.md` | Custom AI rules |
| `.windsurf/mcp.json` | MCP server configurations |
| `.windsurfrules` | Legacy/simple custom instructions |

---

## 4. JetBrains AI Assistant

### 4.1 Configuration Structure ✅

JetBrains AI lives within the IDE's configuration, primarily in the `.idea/` directory and user-level settings:

```
project/
├── .idea/
│   ├── ai-assistant.xml            # AI Assistant plugin settings (⚠️ exact name may vary)
│   ├── workspace.xml               # Workspace settings (may contain AI config)
│   ├── misc.xml                    # Project-level config
│   └── inspectionProfiles/
│       └── Project_Default.xml     # Inspection settings (AI uses these)
├── .junie/
│   └── guidelines.md              # Junie (JetBrains agent) project guidelines ⚠️
```

#### AI-relevant settings in `.idea/` ⚠️

```xml
<!-- .idea/workspace.xml (partial) -->
<component name="AIAssistantConfiguration">
  <option name="enableInlineCompletion" value="true" />
  <option name="enableCloudCompletion" value="true" />
  <option name="provider" value="jetbrains-ai" />
</component>
```

#### `.junie/guidelines.md` ⚠️

Junie is JetBrains' coding agent (comparable to Copilot Agent mode):

```markdown
# Project Guidelines for Junie

- This is a Kotlin Spring Boot project
- Use coroutines for async operations
- Follow the existing package structure
```

### 4.2 PSI/Inspection Engine Integration ✅

JetBrains IDEs have deep structural code understanding via PSI (Program Structure Interface):

- **PSI trees** provide full AST-level understanding of code
- AI Assistant can use PSI to understand code structure, not just text
- Inspections feed into AI suggestions: AI can fix inspection warnings
- Refactoring engine is integrated: AI can trigger IDE refactorings
- Type information from the IDE's type system is available to AI

This is a fundamental architectural difference from text-editor-based IDEs (VS Code, Cursor, Windsurf) where the AI primarily works with plain text.

### 4.3 AI Features ✅

| Feature | Description |
|---------|-------------|
| **Code Completion** | Inline suggestions (full-line and multi-line) |
| **Chat** | Conversational AI in a tool window |
| **Explain Code** | Select code → right-click → AI Explain |
| **Generate Code** | AI-powered code generation in editor |
| **Refactoring** | AI-assisted refactoring suggestions |
| **Commit Messages** | Auto-generate commit messages |
| **Documentation** | Generate docs for functions/classes |
| **Name Suggestions** | AI-powered variable/function naming |
| **Junie** | Agentic coding assistant (like Copilot Agent) ⚠️ |

### 4.4 Models/Providers ✅

| Provider | Models | Notes |
|----------|--------|-------|
| JetBrains AI (default) | GPT-4o, Claude, custom | Proxied through JetBrains infrastructure |
| Google Gemini | Gemini models | Via JetBrains AI plugin |
| OpenAI (BYOK) | GPT-4, GPT-4o, etc. | Bring your own API key ⚠️ |
| Ollama (local) | Any Ollama model | Local inference ⚠️ |

JetBrains AI Assistant requires a JetBrains AI subscription (separate from the IDE license in the basic tier, included in All Products Pack as of 2025).

### 4.5 Junie (Agent Mode) ⚠️

Junie is JetBrains' agentic AI assistant, comparable to Cursor Composer or Copilot Agent:

- Can create/edit multiple files
- Can run terminal commands
- Can run tests and iterate on failures
- Works within the IDE's project model (understands modules, dependencies)
- Reads `.junie/guidelines.md` for project-specific instructions
- Available in IntelliJ IDEA, WebStorm, PyCharm (rollout varies)

### 4.6 MCP Support ⚠️

As of early 2026, JetBrains is adding MCP support:
- Configuration may be in `.idea/` or IDE-level settings
- Support is newer than VS Code/Cursor MCP support

### 4.7 Filesystem Detection Summary

| Path | What It Reveals |
|------|----------------|
| `.idea/` | JetBrains IDE project |
| `.idea/ai-assistant.xml` | AI Assistant is configured ⚠️ |
| `.idea/workspace.xml` | May contain AI settings |
| `.junie/guidelines.md` | Junie agent guidelines |
| `.idea/inspectionProfiles/` | Inspection profiles (AI uses these) |

---

## 5. Zed

### 5.1 Architecture ✅

Zed is a high-performance code editor written in Rust. AI is built-in, not an extension:

- **Assistant Panel**: Chat-based AI interaction (side panel)
- **Inline Assist**: AI edits inline (Ctrl+Enter on a selection)
- **Terminal Assist**: AI in terminal context ⚠️
- All AI features use Zed's own context system

### 5.2 Configuration ✅

Zed uses a JSON settings file (not per-project by default):

**Global settings**: `~/.config/zed/settings.json` (Linux/macOS) or `%APPDATA%\Zed\settings.json` (Windows)

**Per-project settings**: `.zed/settings.json`

```jsonc
{
  // ── Assistant (AI) Configuration ──────────────────────────────────
  "assistant": {
    "version": "2",
    "enabled": true,
    "default_model": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514"
    },
    "inline_alternatives": [
      {
        "provider": "openai",
        "model": "gpt-4o"
      }
    ]
  },

  // ── Language Model Providers ──────────────────────────────────────
  "language_models": {
    "anthropic": {
      "api_url": "https://api.anthropic.com",
      "available_models": [
        {
          "name": "claude-sonnet-4-20250514",
          "display_name": "Claude Sonnet 4",
          "max_tokens": 8192,
          "max_output_tokens": 8192
        }
      ]
    },
    "openai": {
      "api_url": "https://api.openai.com/v1",
      "available_models": [
        {
          "name": "gpt-4o",
          "display_name": "GPT-4o",
          "max_tokens": 128000
        }
      ]
    },
    "ollama": {
      "api_url": "http://localhost:11434"
    },
    "google": {
      "available_models": [
        {
          "name": "gemini-2.0-flash",
          "display_name": "Gemini 2.0 Flash",
          "max_tokens": 128000
        }
      ]
    },
    "zed.dev": {
      // Uses Zed's own hosted inference (included with Zed Pro)
    }
  },

  // ── Context Servers (MCP-like) ────────────────────────────────────
  "context_servers": {
    "my-server": {
      "command": {
        "path": "npx",
        "args": ["-y", "my-context-server"]
      },
      "settings": {}
    }
  }
}
```

### 5.3 Assistant Panel Architecture ✅

Zed's Assistant Panel is different from VS Code's chat:

- Uses a **document-based** model: the assistant panel IS an editable document
- System prompts, user messages, and assistant responses are all visible/editable
- Users can edit the system prompt directly in the panel
- Supports slash commands: `/file`, `/tab`, `/diagnostics`, `/fetch`, `/now`, `/prompt`, `/search`, `/symbols`, `/terminal`
- Context is added via slash commands or drag-and-drop

#### Prompt Library ✅

Zed has a prompt library for reusable system prompts:
- Stored in `~/.config/zed/prompts/` ⚠️
- `.md` files that can be loaded as system prompts
- Managed through the Assistant Panel

### 5.4 Agent Mode (Zed Agent) ⚠️

Zed added agent capabilities (may be called "Agent Panel" or similar):
- Tool use similar to other IDEs
- Can read/write files, run terminals, search
- Uses context servers for extensibility

### 5.5 Context Servers ✅

Zed's equivalent of MCP servers. Configuration in settings.json under `"context_servers"`:

```jsonc
{
  "context_servers": {
    "postgres": {
      "command": {
        "path": "npx",
        "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
      }
    }
  }
}
```

Zed adopted MCP (Model Context Protocol) for its context server system, so MCP servers work in Zed.

### 5.6 Models Supported ✅

| Provider | Models | Configuration |
|----------|--------|---------------|
| Anthropic | Claude 3.5 Sonnet, Claude Sonnet 4, Claude Opus 4 | API key in Zed settings |
| OpenAI | GPT-4o, GPT-4o-mini, o1, o3-mini | API key in Zed settings |
| Google | Gemini 2.0 Flash, Gemini 2.5 Pro | API key |
| Ollama | Any local model | Local endpoint |
| zed.dev | Hosted models (Zed Pro) | Zed account |
| OpenAI-compatible | Any compatible API | Custom endpoint URL |

### 5.7 Filesystem Detection Summary

| Path | What It Reveals |
|------|----------------|
| `.zed/settings.json` | Zed project settings, AI config |
| `.zed/tasks.json` | Zed task runner config |

User-level (global):
| Path | What It Reveals |
|------|----------------|
| `~/.config/zed/settings.json` | Global Zed settings with AI providers |
| `~/.config/zed/prompts/*.md` | Prompt library |
| `~/.config/zed/keymap.json` | Key bindings |

---

## 6. Generic Prompt Pipeline Patterns

### 6.1 Universal Pipeline Architecture

Every AI-powered IDE follows approximately this pipeline:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: USER INPUT                                                      │
│                                                                          │
│ Sources:                                                                 │
│ • Chat panel text input                                                  │
│ • Inline chat (at cursor position)                                       │
│ • Autocomplete trigger (keystroke)                                       │
│ • Voice input ⚠️                                                         │
│ • Command palette actions                                                │
│ • @-mentions (@workspace, @file, @terminal)                              │
│ • Slash commands (/explain, /fix, /test)                                 │
│                                                                          │
│ Output: raw user intent + any explicit context references                │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: CONTEXT GATHERING                                               │
│                                                                          │
│ Substages:                                                               │
│ a) STATIC CONTEXT — always available:                                    │
│    • Active file content + cursor position + selection                   │
│    • Open editor tabs (file contents or summaries)                       │
│    • Project structure / file tree                                       │
│    • Language server info (types, symbols, diagnostics)                  │
│    • Git state (diff, branch, recent commits)                            │
│                                                                          │
│ b) DYNAMIC CONTEXT — fetched per query:                                  │
│    • Codebase search (semantic embeddings or text search)                │
│    • Related files (imports, call graph)                                 │
│    • Terminal output / running processes                                  │
│    • MCP/context server results                                          │
│    • Web search results ⚠️                                               │
│                                                                          │
│ c) CONFIGURED CONTEXT:                                                   │
│    • Custom instructions files                                           │
│      (.github/copilot-instructions.md, .cursorrules,                     │
│       .windsurfrules, .junie/guidelines.md)                              │
│    • Rule files with conditional inclusion                               │
│      (.cursor/rules/*.mdc, .windsurf/rules/*.md)                        │
│                                                                          │
│ Output: ordered list of context items with relevance scores              │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: PROMPT ASSEMBLY                                                 │
│                                                                          │
│ Components (in typical order):                                           │
│ 1. System prompt (IDE-specific, defines assistant role & rules)          │
│ 2. Tool definitions (JSON schemas for all available tools)               │
│ 3. Custom instructions (from instruction files)                         │
│ 4. Workspace context (selected/relevant code, file contents)            │
│ 5. Conversation history (previous turns in this session)                 │
│ 6. User message (current request)                                        │
│                                                                          │
│ Token budget management:                                                 │
│ - Total budget = model's context window (e.g., 128K, 200K tokens)       │
│ - System prompt + tools: ~2K-5K tokens (fixed)                          │
│ - Custom instructions: ~500-2K tokens                                    │
│ - Context: fills remaining budget, prioritized by relevance             │
│ - History: most recent turns kept, older ones summarized/dropped         │
│                                                                          │
│ Output: complete prompt (messages array)                                 │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ STAGE 4: LLM API CALL                                                    │
│                                                                          │
│ • HTTP POST to model endpoint (OpenAI, Anthropic, or proxy)             │
│ • Streaming response (SSE / chunked transfer)                            │
│ • Model selection based on:                                              │
│   - User preference (model picker)                                       │
│   - Task type (autocomplete → fast model, agent → capable model)        │
│   - Cost/speed tradeoff                                                  │
│                                                                          │
│ Request format (OpenAI-compatible):                                      │
│ {                                                                        │
│   "model": "gpt-4o",                                                     │
│   "messages": [...],                                                     │
│   "tools": [...],           // tool definitions                          │
│   "tool_choice": "auto",    // let model decide                          │
│   "stream": true,                                                        │
│   "temperature": 0.0-0.7                                                 │
│ }                                                                        │
│                                                                          │
│ Output: streamed response chunks (text + optional tool_calls)            │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │
                    ┌──────┴───────┐
                    │              │
              [Text only]    [Tool calls]
                    │              │
                    ▼              ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 5: TOOL EXECUTION LOOP (Agent Mode Only)                         │
│                                                                        │
│ while (response contains tool_calls AND iterations < max):             │
│   for each tool_call in response.tool_calls:                           │
│     1. Parse tool name + arguments                                     │
│     2. Validate arguments against schema                               │
│     3. Execute tool:                                                   │
│        - Built-in: file read/write, search, terminal, diagnostics     │
│        - MCP: forward to MCP server via stdio/SSE                     │
│        - Extension-provided: call extension handler                   │
│     4. Collect tool result                                             │
│     5. Some tools may require user confirmation (terminal commands)    │
│   end for                                                              │
│                                                                        │
│   Append all tool results to messages                                  │
│   Call LLM again with updated conversation                             │
│   iterations++                                                         │
│ end while                                                              │
│                                                                        │
│ Termination conditions:                                                │
│ • LLM responds with text only (no tool calls) → done                  │
│ • Max iterations reached (e.g., 15-25)         → forced stop          │
│ • User cancels                                  → abort                │
│ • Error threshold exceeded                      → abort + report      │
│                                                                        │
│ Typical iteration counts:                                              │
│ • Simple tasks: 1-3 iterations                                         │
│ • Complex refactors: 5-15 iterations                                   │
│ • Debugging loops: 3-10 iterations                                     │
└──────────────────────────┬─────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ STAGE 6: RESPONSE RENDERING                                              │
│                                                                          │
│ • Markdown rendering with syntax highlighting                            │
│ • Code blocks with "Apply" / "Insert" actions                           │
│ • File diffs shown inline or in diff view                               │
│ • Terminal command outputs                                               │
│ • References / citations to files and symbols                           │
│ • Follow-up suggestions                                                  │
│ • "Accept All" / "Reject All" for multi-file changes                   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Tool-Use Loop Detail

The tool-use loop is the heart of agent mode. Here's how it works at the API level:

```
TURN 1 (Initial):
  Messages: [system, user]
  → LLM Response: "I'll read the file first."
    + tool_calls: [{ name: "read_file", args: { path: "src/main.ts" } }]

TURN 2 (After tool execution):
  Messages: [system, user, assistant(tool_call), tool_result("file contents...")]
  → LLM Response: "I see the issue. Let me fix it."
    + tool_calls: [{ name: "replace_in_file", args: { path: "src/main.ts", ... } }]

TURN 3 (After tool execution):
  Messages: [system, user, assistant, tool_result, assistant(tool_call), tool_result("success")]
  → LLM Response: "I've fixed the bug. Let me verify by running the tests."
    + tool_calls: [{ name: "run_terminal", args: { command: "npm test" } }]

TURN 4 (After tool execution):
  Messages: [..., tool_result("3 tests passed")]
  → LLM Response: "All tests pass. Here's what I changed: ..." (NO tool calls → DONE)
```

### 6.3 Comparison Matrix: Agent Infrastructure

| Feature | VS Code Copilot | Cursor | Windsurf | JetBrains | Zed |
|---------|----------------|--------|----------|-----------|-----|
| **Custom Instructions File** | `.github/copilot-instructions.md` | `.cursorrules` / `.cursor/rules/*.mdc` | `.windsurfrules` / `.windsurf/rules/*.md` | `.junie/guidelines.md` | Prompt Library |
| **MCP Config Location** | `.vscode/mcp.json` or `settings.json` | `.cursor/mcp.json` | `.windsurf/mcp.json` ⚠️ | IDE settings ⚠️ | `settings.json → context_servers` |
| **MCP Config Key** | `"servers"` or `"mcp.servers"` | `"mcpServers"` | `"mcpServers"` ⚠️ | TBD ⚠️ | `"context_servers"` |
| **Agent Mode** | `chat.agent.enabled` | Composer | Cascade | Junie ⚠️ | Agent Panel ⚠️ |
| **Max Tool Iterations** | `chat.agent.maxRequests` (default 15) | ~25 ⚠️ | ~20 ⚠️ | Unknown | Unknown |
| **Codebase Indexing** | `@workspace` embeddings | Built-in (always on) | Built-in (Codeium) | PSI-based | Built-in ⚠️ |
| **Ignore File** | `.github/copilot-ignore` ⚠️ | `.cursorignore` | Unknown | N/A | N/A |
| **IDE Config Directory** | `.vscode/` | `.cursor/` | `.windsurf/` | `.idea/` | `.zed/` |
| **Extension System** | VS Code extensions | VS Code extensions (fork) | VS Code extensions (fork) | JetBrains plugins | Zed extensions |

---

## 7. Filesystem Detection Matrix

### 7.1 IDE Detection: What to Scan

For a tool that wants to detect which IDE and AI infrastructure is in use by scanning the filesystem:

```python
IDE_MARKERS = {
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
            ".vscode/copilot-chat-instructions.md",  # ⚠️
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
            ".cursor/rules/*.mdc",
        ],
    },
    "windsurf": {
        "directories": [".windsurf", ".windsurf/rules"],
        "files": [
            ".windsurfrules",
            ".windsurf/mcp.json",
        ],
        "ai_indicators": [
            ".windsurfrules",
            ".windsurf/rules/*.md",
        ],
    },
    "jetbrains": {
        "directories": [".idea", ".idea/inspectionProfiles"],
        "files": [
            ".idea/workspace.xml",
            ".idea/misc.xml",
            ".idea/modules.xml",
        ],
        "ai_indicators": [
            ".idea/ai-assistant.xml",  # ⚠️
            ".junie/guidelines.md",    # ⚠️
        ],
    },
    "zed": {
        "directories": [".zed"],
        "files": [
            ".zed/settings.json",
            ".zed/tasks.json",
        ],
        "ai_indicators": [
            ".zed/settings.json",  # Check for "assistant" or "language_models" keys
        ],
    },
}
```

### 7.2 MCP Detection: Unified Parsing

```python
MCP_LOCATIONS = {
    "vscode": [
        (".vscode/mcp.json", "servers"),          # { "servers": { ... } }
        (".vscode/settings.json", "mcp.servers"), # { "mcp": { "servers": { ... } } }
    ],
    "cursor": [
        (".cursor/mcp.json", "mcpServers"),       # { "mcpServers": { ... } }
    ],
    "windsurf": [
        (".windsurf/mcp.json", "mcpServers"),     # { "mcpServers": { ... } }
    ],
    "zed": [
        (".zed/settings.json", "context_servers"), # { "context_servers": { ... } }
    ],
}
```

### 7.3 Custom Instructions Detection

```python
INSTRUCTION_FILES = {
    "vscode": [
        ".github/copilot-instructions.md",
        ".vscode/*.instructions.md",    # Glob pattern
    ],
    "cursor": [
        ".cursorrules",
        ".cursor/rules/*.mdc",          # Glob pattern
    ],
    "windsurf": [
        ".windsurfrules",
        ".windsurf/rules/*.md",          # Glob pattern
    ],
    "jetbrains": [
        ".junie/guidelines.md",
    ],
    "zed": [
        # Prompt library is user-level, not project-level
    ],
}
```

### 7.4 Model Provider Detection Heuristics

When scanning config files, look for these keys/values to determine AI model providers:

```python
MODEL_PROVIDER_SIGNALS = {
    # In settings files
    "openai": ["openai", "gpt-4", "gpt-3.5", "o1", "o3", "dall-e"],
    "anthropic": ["anthropic", "claude", "sonnet", "opus", "haiku"],
    "google": ["google", "gemini", "palm"],
    "ollama": ["ollama", "localhost:11434", "127.0.0.1:11434"],
    "azure_openai": ["azure", "openai.azure.com", "cognitiveservices"],
    "copilot": ["copilot", "github.copilot"],
    "codeium": ["codeium", "windsurf"],
    "cursor": ["cursor-small"],  # Cursor's own model
    "zed": ["zed.dev"],
}
```

---

## Appendix A: Cross-IDE MCP Server Config Comparison

### VS Code (`.vscode/mcp.json`)
```jsonc
{
  "servers": {
    "name": {
      "type": "stdio",              // Required: "stdio" | "sse"
      "command": "npx",             // Required for stdio
      "args": ["-y", "pkg-name"],   // Required for stdio
      "env": { "KEY": "val" }       // Optional
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)
```jsonc
{
  "mcpServers": {
    "name": {
      "command": "npx",             // Required
      "args": ["-y", "pkg-name"],   // Required
      "env": { "KEY": "val" }       // Optional
      // OR for SSE:
      // "url": "http://localhost:3000/sse"
    }
  }
}
```

### Windsurf (`.windsurf/mcp.json`)
```jsonc
{
  "mcpServers": {
    "name": {
      "command": "npx",
      "args": ["-y", "pkg-name"],
      "env": { "KEY": "val" }
    }
  }
}
```

### Zed (`settings.json`)
```jsonc
{
  "context_servers": {
    "name": {
      "command": {
        "path": "npx",               // Note: nested under "command"
        "args": ["-y", "pkg-name"],
        "env": { "KEY": "val" }
      },
      "settings": {}                 // Server-specific settings
    }
  }
}
```

---

## Appendix B: Event Types for Pipeline Introspection

For the Synapse Live Debug tool, these are the key events to capture at each pipeline stage:

| Stage | Events | IDE Source |
|-------|--------|-----------|
| User Input | `user-input`, `chat-mode-change`, `inline-chat`, `voice-input` | Chat panel, inline chat |
| Context Build | `context-build`, `context-compress`, `file-read` | Context engine |
| Prompt Assembly | `model-route`, `agent-dispatch` | Prompt assembler |
| LLM Call | `llm-call`, `api-request`, `agent-stream-chunk`, `agent-thinking-block` | API layer |
| LLM Response | `llm-response`, `api-response`, `model-fallback` | API layer |
| Tool Parse | `tool-parse`, `mcp-call` | Tool router |
| Tool Execute | `tool-execute`, `terminal-exec`, `file-write`, `file-read` | Tool executors |
| Tool Result | `tool-result`, `mcp-response` | Tool executors |
| Agent Loop | `agent-bridge`, `agent-complete`, `agent-status` | Agent orchestrator |
| Memory | `memory-read`, `memory-write`, `memory-persist`, `episode-record` | Memory system |
| Planning | `plan-generate-start`, `plan-generate-complete`, `plan-step-activate` | Planning engine |
| Output | `agent-complete`, `autofix-complete` | Response renderer |

---

## Appendix C: Key Architectural Differences

### Text-Based vs Structure-Based AI Integration

| Aspect | VS Code / Cursor / Windsurf / Zed | JetBrains |
|--------|-----------------------------------|-----------|
| Code Understanding | Text + Language Server Protocol | PSI (full AST) |
| Refactoring | AI generates text diffs | AI triggers IDE refactoring engine |
| Type Info | LSP hover/symbols | Full type resolution |
| Navigation | Symbol search | PSI-based find usages |
| Error Detection | LSP diagnostics | Built-in inspections + PSI analysis |

### Agent Orchestration Styles

| IDE | Orchestration | Notable Feature |
|-----|--------------|-----------------|
| VS Code Copilot | Model-driven (LLM decides tools) | Extensible via MCP + chat API |
| Cursor | Model-driven + plan preview | Composer multi-file diffs |
| Windsurf | Flow-based (Cascade) | Step-by-step execution visibility |
| JetBrains | IDE-integrated agent (Junie) | Uses IDE's project model |
| Zed | Document-based assistant | Editable system prompt |

---

*End of research document. All items marked ⚠️ should be verified against the latest documentation before building detection logic. Items marked ❓ require further investigation.*
