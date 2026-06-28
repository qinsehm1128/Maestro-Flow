// ---------------------------------------------------------------------------
// Router signals — the state-derivation layer that chains/_router.json assumes
// but no code ever computed (latent bug: the router collapses to `to_analyze`
// for any real project because these ctx.project.* fields are always undefined).
//
// Computing them from the artifact registry makes `_router.json`'s decision
// edges evaluate correctly, and gives `maestro-brain` the same signals.
// ---------------------------------------------------------------------------

import { deriveCurrentPhase } from '../utils/state-schema.js';
import type { ArtifactType, StateJsonV2 } from '../utils/state-schema.js';

export interface RouterSignals {
  milestones_total: number;
  latest_artifact_type: ArtifactType | null;
  has_pending_plans: boolean;
  all_phases_executed: boolean;
}

/** The most recently created artifact's type (by created_at, falling back to array order). */
export function latestArtifactType(state: StateJsonV2): ArtifactType | null {
  const arts = state.artifacts ?? [];
  if (arts.length === 0) return null;
  let latest = arts[0];
  for (const a of arts) {
    // created_at is ISO; lexical compare is chronological. Ties: later array index wins.
    if ((a.created_at ?? '') >= (latest.created_at ?? '')) latest = a;
  }
  return latest.type;
}

/** A plan artifact exists whose phase has no completed `execute` (i.e. work still pending). */
export function hasPendingPlans(state: StateJsonV2): boolean {
  const arts = state.artifacts ?? [];
  return arts.some(plan => {
    if (plan.type !== 'plan') return false;
    const executed = arts.some(e =>
      e.type === 'execute' &&
      e.status === 'completed' &&
      e.phase === plan.phase &&
      e.milestone === plan.milestone,
    );
    return !executed;
  });
}

/** Every phase of the current milestone has a completed `execute` artifact. */
export function allPhasesExecuted(state: StateJsonV2): boolean {
  const milestone = state.milestones?.find(m =>
    m.name === state.current_milestone || m.id === state.current_milestone,
  );
  if (!milestone?.phases?.length) return false; // no phases => not "all executed"
  // deriveCurrentPhase returns null exactly when no phase lacks a completed execute.
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
