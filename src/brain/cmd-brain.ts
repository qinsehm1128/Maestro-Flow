// ---------------------------------------------------------------------------
// `maestro brain` subcommand implementations — the deterministic engine the
// authored FSM (.claude/commands/maestro-brain.md) calls each round.
//
//   init     create a brain session + ledger.json
//   derive   print the decision-input snapshot (cursor, stop eval, router signals)
//   decide   run the A_DECIDE engine for a given reconciled round-signal
//   record   append a completed round to the ledger
//   status   human-readable session summary
//
// Data contract: `.workflow/.brain/brain-*/ledger.json`. Mirrors src/ralph.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StateJsonV2 } from '../utils/state-schema.js';
import { deriveBrainState } from './brain-derive.js';
import { type RoundSignal, applyBump, decide } from './brain-decide.js';
import {
  type ResolvedBrainSession,
  newLedger,
  resolveBrainSession,
  workflowRoot,
  writeLedger,
} from './brain-store.js';
import type { BrainRound } from './brain-schema.js';

function readState(root: string): StateJsonV2 | null {
  try {
    return JSON.parse(readFileSync(join(root, '.workflow', 'state.json'), 'utf-8')) as StateJsonV2;
  } catch {
    return null;
  }
}

function ts(now: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

export interface InitOpts { intent: string; autonomous: boolean; maxRounds?: number; now?: Date; }

export function runInit(opts: InitOpts): number {
  const intent = (opts.intent ?? '').trim();
  if (intent === '') {
    console.error('[brain init] empty intent — refuse to fabricate a roadmap from nothing');
    return 2;
  }
  const root = workflowRoot();
  const sessionId = `brain-${ts(opts.now ?? new Date())}`;
  const ledger = newLedger({ sessionId, intent, autonomous: opts.autonomous, maxRounds: opts.maxRounds });
  const ledgerPath = join(root, '.workflow', '.brain', sessionId, 'ledger.json');
  writeLedger(ledgerPath, ledger);
  console.log(JSON.stringify({ session_id: sessionId, ledger: ledgerPath, stop_condition: ledger.stop_condition }, null, 2));
  return 0;
}

function loadSession(sessionId?: string): { sess: ResolvedBrainSession; state: StateJsonV2 } | number {
  const root = workflowRoot();
  const sess = resolveBrainSession(root, sessionId);
  if (!sess) { console.error('[brain] no brain session found (run `maestro brain init` first)'); return 3; }
  const state = readState(root);
  if (!state) { console.error('[brain] no .workflow/state.json found'); return 3; }
  return { sess, state };
}

export function runDerive(opts: { sessionId?: string; json?: boolean }): number {
  const loaded = loadSession(opts.sessionId);
  if (typeof loaded === 'number') return loaded;
  const { sess, state } = loaded;
  const bs = deriveBrainState(state, sess.data.blockers);
  if (opts.json) { console.log(JSON.stringify(bs, null, 2)); return 0; }
  console.log(`cursor: ${bs.cursor ?? '(none — all resolved)'}`);
  console.log(`stop satisfied: ${bs.stop.satisfied} -> ${bs.stop.terminalStatus}`);
  console.log(`router: ${JSON.stringify(bs.router)}`);
  return 0;
}

/** Parse `--signal` CLI value into a RoundSignal. e.g. "roadmap-problem:export-semantics". */
export function parseSignal(raw: string | undefined): RoundSignal {
  const v = (raw ?? 'ok').trim();
  if (v === 'ok' || v === 'first-round' || v === 'result-problem' || v === 'unfixable-external') {
    return { kind: v } as RoundSignal;
  }
  if (v.startsWith('roadmap-problem')) {
    const issue = v.includes(':') ? v.slice(v.indexOf(':') + 1) : 'unspecified';
    return { kind: 'roadmap-problem', issue };
  }
  return { kind: 'ok' };
}

export function runDecide(opts: { sessionId?: string; signal?: string; json?: boolean }): number {
  const loaded = loadSession(opts.sessionId);
  if (typeof loaded === 'number') return loaded;
  const { sess, state } = loaded;
  const ledger = sess.data;
  const bs = deriveBrainState(state, ledger.blockers);
  const result = decide({
    stop: bs.stop,
    round: ledger.rounds.length + 1,
    maxRounds: ledger.max_rounds,
    autonomous: ledger.autonomous,
    cursorUnit: bs.cursor,
    signal: parseSignal(opts.signal),
    convergence: ledger.convergence,
  });
  if (opts.json) console.log(JSON.stringify({ cursor: bs.cursor, ...result }, null, 2));
  else console.log(`[round ${ledger.rounds.length + 1}] cursor=${bs.cursor} -> ${result.decision}${result.terminalStatus ? `(${result.terminalStatus})` : ''} :: ${result.reason}`);
  return 0;
}

export interface RecordOpts { sessionId?: string; round: BrainRound; }

export function runRecord(opts: RecordOpts): number {
  const loaded = loadSession(opts.sessionId);
  if (typeof loaded === 'number') return loaded;
  const { sess } = loaded;
  const ledger = sess.data;
  ledger.rounds.push(opts.round);
  // apply any bump declared by a prior decide so counters persist across rounds
  writeLedger(sess.ledgerPath, ledger);
  console.log(`[brain record] round ${opts.round.round} appended (${opts.round.decision})`);
  return 0;
}

export function runStatus(opts: { sessionId?: string }): number {
  const loaded = loadSession(opts.sessionId);
  if (typeof loaded === 'number') return loaded;
  const { sess, state } = loaded;
  const ledger = sess.data;
  const bs = deriveBrainState(state, ledger.blockers);
  console.log(`session: ${ledger.session_id}  status: ${ledger.status}  rounds: ${ledger.rounds.length}/${ledger.max_rounds}`);
  console.log(`cursor: ${bs.cursor ?? '(none)'}  stop: ${bs.stop.satisfied}`);
  console.log(`blockers: ${ledger.blockers.length}  deferred: ${ledger.deferred.length}`);
  return 0;
}

// re-export for callers/tests
export { applyBump };
