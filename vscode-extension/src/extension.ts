/**
 * Synapse Live Debug — VS Code Extension
 * ========================================
 * Launches the Python backend, attaches to the current workspace,
 * opens the dashboard in a webview panel or external browser,
 * and pipes IDE events (file saves, terminal output) to the event bus.
 */

import * as vscode from "vscode";
import * as path from "path";
import { ChildProcess, spawn } from "child_process";
import { SynapseDashboardPanel } from "./panel";
import {
  SynapseStatusProvider,
  SynapseServicesProvider,
  SynapseEventsProvider,
} from "./tree-views";

let backendProcess: ChildProcess | null = null;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

// Tree view providers
let statusProvider: SynapseStatusProvider;
let servicesProvider: SynapseServicesProvider;
let eventsProvider: SynapseEventsProvider;

// ─── Configuration Helpers ───────────────────────────────────────────────────

function getConfig() {
  const config = vscode.workspace.getConfiguration("synapseLiveDebug");
  return {
    port: config.get<number>("port", 8421),
    autoStart: config.get<boolean>("autoStart", false),
    openBrowser: config.get<boolean>("openBrowser", true),
    enableFileWatcher: config.get<boolean>("enableFileWatcher", true),
    pythonPath: config.get<string>("pythonPath", "python"),
    backendPath: config.get<string>("backendPath", ""),
  };
}

function getBackendDir(): string {
  const config = getConfig();
  if (config.backendPath) {
    return config.backendPath;
  }
  // Default: look for the backend directory relative to the extension
  return path.join(__dirname, "..", "..", "backend");
}

function getProjectRoot(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].uri.fsPath;
  }
  return process.cwd();
}

// ─── Backend Process Management ──────────────────────────────────────────────

function startBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (backendProcess) {
      vscode.window.showInformationMessage(
        "Synapse Live Debug is already running.",
      );
      resolve();
      return;
    }

    const config = getConfig();
    const backendDir = getBackendDir();
    const projectRoot = getProjectRoot();
    const mainPy = path.join(backendDir, "main.py");

    const args = [
      mainPy,
      "--project-root",
      projectRoot,
      "--port",
      String(config.port),
      "--host",
      "127.0.0.1",
      "--no-reload",
    ];

    if (!config.enableFileWatcher) {
      args.push("--no-watch");
    }

    outputChannel.appendLine(`Starting Synapse Live Debug...`);
    outputChannel.appendLine(`  Python:  ${config.pythonPath}`);
    outputChannel.appendLine(`  Backend: ${backendDir}`);
    outputChannel.appendLine(`  Project: ${projectRoot}`);
    outputChannel.appendLine(`  Port:    ${config.port}`);
    outputChannel.appendLine("");

    backendProcess = spawn(config.pythonPath, args, {
      cwd: backendDir,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    backendProcess.stdout?.on("data", (data: Buffer) => {
      outputChannel.append(data.toString());
    });

    backendProcess.stderr?.on("data", (data: Buffer) => {
      outputChannel.append(data.toString());
    });

    backendProcess.on("error", (err) => {
      outputChannel.appendLine(`ERROR: ${err.message}`);
      vscode.window.showErrorMessage(
        `Failed to start Synapse Live Debug: ${err.message}. ` +
          `Make sure Python is installed and the backend path is correct.`,
      );
      backendProcess = null;
      updateStatusBar(false);
      reject(err);
    });

    backendProcess.on("close", (code) => {
      outputChannel.appendLine(`Backend process exited with code ${code}`);
      backendProcess = null;
      updateStatusBar(false);
    });

    // Wait a bit for the server to start, then resolve
    setTimeout(() => {
      if (backendProcess) {
        updateStatusBar(true);
        statusProvider?.refresh();
        servicesProvider?.refresh();
        resolve();
      }
    }, 3000);
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill("SIGTERM");
    setTimeout(() => {
      if (backendProcess) {
        backendProcess.kill("SIGKILL");
      }
    }, 5000);
    backendProcess = null;
    updateStatusBar(false);
    outputChannel.appendLine("Synapse Live Debug stopped.");
    statusProvider?.refresh();
  } else {
    vscode.window.showInformationMessage("Synapse Live Debug is not running.");
  }
}

// ─── Status Bar ──────────────────────────────────────────────────────────────

function updateStatusBar(running: boolean) {
  if (running) {
    const config = getConfig();
    statusBarItem.text = "$(pulse) Synapse Debug";
    statusBarItem.tooltip = `Synapse Live Debug running on port ${config.port}`;
    statusBarItem.command = "synapse-live-debug.openDashboard";
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = "$(debug-disconnect) Synapse Debug";
    statusBarItem.tooltip = "Click to start Synapse Live Debug";
    statusBarItem.command = "synapse-live-debug.start";
    statusBarItem.backgroundColor = undefined;
  }
  statusBarItem.show();
}

// ─── IDE Event Forwarding ────────────────────────────────────────────────────

async function sendEvent(event: Record<string, unknown>) {
  const config = getConfig();
  const url = `http://127.0.0.1:${config.port}/debug/events`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      outputChannel.appendLine(`Event send failed: HTTP ${response.status}`);
    }
  } catch {
    // Silently ignore — backend might not be running
  }
}

async function sendPromptTrace(
  prompt: string,
  source: string = "copilot-chat",
): Promise<void> {
  const config = getConfig();
  const url = `http://127.0.0.1:${config.port}/v1/chat-forward`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, source, ide: "vscode", mode: "live" }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    outputChannel.appendLine(`Chat forward failed: ${err}`);
  }
}

// ─── Network-Level Prompt Mirror ─────────────────────────────────────────────
// Monkey-patches globalThis.fetch and require('https').request so that ANY
// request leaving the Extension Host towards Copilot endpoints is silently
// mirrored to the Synapse backend.  This is the "riflesso a specchio" — it
// captures prompts regardless of which chat participant or extension sent them.

interface CopilotMessage {
  role: string;
  content: string | Array<{ type: string; text?: string }>;
}

interface CopilotRequestBody {
  messages?: CopilotMessage[];
  model?: string;
  stream?: boolean;
  intent?: string;
}

const COPILOT_URL_PATTERN =
  /githubcopilot\.com|copilot-proxy\.githubusercontent\.com|api\.github\.com\/copilot/i;

/** Quick check: does this URL target a Copilot LLM endpoint? */
function isCopilotEndpoint(url: string): boolean {
  return COPILOT_URL_PATTERN.test(url);
}

/** Dedup guard — avoid forwarding the same prompt twice within a short window */
let _lastMirroredPrompt = "";
let _lastMirroredTs = 0;

function isDuplicate(prompt: string): boolean {
  const now = Date.now();
  if (prompt === _lastMirroredPrompt && now - _lastMirroredTs < 4000) {
    return true;
  }
  _lastMirroredPrompt = prompt;
  _lastMirroredTs = now;
  return false;
}

/** Extract the last user message from an OpenAI Chat-Completions body. */
function extractUserPrompt(body: CopilotRequestBody): string | null {
  if (!body?.messages || !Array.isArray(body.messages)) {
    return null;
  }

  // Filter for user role only
  const userMsgs = body.messages.filter((m) => m.role === "user");
  if (userMsgs.length === 0) {
    return null;
  }

  const last = userMsgs[userMsgs.length - 1];
  if (typeof last.content === "string") {
    return last.content;
  }
  if (Array.isArray(last.content)) {
    return last.content
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text!)
      .join("\n");
  }
  return null;
}

/** Forward captured prompt to the backend — fire & forget */
function mirrorPrompt(
  prompt: string,
  source: string,
  model: string | undefined,
  endpoint: string,
) {
  if (!prompt.trim() || isDuplicate(prompt)) {
    return;
  }
  outputChannel.appendLine(
    `[Mirror] Captured prompt (${prompt.length} chars) → ${endpoint.substring(0, 60)}…`,
  );

  sendPromptTrace(prompt, source).catch(() => {});
  sendEvent({
    type: "chat-intercepted",
    component: "network-mirror",
    data: {
      prompt,
      source,
      model: model || "unknown",
      endpoint: endpoint.substring(0, 120),
    },
  }).catch(() => {});
}

function setupNetworkMirror() {
  // Network-level interception — catches prompts from extensions that call
  // Copilot endpoints directly. NOTE: VS Code's built-in Copilot Chat sends
  // prompts from the renderer process, not the Extension Host, so those are
  // captured via the @synapse ChatParticipant instead.

  // ── 1. Patch globalThis.fetch ────────────────────────────────────────────
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function mirroredFetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;

      if (isCopilotEndpoint(url)) {
        let bodyText: string | null = null;

        // Try Request object body first
        if (input instanceof Request && input.method === "POST") {
          try {
            bodyText = await input.clone().text();
          } catch {}
        }

        // Then try init.body
        if (!bodyText && init?.body) {
          if (typeof init.body === "string") {
            bodyText = init.body;
          } else if (
            init.body instanceof Uint8Array ||
            Buffer.isBuffer(init.body)
          ) {
            bodyText = Buffer.from(init.body as any).toString("utf-8");
          } else if (init.body instanceof ArrayBuffer) {
            bodyText = new TextDecoder().decode(init.body);
          }
        }

        if (bodyText) {
          try {
            const parsed: CopilotRequestBody = JSON.parse(bodyText);
            const prompt = extractUserPrompt(parsed);
            if (prompt) {
              mirrorPrompt(prompt, "copilot-network-mirror", parsed.model, url);
            }
          } catch {
            /* non-JSON */
          }
        }
      }
    } catch {
      /* never interfere */
    }

    return originalFetch.call(globalThis, input, init);
  };

  // ── 2. Patch https.request ───────────────────────────────────────────────
  try {
    const https = require("https") as typeof import("https");
    const originalHttpsRequest = https.request;

    (https as any).request = function mirroredHttpsRequest(
      urlOrOpts: any,
      optsOrCb?: any,
      maybeCb?: any,
    ) {
      const req = originalHttpsRequest.call(
        https,
        urlOrOpts,
        optsOrCb,
        maybeCb,
      );
      try {
        let url = "";
        if (typeof urlOrOpts === "string") {
          url = urlOrOpts;
        } else if (urlOrOpts instanceof URL) {
          url = urlOrOpts.toString();
        } else if (urlOrOpts?.hostname) {
          url = `https://${urlOrOpts.hostname}${urlOrOpts.path || ""}`;
        }

        if (isCopilotEndpoint(url)) {
          const chunks: Buffer[] = [];
          const origWrite = req.write.bind(req);
          const origEnd = req.end.bind(req);

          req.write = function (chunk: any, ...args: any[]) {
            if (chunk) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            return origWrite(chunk, ...args);
          } as any;

          req.end = function (chunk?: any, ...args: any[]) {
            if (chunk && typeof chunk !== "function") {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            if (chunks.length > 0) {
              try {
                const parsed: CopilotRequestBody = JSON.parse(
                  Buffer.concat(chunks).toString("utf-8"),
                );
                const prompt = extractUserPrompt(parsed);
                if (prompt) {
                  mirrorPrompt(
                    prompt,
                    "copilot-https-mirror",
                    parsed.model,
                    url,
                  );
                }
              } catch {
                /* not JSON */
              }
            }
            return origEnd(chunk, ...args);
          } as any;
        }
      } catch {
        /* never break */
      }
      return req;
    };
  } catch {
    outputChannel.appendLine(
      "[Mirror] Could not patch https.request (non-critical).",
    );
  }

  // ── 3. diagnostics_channel (catches undici/fetch at Node.js engine level) ─
  try {
    const dc =
      require("diagnostics_channel") as typeof import("diagnostics_channel");

    const reqCreateChannel = dc.channel("undici:request:create");
    if (reqCreateChannel && typeof reqCreateChannel.subscribe === "function") {
      reqCreateChannel.subscribe((message: any) => {
        try {
          const req = message?.request;
          if (!req) {
            return;
          }
          const fullUrl = String(req.origin || "") + String(req.path || "");
          if (isCopilotEndpoint(fullUrl)) {
            const body = req.body;
            let bodyText: string | null = null;
            if (typeof body === "string") {
              bodyText = body;
            } else if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
              bodyText = Buffer.from(body).toString("utf-8");
            }
            if (bodyText) {
              try {
                const parsed: CopilotRequestBody = JSON.parse(bodyText);
                const prompt = extractUserPrompt(parsed);
                if (prompt) {
                  mirrorPrompt(
                    prompt,
                    "copilot-dc-mirror",
                    parsed.model,
                    fullUrl,
                  );
                }
              } catch {
                /* non-JSON */
              }
            }
          }
        } catch {
          /* never break */
        }
      });
    }

    // http:client:request:created (Node.js 22+)
    try {
      const httpChannel = dc.channel("http:client:request:created");
      if (httpChannel && typeof httpChannel.subscribe === "function") {
        httpChannel.subscribe((message: any) => {
          try {
            const req = message?.request;
            if (!req) {
              return;
            }
            const host = req.getHeader?.("host") || req.host || "";
            const fullUrl = `https://${host}${req.path || ""}`;
            if (isCopilotEndpoint(fullUrl)) {
              outputChannel.appendLine(
                `[Mirror/dc-http] Copilot request → ${fullUrl.substring(0, 120)}`,
              );
            }
          } catch {}
        });
      }
    } catch {}
  } catch {
    /* diagnostics_channel not available */
  }

  // ── 4. TLS connect (lowest level — raw socket interception) ──────────────
  try {
    const tls = require("tls") as typeof import("tls");
    const origConnect = tls.connect;

    (tls as any).connect = function mirroredTlsConnect(...args: any[]) {
      const sock = origConnect.apply(tls, args as any);
      try {
        const opts = args[0];
        const host =
          typeof opts === "object" ? opts.host || opts.servername || "" : "";
        if (isCopilotEndpoint(host)) {
          const origWrite = sock.write.bind(sock);
          sock.write = function (data: any, ...wArgs: any[]) {
            if (data) {
              const str = Buffer.isBuffer(data)
                ? data.toString("utf-8")
                : String(data);
              const bodyStart = str.indexOf("\r\n\r\n");
              if (bodyStart > -1) {
                const bodyPart = str.substring(bodyStart + 4);
                if (bodyPart.startsWith("{")) {
                  try {
                    const parsed: CopilotRequestBody = JSON.parse(bodyPart);
                    const prompt = extractUserPrompt(parsed);
                    if (prompt) {
                      mirrorPrompt(
                        prompt,
                        "copilot-tls-mirror",
                        parsed.model,
                        host,
                      );
                    }
                  } catch {}
                }
              }
            }
            return origWrite(data, ...wArgs);
          } as any;
        }
      } catch {}
      return sock;
    };
  } catch {
    /* tls patch failed — non-critical */
  }

  outputChannel.appendLine(
    "[Mirror] Network interception active (fetch + https + dc + tls)",
  );
}

// ─── Chat Participant — intercepts prompts from VS Code Chat ─────────────────

function setupChatParticipant(context: vscode.ExtensionContext) {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    _chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult> => {
    const prompt = request.prompt;

    if (!prompt.trim()) {
      stream.markdown(
        "Please type a prompt — it will be traced through the pipeline and answered by AI.",
      );
      return {};
    }

    // Notify the dashboard via SSE
    sendEvent({
      type: "chat-intercepted",
      component: "vscode-chat",
      data: { prompt, source: "copilot-chat" },
    });

    // Trace through pipeline (async — runs in parallel with LM response)
    const tracePromise = sendPromptTrace(prompt);

    // No visible header — completely transparent to user

    // Use the VS Code Language Model API for actual AI response
    try {
      const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
      const model = models[0];
      if (model) {
        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
        const chatResponse = await model.sendRequest(messages, {}, token);
        for await (const fragment of chatResponse.text) {
          stream.markdown(fragment);
        }
      } else {
        stream.markdown(
          "_No language model available. Your prompt has been traced through the pipeline — " +
            "open the Synapse dashboard to see it._",
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`LM response error: ${msg}`);
      stream.markdown(
        "_AI response unavailable. Pipeline trace is visible in the Synapse dashboard._",
      );
    }

    await tracePromise;
    return {};
  };

  const participant = vscode.chat.createChatParticipant(
    "synapse-live-debug.trace",
    handler,
  );
  participant.iconPath = new vscode.ThemeIcon("pulse");
  (participant as any).isSticky = true; // Auto-activate: intercepts all prompts without @synapse prefix
  context.subscriptions.push(participant);
  outputChannel.appendLine(
    "Synapse Chat Participant registered (isSticky=true — auto-intercepts all prompts).",
  );
}

function setupEventForwarding(context: vscode.ExtensionContext) {
  // File save events
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const rel = vscode.workspace.asRelativePath(doc.uri);
      sendEvent({
        type: "file-write",
        component: "vscode-extension",
        data: {
          action: "saved",
          path: rel,
          languageId: doc.languageId,
          lineCount: doc.lineCount,
        },
      });
    }),
  );

  // File open events
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.uri.scheme !== "file") return;
      const rel = vscode.workspace.asRelativePath(doc.uri);
      sendEvent({
        type: "file-read",
        component: "vscode-extension",
        data: {
          action: "opened",
          path: rel,
          languageId: doc.languageId,
        },
      });
    }),
  );

  // Active editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) return;
      const rel = vscode.workspace.asRelativePath(editor.document.uri);
      sendEvent({
        type: "user-input",
        component: "vscode-extension",
        data: {
          action: "editor-focus",
          path: rel,
          languageId: editor.document.languageId,
        },
      });
    }),
  );

  // Terminal events
  context.subscriptions.push(
    vscode.window.onDidOpenTerminal((terminal) => {
      sendEvent({
        type: "terminal-exec",
        component: "vscode-extension",
        data: {
          action: "terminal-opened",
          name: terminal.name,
        },
      });
    }),
  );

  // Diagnostics (errors/warnings)
  // NOTE: By default ALL diagnostics with severity Error are forwarded.
  //       Set "synapseLiveDebug.filterLintNoise" to true in VS Code settings
  //       to exclude common CSS/HTML lint hints (Safari compat, viewport meta, etc.).
  const _diagSentPaths = new Map<string, number>();
  const DIAG_COOLDOWN = 10_000;
  const DIAG_NOISE_PATTERNS = [
    /not supported by Safari/i,
    /backdrop-filter/i,
    /user-select/i,
    /webkit-/i,
    /viewport.*meta/i,
    /discernible text/i,
    /button.*must have/i,
    /alt.*attribute/i,
    /empty.*heading/i,
    /missing.*doctype/i,
  ];

  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((e) => {
      const filterNoise = vscode.workspace
        .getConfiguration("synapseLiveDebug")
        .get<boolean>("filterLintNoise", false);

      for (const uri of e.uris) {
        if (uri.scheme !== "file") {
          continue;
        }
        const rel = vscode.workspace.asRelativePath(uri);
        if (/node_modules|\.git|__pycache__|\.vscode-test/.test(rel)) {
          continue;
        }

        const diagnostics = vscode.languages.getDiagnostics(uri);
        const errors = diagnostics.filter((d) => {
          if (d.severity !== vscode.DiagnosticSeverity.Error) {
            return false;
          }
          if (
            filterNoise &&
            DIAG_NOISE_PATTERNS.some((p) => p.test(d.message))
          ) {
            return false;
          }
          return true;
        });

        if (errors.length > 0) {
          const now = Date.now();
          const lastSent = _diagSentPaths.get(rel) || 0;
          if (now - lastSent < DIAG_COOLDOWN) {
            continue;
          }
          _diagSentPaths.set(rel, now);

          sendEvent({
            type: "error",
            component: "vscode-diagnostics",
            data: {
              path: rel,
              errorCount: errors.length,
              firstError: errors[0].message,
              range: `L${errors[0].range.start.line + 1}`,
            },
          });
        }
      }
    }),
  );

  // Debug session events
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => {
      sendEvent({
        type: "agent-status",
        component: "vscode-debugger",
        data: {
          action: "debug-started",
          name: session.name,
          type: session.type,
        },
      });
    }),
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession((session) => {
      sendEvent({
        type: "agent-status",
        component: "vscode-debugger",
        data: {
          action: "debug-stopped",
          name: session.name,
        },
      });
    }),
  );

  // Task events (build, test, etc.)
  context.subscriptions.push(
    vscode.tasks.onDidStartTask((e) => {
      sendEvent({
        type: "terminal-exec",
        component: "vscode-task",
        data: {
          action: "task-started",
          name: e.execution.task.name,
          source: e.execution.task.source,
        },
      });
    }),
  );

  context.subscriptions.push(
    vscode.tasks.onDidEndTask((e) => {
      sendEvent({
        type: "terminal-exec",
        component: "vscode-task",
        data: {
          action: "task-ended",
          name: e.execution.task.name,
        },
      });
    }),
  );
}

// ─── Activation ──────────────────────────────────────────────────────────────

// ─── Terminal Command Polling ─────────────────────────────────────────────────
// Polls the backend for queued terminal commands and executes them in VS Code.
// This enables the dashboard (in browser OR panel) to run commands in the
// VS Code integrated terminal without requiring iframe postMessage.

let _quickFixTerminal: vscode.Terminal | undefined;

function getOrCreateQuickFixTerminal(cwd?: string): vscode.Terminal {
  // Reuse existing terminal if still alive
  if (_quickFixTerminal) {
    const alive = vscode.window.terminals.find(t => t === _quickFixTerminal);
    if (alive) {
      return alive;
    }
    _quickFixTerminal = undefined;
  }
  _quickFixTerminal = vscode.window.createTerminal({
    name: "Synapse Quick Fix",
    cwd: cwd || undefined,
  });
  return _quickFixTerminal;
}

function startTerminalCommandPolling(): ReturnType<typeof setInterval> {
  const POLL_MS = 2000;
  let polling = false; // guard against overlapping polls

  return setInterval(async () => {
    if (polling) { return; }
    polling = true;
    try {
      const config = getConfig();
      const url = `http://127.0.0.1:${config.port}/v1/terminal/pending`;
      const response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) { return; }
      const data = (await response.json()) as { commands: Array<{ id?: string; command: string; cwd?: string }> };
      if (data.commands && data.commands.length > 0) {
        for (const cmd of data.commands) {
          const terminal = getOrCreateQuickFixTerminal(cmd.cwd);
          terminal.show(false); // false = don't steal focus from editor
          terminal.sendText(cmd.command);
          outputChannel.appendLine(`[Terminal] Executed: ${cmd.command}`);

          // ACK the command so the frontend knows it was executed
          if (cmd.id) {
            try {
              await fetch(`http://127.0.0.1:${config.port}/v1/terminal/ack`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: cmd.id }),
                signal: AbortSignal.timeout(2000),
              });
              outputChannel.appendLine(`[Terminal] ACK sent for: ${cmd.id}`);
            } catch {
              // Best-effort ACK — don't block on failure
            }
          }
        }
      }
    } catch {
      // Backend not running — silently ignore
    } finally {
      polling = false;
    }
  }, POLL_MS);
}

// ─── Activation ──────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Synapse Live Debug");

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  updateStatusBar(false);
  context.subscriptions.push(statusBarItem);

  // Tree view providers
  const config = getConfig();
  statusProvider = new SynapseStatusProvider(config.port);
  servicesProvider = new SynapseServicesProvider(config.port);
  eventsProvider = new SynapseEventsProvider(config.port);

  vscode.window.registerTreeDataProvider(
    "synapse-live-debug.status",
    statusProvider,
  );
  vscode.window.registerTreeDataProvider(
    "synapse-live-debug.services",
    servicesProvider,
  );
  vscode.window.registerTreeDataProvider(
    "synapse-live-debug.events",
    eventsProvider,
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("synapse-live-debug.start", async () => {
      try {
        await startBackend();
        const cfg = getConfig();
        if (cfg.openBrowser) {
          vscode.env.openExternal(
            vscode.Uri.parse(`http://127.0.0.1:${cfg.port}`),
          );
        }
      } catch {
        // Error already shown
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("synapse-live-debug.stop", () => {
      stopBackend();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("synapse-live-debug.openDashboard", () => {
      const cfg = getConfig();
      vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${cfg.port}`));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("synapse-live-debug.openPanel", () => {
      const cfg = getConfig();
      SynapseDashboardPanel.createOrShow(context.extensionUri, cfg.port);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "synapse-live-debug.setProjectRoot",
      async () => {
        const result = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: "Select Project Root",
        });
        if (result && result[0]) {
          vscode.window.showInformationMessage(
            `Project root set to: ${result[0].fsPath}. Restart the dashboard to apply.`,
          );
        }
      },
    ),
  );

  // ★ Network mirror — MUST run before any other setup so the monkey-patch
  //   captures requests from extensions that activate concurrently.
  setupNetworkMirror();

  // Setup event forwarding
  setupEventForwarding(context);

  // Register Chat Participant for prompt interception (complementary)
  setupChatParticipant(context);

  // ★ Terminal Command Polling — picks up commands queued by the dashboard
  //   (works whether the dashboard is opened in the browser or in the panel)
  const terminalPollInterval = startTerminalCommandPolling();
  context.subscriptions.push({ dispose: () => clearInterval(terminalPollInterval) });

  // Auto-start if configured
  if (getConfig().autoStart) {
    startBackend().catch(() => {});
  }

  // ★ Auto-open @synapse chat so prompts are intercepted from the very start.
  //   With isSticky=true the participant stays active for all subsequent messages.
  setTimeout(() => {
    vscode.commands
      .executeCommand("workbench.action.chat.open", {
        query: "@synapse ",
      })
      .then(
        () => {
          outputChannel.appendLine(
            "@synapse chat opened automatically — all prompts will be traced.",
          );
        },
        () => {
          // Chat panel may not be available yet — non-critical
        },
      );
  }, 3000);

  outputChannel.appendLine("Synapse Live Debug extension activated.");
}

export function deactivate() {
  stopBackend();
}
