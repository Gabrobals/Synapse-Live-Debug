/**
 * Synapse Live Debug — VS Code Tree View Providers
 * Sidebar panels showing status, services, and recent events.
 */

import * as vscode from 'vscode';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchJson(port: number, path: string): Promise<any> {
    try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
            signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
            return await response.json();
        }
    } catch {
        // Backend not running
    }
    return null;
}

// ─── Status Tree ─────────────────────────────────────────────────────────────

export class SynapseStatusProvider implements vscode.TreeDataProvider<StatusItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<StatusItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private port: number) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: StatusItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<StatusItem[]> {
        const health = await fetchJson(this.port, '/health');
        const status = await fetchJson(this.port, '/debug/status');
        const detect = await fetchJson(this.port, '/v1/project/detect');

        if (!health) {
            return [new StatusItem('Backend', 'Not running', vscode.TreeItemCollapsibleState.None, 'warning')];
        }

        const items: StatusItem[] = [
            new StatusItem('Status', 'Running', vscode.TreeItemCollapsibleState.None, 'pass'),
            new StatusItem('Version', health.version || '?', vscode.TreeItemCollapsibleState.None, 'info'),
            new StatusItem('Port', String(this.port), vscode.TreeItemCollapsibleState.None, 'info'),
        ];

        if (status) {
            items.push(new StatusItem('Uptime', `${status.uptime}s`, vscode.TreeItemCollapsibleState.None, 'info'));
            items.push(new StatusItem('Events', String(status.event_count), vscode.TreeItemCollapsibleState.None, 'info'));
            items.push(new StatusItem('SSE Clients', String(status.sse_clients), vscode.TreeItemCollapsibleState.None, 'info'));
        }

        if (detect) {
            items.push(new StatusItem('Project', detect.name || '?', vscode.TreeItemCollapsibleState.None, 'info'));
            items.push(new StatusItem('Language', detect.primaryLanguage || '?', vscode.TreeItemCollapsibleState.None, 'info'));
            if (detect.frameworks?.length) {
                items.push(new StatusItem('Frameworks', detect.frameworks.join(', '), vscode.TreeItemCollapsibleState.None, 'info'));
            }
        }

        return items;
    }
}

class StatusItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        private value: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        private iconType: 'pass' | 'warning' | 'error' | 'info' = 'info',
    ) {
        super(label, collapsibleState);
        this.description = value;
        this.iconPath = new vscode.ThemeIcon(
            iconType === 'pass' ? 'check' :
            iconType === 'warning' ? 'warning' :
            iconType === 'error' ? 'error' :
            'info'
        );
    }
}

// ─── Services Tree ───────────────────────────────────────────────────────────

export class SynapseServicesProvider implements vscode.TreeDataProvider<ServiceItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ServiceItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private port: number) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: ServiceItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<ServiceItem[]> {
        const endpoints = await fetchJson(this.port, '/v1/project/endpoints');
        if (!endpoints) {
            return [new ServiceItem('Backend not running', '', 'warning')];
        }

        return endpoints.endpoints.map((ep: { method: string; path: string }) =>
            new ServiceItem(`${ep.method} ${ep.path}`, '', 'symbol-method')
        );
    }
}

class ServiceItem extends vscode.TreeItem {
    constructor(label: string, description: string, icon: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.iconPath = new vscode.ThemeIcon(icon);
    }
}

// ─── Events Tree ─────────────────────────────────────────────────────────────

export class SynapseEventsProvider implements vscode.TreeDataProvider<EventItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<EventItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private port: number) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: EventItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<EventItem[]> {
        const events = await fetchJson(this.port, '/debug/events?limit=20');
        if (!events || !Array.isArray(events)) {
            return [new EventItem('No events', '', 'info')];
        }

        return events.slice(0, 20).map((evt: any) => {
            const type = evt.type || 'unknown';
            const ts = evt.timestamp ? evt.timestamp.substring(11, 19) : '';
            const icon = type === 'error' ? 'error' :
                         type.startsWith('file-') ? 'file' :
                         type.startsWith('llm-') ? 'robot' :
                         type.startsWith('tool-') ? 'wrench' :
                         'circle-outline';
            return new EventItem(type, ts, icon);
        });
    }
}

class EventItem extends vscode.TreeItem {
    constructor(label: string, description: string, icon: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.iconPath = new vscode.ThemeIcon(icon);
    }
}
