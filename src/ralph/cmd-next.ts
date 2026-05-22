// ---------------------------------------------------------------------------
// `maestro ralph next` — load next pending step.
//
// Flow:
//   1. Resolve session (must be `running`)
//   2. Consistency check: active_step_index must be null (or point to a
//      completed step we can clear). Decision nodes are skipped — caller
//      (ralph-execute.md) handles those via Skill("maestro-ralph") handoff.
//   3. Pick next `status==pending` execution step.
//   4. Load command_path .md + required_reading (via skill-resolver).
//   5. Write status.json: active_step_index = N, step.status = "running",
//      step.load.* populated.
//   6. stdout: framed prompt block + completion protocol.
//
// Exit codes:
//   0 — printed a step
//   2 — no more pending steps; session may need completion
//   3 — refused due to active_step_index already held (caller must complete first)
//   1 — generic error (E007 missing required_reading, etc.)
// ---------------------------------------------------------------------------

import type { RalphSession, RalphStep, RalphStepLoad } from './status-schema.js';
import { RALPH_PROTOCOL_VERSION } from './status-schema.js';
import { resolveSession, writeStatus, workflowRoot } from './status-store.js';
import { checkStatus } from './status-checker.js';
import { hasErrors } from './cmd-check.js';
import { loadSkill } from './skill-resolver.js';

export interface NextCmdOptions {
  sessionId?: string;
}

export async function runNext(opts: NextCmdOptions): Promise<number> {
  const resolved = resolveSession(workflowRoot(), opts.sessionId);
  if (!resolved) {
    console.error('[ralph next] no ralph-* session found');
    return 1;
  }
  const { sessionId, statusPath, data } = resolved;

  if (data.status !== 'running') {
    console.error(`[ralph next] session is "${data.status}", not running — edit status.json to resume`);
    return 1;
  }

  // E-level prerequisites — refuse if any.
  const findings = checkStatus(data);
  if (hasErrors(findings)) {
    console.error('[ralph next] status.json has errors:');
    for (const f of findings) {
      if (f.level !== 'E') continue;
      const loc = f.step_index !== undefined ? ` [step ${f.step_index}]` : '';
      console.error(`  ${f.code}${loc}: ${f.message}`);
    }
    console.error('  → edit status.json manually, then retry');
    return 1;
  }

  // Auto-clear stale active_step_index pointing to a completed step (W005).
  if (data.active_step_index !== null && data.active_step_index !== undefined) {
    const cur = data.steps[data.active_step_index];
    if (cur && cur.status === 'completed') {
      data.active_step_index = null;
    } else {
      console.error(`[ralph next] step ${data.active_step_index} is still active (status=${cur?.status})`);
      console.error(`  → run: maestro ralph complete ${data.active_step_index} --status DONE|...`);
      console.error('    or:  maestro ralph retry ' + data.active_step_index);
      return 3;
    }
  }

  // Pick next pending execution step (skip decision nodes — those are handed
  // back to /maestro-ralph by ralph-execute.md, not loaded by this CLI).
  const next = data.steps.find(s => s.status === 'pending' && !s.decision);
  if (!next) {
    // All execution steps done. Surface decision nodes as a hint.
    const pendingDecision = data.steps.find(s => s.status === 'pending' && s.decision);
    if (pendingDecision) {
      console.error(`[ralph next] no pending execution step; next is a decision node: ${pendingDecision.decision}`);
      console.error('  → ralph-execute should hand off to /maestro-ralph for evaluation');
      return 2;
    }
    console.error('[ralph next] no pending steps — all complete');
    return 2;
  }

  // Validate command_path one more time at load time.
  if (!next.command_path) {
    console.error(`[ralph next] step ${next.index} has no command_path (skill="${next.skill}")`);
    return 1;
  }

  let loaded: ReturnType<typeof loadSkill>;
  try {
    loaded = loadSkill(next.command_path);
  } catch (err) {
    console.error(`[ralph next] ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // Persist load record + mark running.
  const now = new Date().toISOString();
  const loadRecord: RalphStepLoad = {
    loaded_at: now,
    required_files: loaded.requiredPaths,
    deferred_files: loaded.deferredPaths,
    resolve_version: '1',
  };
  next.load = loadRecord;
  next.deferred_reads = loaded.deferredPaths;
  next.status = 'running';
  data.active_step_index = next.index;
  data.ralph_protocol_version = data.ralph_protocol_version ?? RALPH_PROTOCOL_VERSION;
  writeStatus(statusPath, data);

  // stdout: framed prompt
  emitPrompt(sessionId, data, next, loaded);
  return 0;
}

function emitPrompt(
  sessionId: string,
  session: RalphSession,
  step: RalphStep,
  loaded: ReturnType<typeof loadSkill>,
): void {
  const total = session.steps.length;
  const idx = step.index;
  const scope = step.command_scope ?? 'unknown';
  const args = (step.args ?? '').trim();
  const argsHint = args ? `  args: ${args}` : '';

  const out: string[] = [];
  out.push('===== MAESTRO RALPH NEXT =====');
  out.push(`session: ${sessionId}`);
  out.push(`step:    [${idx}/${total}] ${step.skill} [${scope}]${argsHint}`);
  out.push(`active_step_index: ${idx}`);
  out.push(`loaded:  required=${loaded.requiredPaths.length}  deferred=${loaded.deferredPaths.length}`);
  out.push(`===== BEGIN COMMAND .md (${step.command_path}) =====`);
  out.push(loaded.body);
  for (const req of loaded.requiredBodies) {
    out.push(`===== BEGIN REQUIRED: ${req.path} =====`);
    out.push(req.content);
    out.push('===== END REQUIRED =====');
  }
  if (loaded.deferredPaths.length > 0) {
    out.push('===== DEFERRED MANIFEST =====');
    for (const p of loaded.deferredPaths) out.push(`- ${p}`);
  }
  out.push('===== COMPLETION PROTOCOL =====');
  out.push('On finish, run exactly one of:');
  out.push(`  maestro ralph complete ${idx} --status DONE [--evidence <path>]`);
  out.push(`  maestro ralph complete ${idx} --status DONE_WITH_CONCERNS --concerns "..."`);
  out.push(`  maestro ralph retry ${idx}`);
  out.push(`  maestro ralph complete ${idx} --status BLOCKED --reason "<external blocker>"`);
  out.push('Statuses: DONE | DONE_WITH_CONCERNS | NEEDS_RETRY | BLOCKED');
  out.push('===== END =====');
  process.stdout.write(out.join('\n') + '\n');
}
