/**
 * Synapse Live Debug — VS Code Webview Panel
 * Embeds the dashboard inside a VS Code panel tab.
 */

import * as vscode from 'vscode';

export class SynapseDashboardPanel {
    public static currentPanel: SynapseDashboardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private readonly _port: number;

    private constructor(panel: vscode.WebviewPanel, port: number) {
        this._panel = panel;
        this._port = port;

        this._panel.webview.html = this._getHtmlContent();

        // Handle messages from the webview (forwarded from the iframe)
        this._panel.webview.onDidReceiveMessage(
            (message) => {
                if (message.type === 'runInTerminal' && message.command) {
                    const termName = 'Synapse Quick Fix';
                    // Reuse existing terminal or create a new one
                    let terminal = vscode.window.terminals.find(t => t.name === termName);
                    if (!terminal) {
                        terminal = vscode.window.createTerminal({
                            name: termName,
                            cwd: message.cwd || undefined,
                        });
                    }
                    terminal.show(false); // false = don't steal focus
                    terminal.sendText(message.command);
                }
            },
            null,
            this._disposables,
        );

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri, port: number) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (SynapseDashboardPanel.currentPanel) {
            SynapseDashboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'synapseLiveDebug',
            'Synapse Live Debug',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [],
            }
        );

        SynapseDashboardPanel.currentPanel = new SynapseDashboardPanel(panel, port);
    }

    private _getHtmlContent(): string {
        const url = `http://127.0.0.1:${this._port}`;
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Synapse Live Debug</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100vh;
            overflow: hidden;
            background: #ffffff;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            color: #666;
        }
    </style>
</head>
<body>
    <iframe
        id="dashboard"
        src="${url}"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        loading="eager"
    ></iframe>
    <script>
        const vscodeApi = acquireVsCodeApi();
        const iframe = document.getElementById('dashboard');
        iframe.onerror = () => {
            document.body.innerHTML = '<div class="loading">Dashboard not available. Start the backend first.</div>';
        };
        // Forward messages from the dashboard iframe to the extension host
        window.addEventListener('message', (event) => {
            // Messages from the iframe have event.data with our custom types
            if (event.data && event.data.type === 'runInTerminal') {
                vscodeApi.postMessage(event.data);
            }
        });
    </script>
</body>
</html>`;
    }

    public dispose() {
        SynapseDashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }
}
