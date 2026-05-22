// ---------------------------------------------------------------------------
// Status store — locates ralph session dir and reads/writes status.json.
// Atomic write via `.tmp` + rename so a crash never leaves a partial file.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { RalphSession } from './status-schema.js';

export interface ResolvedSession {
  sessionId: string;
  sessionDir: string;       // absolute
  statusPath: string;       // absolute
  data: RalphSession;
}

function ralphRoot(workflowRoot: string): string {
  return join(workflowRoot, '.workflow', '.maestro');
}

/** List all ralph-* session directories sorted by mtime DESC. */
export function listRalphSessions(workflowRoot: string): string[] {
  const root = ralphRoot(workflowRoot);
  if (!existsSync(root)) return [];
  const entries: Array<{ name: string; mtimeMs: number }> = [];
  for (const name of readdirSync(root)) {
    if (!name.startsWith('ralph-')) continue;
    const full = join(root, name);
    try {
      const st = statSync(full);
      if (st.isDirectory()) entries.push({ name, mtimeMs: st.mtimeMs });
    } catch { /* ignore */ }
  }
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return entries.map(e => e.name);
}

/**
 * Resolve a ralph session: by explicit id, or the latest running one.
 * Returns null when nothing matches — callers decide how to surface.
 */
export function resolveSession(
  workflowRoot: string,
  sessionId?: string,
  opts: { requireRunning?: boolean } = {},
): ResolvedSession | null {
  const root = ralphRoot(workflowRoot);
  if (sessionId) {
    const statusPath = join(root, sessionId, 'status.json');
    if (!existsSync(statusPath)) return null;
    const data = readStatus(statusPath);
    return { sessionId, sessionDir: join(root, sessionId), statusPath, data };
  }
  for (const name of listRalphSessions(workflowRoot)) {
    const statusPath = join(root, name, 'status.json');
    if (!existsSync(statusPath)) continue;
    try {
      const data = readStatus(statusPath);
      if (opts.requireRunning && data.status !== 'running') continue;
      return { sessionId: name, sessionDir: join(root, name), statusPath, data };
    } catch { /* skip corrupt */ }
  }
  return null;
}

function readStatus(statusPath: string): RalphSession {
  const raw = readFileSync(statusPath, 'utf-8');
  return JSON.parse(raw) as RalphSession;
}

/** Atomic write: stage to `.tmp`, then rename. */
export function writeStatus(statusPath: string, data: RalphSession): void {
  const tmp = `${statusPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  renameSync(tmp, statusPath);
}

export function workflowRoot(): string {
  return resolve(process.cwd());
}
