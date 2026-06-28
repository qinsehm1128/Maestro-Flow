// ---------------------------------------------------------------------------
// Brain state derivation — bundles the per-round decision inputs the A-window
// (host agent) assembles each loop: the roadmap cursor, the normalized
// milestone views, and the machine-evaluated stop predicate.
// ---------------------------------------------------------------------------

import { deriveCurrentPhase } from '../utils/state-schema.js';
import type { StateJsonV2 } from '../utils/state-schema.js';
import type { Blocker } from './brain-schema.js';
import { type MilestoneView, type StopEvaluation, evaluateStopPredicate, milestoneViews } from './stop-predicate.js';
import { type RouterSignals, deriveRouterSignals } from './router-signals.js';

/**
 * Derive the roadmap cursor: "M{id}/phase-{n}" for the next-incomplete unit, or
 * just the milestone id when it has no phases, or null when nothing is pending.
 *
 * Skips milestones that are completed OR (optional AND acknowledged-deferred) —
 * so the cursor advances past resolved optional units instead of stalling.
 */
export function deriveCursor(state: StateJsonV2): string | null {
  const views = milestoneViews(state);
  for (const v of views) {
    if (v.status === 'completed') continue;
    if (!v.mandatory && v.status === 'deferred' && v.defer_reason && v.defer_reason.trim() !== '') continue;

    // This milestone is the cursor. If it is the current milestone, derive its phase.
    if (v.id === state.current_milestone) {
      const phase = deriveCurrentPhase(state);
      return phase === null ? v.id : `${v.id}/phase-${phase}`;
    }
    return v.id;
  }
  return null; // everything resolved
}

export interface BrainState {
  cursor: string | null;
  milestones: MilestoneView[];
  stop: StopEvaluation;
  router: RouterSignals;
}

/**
 * Full decision-input snapshot for one round. `blockers` come from the ledger
 * (not state.json) because severity/state is a brain-side concept.
 */
export function deriveBrainState(state: StateJsonV2, blockers: Blocker[]): BrainState {
  const milestones = milestoneViews(state);
  return {
    cursor: deriveCursor(state),
    milestones,
    stop: evaluateStopPredicate(milestones, blockers),
    router: deriveRouterSignals(state),
  };
}
