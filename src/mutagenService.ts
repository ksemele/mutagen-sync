import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

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
    /** Value of the `io.mutagen.project` label, set on sessions created by `mutagen project start`. */
    projectId?: string;
}

/** A `mutagen.yml` found in a workspace folder. */
export interface ProjectInfo {
    /** Workspace folder containing the project file. */
    folder: string;
    /** Display name — basename of the folder. */
    name: string;
    /** Absolute path to `mutagen.yml` / `mutagen.yaml`. */
    projectFile: string;
    /** Project identifier from `<projectFile>.lock`, or null when the project is not started. */
    lockedId: string | null;
}

const PROJECT_LABEL = 'io.mutagen.project';
const PROJECT_FILE_NAMES = ['mutagen.yml', 'mutagen.yaml'];

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
    let section: 'root' | 'alpha' | 'beta' | 'conflicts' | 'labels' = 'root';

    for (const line of lines) {
        const trimmed = line.trimEnd();
        if (!trimmed.trim()) continue;

        const isRootLevel = !line.startsWith('\t') && !line.startsWith('  ');

        if (isRootLevel) {
            const t = trimmed.trim();
            if (t === 'Alpha:') { section = 'alpha'; continue; }
            if (t === 'Beta:') { section = 'beta'; continue; }
            if (t === 'Conflicts:') { section = 'conflicts'; continue; }
            if (t === 'Labels:') { section = 'labels'; continue; }

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
            } else if (section === 'labels') {
                if (t.startsWith(PROJECT_LABEL + ':')) {
                    session.projectId = t.slice(PROJECT_LABEL.length + 1).trim();
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
        projectId: session.projectId,
    };
}

/** Parse the output of `mutagen sync list -l` into sessions. Exported for testing. */
export function parseSessionList(output: string): SyncSession[] {
    const trimmed = output.trim();
    if (!trimmed || /^No sessions found/i.test(trimmed)) return [];

    const parts = trimmed.split(/^-{10,}$/m).map(s => s.trim()).filter(Boolean);
    return parts.map(parseSessionBlock).filter((s): s is SyncSession => s !== null);
}

export async function listSessions(mutagenPath: string): Promise<SyncSession[]> {
    // `-l` (long) is required to get the Labels section, which carries the project id
    const { stdout } = await execAsync(`"${mutagenPath}" sync list -l`);
    return parseSessionList(stdout);
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

export async function projectStart(mutagenPath: string, project: ProjectInfo): Promise<void> {
    await execAsync(`"${mutagenPath}" project start -f "${project.projectFile}"`, { cwd: project.folder });
}

export async function projectPause(mutagenPath: string, project: ProjectInfo): Promise<void> {
    await execAsync(`"${mutagenPath}" project pause -f "${project.projectFile}"`, { cwd: project.folder });
}

export async function projectResume(mutagenPath: string, project: ProjectInfo): Promise<void> {
    await execAsync(`"${mutagenPath}" project resume -f "${project.projectFile}"`, { cwd: project.folder });
}

export async function projectTerminate(mutagenPath: string, project: ProjectInfo): Promise<void> {
    await execAsync(`"${mutagenPath}" project terminate -f "${project.projectFile}"`, { cwd: project.folder });
}

/** Look for a `mutagen.yml` in each workspace folder and read its lock file. */
export async function findProjects(folders: string[]): Promise<ProjectInfo[]> {
    const projects: ProjectInfo[] = [];
    for (const folder of folders) {
        for (const fileName of PROJECT_FILE_NAMES) {
            const projectFile = path.join(folder, fileName);
            if (!fs.existsSync(projectFile)) continue;
            let lockedId: string | null = null;
            try {
                const lock = fs.readFileSync(projectFile + '.lock', 'utf8').trim();
                if (lock) lockedId = lock;
            } catch { /* not started */ }
            projects.push({ folder, name: path.basename(folder), projectFile, lockedId });
            break;
        }
    }
    return projects;
}

/** True for a local filesystem endpoint URL (as opposed to SSH / docker / tunnel). */
function isLocalUrl(url: string): boolean {
    return url.startsWith('/') || url.startsWith('~') || /^[A-Za-z]:[\\/]/.test(url);
}

function isInsideFolder(url: string, folder: string): boolean {
    if (!isLocalUrl(url)) return false;
    const rel = path.relative(folder, url);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** A session belongs to the workspace if its project is locked in a workspace folder
 *  or one of its endpoints is a local path inside a workspace folder. */
export function isWorkspaceSession(s: SyncSession, folders: string[], projects: ProjectInfo[]): boolean {
    if (s.projectId && projects.some(p => p.lockedId === s.projectId)) return true;
    return folders.some(f => isInsideFolder(s.alphaUrl, f) || isInsideFolder(s.betaUrl, f));
}

/** Split sessions into those tied to the workspace and everything else.
 *  With no workspace folders open, every session counts as a workspace session. */
export function partitionSessions(
    sessions: SyncSession[],
    folders: string[],
    projects: ProjectInfo[],
): { workspace: SyncSession[]; other: SyncSession[] } {
    if (folders.length === 0) return { workspace: sessions, other: [] };
    const workspace: SyncSession[] = [];
    const other: SyncSession[] = [];
    for (const s of sessions) {
        (isWorkspaceSession(s, folders, projects) ? workspace : other).push(s);
    }
    return { workspace, other };
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
