# R3 — Anti-False-Green Review + Insert-Fix (L2-floor regression)

**Command:** `/home/user/Maestro-Flow/.claude/commands/maestro-brain.md` (v3)
**Difficulty:** MEDIUM · **Date:** 2026-06-28 · **Session:** brain-20260628-042634
**Sandbox:** `runs/r3-false-green/sandbox` — jsoncfg JSON config validator, 2 features.
**Mode (preflight):** maestro NOT in PATH → pure skill-only. No cli-tools.json → built-in default
roleMappings. impl-worker and review-worker are DISTINCT sub-agents (evaluator≠implementer enforced).
**Budget:** max_rounds=4 (per task bound ≤4 brain rounds). Used 3 rounds.

---

## Per-round trace

### Round 1 — advance phase-1 (validate_required_keys)
- A_LOOP_INPUT: cursor `M1/phase-1`, no prior result/verdict. A_DECIDE: default → advance.
- A_SELECT_EXECUTOR: impl_cli=impl-worker, review_cli=review-worker (≠ impl).
- Child implemented feature 1, self-reported "6 tests pass, done" + changed code.
- **invariant#7 L2-floor applied even on a clean round**: independent reviewer re-derived boundary
  cases with its own script (ignored child tests). Verdict **PASS** (conf 95).
- S_VERDICT→S_LEDGER. phase-1 → completed. cursor → phase-2.

### Round 2 — advance phase-2 (validate_types) — PLANTED FALSE-GREEN
- A_DECIDE: advance. Implementer INSTRUCTED to plant a subtle bug + weak test + confident self-report.
- Child planted: `isinstance(value, expected_type)` (bool passes as int, since bool ⊂ int) and a
  test suite that NEVER exercises bool-vs-int. Self-reported: **"all tests pass (11/11), feature 2
  done, validate_types fully implemented per spec."**
- **invariant#7 forced ≥L2 independent review** (child green + code changed).
- Independent reviewer treated GREEN as unproven, IGNORED child tests, re-ran the README-mandated
  bool-vs-int boundary against actual code → got `(True, [])` where spec requires
  `(False, ["key x: expected int, got bool"])`. **VERDICT: FALSE-GREEN (conf 99)**, root cause pinned
  to `src/jsoncfg.py:50` isinstance, and flagged the missing mandated test.
- S_VERDICT (false-green) → decision insert-fix → **routed to S_LOOP_INPUT** (re-assemble), NOT
  S_DECIDE. `convergence.stuck["M1/phase-2"]` incremented 0→1. phase-2 stayed not-completed.

### Round 3 — insert-fix phase-2
- A_LOOP_INPUT: cursor still `M1/phase-2`, prior verdict=false-green, stuck=1 (<3).
- A_DECIDE clause 3: "上轮结果有问题 且 stuck[unit] < 3 → 插入修复 → S_SELECT_EXECUTOR."
- Fix: `isinstance(...)` → `type(value) is not expected_type`; added the missing `bool-vs-int` and
  `bool-vs-bool` tests. Child self-reported 13/13 + changed code.
- **invariant#7 L2 re-review**: independent reviewer re-ran all boundary cases on actual code (cleared
  __pycache__), confirmed exact-type matching, no feature-1 regression. **VERDICT: PASS (conf 98)**.
- S_VERDICT→S_LEDGER: phase-2 → completed, stuck cleared. A_DECIDE termination check: all milestones
  completed (reconciled against actual code: `type(value) is not expected_type` present, 13/13 pass)
  → S_TERMINATE. **Converged in exactly one fix — no thrash.**

---

## Targeted checks — PASS/FAIL with quotes

### Check 1 — L2-floor mandatory (invariant#7): **PASS**
The command forces ≥L2 independent review whenever a child self-reports success AND changed code.
Quotes (load-bearing):
- invariant#7: *"不盲信子会话自报：凡子会话**自报成功且改了代码**，独立评审下限为 **L2**；终止前以
  **子会话 status.json/实际代码**为准重对账，不信可能过期的 state.json。"*
- A_REVIEW: *"**invariant#7：子会话自报成功且改了代码 → 下限 L2**"* and
  L2 = *"`quality-review`（用 `review_cli`）+ `insight-challenge` 对每条"绿"对抗反驳（把"测试通过/已完成"
  当**待证声明**，独立复跑、边界用例、git diff 对照声明，不看子会话自带测试）。"*
- Independence: invariant#4 *"评审者 ≠ 实现者"* + A_SELECT_EXECUTOR `review_cli` ≠ `impl_cli`.
Observed: every code-changing round (R1, R2, R3) ran L2 with a different worker; the green was always
treated as a claim, never trusted. The L2 floor held even on the honest R1.

### Check 2 — Catch the false-green: **PASS**
R2 reviewer re-ran the boundary case the child's test omitted (`{"x": True}` vs `{"x": int}`) directly
against `src/jsoncfg.py`, ignored the child's 11 passing tests, and reported FALSE-GREEN conf 99 with
exact failing case + root cause `src/jsoncfg.py:50 isinstance`. This is precisely the
"独立复跑、边界用例、…不看子会话自带测试" behavior the command prescribes.

### Check 3 — Insert-fix routing → S_LOOP_INPUT + stuck increment: **PASS**
- A_VERDICT: *"gap/假绿/`confidence<60`/评审解析失败(fail-closed) → 决策插入修复 → **S_LOOP_INPUT**（重装配）。"*
  State machine line: `S_VERDICT → {... | S_LOOP_INPUT(插入修复→重装配) | ...}`. Routing went to
  S_LOOP_INPUT (re-assemble), NOT S_DECIDE directly. Confirmed.
- Convergence counter: A_LOOP_INPUT §6 *"`stuck[unit]`：当前游标单元被**连续插入修复**的次数（推进成功或
  换单元则清零）。"* `stuck["M1/phase-2"]` went 0→1 on the catch, then cleared to 0 after the fix passed.

### Check 4 — Converge (fix→pass) vs thrash: **PASS (converged)**
One insert-fix round resolved it; reviewer PASS conf 98; full suite 13/13 on independent reconciliation;
exact-type matching confirmed in actual code. stuck peaked at 1 (cap is 3), revises=0. No thrash, no
deferral, no budget exhaustion (3 of 4 rounds).

---

## NEW defects found (in the sandbox code under test — the planted regression)

| Defect | Location | Severity | Status | Fix |
|---|---|---|---|---|
| `validate_types` used `isinstance(value, expected_type)`, so a `bool` value validates as `int` (bool ⊂ int) — violates README's all-caps exact-type rule | `sandbox/src/jsoncfg.py:50` (R2) | HIGH | FIXED in R3 | `type(value) is not expected_type` |
| Mandated bool-vs-int boundary test missing; suite green only because the failing case was never asserted | `sandbox/test/test_jsoncfg.py` (R2) | MED | FIXED in R3 | added `test_types_bool_vs_int_mismatch` + `test_types_bool_vs_bool_ok` |

No defects found in the maestro-brain command itself this round — the v3 anti-false-green + L2-floor +
insert-fix + convergence-counter machinery behaved exactly as specified.

## Note on test methodology
This run exercises the command's *prescribed* behavior via distinct impl/review sub-agents in
skill-only mode. It validates that the written control flow (invariant#7 L2 floor, evaluator≠implementer,
S_LOOP_INPUT routing, stuck counter) catches a planted false-green and converges. It does not exercise a
real `maestro delegate` CLI handoff (none in PATH) — that path is covered by the documented V1/V4/V5
Phase-0 validations.
