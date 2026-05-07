import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type SessionStatus =
    | 'watching'
    | 'syncing'
    | 'paused'
    | 'halted'
    | 'disconnected'
    | 'connecting'
    | 'unknown';

export interface SyncSession {
    name: string;
    identifier: string;
    alphaUrl: string;
    alphaConnected: boolean;
    betaUrl: string;
    betaConnected: boolean;
    statusText: string;
    status: SessionStatus;
    lastError?: string;
    conflicts: string[];
}

function categorizeStatus(text: string): SessionStatus {
    const t = text.toLowerCase();
    if (t.includes('watching')) return 'watching';
    if (t.includes('paused')) return 'paused';
    if (t.includes('halted')) return 'halted';
    if (t.includes('disconnected')) return 'disconnected';
    if (t.includes('connecting')) return 'connecting';
    if (
        t.includes('staging') || t.includes('reconciling') || t.includes('scanning') ||
        t.includes('applying') || t.includes('saving') || t.includes('waiting')
    ) return 'syncing';
    return 'unknown';
}

function parseSessionBlock(block: string): SyncSession | null {
    const lines = block.split('\n');
    const session: Partial<SyncSession> & { conflicts: string[] } = { conflicts: [] };
    let section: 'root' | 'alpha' | 'beta' | 'conflicts' = 'root';

    for (const line of lines) {
        const trimmed = line.trimEnd();
        if (!trimmed.trim()) continue;

        const isRootLevel = !line.startsWith('\t') && !line.startsWith('  ');

        if (isRootLevel) {
            const t = trimmed.trim();
            if (t === 'Alpha:') { section = 'alpha'; continue; }
            if (t === 'Beta:') { section = 'beta'; continue; }
            if (t === 'Conflicts:') { section = 'conflicts'; continue; }

            // Reset section for any other root-level field
            section = 'root';

            if (t.startsWith('Name:')) {
                session.name = t.slice('Name:'.length).trim();
            } else if (t.startsWith('Identifier:')) {
                session.identifier = t.slice('Identifier:'.length).trim();
            } else if (t.startsWith('Status:')) {
                session.statusText = t.slice('Status:'.length).trim();
            } else if (t.startsWith('Last error:')) {
                session.lastError = t.slice('Last error:'.length).trim();
            }
        } else {
            // Indented line — belongs to current section
            const t = trimmed.trim();
            if (section === 'alpha' || section === 'beta') {
                if (t.startsWith('URL:')) {
                    const url = t.slice('URL:'.length).trim();
                    if (section === 'alpha') session.alphaUrl = url;
                    else session.betaUrl = url;
                } else if (t.startsWith('Connected:')) {
                    const connected = t.slice('Connected:'.length).trim() === 'Yes';
                    if (section === 'alpha') session.alphaConnected = connected;
                    else session.betaConnected = connected;
                }
            } else if (section === 'conflicts') {
                // Only capture top-level conflict lines (single indent)
                if (line.startsWith('\t') && !line.startsWith('\t\t')) {
                    session.conflicts.push(t);
                }
            }
        }
    }

    if (!session.name) return null;

    return {
        name: session.name,
        identifier: session.identifier ?? '',
        alphaUrl: session.alphaUrl ?? '',
        alphaConnected: session.alphaConnected ?? false,
        betaUrl: session.betaUrl ?? '',
        betaConnected: session.betaConnected ?? false,
        statusText: session.statusText ?? 'Unknown',
        status: categorizeStatus(session.statusText ?? ''),
        lastError: session.lastError,
        conflicts: session.conflicts,
    };
}

export async function listSessions(mutagenPath: string): Promise<SyncSession[]> {
    const { stdout } = await execAsync(`"${mutagenPath}" sync list`);
    const output = stdout.trim();

    if (!output || /^No sessions found/i.test(output)) return [];

    const parts = output.split(/^-{10,}$/m).map(s => s.trim()).filter(Boolean);
    return parts.map(parseSessionBlock).filter((s): s is SyncSession => s !== null);
}

export async function pauseSession(mutagenPath: string, name: string): Promise<void> {
    await execAsync(`"${mutagenPath}" sync pause "${name}"`);
}

export async function resumeSession(mutagenPath: string, name: string): Promise<void> {
    await execAsync(`"${mutagenPath}" sync resume "${name}"`);
}

export async function flushSession(mutagenPath: string, name: string): Promise<void> {
    await execAsync(`"${mutagenPath}" sync flush "${name}"`);
}

export async function terminateSession(mutagenPath: string, name: string): Promise<void> {
    await execAsync(`"${mutagenPath}" sync terminate "${name}"`);
}

export async function findMutagenPath(): Promise<string | null> {
    try {
        const cmd = process.platform === 'win32' ? 'where mutagen' : 'which mutagen';
        const { stdout } = await execAsync(cmd);
        const found = stdout.trim().split('\n')[0].trim();
        if (found) return found;
    } catch { /* ignore */ }

    for (const p of ['/opt/homebrew/bin/mutagen', '/usr/local/bin/mutagen', '/usr/bin/mutagen']) {
        try {
            await execAsync(`"${p}" version`);
            return p;
        } catch { /* ignore */ }
    }

    return null;
}
