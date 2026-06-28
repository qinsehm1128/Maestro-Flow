// ---------------------------------------------------------------------------
// Review orchestration — the anti-false-green "review sandwich" as a
// deterministic plan, modeled on Claude Workflow idioms (verify -> independent
// review -> adversarial challenge -> [collab] -> synthesize). The TS engine owns
// the CONTROL FLOW (tier selection, evaluator!=implementer assignment, stage
// ordering, verdict aggregation); the LLM agents do the work, exactly like a
// Workflow script is the deterministic harness and agent() does the reasoning.
//
// Claude-only: review agents are Claude sessions on a model/instance distinct
// from the implementer (Workflow enforces evaluator!=implementer via separate
// fresh-context agent() calls; we encode the same as a different review_cli or,
// in skill-only mode, a distinct sub-agent instance).
// ---------------------------------------------------------------------------

export type ReviewTier = 'L1' | 'L2' | 'L3';

/** Workflow primitive a stage maps to: a single agent, or a parallel barrier. */
export type StageMode = 'single' | 'parallel';

export interface ReviewStage {
  id: string;
  /** what the stage does (verify / review / challenge / collab / synthesize). */
  kind: 'verify' | 'review' | 'challenge' | 'collab' | 'synthesize';
  mode: StageMode;
  /** how the host should run it (the actual command/role to invoke). */
  action: string;
  /** must this stage run on a CLI/instance != the implementer? */
  independentOfImplementer: boolean;
}

export interface ReviewPlanInput {
  difficulty: 'trivial' | 'normal' | 'hard';
  selfReportedSuccess: boolean;   // child claimed "done/all green"
  codeChanged: boolean;
  critical: boolean;              // critical path / low confidence / auto hard-signal
  implCli: string;
  availableClis: string[];        // e.g. ['claude'] (Claude-only) or more
  forcedTier?: ReviewTier;
}

export interface ReviewPlan {
  tier: ReviewTier;
  reviewCli: string;              // guaranteed != implCli when possible
  reviewIsolation: 'different-cli' | 'different-model' | 'distinct-instance';
  stages: ReviewStage[];
  notes: string[];
}

/**
 * Pick the review tier. invariant#7: any round that CHANGED CODE and was
 * SELF-REPORTED successful has a hard floor of L2 (don't trust the green).
 */
export function selectTier(input: ReviewPlanInput): ReviewTier {
  if (input.forcedTier) {
    // forced tier still honors the L2 floor on self-reported code
    if (input.codeChanged && input.selfReportedSuccess && input.forcedTier === 'L1') return 'L2';
    return input.forcedTier;
  }
  if (input.critical) return 'L3';
  if (!input.codeChanged) return 'L1';                       // doc-only / no-code round
  if (input.difficulty === 'hard') return 'L2';
  if (input.selfReportedSuccess) return 'L2';                // L2 floor (R7/R11)
  return 'L1';
}

/**
 * Choose the review CLI/instance so the evaluator differs from the implementer.
 * Claude-only deployments fall back to a distinct fresh-context instance, which
 * Workflow treats as valid isolation (R8-D2).
 */
export function selectReviewIsolation(input: ReviewPlanInput): { reviewCli: string; isolation: ReviewPlan['reviewIsolation'] } {
  const others = input.availableClis.filter(c => c !== input.implCli);
  if (others.length > 0) return { reviewCli: others[0], isolation: 'different-cli' };
  // only one CLI (e.g. Claude-only): use a different model, else a distinct instance
  return { reviewCli: input.implCli, isolation: input.availableClis.length === 1 ? 'distinct-instance' : 'different-model' };
}

/**
 * Build the staged review plan for the tier. Stages mirror the Workflow sandwich:
 *   L1: verify (single)
 *   L2: verify -> review (independent) -> challenge (adversarial) -> synthesize
 *   L3: L2 + collab (parallel multi-CLI consensus) before synthesize
 * Every code-touching review stage is marked independentOfImplementer.
 */
export function planReview(input: ReviewPlanInput): ReviewPlan {
  const tier = selectTier(input);
  const { reviewCli, isolation } = selectReviewIsolation(input);
  const notes: string[] = [];
  if (isolation === 'distinct-instance') {
    notes.push('Claude-only: evaluator = distinct fresh-context instance (no self-review).');
  }

  const verify: ReviewStage = {
    id: 'verify', kind: 'verify', mode: 'single',
    action: 'Goal-Backward verify: existence/substance/anti-pattern + git diff vs claim; re-run the PROJECT real test command and paste its framework banner',
    independentOfImplementer: false,
  };
  const review: ReviewStage = {
    id: 'review', kind: 'review', mode: 'single',
    action: `quality-review via ${reviewCli}: multi-dimension (correctness/security/perf/arch), ignore the child's own tests`,
    independentOfImplementer: true,
  };
  const challenge: ReviewStage = {
    id: 'challenge', kind: 'challenge', mode: 'single',
    action: 'insight-challenge: treat every "green" as a claim to disprove; seek counter-evidence first',
    independentOfImplementer: true,
  };
  const collab: ReviewStage = {
    id: 'collab', kind: 'collab', mode: 'parallel',
    action: 'maestro-collab: fan out to N independent CLIs, evidence-weighted consensus (the only escape from single-model self-grading)',
    independentOfImplementer: true,
  };
  const synthesize: ReviewStage = {
    id: 'synthesize', kind: 'synthesize', mode: 'single',
    action: 'aggregate verdict: pass | gap | false-green | escalate',
    independentOfImplementer: false,
  };

  let stages: ReviewStage[];
  if (tier === 'L1') stages = [verify];
  else if (tier === 'L2') stages = [verify, review, challenge, synthesize];
  else stages = [verify, review, challenge, collab, synthesize];

  // feasibility cap-down: if collab needs >1 CLI but only one is available, drop to L2-equivalent + note
  if (tier === 'L3' && input.availableClis.filter(c => c !== input.implCli).length === 0) {
    stages = stages.filter(s => s.kind !== 'collab');
    notes.push('review-tier-capped: collab infeasible (single CLI) -> L3 reduced to L2-equivalent; review NOT skipped');
  }

  return { tier, reviewCli, reviewIsolation: isolation, stages, notes };
}

export type StageVerdict = 'pass' | 'gap' | 'false-green';
export interface StageOutcome { id: string; verdict: StageVerdict; confidence: number; }

/**
 * Aggregate stage outcomes into the round verdict. A false-green anywhere, or a
 * gap, fails the round (routes to insert-fix). Low confidence (<60) fails closed.
 */
export function aggregateVerdict(outcomes: StageOutcome[]): { verdict: 'pass' | 'gap' | 'false-green'; reason: string } {
  if (outcomes.some(o => o.verdict === 'false-green')) {
    return { verdict: 'false-green', reason: 'a reviewer disproved a claimed green' };
  }
  if (outcomes.some(o => o.verdict === 'gap')) {
    return { verdict: 'gap', reason: 'a reviewer found an unmet requirement' };
  }
  if (outcomes.some(o => o.confidence < 60)) {
    return { verdict: 'gap', reason: 'fail-closed: confidence < 60' };
  }
  return { verdict: 'pass', reason: 'all review stages passed with sufficient confidence' };
}
