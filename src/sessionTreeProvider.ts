import * as vscode from 'vscode';
import * as path from 'path';
import { SyncSession, SessionStatus, ProjectInfo, partitionSessions, discoverProjects } from './mutagenService';

/** running-* variants say whether the project's sessions are active, paused, or a mix — drives Pause/Resume buttons. */
export type ProjectState = 'running-active' | 'running-paused' | 'running-mixed' | 'stopped' | 'stale';

type ItemData =
    | { type: 'session'; session: SyncSession; hidden: boolean }
    | { type: 'detail'; label: string; icon: string; color?: string }
    | { type: 'message'; text: string; icon: string }
    | { type: 'group'; kind: 'hidden' | 'other'; label: string; icon: string; sessions: SyncSession[] }
    /** `sessions` are all sessions of the project, hidden ones included; `allHidden` drives the eye button. */
    | { type: 'project'; project: ProjectInfo; state: ProjectState; sessions: SyncSession[]; allHidden: boolean };

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
            // 'group' keeps the existing Hidden Sessions menus; 'group-other' has no inline actions
            this.contextValue = data.kind === 'hidden' ? 'group' : 'group-other';
        } else if (data.type === 'project') {
            const p = data.project;
            const file = path.basename(p.projectFile);
            this.label = p.name;
            this.description = data.allHidden ? `[hidden] ${file}` : file;
            this.collapsibleState = data.allHidden
                ? vscode.TreeItemCollapsibleState.None
                : vscode.TreeItemCollapsibleState.Expanded;
            this.iconPath = new vscode.ThemeIcon('root-folder');
            // Same convention as sessions: `-hidden` suffix on top of the state
            this.contextValue = `project-${data.state}${data.allHidden ? '-hidden' : ''}`;
            this.tooltip = buildProjectTooltip(p, data.state, data.sessions.length);
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

function buildProjectTooltip(p: ProjectInfo, state: ProjectState, sessionCount: number): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${p.name}** — \`${p.projectFile}\`\n\n`);
    const n = `${sessionCount} session${sessionCount === 1 ? '' : 's'}`;
    switch (state) {
        case 'running-active': md.appendMarkdown(`Running: ${n}`); break;
        case 'running-paused': md.appendMarkdown(`Paused: ${n}`); break;
        case 'running-mixed':  md.appendMarkdown(`Partially paused: ${n}`); break;
        case 'stopped': md.appendMarkdown('Not started'); break;
        case 'stale':   md.appendMarkdown('Lock file present but no sessions — terminate to clean up, then start'); break;
    }
    return md;
}

function projectState(p: ProjectInfo, sessions: SyncSession[]): ProjectState {
    if (!p.lockedId) return 'stopped';
    if (sessions.length === 0) return 'stale';
    const active = sessions.filter(s => s.status === 'watching' || s.status === 'syncing' || s.status === 'connecting').length;
    if (active === sessions.length) return 'running-active';
    if (active === 0) return 'running-paused';
    return 'running-mixed';
}

export class MutagenSessionProvider implements vscode.TreeDataProvider<MutagenTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<MutagenTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private sessions: SyncSession[] = [];
    private errorMessage: string | null = null;
    private hiddenNames: Set<string> = new Set();
    private folders: string[] = [];
    private projects: ProjectInfo[] = [];

    update(
        sessions: SyncSession[],
        error?: string,
        hidden?: Set<string>,
        folders?: string[],
        projects?: ProjectInfo[],
    ): void {
        this.sessions = sessions;
        this.errorMessage = error ?? null;
        this.hiddenNames = hidden ?? new Set();
        this.folders = folders ?? [];
        this.projects = projects ?? [];
        this._onDidChangeTreeData.fire();
    }

    /** Sessions of a project: those carrying its locked id (hidden ones included). */
    private projectSessions(p: ProjectInfo, pool: SyncSession[]): SyncSession[] {
        if (!p.lockedId) return [];
        return pool.filter(s => s.projectId === p.lockedId);
    }

    private isHidden = (s: SyncSession): boolean => this.hiddenNames.has(s.name);

    /** Project nodes for `projects` followed by the sessions in `pool` that belong to none of them. */
    private projectsAndLoose(projects: ProjectInfo[], pool: SyncSession[]): MutagenTreeItem[] {
        const items: MutagenTreeItem[] = [];
        const inProject = new Set<string>();
        for (const p of projects) {
            const own = this.projectSessions(p, pool);
            own.forEach(s => inProject.add(s.name));
            items.push(new MutagenTreeItem({
                type: 'project', project: p, state: projectState(p, own), sessions: own,
                allHidden: own.length > 0 && own.every(this.isHidden),
            }));
        }
        for (const s of pool) {
            if (inProject.has(s.name) || this.isHidden(s)) continue;
            items.push(new MutagenTreeItem({ type: 'session', session: s, hidden: false }));
        }
        return items;
    }

    getTreeItem(element: MutagenTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MutagenTreeItem): MutagenTreeItem[] {
        if (!element) {
            if (this.errorMessage) {
                return [new MutagenTreeItem({ type: 'message', text: this.errorMessage, icon: 'error' })];
            }
            if (this.sessions.length === 0 && this.projects.length === 0) {
                return [new MutagenTreeItem({ type: 'message', text: 'No sessions', icon: 'info' })];
            }

            const { workspace, other } = partitionSessions(this.sessions, this.folders, this.projects);

            // Project nodes first, then workspace sessions that don't belong to a project
            const items = this.projectsAndLoose(this.projects, workspace);

            // Other Sessions: always collapsed; disappears once every session in it is hidden
            const otherVisible = other.filter(s => !this.isHidden(s));
            if (otherVisible.length > 0) {
                items.push(new MutagenTreeItem({
                    type: 'group', kind: 'other', label: `Other Sessions (${otherVisible.length})`,
                    icon: 'folder-library', sessions: otherVisible,
                }));
            }

            if (this.sessions.some(this.isHidden)) {
                items.push(new MutagenTreeItem({
                    type: 'group', kind: 'hidden', label: 'Hidden Sessions', icon: 'eye-closed',
                    sessions: this.sessions.filter(this.isHidden),
                }));
            }
            return items;
        }

        if (element.data.type === 'group') {
            if (element.data.kind === 'hidden') {
                return element.data.sessions.map(s => new MutagenTreeItem({ type: 'session', session: s, hidden: true }));
            }
            // Other Sessions mirrors the top level: project nodes (located via their lock files), then loose sessions
            return this.projectsAndLoose(discoverProjects(element.data.sessions, this.projects), element.data.sessions);
        }

        if (element.data.type === 'project') {
            return element.data.sessions
                .filter(s => !this.isHidden(s))
                .map(s => new MutagenTreeItem({ type: 'session', session: s, hidden: false }));
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
