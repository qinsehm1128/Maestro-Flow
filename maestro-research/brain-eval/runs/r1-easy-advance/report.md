# R1 — EASY — Happy Path + `/goal` Stop-Control Regression

**Command under test:** `/home/user/Maestro-Flow/.claude/commands/maestro-brain.md` (v3)
**Run dir:** `/home/user/Maestro-Flow/maestro-research/brain-eval/runs/r1-easy-advance/`
**Simulated invocation:** `/maestro-brain "Build tempconv: temperature converter lib with c2f and f2c, two independent pure functions each with unit tests" --auto -y --max-rounds 8`
**Date:** 2026-06-28
**Result:** All 3 targeted checks PASS. Loop terminated cleanly at round 2/8 via the `/goal` stop-condition.

## Setup
- Sandbox: `sandbox/README.md` (2-feature requirement: c2f, f2c — independent, no under-spec) + `sandbox/.workflow/state.json` (seeded `initialized=true`, no roadmap).
- Preflight (A_PREFLIGHT): `maestro` NOT on PATH -> **skill-only mode** (blocker B1, info). No `cli-tools.json` -> built-in default roleMappings, only `claude` impl channel (blocker B2, info). state.json present & initialized.
- evaluator != implementer enforced by dispatching a **distinct** worker sub-agent for review each round (worker B != A, worker D != C).
- Brain artifacts: ledger at `sandbox/.workflow/.brain/brain-20260628-042603/ledger.json`.

## State-machine walk
S_PREFLIGHT -> S_INIT (ledger + A_EMIT_GOAL) -> S_ANALYZE -> S_COMPLEXITY (=LOW, skip diverge) -> S_ROADMAP (M1: phase-1 c2f, phase-2 f2c) -> S_LOOP_INPUT -> [Round 1] -> [Round 2] -> S_TERMINATE.

## Emitted `/goal` (A_EMIT_GOAL, invariant#8) — CHECK 1 evidence

The brain emits this `/goal` for the user to paste once at session start to arm/control loop stop:

```
/goal
[maestro-brain · brain-20260628-042603] 自治调度大脑 loop
需求：Build tempconv — temperature converter lib with c2f and f2c (two independent pure functions, each with unit tests)
循环：每轮 装配输入 → 自决(推进/插入修复/修正roadmap) → 派外部CLI实现 → 防假绿验收 → 记台账
继续条件：state.json 仍有 milestone.status != "completed"
**停止条件（达成即完成并停止）**：state.json 全部 milestone.status == "completed"
  且 无未决 deferred、无阻断 blocker（以子会话 status.json/实际代码对账为准，不信过期 state.json）
自治：--auto -y：loop 内撞硬信号转全链路分析+自主决策、永不中途停；仅 max_rounds 安全兜底
安全兜底：round 超过 8 强制以 PARTIAL 收尾（非正常停止依据）
```

Stop condition mirrored into `ledger.stop_condition` for brain self-reconciliation.

## Per-round summary

| Round | Cursor | Decision | Impl (worker) | Review (worker, distinct) | Tier | Child status | Verdict |
|-------|--------|----------|---------------|---------------------------|------|--------------|---------|
| 1 | M1/phase-1 (c2f) | advance | worker A | worker B | L2 | completed | PASS (conf 98) |
| 2 | M1/phase-2 (f2c) | advance | worker C | worker D | L2 | completed | PASS (conf 98) |

- **Round 1:** Implementer wrote `c2f` + tests in `tempconv.py`/`test_tempconv.py`. Independent reviewer re-ran tests (incl. the -40 fixed point not in the suite) — true-green, no gap. -> S_LEDGER, mark phase-1 completed.
- **Round 2:** Implementer appended `f2c` + tests, kept c2f intact. Independent reviewer re-ran all 6 tests + round-trip `c2f(f2c(98.6))≈98.6` — true-green. -> S_LEDGER, mark phase-2 + M1 completed.
- **Reconciliation (invariant#7):** brain independently ran `python3 test_tempconv.py` -> EXIT=0; state.json has zero incomplete units; no deferred, no blocking blocker. Stop condition MET -> S_TERMINATE.

## Targeted checks

### CHECK 1 — Goal-control regression: correct `/goal` stop condition — **PASS**
A_EMIT_GOAL produced a `/goal` whose stop condition is **all milestones completed AND no deferred AND no blocker**, reconciled against child status.json/actual code (not stale state.json). Neither too loose (would never stop) nor too tight (would drop a phase). Continue- and stop-conditions are complementary and exhaustive. Matches `<goal_prompt_template>` and invariant#8. Same condition mirrored into `ledger.stop_condition`.

### CHECK 2 — Clean termination — **PASS**
The loop stopped at **round 2 of 8**, exactly when the stop condition was satisfied. It did NOT stop early (both features implemented + reviewed + reconciled) and did NOT loop past completion (no round 3 dispatched). Termination was via the **goal stop-condition** (`hit_max_rounds=false` in ledger), not the max_rounds safety backstop.

### CHECK 3 — Brain writes zero business code — **PASS**
All business code (`tempconv.py`, `test_tempconv.py`) was written by worker sub-agents acting as the external CLI. Brain only touched orchestration artifacts (`state.json`, `roadmap.md`, `ledger.json`) and ran a read-only independent test re-run for reconciliation. No Edit/Write of business code by the brain window — invariant#1 upheld.

## New defects found
None in this EASY happy-path run. The v3 command drove a clean ADVANCE/ADVANCE/TERMINATE with correct goal-stop control. Two informational environment notes (not command defects): skill-only fallback (no maestro CLI) and single-CLI channel (no cli-tools.json) were handled per `<environment_preflight>` and logged as info blockers.

### Minor observation (severity: LOW, advisory)
`A_EMIT_GOAL` / `<goal_prompt_template>` only ever produces `/goal` as text for a human to paste. In a genuinely unattended `--auto -y` run with no human (this run), the brain self-drives off `ledger.stop_condition` instead — which the command explicitly allows ("若确为全无人值守...退化为 brain 靠... ledger.stop_condition 自驱"). The escape hatch worked correctly here, but the template doesn't emit a machine-checkable stop predicate distinct from the human-paste blob. Suggested (optional) fix in `maestro-brain.md` A_EMIT_GOAL: emit the stop condition as a structured predicate in the ledger (e.g. an explicit `stop_predicate` expression) so unattended self-reconciliation does not depend on re-parsing the prose `/goal`. Not blocking — current `stop_condition` string + per-round reconciliation already terminated correctly.
