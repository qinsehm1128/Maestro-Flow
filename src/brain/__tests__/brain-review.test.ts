import { describe, it, expect } from 'vitest';
import { selectTier, selectReviewIsolation, planReview, aggregateVerdict, type ReviewPlanInput } from '../brain-review.js';

const base = (over: Partial<ReviewPlanInput> = {}): ReviewPlanInput => ({
  difficulty: 'normal', selfReportedSuccess: true, codeChanged: true, critical: false,
  implCli: 'claude', availableClis: ['claude'], ...over,
});

describe('selectTier — invariant#7 L2 floor', () => {
  it('no code change -> L1', () => {
    expect(selectTier(base({ codeChanged: false, selfReportedSuccess: false }))).toBe('L1');
  });
  it('code changed + self-reported success -> L2 floor (never trust the green)', () => {
    expect(selectTier(base())).toBe('L2');
  });
  it('hard difficulty -> L2', () => {
    expect(selectTier(base({ selfReportedSuccess: false, difficulty: 'hard' }))).toBe('L2');
  });
  it('critical -> L3', () => {
    expect(selectTier(base({ critical: true }))).toBe('L3');
  });
  it('forced L1 on self-reported code is clamped up to L2', () => {
    expect(selectTier(base({ forcedTier: 'L1' }))).toBe('L2');
  });
});

describe('selectReviewIsolation — evaluator != implementer', () => {
  it('multi-CLI -> different CLI', () => {
    const r = selectReviewIsolation(base({ implCli: 'claude', availableClis: ['claude', 'codex'] }));
    expect(r.reviewCli).toBe('codex');
    expect(r.isolation).toBe('different-cli');
  });
  it('Claude-only -> distinct fresh-context instance (valid isolation, R8-D2)', () => {
    const r = selectReviewIsolation(base({ availableClis: ['claude'] }));
    expect(r.isolation).toBe('distinct-instance');
  });
});

describe('planReview — Workflow-style staged sandwich', () => {
  it('L2 plan = verify -> review -> challenge -> synthesize, reviews independent', () => {
    const p = planReview(base());
    expect(p.tier).toBe('L2');
    expect(p.stages.map(s => s.kind)).toEqual(['verify', 'review', 'challenge', 'synthesize']);
    expect(p.stages.find(s => s.kind === 'review')?.independentOfImplementer).toBe(true);
  });
  it('L3 adds a parallel collab consensus stage', () => {
    const p = planReview(base({ critical: true, availableClis: ['claude', 'codex', 'gemini'] }));
    const collab = p.stages.find(s => s.kind === 'collab');
    expect(collab?.mode).toBe('parallel');
  });
  it('L3 single-CLI -> collab dropped (feasibility cap-down), review NOT skipped, note recorded', () => {
    const p = planReview(base({ critical: true, availableClis: ['claude'] }));
    expect(p.stages.some(s => s.kind === 'collab')).toBe(false);
    expect(p.stages.some(s => s.kind === 'review')).toBe(true);
    expect(p.notes.join(' ')).toContain('review-tier-capped');
  });
});

describe('aggregateVerdict — anti-false-green', () => {
  it('any false-green fails the round', () => {
    expect(aggregateVerdict([{ id: 'v', verdict: 'pass', confidence: 99 }, { id: 'c', verdict: 'false-green', confidence: 100 }]).verdict).toBe('false-green');
  });
  it('a gap fails the round', () => {
    expect(aggregateVerdict([{ id: 'r', verdict: 'gap', confidence: 90 }]).verdict).toBe('gap');
  });
  it('low confidence fails closed', () => {
    expect(aggregateVerdict([{ id: 'v', verdict: 'pass', confidence: 40 }]).verdict).toBe('gap');
  });
  it('all pass with confidence -> pass', () => {
    expect(aggregateVerdict([{ id: 'v', verdict: 'pass', confidence: 95 }, { id: 'r', verdict: 'pass', confidence: 88 }]).verdict).toBe('pass');
  });
});
