// ---------------------------------------------------------------------------
// Brain state derivation — all read-only derivers in one file (mirrors how
// src/utils/state-schema.ts keeps deriveCurrentPhase + derivePhasesSummary
// together). Computes the per-round decision inputs the A-window assembles:
// the roadmap cursor, normalized milestone views, the machine-evaluated stop
// predicate, and the `_router.json` signals (the latent-bug fix).
// ---------------------------------------------------------------------------

import { deriveCurrentPhase } from '../utils/state-schema.js';
import type { ArtifactType, StateJsonV2 } from '../utils/state-schema.js';
import type { Blocker } from './brain-schema.js';
import { type MilestoneView, type StopEvaluation, evaluateStopPredicate, milestoneViews } from './stop-predicate.js';

// ---------------------------------------------------------------------------
// Router signals — fields chains/_router.json reads but no code ever computed
// (the router collapsed to `to_analyze`). Wired into graph-walker.buildInitialContext.
// ---------------------------------------------------------------------------

export interface RouterSignals {
  milestones_total: number;
  latest_artifact_type: ArtifactType | null;
  has_pending_plans: boolean;
  all_phases_executed: boolean;
}

/** The most recently created artifact's type (by created_at, ties -> later array index). */
export function latestArtifactType(state: StateJsonV2): ArtifactType | null {
  const arts = state.artifacts ?? [];
  if (arts.length === 0) return null;
  let latest = arts[0];
  for (const a of arts) {
    if ((a.created_at ?? '') >= (latest.created_at ?? '')) latest = a;
  }
  return latest.type;
}

/** A plan artifact exists whose phase has no completed `execute` (work still pending). */
export function hasPendingPlans(state: StateJsonV2): boolean {
  const arts = state.artifacts ?? [];
  return arts.some(plan => {
    if (plan.type !== 'plan') return false;
    return !arts.some(e =>
      e.type === 'execute' && e.status === 'completed' &&
      e.phase === plan.phase && e.milestone === plan.milestone,
    );
  });
}

/** Every phase of the current milestone has a completed `execute` artifact. */
export function allPhasesExecuted(state: StateJsonV2): boolean {
  const milestone = state.milestones?.find(m =>
    m.name === state.current_milestone || m.id === state.current_milestone,
  );
  if (!milestone?.phases?.length) return false;
  return deriveCurrentPhase(state) === null;
}

export function deriveRouterSignals(state: StateJsonV2): RouterSignals {
  return {
    milestones_total: state.milestones?.length ?? 0,
    latest_artifact_type: latestArtifactType(state),
    has_pending_plans: hasPendingPlans(state),
    all_phases_executed: allPhasesExecuted(state),
  };
}

// ---------------------------------------------------------------------------
// Cursor + bundled snapshot
// ---------------------------------------------------------------------------

/**
 * Derive the roadmap cursor: "M{id}/phase-{n}" for the next-incomplete unit, the
 * milestone id when it has no phases, or null when nothing is pending. Skips
 * completed milestones and optional ones that are acknowledged-deferred.
 */
export function deriveCursor(state: StateJsonV2): string | null {
  for (const v of milestoneViews(state)) {
    if (v.status === 'completed') continue;
    if (!v.mandatory && v.status === 'deferred' && v.defer_reason && v.defer_reason.trim() !== '') continue;
    if (v.id === state.current_milestone) {
      const phase = deriveCurrentPhase(state);
      return phase === null ? v.id : `${v.id}/phase-${phase}`;
    }
    return v.id;
  }
  return null;
}

export interface BrainState {
  cursor: string | null;
  milestones: MilestoneView[];
  stop: StopEvaluation;
  router: RouterSignals;
}

/** Full decision-input snapshot for one round. `blockers` come from the ledger. */
export function deriveBrainState(state: StateJsonV2, blockers: Blocker[]): BrainState {
  const milestones = milestoneViews(state);
  return {
    cursor: deriveCursor(state),
    milestones,
    stop: evaluateStopPredicate(milestones, blockers),
    router: deriveRouterSignals(state),
  };
}
