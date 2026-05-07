import * as vscode from 'vscode';
import * as service from './mutagenService';
import { MutagenSessionProvider, MutagenTreeItem } from './sessionTreeProvider';

let refreshTimer: ReturnType<typeof setInterval> | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const provider = new MutagenSessionProvider();

    const treeView = vscode.window.createTreeView('mutagenSessions', {
        treeDataProvider: provider,
        showCollapseAll: false,
    });

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.command = 'mutagenSessions.focus';
    statusBar.text = '$(sync~spin) mutagen';
    statusBar.tooltip = 'Mutagen Sync';
    statusBar.show();

    context.subscriptions.push(treeView, statusBar);

    const configPath = vscode.workspace.getConfiguration('mutagen').get<string>('binaryPath', '');
    let mutagenPath = configPath.trim() || await service.findMutagenPath();

    if (!mutagenPath) {
        statusBar.text = '$(error) mutagen: not found';
        statusBar.tooltip = 'mutagen binary not found in PATH. Set mutagen.binaryPath in settings.';
        statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        provider.update([], 'mutagen binary not found in PATH');
        return;
    }

    function getHiddenNames(): Set<string> {
        return new Set(context.workspaceState.get<string[]>('hiddenSessions', []));
    }

    async function setHiddenNames(names: Set<string>): Promise<void> {
        await context.workspaceState.update('hiddenSessions', [...names]);
    }

    async function refresh(): Promise<void> {
        try {
            const sessions = await service.listSessions(mutagenPath as string);
            const hidden = getHiddenNames();
            provider.update(sessions, undefined, hidden);
            const visible = sessions.filter(s => !hidden.has(s.name));
            updateStatusBar(statusBar, visible);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const clean = msg.replace(/^Command failed: .*\n/, '').trim();
            provider.update([], clean);
            statusBar.text = '$(error) mutagen';
            statusBar.tooltip = clean;
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('mutagen.refresh', () => refresh()),

        vscode.commands.registerCommand('mutagen.pauseSession', async (item: MutagenTreeItem) => {
            if (item?.data.type !== 'session') return;
            try {
                await service.pauseSession(mutagenPath as string, item.data.session.name);
            } catch (err: unknown) {
                vscode.window.showErrorMessage(`Pause failed: ${err instanceof Error ? err.message : err}`);
            }
            await refresh();
        }),

        vscode.commands.registerCommand('mutagen.resumeSession', async (item: MutagenTreeItem) => {
            if (item?.data.type !== 'session') return;
            try {
                await service.resumeSession(mutagenPath as string, item.data.session.name);
            } catch (err: unknown) {
                vscode.window.showErrorMessage(`Resume failed: ${err instanceof Error ? err.message : err}`);
            }
            await refresh();
        }),

        vscode.commands.registerCommand('mutagen.flushSession', async (item: MutagenTreeItem) => {
            if (item?.data.type !== 'session') return;
            try {
                await service.flushSession(mutagenPath as string, item.data.session.name);
            } catch (err: unknown) {
                vscode.window.showErrorMessage(`Flush failed: ${err instanceof Error ? err.message : err}`);
                await refresh();
                return;
            }
            await refresh();
        }),

        vscode.commands.registerCommand('mutagen.terminateSession', async (item: MutagenTreeItem) => {
            if (item?.data.type !== 'session') return;
            const name = item.data.session.name;
            const confirm = vscode.workspace.getConfiguration('mutagen').get<boolean>('confirmTerminate', true);
            if (confirm) {
                const answer = await vscode.window.showWarningMessage(
                    `Terminate mutagen session "${name}"? This cannot be undone.`,
                    { modal: true },
                    'Terminate'
                );
                if (answer !== 'Terminate') return;
            }
            try {
                await service.terminateSession(mutagenPath as string, name);
                const hidden = getHiddenNames();
                hidden.delete(name);
                await setHiddenNames(hidden);
            } catch (err: unknown) {
                vscode.window.showErrorMessage(`Terminate failed: ${err instanceof Error ? err.message : err}`);
            }
            await refresh();
        }),

        vscode.commands.registerCommand('mutagen.hideSession', async (item: MutagenTreeItem) => {
            if (item?.data.type !== 'session') return;
            const hidden = getHiddenNames();
            hidden.add(item.data.session.name);
            await setHiddenNames(hidden);
            await refresh();
        }),

        vscode.commands.registerCommand('mutagen.unhideSession', async (item: MutagenTreeItem) => {
            if (item?.data.type !== 'session') return;
            const hidden = getHiddenNames();
            hidden.delete(item.data.session.name);
            await setHiddenNames(hidden);
            await refresh();
        }),

        vscode.commands.registerCommand('mutagen.pauseAll', async () => {
            try {
                const sessions = await service.listSessions(mutagenPath as string);
                const active = sessions.filter(s => s.status === 'watching' || s.status === 'syncing' || s.status === 'connecting');
                await Promise.all(active.map(s => service.pauseSession(mutagenPath as string, s.name)));
            } catch (err: unknown) {
                vscode.window.showErrorMessage(`Pause all failed: ${err instanceof Error ? err.message : err}`);
            }
            await refresh();
        }),

        vscode.commands.registerCommand('mutagen.resumeAll', async () => {
            try {
                const sessions = await service.listSessions(mutagenPath as string);
                const inactive = sessions.filter(s => s.status === 'paused' || s.status === 'halted' || s.status === 'disconnected');
                await Promise.all(inactive.map(s => service.resumeSession(mutagenPath as string, s.name)));
            } catch (err: unknown) {
                vscode.window.showErrorMessage(`Resume all failed: ${err instanceof Error ? err.message : err}`);
            }
            await refresh();
        }),

        vscode.commands.registerCommand('mutagen.unhideAll', async () => {
            await setHiddenNames(new Set());
            await refresh();
        }),

        vscode.commands.registerCommand('mutagen.pauseAllHidden', async () => {
            const hidden = getHiddenNames();
            try {
                const sessions = await service.listSessions(mutagenPath as string);
                const active = sessions.filter(s => hidden.has(s.name) && (s.status === 'watching' || s.status === 'syncing' || s.status === 'connecting'));
                await Promise.all(active.map(s => service.pauseSession(mutagenPath as string, s.name)));
            } catch (err: unknown) {
                vscode.window.showErrorMessage(`Pause hidden failed: ${err instanceof Error ? err.message : err}`);
            }
            await refresh();
        }),

        vscode.commands.registerCommand('mutagen.resumeAllHidden', async () => {
            const hidden = getHiddenNames();
            try {
                const sessions = await service.listSessions(mutagenPath as string);
                const inactive = sessions.filter(s => hidden.has(s.name) && (s.status === 'paused' || s.status === 'halted' || s.status === 'disconnected'));
                await Promise.all(inactive.map(s => service.resumeSession(mutagenPath as string, s.name)));
            } catch (err: unknown) {
                vscode.window.showErrorMessage(`Resume hidden failed: ${err instanceof Error ? err.message : err}`);
            }
            await refresh();
        }),

        vscode.commands.registerCommand('mutagen.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', '@ext:ksemele.mutagen-sync');
        }),

        vscode.workspace.onDidChangeConfiguration(async e => {
            if (e.affectsConfiguration('mutagen')) {
                const newPath = vscode.workspace.getConfiguration('mutagen').get<string>('binaryPath', '');
                mutagenPath = newPath.trim() || await service.findMutagenPath();
                scheduleAutoRefresh();
                await refresh();
            }
        }),
    );

    function scheduleAutoRefresh(): void {
        if (refreshTimer) clearInterval(refreshTimer);
        const intervalSec = vscode.workspace.getConfiguration('mutagen').get<number>('refreshInterval', 10);
        refreshTimer = setInterval(refresh, Math.max(3, intervalSec) * 1000);
    }

    context.subscriptions.push({ dispose: () => { if (refreshTimer) clearInterval(refreshTimer); } });

    await refresh();
    scheduleAutoRefresh();
}

function updateStatusBar(bar: vscode.StatusBarItem, sessions: service.SyncSession[]): void {
    bar.backgroundColor = undefined;
    bar.color = undefined;

    if (sessions.length === 0) {
        bar.text = '$(sync) mutagen';
        bar.tooltip = 'No Mutagen sessions';
        return;
    }

    const ok      = sessions.filter(s => s.status === 'watching').length;
    const syncing = sessions.filter(s => s.status === 'syncing' || s.status === 'connecting').length;
    const paused  = sessions.filter(s => s.status === 'paused').length;
    const error   = sessions.filter(s => s.status === 'halted' || s.status === 'disconnected').length;

    if (error > 0) {
        bar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    bar.tooltip = sessions.map(s => `${s.name}: ${s.statusText}`).join('\n');

    let icon: string;
    if (error > 0)       { icon = '$(error)'; }
    else if (syncing > 0) { icon = '$(sync~spin)'; }
    else if (paused > 0 && ok === 0) { icon = '$(debug-pause)'; }
    else                  { icon = '$(check)'; }

    const cfg = vscode.workspace.getConfiguration('mutagen');
    const showCounts = cfg.get<boolean>('showSessionCounts', true);
    const suffix = showCounts ? ` ${ok}/${sessions.length}` : '';
    bar.text = `${icon} mutagen${suffix}`;

    if (cfg.get<boolean>('statusBarColorByStatus', false)) {
        bar.color =
            error   > 0                  ? new vscode.ThemeColor('errorForeground') :
            syncing + paused > 0         ? new vscode.ThemeColor('charts.yellow') :
                                           new vscode.ThemeColor('charts.green');
    }
}

export function deactivate(): void {
    if (refreshTimer) clearInterval(refreshTimer);
}
