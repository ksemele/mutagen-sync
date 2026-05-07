import * as vscode from 'vscode';
import { SyncSession, SessionStatus } from './mutagenService';

type ItemData =
    | { type: 'session'; session: SyncSession; hidden: boolean }
    | { type: 'detail'; label: string; icon: string; color?: string }
    | { type: 'message'; text: string; icon: string }
    | { type: 'group'; label: string; icon: string };

export class MutagenTreeItem extends vscode.TreeItem {
    constructor(public readonly data: ItemData) {
        super('');
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;

        if (data.type === 'session') {
            const s = data.session;
            const colored = vscode.workspace.getConfiguration('mutagen').get<boolean>('coloredIcons', true);
            this.label = s.name;
            this.description = data.hidden ? `[hidden] ${s.statusText}` : s.statusText;
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.iconPath = statusIcon(s.status, colored);
            this.contextValue = sessionContextValue(s, data.hidden);
            this.tooltip = buildTooltip(s);
        } else if (data.type === 'detail') {
            this.label = data.label;
            this.iconPath = new vscode.ThemeIcon(
                data.icon,
                data.color ? new vscode.ThemeColor(data.color) : undefined
            );
        } else if (data.type === 'group') {
            this.label = data.label;
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.iconPath = new vscode.ThemeIcon(data.icon);
            this.contextValue = 'group';
        } else {
            this.label = data.text;
            this.iconPath = new vscode.ThemeIcon(data.icon);
        }
    }
}

function statusIcon(status: SessionStatus, colored: boolean): vscode.ThemeIcon {
    if (!colored) {
        switch (status) {
            case 'watching':     return new vscode.ThemeIcon('check');
            case 'syncing':      return new vscode.ThemeIcon('sync~spin');
            case 'paused':       return new vscode.ThemeIcon('debug-pause');
            case 'connecting':   return new vscode.ThemeIcon('loading~spin');
            case 'halted':
            case 'disconnected': return new vscode.ThemeIcon('error');
            default:             return new vscode.ThemeIcon('question');
        }
    }
    switch (status) {
        case 'watching':     return new vscode.ThemeIcon('check',       new vscode.ThemeColor('charts.green'));
        case 'syncing':      return new vscode.ThemeIcon('sync~spin');
        case 'paused':       return new vscode.ThemeIcon('debug-pause', new vscode.ThemeColor('charts.yellow'));
        case 'connecting':   return new vscode.ThemeIcon('loading~spin');
        case 'halted':
        case 'disconnected': return new vscode.ThemeIcon('error',       new vscode.ThemeColor('errorForeground'));
        default:             return new vscode.ThemeIcon('question');
    }
}

function sessionContextValue(s: SyncSession, hidden: boolean): string {
    let base: string;
    switch (s.status) {
        case 'watching':
        case 'syncing':
        case 'connecting': base = 'session-active'; break;
        case 'paused':     base = 'session-paused'; break;
        case 'halted':
        case 'disconnected': base = 'session-error'; break;
        default:           base = 'session-unknown';
    }
    return hidden ? `${base}-hidden` : base;
}

function buildTooltip(s: SyncSession): vscode.MarkdownString {
    const cfg = vscode.workspace.getConfiguration('mutagen');
    const aLabel = cfg.get<string>('alphaLabel', 'α');
    const bLabel = cfg.get<string>('betaLabel', 'β');
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${s.name}**\n\n`);
    md.appendMarkdown(`Status: ${s.statusText}\n\n`);
    md.appendMarkdown(`${aLabel}: \`${s.alphaUrl}\` ${s.alphaConnected ? '✓' : '✗'}\n\n`);
    md.appendMarkdown(`${bLabel}: \`${s.betaUrl}\` ${s.betaConnected ? '✓' : '✗'}\n\n`);
    if (s.lastError) md.appendMarkdown(`⚠ ${s.lastError}`);
    return md;
}

export class MutagenSessionProvider implements vscode.TreeDataProvider<MutagenTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<MutagenTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private sessions: SyncSession[] = [];
    private errorMessage: string | null = null;
    private hiddenNames: Set<string> = new Set();

    update(sessions: SyncSession[], error?: string, hidden?: Set<string>): void {
        this.sessions = sessions;
        this.errorMessage = error ?? null;
        this.hiddenNames = hidden ?? new Set();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: MutagenTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MutagenTreeItem): MutagenTreeItem[] {
        if (!element) {
            if (this.errorMessage) {
                return [new MutagenTreeItem({ type: 'message', text: this.errorMessage, icon: 'error' })];
            }
            if (this.sessions.length === 0) {
                return [new MutagenTreeItem({ type: 'message', text: 'No sessions', icon: 'info' })];
            }

            const visible = this.sessions.filter(s => !this.hiddenNames.has(s.name));
            const hidden  = this.sessions.filter(s =>  this.hiddenNames.has(s.name));

            const items: MutagenTreeItem[] = visible.map(
                s => new MutagenTreeItem({ type: 'session', session: s, hidden: false })
            );
            if (hidden.length > 0) {
                items.push(new MutagenTreeItem({ type: 'group', label: 'Hidden Sessions', icon: 'eye-closed' }));
            }
            return items;
        }

        if (element.data.type === 'group') {
            return this.sessions
                .filter(s => this.hiddenNames.has(s.name))
                .map(s => new MutagenTreeItem({ type: 'session', session: s, hidden: true }));
        }

        if (element.data.type !== 'session') return [];
        const s = element.data.session;
        const items: MutagenTreeItem[] = [];

        const cfg = vscode.workspace.getConfiguration('mutagen');
        const aLabel = cfg.get<string>('alphaLabel', 'α');
        const bLabel = cfg.get<string>('betaLabel', 'β');

        items.push(new MutagenTreeItem({
            type: 'detail',
            label: `${aLabel}: ${s.alphaUrl}`,
            icon: s.alphaConnected ? 'circle-filled' : 'circle-outline',
            color: s.alphaConnected ? 'charts.green' : 'errorForeground',
        }));
        items.push(new MutagenTreeItem({
            type: 'detail',
            label: `${bLabel}: ${s.betaUrl}`,
            icon: s.betaConnected ? 'circle-filled' : 'circle-outline',
            color: s.betaConnected ? 'charts.green' : 'errorForeground',
        }));

        if (s.lastError) {
            items.push(new MutagenTreeItem({
                type: 'detail',
                label: s.lastError,
                icon: 'warning',
                color: 'charts.orange',
            }));
        }

        for (const conflict of s.conflicts) {
            items.push(new MutagenTreeItem({
                type: 'detail',
                label: conflict,
                icon: 'warning',
                color: 'charts.orange',
            }));
        }

        return items;
    }
}
