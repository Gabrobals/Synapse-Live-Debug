/* ═══════════════════════════════════════════════════════════════════════════
   USER GUIDE — Complete User Guide (Narrative Style)
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Section Content ────────────────────────────────────────────────────── */

  const SECTIONS = [

    /* ============================================================
       0. INTRODUCTION
       ============================================================ */
    {
      id: 'intro',
      icon: '',
      title: 'Introduction',
      body: `
<p>Welcome to the complete documentation of <strong>Live Debug Dashboard</strong>. This guide is not a simple list of features — it's a structured journey that takes you from first installation to complete mastery of the tool. Each section explains not only <em>what</em> you can do, but <em>why</em> you should do it and <em>how</em> to interpret what you see.</p>

<h4>What is Live Debug and Why Does It Exist</h4>

<p>When developing a software project, especially a complex one, you constantly find yourself searching for scattered information: logs in the terminal, errors in the browser console, stack traces in files, metrics in separate tools. Live Debug was created to solve this problem: it collects everything in one place, updated in real time.</p>

<p>Imagine having a "dashboard" that simultaneously shows you: the health status of all your services, errors occurring as you write code, your architecture structure, code quality, and test results. You no longer need to jump between ten different windows — everything is here, organized in thematic tabs.</p>

<h4>How It Works: The Data Flow</h4>

<p>Live Debug consists of three parts working together. The <strong>dashboard frontend</strong> is the web page you're looking at — it's written in pure HTML, CSS and JavaScript, without external frameworks. This means it loads instantly and works in any modern browser.</p>

<p>The <strong>backend</strong> is a Python server based on FastAPI. When you start it, it analyzes your project: reads files, counts lines, identifies modules, calculates metrics. Then it exposes this information via REST APIs that the dashboard calls. But the real magic is the SSE (Server-Sent Events) channel: a persistent connection through which the backend sends real-time updates to the dashboard, without you having to press "Refresh".</p>

<p>The <strong>VS Code extension</strong> is optional but powerful. When you install it, it captures events from the IDE — which file you're editing, which errors appear, when you run the debugger — and sends them to the backend, which forwards them to the dashboard. This way you can see what's happening in your editor directly in the browser.</p>

<h4>Getting Started: The First Five Minutes</h4>

<p>To see Live Debug in action, follow these steps. First, open a terminal in the project folder and install the required Python dependencies:</p>

<pre style="background:var(--surface-secondary);padding:12px;border-radius:6px;margin:12px 0;">pip install -r backend/requirements.txt</pre>

<p>This command downloads FastAPI, uvicorn, and other necessary libraries. If you see errors, make sure you have Python 3.8 or higher installed. You can verify with <code>python --version</code>.</p>

<p>Now start the backend server:</p>

<pre style="background:var(--surface-secondary);padding:12px;border-radius:6px;margin:12px 0;">cd backend
python main.py --open</pre>

<p>The <code>--open</code> flag is convenient because it automatically opens the browser to the dashboard. If you prefer to open it manually, omit the flag and go to <code>http://127.0.0.1:8421</code>.</p>

<p>At this point you should see the dashboard loading. The first indicator of success is the header: if it shows "Connected" with a green dot, the frontend is communicating correctly with the backend. If you see "Waiting for Backend" or "Disconnected", go to the Troubleshooting section of this guide.</p>

<h4>Who Is This Dashboard For</h4>

<p>Live Debug was designed with different types of users in mind. <strong>Developers</strong> use it to debug in real time, seeing errors appear instantly as they write code. <strong>DevOps and SRE</strong> use it to monitor service health in staging or production. <strong>QA Engineers</strong> use it to run test suites and analyze coverage and quality. <strong>Tech Leads</strong> use it to get an overview of architecture and project status.</p>

<p>In the following sections, we'll explore each tab in detail, explaining what it shows, how to interpret the data, and how to use it to improve your development workflow.</p>
`
    },

    /* ============================================================
       1. INTERFACE OVERVIEW
       ============================================================ */
    {
      id: 'layout',
      icon: '',
      title: 'Interface Overview',
      body: `
<p>When you first open the dashboard, you might feel overwhelmed by the amount of information available. This section helps you orient yourself, explaining how the interface is organized and what each element you see means.</p>

<h4>The Four Main Areas</h4>

<p>The interface is divided into four distinct areas, each with a specific purpose. Understanding this structure allows you to quickly find the information you're looking for.</p>

<pre style="background:var(--surface-secondary);padding:16px;border-radius:8px;margin:16px 0;font-family:monospace;font-size:12px;line-height:1.4;overflow-x:auto;">
┌─────────────────────────────────────────────────────────────────────────┐
│  HEADER                                                                 │
│  ┌──────────┐        ┌─────────────┐           ┌──────────────────────┐ │
│  │ Logo     │        │ ● Connected │           │  🔊  🔔  🎤  💻     │ │
│  └──────────┘        └─────────────┘           └──────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│  SIDEBAR (Vertical navigation on the left)                             │
│                                                                         │
│  ┌─────────────────────┐                                                │
│  │ LIVE                │                                                │
│  │  • Live Events      │                                                │
│  │  • Services         │                                                │
│  │  • Canvas SSE       │                                                │
│  │                     │                                                │
│  │ SYSTEM              │                                                │
│  │  • Agent Intel      │                                                │
│  │  • Governor         │                                                │
│  │                     │                                                │
│  │ TESTING             │                                                │
│  │  • Test Center      │                                                │
│  │  • Quality          │                                                │
│  │  • Test Quality     │                                                │
│  │                     │                                                │
│  │ ANALYTICS           │                                                │
│  │  • Metrics          │                                                │
│  │  • Project Reality  │                                                │
│  │  • Structural Health│                                                │
│  │  • Language Registry│                                                │
│  │                     │                                                │
│  │ HELP                │                                                │
│  │  • User Guide       │                                                │
│  └─────────────────────┘                                                │
├─────────────────────────────────────────────────────────────────────────┤
│  ALERT BAR (optional - appears when there are notifications)           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ ⚠️  Service "ollama" went offline                            [×]  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                         CONTENT AREA                                    │
│                                                                         │
│    (Content changes based on selected tab)                              │
│                                                                         │
│    May contain: tables, charts, canvas, forms, lists...                 │
│                                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
</pre>

<p><strong>The Header (top bar)</strong> is your global "status bar". On the left side you find the logo and application name. In the center, prominently placed, is the connection indicator: a dot that can be green ("Connected"), yellow ("Reconnecting..."), or red ("Disconnected"). This is the first place to look if something isn't working — if you're not connected to the backend, nothing else will work.</p>

<p>On the right side of the header you find a series of icons that control cross-cutting features. The volume icon enables/disables notification sounds. The bell icon manages desktop notifications. The microphone icon activates voice synthesis for alerts. The terminal icon opens the integrated Debug Console. These features are "global" — they apply to the entire dashboard, regardless of which tab you're in.</p>

<p><strong>The Sidebar (on the left)</strong> is your main navigation system. Tabs are organized in 5 categories: <strong>Live</strong> (real-time monitoring of events, services and canvas visualization), <strong>System</strong> (Agent Intelligence for AI and Governor for auto-correction), <strong>Testing</strong> (Test Center, Quality and TQI), <strong>Analytics</strong> (Metrics, Project Reality, Structural Health, Language Registry), and <strong>Help</strong> (this User Guide).</p>

<p>Each tab represents a different "view" of your project data. Some are purely informational (like "Live Events"), others are interactive (like "Test Center" where you can run tests), and others are graphical visualizations (like "Canvas SSE" with the interactive dependency graph).</p>

<p><strong>The Content Area (central area)</strong> is where the selected tab's content appears. This is the largest part of the screen and changes completely depending on the tab. It can show tables, charts, interactive canvases, forms, or combinations of these elements.</p>

<p><strong>The Alert Bar (above the content, when present)</strong> only appears when there are active notifications. It shows alert toasts — messages informing you of important events like services going offline, critical errors, or completed operations. Critical alerts remain visible until you manually close them; informational ones disappear after a few seconds.</p>

<h4>Status Indicators</h4>

<p>Throughout the dashboard you'll find colored indicators that follow a consistent convention. <span style="color:var(--accent-green);">Green</span> indicates everything is working correctly — a service is online, a test passed, a connection is active. <span style="color:var(--accent-yellow);">Yellow</span> indicates an intermediate state or warning — something requires attention but isn't critical. <span style="color:var(--accent-red);">Red</span> indicates a problem — a service is offline, a test failed, there's an error.</p>

<p>This convention allows you to "glance" at the dashboard and immediately understand if there's something requiring your attention: if you see red somewhere, that's where to look.</p>

<h4>Responsive Design</h4>

<p>The dashboard is designed to work well on different screen sizes. On large monitors (1920px or more), you have space to see lots of data simultaneously. On smaller screens, some elements reorganize vertically. If you use the dashboard on a laptop, you might want to use the browser in full screen for more space.</p>

<p>Interactive canvases (like Canvas SSE) support zoom and pan with the mouse wheel and drag, so you can explore complex visualizations even on small screens.</p>
`
    },

    /* ============================================================
       2. BACKEND CONNECTION
       ============================================================ */
    {
      id: 'connection',
      icon: '',
      title: 'Backend Connection',
      body: `
<p>The connection between the dashboard and backend is the foundation everything else is built on. If this connection doesn't work, the dashboard is essentially useless — it can show the interface, but can't populate it with real data. This section explains how the connection works, how to diagnose problems, and how to configure it for non-standard scenarios.</p>

<h4>How the Connection Works</h4>

<p>When the dashboard loads, the first thing it does is attempt to connect to the backend. This happens in two parallel ways. First, it makes an HTTP request to the <code>/health</code> endpoint to verify the server is reachable and responding correctly. If this request succeeds, the dashboard knows the backend exists and is active.</p>

<p>Then, it opens an SSE (Server-Sent Events) connection to the <code>/v1/events</code> endpoint. This is a persistent connection — it remains open as long as you keep the dashboard open in the browser. Through this connection, the backend can "push" events to the dashboard in real time, without the dashboard having to constantly ask "any news?".</p>

<p>Think of the difference between checking your email inbox every 5 minutes (polling) and receiving a push notification when an email arrives (SSE). The latter is much more efficient and immediate.</p>

<pre style="background:var(--surface-secondary);padding:16px;border-radius:8px;margin:16px 0;font-family:monospace;font-size:12px;line-height:1.4;overflow-x:auto;">
   DASHBOARD (Browser)                        BACKEND (Python)
   ┌─────────────────┐                       ┌─────────────────┐
   │                 │  1. GET /health       │                 │
   │   Frontend      │ ─────────────────────►│   FastAPI       │
   │                 │                       │                 │
   │                 │  2. 200 OK            │                 │
   │                 │ ◄─────────────────────│                 │
   │                 │                       │                 │
   │                 │  3. SSE /v1/events    │                 │
   │                 │ ════════════════════► │                 │
   │                 │                       │                 │
   │                 │  4. Real-time events  │                 │
   │                 │ ◄════════════════════ │   File watcher  │
   │                 │  (continuous stream)  │   Metrics       │
   │                 │                       │   Analyzers     │
   └─────────────────┘                       └─────────────────┘
</pre>

<h4>Connection States</h4>

<p>The indicator in the header can show various states:</p>

<p><strong>Connected (green):</strong> Everything is working. The SSE channel is open and the backend is sending data.</p>

<p><strong>Reconnecting (yellow):</strong> The connection was lost and the dashboard is trying to re-establish it. This happens automatically every 5 seconds. Common causes: the backend was restarted, there was a network glitch, or the computer went to sleep.</p>

<p><strong>Disconnected (red):</strong> The dashboard cannot reach the backend. Possible causes: the backend isn't running, it's on a different port than expected, or there's a firewall blocking.</p>

<h4>Configuration</h4>

<p>By default, the dashboard looks for the backend at <code>http://127.0.0.1:8421</code>. If you need to change this address (for example because you run the backend on a different machine or port), you can modify the <code>API_BASE</code> constant in the <code>frontend/js/config.js</code> file.</p>

<h4>Common Problems</h4>

<p><strong>CORS Error:</strong> If you see CORS errors in the browser console, it means the backend doesn't accept requests from the origin where the dashboard is running. Normally the backend is configured to accept localhost connections, but if you host the dashboard elsewhere you may need to modify the backend's CORS settings.</p>

<p><strong>Port already in use:</strong> If you get a "port already in use" error when starting the backend, another process is using port 8421. You can either close that process, or start the backend on a different port with <code>python main.py --port 9000</code>.</p>
`
    },

    /* ============================================================
       3. VS CODE EXTENSION
       ============================================================ */
    {
      id: 'vscode-extension',
      icon: '',
      title: 'VS Code Extension',
      body: `
<p>While the dashboard can work standalone (connecting to the backend for project analysis), its full potential is unleashed when paired with the VS Code extension. This extension captures events from your editor and sends them to the dashboard, creating a seamless debugging experience.</p>

<h4>What the Extension Captures</h4>

<p>The extension monitors several activity categories in VS Code:</p>

<p><strong>File changes:</strong> Every time you save a file, the extension sends an event indicating which file was modified, when, and (if available) what changed.</p>

<p><strong>Diagnostic errors:</strong> Syntax errors, type errors, linting warnings — whatever VS Code displays with red or yellow squiggles gets captured and sent to the dashboard.</p>

<p><strong>Debug sessions:</strong> When you start/stop a debug session, set breakpoints, or step through code, these events are tracked.</p>

<p><strong>Terminal activity:</strong> Commands executed in the integrated terminal, their outputs, and exit codes.</p>

<p><strong>AI interactions:</strong> If you use Copilot or other AI assistants, the extension can capture prompts and responses (this requires specific permission).</p>

<h4>Installation</h4>

<p>The extension is located in the <code>vscode-extension/</code> folder of this project. To install it in development mode:</p>

<pre style="background:var(--surface-secondary);padding:12px;border-radius:6px;margin:12px 0;">cd vscode-extension
npm install
npm run watch</pre>

<p>Then in VS Code, press F5 to start a new window with the extension loaded. In this window, open your project and you should see events flowing to the dashboard.</p>

<h4>Configuration</h4>

<p>The extension connects to the same backend URL as the dashboard (default: port 8421). If you need to customize this, modify the extension settings in VS Code.</p>

<h4>Privacy Considerations</h4>

<p>The extension sends data to your local backend — nothing goes to external servers by default. However, the dashboard displays file paths and code snippets, so be mindful if you're sharing your screen or taking screenshots.</p>
`
    },

    /* ============================================================
       4. LIVE EVENTS
       ============================================================ */
    {
      id: 'events',
      icon: '',
      title: 'Live Events',
      body: `
<p>The Live Events tab is the "heart" of the dashboard. Here you see every event happening in your system, in real time, as it occurs. It's like having a unified log that collects information from all sources: IDE, backend, tests, AI agents.</p>

<h4>Reading the Event Stream</h4>

<p>Events appear in a chronological list, with the most recent at the top. Each event shows: a timestamp, an event type icon, a brief description, and (when relevant) the file or component involved.</p>

<pre style="background:var(--surface-secondary);padding:16px;border-radius:8px;margin:16px 0;font-family:monospace;font-size:12px;line-height:1.4;overflow-x:auto;">
  LIVE EVENTS
  ┌────────────────────────────────────────────────────────────────────┐
  │  [ 🔍 Search... ]    [All] [Errors] [Files] [Tests]  142 events   │
  ├────────────────────────────────────────────────────────────────────┤
  │                                                                    │
  │  🟢 14:32:45  file:save         src/components/Button.tsx         │
  │     Saved 45 lines, 2 functions modified                          │
  │                                                                    │
  │  🔴 14:32:43  diagnostic:error   src/services/api.ts:142          │
  │     TypeError: Property 'data' does not exist on type 'void'      │
  │                                                                    │
  │  🟡 14:32:40  diagnostic:warn    src/hooks/useAuth.ts:23          │
  │     'user' is declared but never used                             │
  │                                                                    │
  │  🟢 14:32:38  test:result        unit/Button.test.tsx             │
  │     ✓ PASSED (3 tests, 45ms)                                      │
  │                                                                    │
  │  🟢 14:32:35  ai:response        copilot                          │
  │     Generated 12 lines of code (GPT-4)                             │
  │                                                                    │
  └────────────────────────────────────────────────────────────────────┘
</pre>

<p>Each event has a consistent structure: a <strong>timestamp</strong> indicating when it occurred, a <strong>type</strong> indicating the event category (file change, error, test result, etc.), a <strong>target</strong> indicating the involved object (filename, endpoint called, etc.), and a <strong>payload</strong> with specific details.</p>

<p>The left border color of each event indicates its "severity": green for normal informational events, yellow for warnings, red for errors. This allows you to quickly scan the list and identify problems.</p>

<h4>Common Event Types</h4>

<p><strong>file:change</strong> — Appears when a file is modified and saved. The payload includes the file path and, if available, a summary of changes. These events are useful for tracking your editing activity.</p>

<p><strong>diagnostic:error</strong> — Appears when VS Code detects an error in code (syntax error, type mismatch, undefined variable). The payload includes the error message, file, line and column. These are the most important events to monitor during development.</p>

<p><strong>diagnostic:warning</strong> — Similar to errors, but for less critical warnings (unused variable, unnecessary import). Less urgent than errors, but still useful to keep an eye on.</p>

<p><strong>test:result</strong> — Appears when a test is run. The payload includes whether the test passed or failed, the duration, and any error messages. Useful when using the Test Center or running tests from the command line.</p>

<p><strong>ai:response</strong> — Appears when an AI assistant (Copilot, a local LLM) responds to a request. The payload includes the original prompt and generated response. Useful for debugging AI interactions.</p>

<h4>Filtering and Searching</h4>

<p>The list can get very long, especially in intense development sessions. Use the search bar at the top of the tab to filter events. You can search by type (type "error" to see only errors), by file (type part of the filename), or by payload content (type a word that appears in the message).</p>

<p>Quick filter buttons let you show/hide entire event categories. For example, if you only care about errors, you can disable all other types with one click.</p>

<h4>Expanded Details</h4>

<p>Click on an event to expand it and see all details. This is particularly useful for complex errors where the short message isn't enough to understand the problem. In expanded details you'll see the full payload in JSON format, which includes all the information the backend sent.</p>

<h4>Connection with Other Tabs</h4>

<p>Many events in Live Events have a "direct" link to other tabs. For example, a file error event might have a link that takes you to the file in the editor (if using the VS Code extension). A failed test event might have a link to the Test Center with failure details. These links make navigation between information smoother.</p>
`
    },

    /* ============================================================
       5. SERVICES HEALTH
       ============================================================ */
    {
      id: 'services',
      icon: '',
      title: 'Services Health',
      body: `
<p>The Services Health tab shows you the status of all "services" that make up your system. But what exactly does "service" mean in this context? And why is it important to monitor them?</p>

<h4>What Are Services</h4>

<p>A "service" is any component of your stack that can be active or inactive, reachable or unreachable. It can be a backend endpoint (like <code>/v1/health</code>), an external service (like a database or Ollama server), or an internal component (like the file watcher).</p>

<p>The Live Debug backend automatically "discovers" available services by analyzing the project and its configurations. Then, periodically, it checks the status of each service and reports results to the dashboard.</p>

<h4>Reading the Services Dashboard</h4>

<p>When you open this tab, you see a grid of "cards", one for each service. Each card shows the service name, its current status (online/offline/degraded), the latency of the last check, and uptime percentage.</p>

<p>The card color reflects the status: <span style="color:var(--accent-green);">green</span> for online and functioning services, <span style="color:var(--accent-yellow);">yellow</span> for degraded services (working but with problems, e.g. high latency), <span style="color:var(--accent-red);">red</span> for offline or unreachable services.</p>

<pre style="background:var(--surface-secondary);padding:16px;border-radius:8px;margin:16px 0;font-family:monospace;font-size:12px;line-height:1.4;overflow-x:auto;">
  SERVICES HEALTH
  ┌────────────────────────────────────────────────────────────────────┐
  │                                                                    │
  │   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐          │
  │   │ 🟢 Backend   │   │ 🟢 SSE       │   │ 🔴 Ollama    │          │
  │   │              │   │              │   │              │          │
  │   │ Latency: 12ms│   │ Latency: 2ms │   │ OFFLINE      │          │
  │   │ Uptime: 99.9%│   │ Uptime: 100% │   │ Last: 5m ago │          │
  │   └──────────────┘   └──────────────┘   └──────────────┘          │
  │                                                                    │
  │   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐          │
  │   │ 🟢 Database  │   │ 🟡 Cache     │   │ 🟢 FileWatch │          │
  │   │              │   │              │   │              │          │
  │   │ Latency: 45ms│   │ Latency:892ms│   │ Watching: 47 │          │
  │   │ Uptime: 99.5%│   │ ⚠️ SLOW     │   │ files        │          │
  │   └──────────────┘   └──────────────┘   └──────────────┘          │
  │                                                                    │
  └────────────────────────────────────────────────────────────────────┘
</pre>

<p>The goal isn't to have all cards green (although that would be ideal), but to know immediately when something stops working. If a service goes red, you want to notice right away, not after hours of frustrating debugging.</p>

<h4>Service Details</h4>

<p>Click on a card to see service details. Here you find more in-depth information: the service URL or endpoint, recent check history (with timestamps and results), any error messages, and aggregated metrics like average latency and success percentage.</p>

<p>This detailed view is useful when a service has intermittent problems. By looking at the check history, you can understand if the problem is constant (service always offline), intermittent (sometimes online, sometimes not), or if it started at a specific moment (all green until 14:32, then red).</p>

<h4>Available Actions</h4>

<p>From the detailed view, you can force an immediate service check (instead of waiting for the next automatic cycle), view the raw response from the last check (useful for debugging), or copy service information to share with colleagues.</p>

<h4>Automatic Notifications</h4>

<p>The Services Health tab is integrated with the dashboard notification system. When a service changes status (from online to offline or vice versa), an alert is automatically generated in the alert bar. If you've enabled sounds or desktop notifications, you'll be notified even if you're not looking at this tab.</p>

<p>This means you can keep the dashboard open in another tab or in the background, and you'll still be notified when a service has problems.</p>

<h4>Customizing Monitoring</h4>

<p>By default, the backend checks services every 10 seconds. This interval is configurable in the <code>config.js</code> file (<code>HEALTH_POLL_INTERVAL</code> constant). A shorter interval means faster problem detection, but also more system load. A longer interval reduces load but delays detection.</p>

<p>For most development scenarios, 10 seconds is a good compromise. In production environments with high availability requirements, you might want to reduce the interval to 5 seconds or less.</p>
`
    },

    /* ============================================================
       6. CANVAS SSE
       ============================================================ */
    {
      id: 'canvas-sse',
      icon: '',
      title: 'Canvas SSE',
      body: `
<p>The Canvas SSE tab offers a graphical and dynamic visualization of events flowing through the system. While the Live Events tab shows events as a text list, here you see them as "nodes" on an interactive canvas, connected by lines representing relationships between them.</p>

<h4>Why a Canvas Visualization</h4>

<p>An event list is useful for details, but when you want to understand the "big picture" — how different components interact, where errors cluster, which part of the system generates the most activity — a graphical visualization is much more effective.</p>

<p>Imagine having hundreds of events. In a list, you have to scroll through them one by one. On the canvas, you can immediately see that "that cluster of red nodes in the upper left" represents a series of correlated errors, while "that line of green nodes" represents a flow of successful operations.</p>

<pre style="background:var(--surface-secondary);padding:16px;border-radius:8px;margin:16px 0;font-family:monospace;font-size:12px;line-height:1.4;overflow-x:auto;">
  CANVAS SSE - Event Visualization
  ┌────────────────────────────────────────────────────────────────────┐
  │                                                                    │
  │         ┌─────┐                                                    │
  │         │ 🔴  │ error:parse                                       │
  │         └──┬──┘                                                    │
  │            │                                                       │
  │    ┌───────┴───────┐                                               │
  │    │               │                                               │
  │ ┌──┴──┐         ┌──┴──┐                                            │
  │ │ 🔴  │         │ 🔴  │   ◄── cluster of related errors           │
  │ └─────┘         └─────┘                                            │
  │                                                                    │
  │ ┌─────┐    ┌─────┐    ┌─────┐    ┌─────┐                          │
  │ │ 🟢  │───►│ 🟢  │───►│ 🟢  │───►│ 🟢  │  ◄── success flow        │
  │ └─────┘    └─────┘    └─────┘    └─────┘                          │
  │ file:save  test:run  test:pass  deploy                            │
  │                                                                    │
  │       ┌─────┐                                                      │
  │       │ 🟡  │  warning (isolated node)                            │
  │       └─────┘                                                      │
  │                                                                    │
  └────────────────────────────────────────────────────────────────────┘
</pre>

<h4>Interacting with the Canvas</h4>

<p>The canvas supports various interaction modes. You can <strong>drag</strong> the background to move the view (pan). You can use the <strong>mouse wheel</strong> to zoom in and out. You can <strong>click on a node</strong> to select it and see its details in a side panel. You can <strong>double-click</strong> to center the view on that node.</p>

<p>Nodes are automatically positioned using a layout algorithm that tries to minimize overlaps and line crossings. However, you can also drag individual nodes to manually reposition them if the automatic arrangement doesn't satisfy you.</p>

<h4>Reading the Nodes</h4>

<p>Each node represents an event or system entity. The <strong>color</strong> indicates the type or status: green for success events, red for errors, blue for informational events, yellow for warnings. The <strong>size</strong> can indicate importance or "magnitude" of the event. <strong>Connection lines</strong> show causal or temporal relationships between events.</p>

<p>Hover over a node to see a tooltip with basic information. Click to see full details in the side panel.</p>

<h4>Filters and Controls</h4>

<p>In the toolbar above the canvas you find controls to filter what's displayed. You can hide certain event types, limit the number of displayed nodes (useful if there are too many and the canvas becomes chaotic), or highlight nodes matching a search query.</p>

<p>The "Clear" button empties the canvas; the "Refresh" button reloads events from the backend; the "Auto-Layout" button recalculates node positions.</p>

<h4>Typical Use Cases</h4>

<p><strong>Debugging complex flows:</strong> When an operation involves many components (frontend → API → database → cache → response), the canvas lets you see the entire flow and identify where it breaks.</p>

<p><strong>Identifying patterns:</strong> If certain error types always appear together, or if a specific component always causes problems after a certain event, the pattern will be visible on the canvas.</p>

<p><strong>Presentations and explanations:</strong> The canvas is also useful for explaining system architecture to colleagues or during reviews, because it offers an intuitive visual representation.</p>
`
    },

    /* ============================================================
       7. AGENT INTELLIGENCE
       ============================================================ */
    {
      id: 'agent-intelligence',
      icon: '',
      title: 'Agent Intelligence',
      body: `
<p>The Agent Intelligence tab is dedicated to monitoring "AI agents" in your system. An AI agent can be GitHub Copilot, a local LLM model like Ollama, a custom multi-agent system, or any component that uses artificial intelligence to generate code or responses.</p>

<h4>The Three Views</h4>

<p>This tab is organized into three "views" that you can alternate using the buttons at the top. Each view shows a different aspect of how agents work.</p>

<p><strong>Infra View (Infrastructure):</strong> Shows the "physical" status of agents. Which models are available? Which LLM backend is active (OpenAI, Ollama, local)? What's the average response latency? How much memory does the model consume? This view is useful for performance or configuration problems.</p>

<p><strong>Flow View:</strong> Shows the interaction flow in real time. When you send a prompt to an agent, you see the prompt appear here, then the response as it's generated, then any follow-up actions. It's like a "chat history" but with more technical details: tokens used, generation time, model used.</p>

<p><strong>Diagnostics View:</strong> Shows problems and anomalies. Responses that took too long, generation errors, prompts that caused exceptions. Useful when an agent behaves strangely and you want to understand why.</p>

<h4>Understanding the Prompt Flow</h4>

<p>When you use an AI assistant like Copilot, what seems like a simple operation ("I ask something, I get a response") is actually a complex process with many steps. The prompt is pre-processed, enriched with context, sent to the model, the response is parsed and post-processed, any actions (like file modifications) are executed.</p>

<p>The Flow view shows you all these steps. Each "step" is a node you can expand to see details. If something goes wrong, you can see exactly which step failed.</p>

<h4>Model Monitoring</h4>

<p>If you use local models (Ollama), the Infra view shows specific information: which model is loaded (llama3.1:8b, qwen2.5-coder, etc.), how much GPU memory it's using, what the throughput is (tokens per second). If the model becomes slow, these metrics help you understand if the problem is the model itself (too large for your GPU), the context (too long), or something else.</p>

<h4>Integration with Live Events</h4>

<p>Agent Intelligence events also appear in the Live Events tab, where they mix with all other system events. This is useful when you want to see how AI interactions fit into the broader context of your development work.</p>

<h4>Agent Configuration</h4>

<p>The backend automatically detects which agents are available based on project and environment configuration. If you use Copilot, it looks for the VS Code extension. If you use Ollama, it looks for the server on port 11434. If you have other custom agents, you can configure them in the backend configuration file.</p>

<p>If an agent doesn't appear when you expect it, verify that it's actually running and reachable. The Infra view shows the connection status to each agent, including any errors.</p>
`
    },

    /* ============================================================
       8. GOVERNOR
       ============================================================ */
    {
      id: 'governor',
      icon: '',
      title: 'Governor',
      body: `
<p>The Governor tab is an advanced "auto-correction" tool for code. It analyzes your project to find problems — style errors, bad practices, potential bugs — and proposes (or automatically applies) fixes. It's like having an intelligent linter that not only reports problems, but also knows how to solve them.</p>

<h4>How Analysis Works</h4>

<p>When you click "Fetch" (or activate automatic monitoring), the Governor scans the project. For each file, it performs a series of checks: correct syntax, adherence to style conventions, potentially problematic patterns, unused dependencies, and so on.</p>

<p>Found problems are classified by severity (critical, warning, info) and type (syntax, style, security, performance). Each problem includes a description, the file and line where it's found, and — when possible — a proposed fix.</p>

<pre style="background:var(--surface-secondary);padding:16px;border-radius:8px;margin:16px 0;font-family:monospace;font-size:12px;line-height:1.4;overflow-x:auto;">
  GOVERNOR
  ┌────────────────────────────────────────────────────────────────────┐
  │  [Fetch] [Monitor] [Dry Run] [Auto-Heal]         Health: 78%      │
  ├────────────────────────────────────────────────────────────────────┤
  │                                                                    │
  │  PROBLEMS FOUND: 7                                                 │
  │                                                                    │
  │  🔴 CRITICAL  src/api.ts:45                                       │
  │     Unhandled promise rejection - missing try/catch                │
  │     [🛠️ Fix Available]                                             │
  │                                                                    │
  │  🔴 CRITICAL  src/auth.ts:102                                     │
  │     Potential SQL injection in query builder                       │
  │     [🛠️ Fix Available]                                             │
  │                                                                    │
  │  🟡 WARNING   src/utils.ts:78                                      │
  │     Function exceeds 100 lines (complexity: high)                  │
  │     [No auto-fix - manual refactor needed]                         │
  │                                                                    │
  │  🟡 WARNING   src/hooks/useData.ts:23                              │
  │     Missing dependency in useEffect array                          │
  │     [🛠️ Fix Available]                                             │
  │                                                                    │
  └────────────────────────────────────────────────────────────────────┘
</pre>

<h4>Dashboard Controls</h4>

<p><strong>Fetch:</strong> Performs a complete project analysis and shows results. This is a point-in-time operation — it gives you a "snapshot" of the current state.</p>

<p><strong>Monitor:</strong> Activates continuous polling (every 10 seconds). Results update automatically, so you can see problems appear and disappear as you work on the code.</p>

<p><strong>Dry Run:</strong> Simulates applying all proposed fixes without actually modifying files. Useful to see what would change before applying modifications.</p>

<p><strong>Auto-Heal:</strong> Automatically applies all fixes the Governor considers "safe" (those that don't change code semantics, only style or obvious corrections). This is a powerful operation — use it with caution and make sure you have version control active.</p>

<h4>The Diff Viewer</h4>

<p>When the Governor proposes a fix, you can see exactly what would change before applying it. Click on a problem with an available fix and the Diff Viewer will open: on the left the original code (with lines to remove highlighted in red), on the right the proposed code (with lines to add highlighted in green).</p>

<p>If the fix looks correct, click "Apply Fix" to apply it. The backend will modify the file on disk. If you prefer not to apply it, simply close the viewer.</p>

<h4>Types of Detected Problems</h4>

<p>The Governor detects various types of problems. <strong>Syntax errors</strong> are the most critical — code that doesn't compile or run. <strong>Style problems</strong> concern formatting, naming conventions, whitespace usage. <strong>Complexity problems</strong> flag functions that are too long, excessive nesting, high cyclomatic complexity. <strong>Security problems</strong> flag potentially vulnerable patterns (SQL injection, XSS, secrets in code).</p>

<h4>Limitations</h4>

<p>The Governor is a powerful tool, but it's not omniscient. Proposed fixes can sometimes be wrong or not applicable to your specific context. Always review proposed changes before applying them, especially for complex fixes that change code logic.</p>

<p>Also, the Governor works best on well-supported languages (Python, JavaScript/TypeScript). For less common languages, analysis might be less thorough.</p>
`
    },

    /* ============================================================
       9. TEST CENTER
       ============================================================ */
    {
      id: 'runner',
      icon: '',
      title: 'Test Center',
      body: `
<p>The Test Center is your unified command center for running tests on the project. Instead of having to remember the specific command for each test framework (jest, pytest, vitest, go test...), you can run everything from here with a single click.</p>

<h4>Test Suite Discovery</h4>

<p>When the dashboard connects to the backend, it analyzes the project to discover which test frameworks are present. It looks for configuration files (jest.config.js, pytest.ini, vitest.config.ts, etc.) and infers which test suites are available.</p>

<p>Each discovered suite appears as a card in the Test Center. The card shows the framework name, the number of tests (if detectable), and the last execution result.</p>

<h4>The 14 Test Suites</h4>

<p>Each suite corresponds to a specific type of verification:</p>

<pre style="background:var(--surface-secondary);padding:16px;border-radius:8px;margin:16px 0;font-family:monospace;font-size:12px;line-height:1.4;overflow-x:auto;">
  TEST CENTER
  ┌────────────────────────────────────────────────────────────────────┐
  │  [ Run All ]                                    0/14 complete      │
  ├────────────────────────────────────────────────────────────────────┤
  │                                                                    │
  │  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────────┐  │
  │  │ 1. Vitest Unit     │  │ 2. TypeScript (tsc)│  │ 3. ESLint        │  │
  │  │    🟢 12/12 pass   │  │    🟢 0 errors     │  │    🟡 3 warnings │  │
  │  │    [Run]  45ms    │  │    [Run]  1.2s     │  │    [Run]  890ms  │  │
  │  └────────────────────┘  └────────────────────┘  └──────────────────┘  │
  │                                                                    │
  │  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────────┐  │
  │  │ 4. Integration     │  │ 5. E2E Playwright  │  │ 6. Pytest        │  │
  │  │    🔴 16/18 pass   │  │    ⏳ Running...   │  │    🟢 24/24 pass │  │
  │  │    [Run]  2.1s    │  │    [Run]  --       │  │    [Run]  1.8s   │  │
  │  └────────────────────┘  └────────────────────┘  └──────────────────┘  │
  │                                                                    │
  │  ... + 8 other suites (Security, Coverage, Performance, etc.)      │
  │                                                                    │
  └────────────────────────────────────────────────────────────────────┘
</pre>

<p><strong>Unit tests</strong> (Jest, Vitest, pytest, Go test): Check that individual functions work correctly in isolation.</p>

<p><strong>Integration tests</strong>: Verify that components work correctly together.</p>

<p><strong>E2E tests</strong> (Playwright, Cypress): Simulate a real user interacting with the application.</p>

<p><strong>Type checking</strong> (TypeScript tsc, mypy): Verify there are no type errors.</p>

<p><strong>Linting</strong> (ESLint, ruff): Verify code follows style conventions.</p>

<p><strong>Coverage</strong>: Calculate what percentage of code is covered by tests.</p>

<h4>Running Tests</h4>

<p>Click the "Run" button on a suite to start it. The button will change to a spinner while the test runs. Results appear in real time in the Live Events tab, and the suite card updates at the end with summary results (passed/failed/skipped).</p>

<p>The "Run All" button at the top runs all detected suites in sequence. This is useful for a complete verification before committing or deploying.</p>

<h4>Interpreting Results</h4>

<p>Each suite has a colored indicator: green (all tests passed), yellow (some warnings or skipped tests), red (at least one failure). Click on a suite to see detailed results: which specific tests passed and which failed, execution times, and error messages for failures.</p>

<h4>Configuration</h4>

<p>The Test Center uses the same configuration as your test frameworks. If you've configured Jest with a jest.config.js, those settings will be used. If you want to customize how the dashboard runs tests, modify the specific framework configuration file.</p>
`
    },

    /* ============================================================
       10. QUALITY
       ============================================================ */
    {
      id: 'quality',
      icon: '',
      title: 'Quality',
      body: `
<p>The Quality tab analyzes the structural quality of your code. It's not about test results (those are in Test Center) but about "intrinsic" code qualities: how readable it is, how well-organized, how easy to maintain.</p>

<h4>Measured Metrics</h4>

<p>The tab displays a series of metrics, each with a numeric value and a visual indicator (bar or gauge). The main metrics are:</p>

<p><strong>Coverage:</strong> What percentage of code is covered by tests. A higher value indicates better test coverage, but 100% isn't always the goal — what matters is covering the critical parts.</p>

<pre style="background:var(--surface-secondary);padding:16px;border-radius:8px;margin:16px 0;font-family:monospace;font-size:12px;line-height:1.4;overflow-x:auto;">
  QUALITY DASHBOARD
  ┌────────────────────────────────────────────────────────────────────┐
  │                                                                    │
  │  TEST COVERAGE                                                     │
  │  ┌────────────────────────────────────────────────────────────┐   │
  │  │████████████████████████████████░░░░░░░░░░░░░░░░│ 67%      │   │
  │  └────────────────────────────────────────────────────────────┘   │
  │                                                                    │
  │  Coverage by Layer:                                                │
  │  ├── Frontend      [████████████████░░░░░░░░] 72%                 │
  │  ├── Backend       [██████████████████░░░░░░] 78%                 │
  │  ├── Services      [████████████░░░░░░░░░░░░] 54%  ◄─ needs work  │
  │  └── Utilities     [██████████████████████░░] 91%                 │
  │                                                                    │
  │  COMPLEXITY SCORE: B+ (Good)                                       │
  │  MAINTAINABILITY:  A  (Excellent)                                  │
  │  TECHNICAL DEBT:   2.3 days                                        │
  │                                                                    │
  └────────────────────────────────────────────────────────────────────┘
</pre>

<p><strong>Complexity:</strong> Measures how "complex" the code is to understand. High complexity makes maintenance and debugging harder. The metric often uses "cyclomatic complexity" — how many possible execution paths exist in a function.</p>

<p><strong>Maintainability:</strong> A composite score that considers various factors: code length, duplication, dependency clarity. A high score means the code is easy to modify without breaking things.</p>

<p><strong>Technical Debt:</strong> An estimate of how much time would be needed to "clean up" all quality problems. Expressed in hours or days, it gives you a concrete idea of the improvement effort needed.</p>

<h4>The Dashboard</h4>

<p>The main view shows a summary of all metrics, with color indicators (green = good, yellow = acceptable, red = needs attention). You can immediately see which areas of the project need the most work.</p>

<h4>Coverage by Layer</h4>

<p>In the detailed view, you can see coverage broken down by "layer" — frontend, backend, services, etc. This is useful for identifying areas with insufficient coverage. For example, if the frontend has 80% coverage but services only 40%, you know where to focus your testing efforts.</p>

<h4>Suggested Actions</h4>

<p>The tab doesn't just show metrics — it suggests concrete actions. For example, "Add tests for src/services/auth.ts (0% coverage)" or "Refactor calculateTotal() (complexity: 25, threshold: 15)". These suggestions help transform abstract metrics into tangible tasks.</p>
`
    },

    /* ============================================================
       11. TEST QUALITY INDEX (TQI)
       ============================================================ */
    {
      id: 'tqi',
      icon: '',
      title: 'Test Quality Index',
      body: `
<p>TQI (Test Quality Index) is a composite metric that measures not just coverage (how much code is tested), but the actual quality of your tests. It's possible to have 100% coverage with tests that don't actually verify anything useful — TQI tries to catch that.</p>

<h4>How TQI Works</h4>

<p>TQI analyzes your test suite from multiple perspectives:</p>

<p><strong>Coverage:</strong> The percentage of code covered by tests. This is the base, but not sufficient alone.</p>

<p><strong>Assertion density:</strong> How many assertions per test? A test with many assertions verifies more behavior. A test with few or no assertions might be "empty".</p>

<p><strong>Branch coverage:</strong> Are all conditional branches tested? A function with an if/else should have tests that cover both paths.</p>

<p><strong>Mutation score:</strong> If we intentionally insert a bug (a "mutation") in the code, do the tests detect it? A high mutation score indicates robust tests.</p>

<h4>The TQI Score</h4>

<pre style="background:var(--surface-secondary);padding:16px;border-radius:8px;margin:16px 0;font-family:monospace;font-size:12px;line-height:1.4;overflow-x:auto;">
  TEST QUALITY INDEX
  ┌────────────────────────────────────────────────────────────────────┐
  │                                                                    │
  │                    ┌──────────────┐                                │
  │                   /                \\                               │
  │                  /    TQI SCORE     \\                              │
  │                 │                    │                             │
  │                 │       72/100       │  ◄─ Good, room to improve   │
  │                 │                    │                             │
  │                  \\                  /                              │
  │                   \\________________/                               │
  │                                                                    │
  │  Score Breakdown:                                                  │
  │  ├── Coverage        25/30 pts   [████████████████████░░░░░]      │
  │  ├── Assertions      18/25 pts   [██████████████░░░░░░░░░░░]      │
  │  ├── Branch Coverage 15/20 pts   [███████████████░░░░░░░░░░]      │
  │  └── Mutation Score  14/25 pts   [██████████████░░░░░░░░░░░]      │
  │                                                                    │
  │  Recommendation: Add edge case tests to improve mutation score     │
  │                                                                    │
  └────────────────────────────────────────────────────────────────────┘
</pre>

<p>The TQI score combines these factors into a single number from 0 to 100. The score is displayed as a gauge at the top of the tab, with a color that indicates the overall quality level: green (70+), yellow (40-69), red (&lt;40).</p>

<h4>Interpreting the Score</h4>

<p><strong>80-100:</strong> Excellent test suite. Tests are thorough, cover edge cases, and would detect most bugs.</p>

<p><strong>60-79:</strong> Good test suite with room for improvement. Basic coverage is there, but might be missing edge cases or certain conditional branches.</p>

<p><strong>40-59:</strong> Acceptable but needs work. Many areas might be uncovered or tests might be superficial.</p>

<p><strong>&lt;40:</strong> Test suite needs significant attention. Many bugs could escape into production without being caught.</p>

<h4>Anti-Patterns</h4>

<p>The TQI tab also identifies "anti-patterns" in tests — common problems that reduce testing quality:</p>

<p><strong>Tests without assertions:</strong> Tests that run code but don't verify the result.</p>

<p><strong>Excessive mocking:</strong> Tests that mock so much that they're not really testing anything real.</p>

<p><strong>Long functions:</strong> Functions above a certain length (e.g. 100 lines) — hard to understand and test.</p>

<p>These patterns are listed with indication of how many occurrences there are and where. Click on one to see the list of affected files.</p>

<h4>Worst Files</h4>

<p>At the bottom of the tab, a table shows files with the worst scores. These are the "weak points" of the project — where focusing improvement efforts will have the maximum impact on overall TQI.</p>
`
    },

    /* ============================================================
       12. METRICS HISTORY
       ============================================================ */
    {
      id: 'metrics',
      icon: '',
      title: 'Metrics History',
      body: `
<p>The Metrics tab collects and visualizes metrics over time. While other tabs show the "current" state, this tab shows how things have changed over hours, days, weeks. It's the difference between a photograph and a movie.</p>

<h4>Why History Matters</h4>

<p>A system with 5 problems today might seem problematic. But if yesterday it had 20 and last week 50, it's actually rapidly improving. Conversely, a system with 2 problems today that had 0 last week is getting worse.</p>

<p>The trend is often more informative than the absolute value. The Metrics tab lets you see these trends.</p>

<h4>Tracked Metrics</h4>

<p><strong>Total Events:</strong> Total number of events processed by the backend since startup. A growing number is normal; sudden slowdowns might indicate problems.</p>

<p><strong>Avg Latency:</strong> Average latency of endpoint responses. A gradual increase might indicate an overloading backend or a project that's growing too large.</p>

<p><strong>Total Errors:</strong> Total number of registered errors. This number should ideally remain low and stable.</p>

<p><strong>Fixes Applied:</strong> Number of automatic fixes applied by the Governor. Shows how much "work" the system is doing for you.</p>

<p><strong>Peak Problems:</strong> Maximum peak of simultaneous problems. If this number grows, the project is accumulating technical debt.</p>

<p><strong>Uptime:</strong> Total backend running time. Useful to understand how long the system has been active.</p>

<h4>The Latency Graph</h4>

<p>Metrics are displayed in graphs showing the trend over time. You can see how response time varies during the day, identify memory usage spikes, or notice correlations between different metrics (for example, response time increasing when CPU is under stress).</p>

<p>A bar graph shows the last 48 hourly latency readings. Each bar is colored based on thresholds: green for good latency (under 200ms), yellow for acceptable latency (200-500ms), red for problematic latency (above 500ms).</p>

<p>Patterns to look for: regular spikes might indicate scheduled jobs overloading the system. Gradual growth might indicate memory leaks or data accumulation. High variance (bars oscillating a lot) might indicate instability.</p>

<h4>Detailed Tables</h4>

<p>Below the graph, tables show more detailed data: complete hourly history, performance per individual endpoint, applied fixes chronology, and problem trends. These tables are scrollable and sortable by different columns.</p>

<h4>Sampling</h4>

<p>Metrics are sampled every 30 seconds by a "snapshot engine" integrated in the backend. This means you don't see every single fluctuation, but trends at half-minute granularity. For more detailed analysis, you can consult backend logs.</p>
`
    },

    /* ============================================================
       13. PROJECT REALITY
       ============================================================ */
    {
      id: 'roadmap',
      icon: '',
      title: 'Project Reality',
      body: `
<p>The Project Reality tab answers a fundamental question: how much of what was "designed" is actually "implemented"? In many projects, there's a gap between documentation (describing how things should work) and code (describing how they actually work).</p>

<h4>Designed vs Built Comparison</h4>

<p>This tab scans both specification documents (markdown, doc, txt files in the docs/ folder or similar) and source code. Then it tries to map each feature or component described in documentation to corresponding code.</p>

<p>The result is a matrix showing, for each element:</p>

<p><strong>Implemented:</strong> The feature is described in documentation and there's corresponding code implementing it.</p>

<p><strong>Partially:</strong> The feature is described and there's code, but not complete — some parts are missing.</p>

<p><strong>Planned:</strong> The feature is described but there's no code yet — it's in the plans but not implemented.</p>

<p><strong>Missing:</strong> There's neither description nor code — a "hole" in the project.</p>

<h4>Project Overview</h4>

<p>In the upper part of the tab, counters show aggregated status: how many Components, Engine Modules, Stores, Services, Hooks, Routes are implemented vs. planned. A global progress bar shows completion percentage.</p>

<p>This gives an immediate bird's eye view of project status. If you're at 40%, there's still a lot of work to do. If you're at 95%, you're close to completion.</p>

<h4>The 12 Document Categories</h4>

<p>Documents are grouped into categories: Architecture, API, Testing, Deployment, Security, Performance, Documentation, Configuration, Monitoring, CI/CD, Database, Other. For each category you can see how many documents there are, how many are implemented, and what the gaps are.</p>

<p>This is useful for understanding where to focus effort. If you have lots of Architecture documentation but little Testing, maybe you should write more tests. If you have lots of Deployment but nothing on Security, maybe you should address security.</p>

<h4>Using Project Reality for Planning</h4>

<p>This tab is particularly useful in sprint or roadmap planning sessions. Instead of relying on vague memories of "what's missing", you have concrete data on what's implemented and what's not. You can sort by priority and choose what to do in the next sprint.</p>

<p>It's also useful for onboarding new team members: they can quickly see project status and where the main work areas are.</p>

<h4>Limitations</h4>

<p>Mapping between documentation and code is heuristic — it's based on name matching, keywords, and patterns. It may not be 100% accurate, especially if documentation uses different terminology than code. Use it as a guide, not as absolute truth.</p>
`
    },

    /* ============================================================
       14. STRUCTURAL HEALTH
       ============================================================ */
    {
      id: 'structural',
      icon: '',
      title: 'Structural Health',
      body: `
<p>The Structural Health tab analyzes the "shape" of your project: how files are organized, how modules depend on each other, whether there are patterns that indicate structural problems.</p>

<h4>What Structural Health Means</h4>

<p>A project can have good code (well written, tested) but bad structure (confusing organization, inappropriate dependencies, duplicated logic). Structural Health focuses on the latter.</p>

<h4>Analyzed Metrics</h4>

<p><strong>Dependency Graph:</strong> A visualization of how files depend on each other. A "healthy" graph has a clear hierarchy with few cross-dependencies. An "unhealthy" graph looks like a tangled ball of yarn.</p>

<p><strong>Circular Dependencies:</strong> When A depends on B and B depends on A (directly or through a chain). These are almost always problematic and should be fixed.</p>

<p><strong>Orphan Files:</strong> Files that aren't imported by anything. They might be old code that's no longer used, or missing connections.</p>

<p><strong>Overly Connected Files:</strong> Files imported by too many others (high "fan-in") or importing too many (high "fan-out"). These are potential "bottlenecks" where a change can have ripple effects.</p>

<p><strong>Layer Violations:</strong> If your project has defined layers (UI, services, backend), there shouldn't be imports going "backwards" (e.g. backend importing from UI). This tab detects such violations.</p>

<h4>Output Types</h4>

<p><strong>Problem List:</strong> List of detected issues, ordered by severity.</p>

<p><strong>Canvas Nodes:</strong> Visualization in the SSE canvas (dependency graph).</p>

<p><strong>Statistics:</strong> Aggregate numbers (total files, average dependencies, maximum nesting depth).</p>

<h4>Recommended Actions</h4>

<p>For each detected problem, the tab suggests a solution. For circular dependencies, it might suggest which dependency to invert or which module to split. For orphan files, it might suggest deletion or integration.</p>

<h4>Integration with Governor</h4>

<p>Some structural problems can be automatically fixed by the Governor. For example, unused imports can be removed. For more complex problems (architectural refactoring), you'll need to intervene manually, but the tab gives you a clear guide on what to do.</p>
`
    },

    /* ============================================================
       15. LANGUAGE REGISTRY
       ============================================================ */
    {
      id: 'langreg',
      icon: '',
      title: 'Language Registry',
      body: `
<p>The Language Registry tab is a "census" of the languages and technologies used in your project. It's useful for understanding project composition, detecting unexpected dependencies, and documenting the technology stack.</p>

<h4>Detected Languages</h4>

<p>The tab scans all project files and categorizes them by language. For each language, it shows: file count, total lines, percentage of total project, and recent file list.</p>

<p>For example, you might see:
- TypeScript: 45 files, 12,340 lines, 62%
- Python: 12 files, 3,210 lines, 16%
- CSS: 8 files, 2,100 lines, 11%
- JSON: 15 files, 890 lines, 5%
- Other: 1,180 lines, 6%</p>

<h4>Why This Matters</h4>

<p>Knowing project composition helps with various decisions:</p>

<p><strong>Hiring:</strong> If the project is 80% Python and 20% TypeScript, you probably need more Python developers.</p>

<p><strong>Training:</strong> If you're introducing a new language, you can track how much it's adopted over time.</p>

<p><strong>Dependencies:</strong> If you unexpectedly see a language you shouldn't have (e.g. PHP files in a Node.js project), that might be a problem to investigate.</p>

<p><strong>Documentation:</strong> The registered data can be exported for project documentation or reports.</p>

<h4>Frameworks and Libraries</h4>

<p>Beyond just languages, the tab also detects used frameworks and libraries. It reads configuration files (package.json, requirements.txt, etc.) and reports which dependencies are present.</p>

<p>This is useful for security (are there dependencies with known vulnerabilities?), maintenance (are there obsolete dependencies?), and documentation.</p>

<h4>Trends</h4>

<p>If you use the tab over time, you can see how project composition changes. A project starting with 100% JavaScript and migrating to TypeScript will show the percentage of TypeScript increasing week by week.</p>
`
    },

    /* ============================================================
       16. ALERTS & NOTIFICATIONS
       ============================================================ */
    {
      id: 'alerts',
      icon: '',
      title: 'Alerts & Notifications',
      body: `
<p>The dashboard notification system is designed to keep you informed of important events without being intrusive. This section explains how notifications work and how to customize them to your preferences.</p>

<h4>Notification Types</h4>

<p><strong>Toast alerts:</strong> Short messages appearing in the alert bar at the top of the page. They disappear automatically after a few seconds (for informational ones) or remain until manually closed (for errors).</p>

<p><strong>Desktop notifications:</strong> System notifications appearing outside the browser. Useful if you want to be alerted even when not looking at the dashboard.</p>

<p><strong>Sound alerts:</strong> Brief sounds playing when certain events occur. Useful if you don't want to constantly watch the screen.</p>

<p><strong>Voice alerts (TTS):</strong> Voice synthesis reading important alerts. Useful for hands-free accessibility.</p>

<h4>Notification Center</h4>

<p>Click the bell icon in the header to open the Notification Center. Here you find a chronological history of all recent notifications, including those you might have missed. You can clear all notifications or mark them as read.</p>

<h4>Configuration</h4>

<p>The icons in the header let you enable/disable different notification channels:</p>

<p>🔊 <strong>Sound:</strong> Enables/disables sound alerts. When enabled, the icon is highlighted.</p>

<p>🔔 <strong>Desktop:</strong> Enables/disables desktop notifications. Requires browser permission (a popup will appear the first time you enable them).</p>

<p>🎤 <strong>Voice:</strong> Enables/disables voice synthesis. Uses the system's default voice.</p>

<h4>Priority Levels</h4>

<p>Notifications have different priority levels that influence their behavior:</p>

<p><strong>Critical:</strong> Service offline, unhandled errors, critical failures. They stay visible until closed and always trigger sound/voice if enabled.</p>

<p><strong>Warning:</strong> Problems needing attention but not critical (high latency, failed tests). Auto-dismiss after 10 seconds.</p>

<p><strong>Info:</strong> Normal informational events (task completed, file saved). Auto-dismiss after 5 seconds.</p>

<h4>Filtering</h4>

<p>You can filter which events generate notifications. By default, only Critical and Warning events generate alerts; Info events are logged but don't show toasts. This is configurable in the config file.</p>
`
    },

    /* ============================================================
       17. DEBUG CONSOLE
       ============================================================ */
    {
      id: 'debugconsole',
      icon: '',
      title: 'Debug Console',
      body: `
<p>The Debug Console is an integrated tool for debugging the dashboard itself. If something isn't working as expected in the UI, this is where to look.</p>

<h4>Opening the Console</h4>

<p>Click the terminal icon 💻 in the header (or press Ctrl+\`) to open the Debug Console. A panel with dark background appears at the bottom of the page.</p>

<pre style="background:var(--surface-secondary);padding:16px;border-radius:8px;margin:16px 0;font-family:monospace;font-size:12px;line-height:1.4;overflow-x:auto;">
  DEBUG CONSOLE
  ┌────────────────────────────────────────────────────────────────────┐
  │                                                                    │
  │  [14:32:45] LOG   SSE connection established                       │
  │  [14:32:45] LOG   Received 12 initial events                       │
  │  [14:32:46] LOG   Services health check: 5/5 online                │
  │  [14:32:48] WARN  Ollama service latency high: 892ms               │
  │  [14:32:50] LOG   Event received: file:change                      │
  │  [14:32:52] ERR   Failed to fetch /v1/models: 404                  │
  │  [14:32:52] LOG   Retrying in 5 seconds...                        │
  │                                                                    │
  │  ─────────────────────────────────────────────────────────────     │
  │  [Clear]  [Pause]  [Copy All]                                      │
  │                                                                    │
  └────────────────────────────────────────────────────────────────────┘
</pre>

<h4>What the Console Shows</h4>

<p>The console captures standard JavaScript logs (console.log, console.warn, console.error) executed by the dashboard. It also shows:</p>

<p><strong>SSE events:</strong> Events received via Server-Sent Events from the backend.</p>

<p><strong>API calls:</strong> HTTP requests made by the dashboard and their results.</p>

<p><strong>Errors:</strong> JavaScript errors, unhandled exceptions, failed fetch requests.</p>

<p><strong>Internal debug:</strong> Messages emitted by dashboard components for debugging.</p>

<h4>Using the Console</h4>

<p>Every line in the console is color-coded:</p>

<p><span style="color:#0f0;">Green (LOG)</span>: Normal information.</p>

<p><span style="color:#fc0;">Yellow (WARN)</span>: Warnings, non-critical problems.</p>

<p><span style="color:#f44;">Red (ERR)</span>: Errors, failures, exceptions.</p>

<p>You can copy all console content with the "Copy All" button — useful for sharing logs when reporting a problem. The "Clear" button empties the console. The "Pause" button stops the log scroll (useful to read a specific message without it being pushed away by new messages).</p>

<h4>When to Use It</h4>

<p>The Debug Console is useful when:</p>

<p>- A tab doesn't load data (check if there are API errors)</p>
<p>- Notifications don't appear when expected (check if events are being received)</p>
<p>- The dashboard seems slow (check if there are warnings about latency)</p>
<p>- You're developing new features and want to see debug logs</p>

<h4>Difference from Browser Console</h4>

<p>The Debug Console is similar to the browser console (F12 → Console), but pre-filtered to only show dashboard-relevant messages, without browser internal noise. For deep debugging, you might still want to use the browser console, but for day-to-day use the integrated Debug Console is more convenient.</p>
`
    },

    /* ============================================================
       18. DIFF VIEWER
       ============================================================ */
    {
      id: 'diff',
      icon: '',
      title: 'Diff Viewer',
      body: `
<p>The Diff Viewer is a tool for visualizing code changes. It's used by the Governor when proposing fixes, and can be invoked manually to compare two versions of a file.</p>

<h4>How It Works</h4>

<p>The viewer shows two panels side by side: on the left the "original" version, on the right the "modified" (or proposed) version. Differences are highlighted:</p>

<p><span style="background:rgba(255,0,0,0.2);">Red lines</span>: Code that would be removed from the original.</p>

<p><span style="background:rgba(0,255,0,0.2);">Green lines</span>: Code that would be added in the new version.</p>

<p>Lines without highlighting are unchanged.</p>

<pre style="background:var(--surface-secondary);padding:16px;border-radius:8px;margin:16px 0;font-family:monospace;font-size:12px;line-height:1.4;overflow-x:auto;">
  DIFF VIEWER
  ┌─────────────────────────────┬─────────────────────────────┐
  │  ORIGINAL (current)         │  MODIFIED (proposed)        │
  ├─────────────────────────────┼─────────────────────────────┤
  │  function getData() {       │  function getData() {       │
  │    const res = fetch(url);  │    const res = fetch(url);  │
  │ -  return res.data;         │ +  try {                    │
  │                             │ +    return res.data;       │
  │                             │ +  } catch (e) {            │
  │                             │ +    console.error(e);      │
  │                             │ +    return null;           │
  │                             │ +  }                        │
  │  }                          │  }                          │
  ├─────────────────────────────┴─────────────────────────────┤
  │  [ Apply Changes ]                    [ Cancel ]          │
  └───────────────────────────────────────────────────────────┘
</pre>

<h4>Interaction with Governor</h4>

<p>When the Governor finds a problem with an auto-fix available, clicking on the problem opens the Diff Viewer with the proposed changes. Here you can:</p>

<p>- Review the proposed modification</p>
<p>- Click "Apply Changes" to apply the fix to the actual file</p>
<p>- Click "Cancel" to close without changing anything</p>

<p>This gives you full control: the Governor shows you what it would do, but final decision is always yours.</p>

<h4>File Comparison</h4>

<p>You can also use the Diff Viewer to compare two versions of a file manually. This is useful when you want to see what changed between two commits, or between a local version and a server version.</p>

<h4>Keyboard Navigation</h4>

<p>The viewer supports keyboard navigation: arrow keys to scroll, 'n' to go to next change, 'p' to previous change, ESC to close the viewer.</p>

<h4>Syntax Highlighting</h4>

<p>The Diff Viewer recognizes common languages (JavaScript, TypeScript, Python, etc.) and applies syntax highlighting. This makes it easier to read and understand proposed changes.</p>
`
    },

    /* ============================================================
       19. CONFIGURATION
       ============================================================ */
    {
      id: 'config',
      icon: '',
      title: 'Configuration',
      body: `
<p>The dashboard behavior can be customized through various configuration files. This section describes where to find them and what options are available.</p>

<h4>Frontend Configuration (config.js)</h4>

<p>The main dashboard configuration file is <code>frontend/js/config.js</code>. Here you can modify:</p>

<p><strong>API_BASE:</strong> The backend server base URL (default: http://127.0.0.1:8421).</p>

<p><strong>SSE_ENDPOINT:</strong> The SSE events endpoint (default: /v1/events).</p>

<p><strong>HEALTH_POLL_INTERVAL:</strong> How often to check service health, in ms (default: 10000).</p>

<p><strong>EVENT_RETENTION:</strong> How many events to keep in history (default: 1000).</p>

<p><strong>DEFAULT_THEME:</strong> The default theme (dark/light).</p>

<h4>Backend Configuration (main.py)</h4>

<p>The backend accepts several command-line arguments:</p>

<pre style="background:var(--surface-secondary);padding:12px;border-radius:6px;margin:12px 0;"># Change listening port (default: 8421)
python main.py --port 9000

# Accept connections from any IP (not just localhost)
python main.py --host 0.0.0.0

# Specify the project folder to analyze
python main.py --project-root /path/to/project

# Automatically open browser
python main.py --open

# Combine options
python main.py --port 9000 --host 0.0.0.0 --project-root ../myproject --open</pre>

<h4>IDE-Specific Configuration</h4>

<p>If you use a specific IDE (Cursor, JetBrains, Windsurf), you might need to configure environment variables or specific configuration files to enable advanced features. Consult the IDE documentation and the Agent Intelligence section of this guide for details.</p>
`
    },

    /* ============================================================
       20. TROUBLESHOOTING
       ============================================================ */
    {
      id: 'troubleshooting',
      icon: '',
      title: 'Troubleshooting',
      body: `
<p>This section collects the most common problems users encounter and how to solve them. If your problem isn't here, try the "Advanced Debug" section for deeper investigation techniques.</p>

<h4>Problem: "Waiting for Backend" Doesn't Disappear</h4>

<p><strong>Symptoms:</strong> The dashboard shows the "Waiting for Backend" overlay and never connects.</p>

<p><strong>Possible causes:</strong></p>
<p>1. The backend isn't running. Open a terminal and run <code>cd backend && python main.py</code>.</p>
<p>2. The backend is on a different port. Check which port main.py is listening on and update config.js.</p>
<p>3. Firewall is blocking the connection. Try temporarily disabling the firewall.</p>
<p>4. CORS error. Check the browser console for CORS-related messages.</p>

<p><strong>Diagnosis:</strong> Open the browser console (F12 → Console) and look for errors. Open the Debug Console (terminal icon) to see connection attempts.</p>

<h4>Problem: Events Don't Appear in Live Events</h4>

<p><strong>Symptoms:</strong> The dashboard is connected (green indicator) but no events appear.</p>

<p><strong>Possible causes:</strong></p>
<p>1. The VS Code extension isn't installed or active. Check VS Code extensions.</p>
<p>2. No activity is happening in the project. Try modifying and saving a file.</p>
<p>3. The SSE channel is open but events aren't arriving. Check the Debug Console.</p>

<p><strong>Diagnosis:</strong> In the browser console, look for SSE-related messages. Try closing and reopening the browser.</p>

<h4>Problem: Test Center Doesn't Find Tests</h4>

<p><strong>Symptoms:</strong> The Test Center shows "No test suites found".</p>

<p><strong>Possible causes:</strong></p>
<p>1. No test framework is configured in the project.</p>
<p>2. Test configuration files aren't in expected locations.</p>
<p>3. The backend doesn't have necessary dependencies to detect frameworks.</p>

<p><strong>Diagnosis:</strong> Verify there's at least one test configuration file (jest.config.js, pytest.ini, etc.) in the project root.</p>

<h4>Problem: Dashboard Is Slow or Unresponsive</h4>

<p><strong>Symptoms:</strong> The dashboard responds slowly to clicks, scrolling is jerky, CPU is high.</p>

<p><strong>Possible causes:</strong></p>
<p>1. Too many events accumulated. Try clicking "Clear" to empty history.</p>
<p>2. The browser has too many open tabs or extensions.</p>
<p>3. The project is too large and analysis is slow.</p>

<p><strong>Diagnosis:</strong> Open browser dev tools (F12 → Performance) and record a profile while you interact with the dashboard. Look where time is spent.</p>

<h4>Problem: Notifications Don't Work</h4>

<p><strong>Symptoms:</strong> Notifications are enabled but you don't see/hear them.</p>

<p><strong>Possible causes:</strong></p>
<p>1. System volume is muted (for sound).</p>
<p>2. Browser doesn't have notification permission (for desktop).</p>
<p>3. Browser is blocking popups or notifications.</p>

<p><strong>Diagnosis:</strong> Check browser notification settings. Try clicking the bell icon to test if they work.</p>
`
    },

    /* ============================================================
       21. ADVANCED DEBUG
       ============================================================ */
    {
      id: 'debug-avanzato',
      icon: '',
      title: 'Advanced Debug',
      body: `
<p>This section is for experienced users who need to investigate complex problems or develop new features. It covers low-level debugging techniques and in-depth understanding of backend mechanics.</p>

<h4>Backend Architecture</h4>

<p>The backend is a FastAPI server that does several things:</p>

<p>1. <strong>File Watcher:</strong> Uses watchdog to monitor project file changes.</p>
<p>2. <strong>Project Analyzer:</strong> Scans code structure, calculates metrics, identifies dependencies.</p>
<p>3. <strong>Event Broker:</strong> Receives events (from watcher, from VS Code extension) and broadcasts them via SSE.</p>
<p>4. <strong>REST API:</strong> Exposes endpoints to get data (health, services, introspect, etc.).</p>

<h4>Useful Endpoints</h4>

<p>For advanced debugging, you can call endpoints directly:</p>

<pre style="background:var(--surface-secondary);padding:12px;border-radius:6px;margin:12px 0;"># Check backend is running
curl http://127.0.0.1:8421/health

# Get services list
curl http://127.0.0.1:8421/v1/services/health

# Get project structure
curl http://127.0.0.1:8421/v1/introspect

# Get problems (Governor)
curl http://127.0.0.1:8421/v1/governor/problems</pre>

<h4>Backend Logs</h4>

<p>The backend writes logs to the terminal where you started it. You can increase verbosity with:</p>

<pre style="background:var(--surface-secondary);padding:12px;border-radius:6px;margin:12px 0;">python main.py --log-level debug</pre>

<p>Logs include: every received HTTP request, broadcasted SSE events, watcher file changes, Governor analysis results.</p>

<h4>SSE Event Structure</h4>

<p>SSE events have this JSON structure:</p>

<pre style="background:var(--surface-secondary);padding:12px;border-radius:6px;margin:12px 0;">{
  "type": "file:change",
  "timestamp": "2024-01-15T14:32:45.123Z",
  "source": "watcher",
  "payload": {
    "path": "src/app.ts",
    "action": "modified",
    "lines": 145
  }
}</pre>

<p>Every event has a type, timestamp, source (who generated it), and a payload with specific details.</p>

<h4>Debugging SSE Connection</h4>

<p>If you suspect an SSE connection problem, you can test it directly:</p>

<pre style="background:var(--surface-secondary);padding:12px;border-radius:6px;margin:12px 0;">curl -N http://127.0.0.1:8421/v1/events</pre>

<p>You should see events arriving as JSON lines. If the connection closes immediately, there's a problem with the backend or your network.</p>

<h4>Debugging JavaScript</h4>

<p>For complex frontend problems, use browser dev tools:</p>

<p>1. <strong>Console:</strong> See errors, warnings, and logs.</p>
<p>2. <strong>Network:</strong> See HTTP requests and SSE connections.</p>
<p>3. <strong>Sources:</strong> Set breakpoints in JavaScript code.</p>
<p>4. <strong>Performance:</strong> Profile to find slow code.</p>

<p>All dashboard code is in <code>frontend/js/</code> and is not minified, so it's easy to read and debug.</p>
`
    }

  ];

  /* ══════════════════════════════════════════════════════════════════════════
     UI RENDERING
     ══════════════════════════════════════════════════════════════════════════ */

  function buildTOC() {
    let toc = '<ul class="guide-toc">';
    for (const s of SECTIONS) {
      toc += `<li><a href="#guide-${s.id}" onclick="SynapseApp.tabs.guide.scrollTo('${s.id}')">${s.icon} ${s.title}</a></li>`;
    }
    toc += '</ul>';
    return toc;
  }

  function buildSections() {
    let html = '';
    for (const s of SECTIONS) {
      html += `
        <section class="guide-section" id="guide-${s.id}">
          <h3 class="guide-section-title">${s.icon} ${s.title}</h3>
          <div class="guide-section-body">${s.body}</div>
        </section>
      `;
    }
    return html;
  }

  function render() {
    const panel = document.getElementById('panel-guide');
    if (!panel) return;

    panel.innerHTML = `
      <div class="guide-container" style="display:flex;gap:32px;height:100%;overflow:hidden;">
        <aside class="guide-sidebar" style="width:220px;flex-shrink:0;overflow-y:auto;padding:16px 0;border-right:1px solid var(--border-primary);">
          <h4 style="padding:0 16px 12px;margin:0;font-size:0.85rem;color:var(--text-secondary);">CONTENTS</h4>
          ${buildTOC()}
        </aside>
        <main class="guide-main" style="flex:1;overflow-y:auto;padding:24px 32px;">
          ${buildSections()}
        </main>
      </div>
    `;
  }

  function scrollTo(id) {
    const el = document.getElementById(`guide-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── Export ─────────────────────────────────────────────────────────────── */
  window.SynapseApp = window.SynapseApp || { tabs: {} };
  SynapseApp.tabs.guide = {
    render,
    scrollTo
  };

})();
