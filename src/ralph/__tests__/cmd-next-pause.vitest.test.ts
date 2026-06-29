// R7-2 regression: an E-level prerequisite (invariant 8) must PAUSE the session,
// not leave it "running" and return 1 (which lets a goal-loop retry forever).
// Mirrors the BLOCKED pause in cmd-complete.ts.

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runNext } from '../cmd-next.js';

describe('runNext — E-level prerequisite pauses session (invariant 8, R7-2)', () => {
  const sessionId = 'maestro-test-e007';
  let tmpRoot: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    tmpRoot = mkdtempSync(join(tmpdir(), 'ralph-pause-'));
    const sessDir = join(tmpRoot, '.workflow', '.maestro', sessionId);
    mkdirSync(sessDir, { recursive: true });
    const status = {
      session_id: sessionId,
      status: 'running',
      active_step_index: null,
      // execution step with no command_path → checkStatus emits E006 (E-level)
      steps: [
        { index: 0, stage: 'execute', status: 'pending', skill: 'x', command_path: null, decision: null },
      ],
    };
    writeFileSync(join(sessDir, 'status.json'), JSON.stringify(status, null, 2));
    process.chdir(tmpRoot);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('sets status="paused" and returns 1 instead of looping on the error', async () => {
    const code = await runNext({ sessionId });
    expect(code).toBe(1);

    const after = JSON.parse(
      readFileSync(join(tmpRoot, '.workflow', '.maestro', sessionId, 'status.json'), 'utf-8'),
    );
    expect(after.status).toBe('paused'); // invariant 8 — not left "running"
    expect(after.active_step_index).toBe(null);
  });
});
