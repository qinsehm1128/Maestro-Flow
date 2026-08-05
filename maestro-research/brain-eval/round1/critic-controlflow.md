# Critic — Control-Flow & State-Correctness Review of `maestro-brain.md`

Target: `/home/user/Maestro-Flow/.claude/commands/maestro-brain.md`
Basis: `08-maestro-brain-flow.md` (F1–F9, D1–D3, V1–V6), `07-maestro-brain-feasibility.md`
Method: static analysis only (not executed). Line refs are to `maestro-brain.md` unless noted.

---

## Defect list

### D1 — `S_LEDGER` termination on "budget exhausted" but no budget exists anywhere — UNREACHABLE/UNDEFINED guard (FATAL for the auto path)
- **Location**: `<state_machine>` L57, `<transitions>` L81 (`S_LEDGER → S_TERMINATE : roadmap 全单元完成 或 预算耗尽`), `A_LEDGER` L170, `<ledger_schema>` L176–193, `<goal_prompt_template>` L204.
- **Defect**: Termination is conditioned on "预算耗尽" (budget exhausted), but **no budget / round-cap field exists** in `ledger.json` (schema has `round` counters but no `max_rounds`/`budget`), no action ever decrements or checks a budget, and `A_INIT` never parses or initializes one. The `--auto -y` chain (invariant#3, D3, A_AUTO_FULLCHAIN L166 "**不终止**") is explicitly designed to never stop on hard-signals. Therefore in auto mode the ONLY remaining stop condition is "roadmap 全单元完成". On an unfixable problem (e.g. a phase that never passes review → S_VERDICT → S_DECIDE → insert-fix → … forever, never marking the unit completed) the loop **runs forever**. This is the precise infinite-loop risk the prompt itself flagged ("预算耗尽才停") but then never implemented.
- **Severity**: **High (FATAL)**.
- **Fix**: Add `max_rounds` / `max_consecutive_fix_rounds` / wall-clock budget to ledger schema + `A_INIT` parse + a real guard in `A_VERDICT`/`A_LEDGER`. Add a transition `S_AUTO_FULLCHAIN → S_TERMINATE (status:escalated)` when the same blocker recurs N times, so auto mode degrades to a written-out escalation rather than spinning.

### D2 — Fix loop re-enters `S_DECIDE` bypassing `S_LOOP_INPUT`; the three round-inputs are never reassembled on a fix round
- **Location**: `<state_machine>` L55, `<transitions>` L77 (`S_VERDICT → S_DECIDE`), L79 (`S_AUTO_FULLCHAIN → S_DECIDE`), `A_DECIDE` L117–120, `A_LOOP_INPUT` L111–116.
- **Defect**: Input assembly (cursor / prior-result / verdict / ledger context) lives only in `A_LOOP_INPUT` (S_LOOP_INPUT). The verdict-driven fix path goes `S_VERDICT → S_DECIDE` directly, and `S_AUTO_FULLCHAIN → S_DECIDE` directly, skipping `S_LOOP_INPUT`. So when `A_DECIDE` runs the "插入修复" branch it relies on inputs (上轮结果 / 裁决信号) that were assembled *for the previous unit*, and the round counter / ledger context for the new fix round are never refreshed. After a fix completes and reaches `S_LEDGER`, it loops back to `S_LOOP_INPUT` and advances the cursor as if the fix were a normal completed unit — but the cursor logic ("next-incomplete phase") has no notion that the prior round was a fix, so it cannot tell "fixed, now re-verify" from "advance". State-resumption after a fix is ambiguous.
- **Severity**: **High**.
- **Fix**: Route fix-decisions back through `S_LOOP_INPUT` (e.g. `S_VERDICT → S_LOOP_INPUT` with a `pending_fix` flag), OR make `A_DECIDE` explicitly re-read inputs. Add a per-round `round_type: advance|fix|revise` to the ledger so cursor derivation and resume can distinguish them.

### D3 — `A_DECIDE` branches are NOT mutually exclusive and NOT exhaustive (decision-exhaustiveness hole)
- **Location**: `A_DECIDE` L117–120; invariants#2 L24–25; flow basis §3.5 / step 9.
- **Defect**: Three cases listed: default-advance, "上轮结果有问题→插入修复", "roadmap 有问题→修正". No tie-break rule for the cross-product:
  - **BOTH** "result has a problem" AND "roadmap is wrong" can hold simultaneously (e.g. a phase fails *because* the roadmap mis-mapped a dependency). The spec gives no precedence → nondeterministic branch.
  - **"result fine AND roadmap complete"** is not handled in `A_DECIDE` — it implicitly falls to "default advance", which then tries to take "游标下一单元" when there is none. The "no next unit" case is only caught downstream in `A_LEDGER`, but `A_DECIDE`→`S_SELECT_EXECUTOR`→`S_DELIVER` would already have fired on an empty cursor. Decision and termination check are in the wrong order.
- **Severity**: **High**.
- **Fix**: State branch precedence explicitly (roadmap-defect outranks result-defect, or vice versa, with rationale). Add an explicit "cursor empty → S_TERMINATE" guard inside `A_DECIDE`/`A_LOOP_INPUT` *before* selecting an executor, not only in `A_LEDGER`.

### D4 — Round-1 inputs are not available at `S_LOOP_INPUT`, but transition guard claims "三类输入装配完成"
- **Location**: `A_LOOP_INPUT` L111–116 ("首轮跳过" on inputs 2 & 3), `<transitions>` L68 (`S_LOOP_INPUT → S_DECIDE : 三类输入装配完成`).
- **Defect**: The transition guard requires all three inputs assembled, but the action says prior-result and verdict are skipped on round 1. So on round 1 the guard is literally false under its own wording, and `A_DECIDE` runs with only 1 of 3 inputs. This is benign for correctness (round 1 = pure advance) but the guard is mis-specified and could mislead an implementer into blocking round 1.
- **Severity**: **Low**.
- **Fix**: Reword guard to "cursor assembled; prior-result/verdict assembled if round>1". Make round-1 explicitly a forced-advance with no decision branching.

### D5 — `A_INIT` emits a `/goal` Goal Prompt and calls `/goal` a "host command that sets the terminate-until-roadmap-complete contract" — contradicts F1 and over-trusts V2
- **Location**: `A_INIT` L90 + L92 ("`/goal` 是宿主命令；它设'持续到 roadmap 完成才停'的终止契约"), `transitions` L62 ("发出 /goal Goal Prompt"), `<goal_prompt_template>` L196–207.
- **Defect**: F1 states `/goal` is a Claude Code **host** command, not a maestro command, with **no definition file** in the repo, and the flow doc lists this as residual validation V2 ("`/goal` 发给外部 headless 是否被尊重 = 待实测"). The command treats `/goal` as a *reliable termination-contract mechanism* ("它设…终止契约") — but maestro-brain's own loop closes via `Skill("maestro-brain")` self-recursion (A_INIT L91), NOT via `/goal`. The `/goal` prompt is therefore at best decorative and at worst gives a false sense that termination is externally enforced. If the host does not honor `/goal`, nothing changes (fine), but the prose asserts a contract that V2 has not confirmed.
- **Severity**: **Med**.
- **Fix**: Demote `/goal` text to "advisory only; termination is enforced by the brain ledger stop-condition, not by `/goal`." Add a Phase-0 note referencing V1/V2 as unverified.

### D6 — `S_AWAIT` assumes a synchronous "block until child session ends" primitive that V4 flags as NON-EXISTENT
- **Location**: `A_AWAIT` L144–146 ("同步 delegate 阻塞直到子会话结束"), `A_DELIVER` L142 ("同步，回传 transcript"), `transitions` L74 (`S_AWAIT → S_REVIEW : 子会话结束 + 结果取回`); basis F4, V4, feasibility §4.2 item 2 / §8 risk 2.
- **Defect**: The whole outer loop's closure depends on a blocking await of a *child ralph/odyssey session that is itself an interactive slash-command*. F4: "外部 CLI 无'发两条命令'通道"; V4: "`src/ralph/` 无 await-sibling 原语". The command picks the recommended workaround (synchronous `delegate`), which is correct in spirit — BUT for the **Claude-implements-CLI + slash-expansion** path (A_DELIVER L139), the blob sent is `/maestro-ralph -y … /goal …`. Whether one `delegate` call blocks until the *entire ralph self-recursion chain inside the child* finishes (vs. returning after the first turn) is exactly residual V1/V4 and is **unverified**. If `delegate` returns before the child's internal `Skill("maestro-ralph-execute")` chain completes, `S_AWAIT → S_REVIEW` fires on a half-done child → false verdicts. The loop "closes" mechanically but on wrong data.
- **Severity**: **High**.
- **Fix**: Make `A_AWAIT` assert completion from the child's `status.json` (`status:completed|paused`) rather than from delegate return; poll/re-read until terminal. Flag V1/V4 as a Phase-0 blocker in the command body.

### D7 — Auto path still contains a residual hard-stop: `A_INIT` "需先 maestro-init", and analyze/roadmap sub-commands may themselves prompt
- **Location**: `A_INIT` L89 ("不存在则标记需先 `maestro-init`"), `A_ANALYZE` L95, `A_ROADMAP` L109, `A_REVISE_ROADMAP` L124–126.
- **Defect**: D3 / invariant#3 promise "`--auto -y` 下永不因需人确认而终止". But the setup chain before the loop (S_INIT→S_ANALYZE→S_ROADMAP) has stop points the auto-rule does not cover: (a) missing `state.json` → "需先 maestro-init" is a hard stop with no auto fallback wired; (b) `maestro-analyze`/`maestro-roadmap` delegated to external CLIs may emit their own confirmation gates — the auto-rule (A_AUTO_FULLCHAIN) is only wired into `S_VERDICT`, i.e. only the *loop body*, never the *pre-loop pipeline*. So auto mode can still halt before the first round.
- **Severity**: **Med**.
- **Fix**: Extend the auto-rule (or a lighter "auto-init") to the pre-loop states: auto-run `maestro-init` if state.json absent; pass `-y` to analyze/roadmap; define what auto mode does if roadmap generation itself stalls.

### D8 — `A_AUTO_FULLCHAIN` can re-trigger itself indefinitely (no progress guarantee) — secondary infinite-loop
- **Location**: `A_AUTO_FULLCHAIN` L162–166, `transitions` L78–79 (`S_VERDICT → S_AUTO_FULLCHAIN`, `S_AUTO_FULLCHAIN → S_DECIDE`).
- **Defect**: Hard-signal under auto → S_AUTO_FULLCHAIN → S_DECIDE → (insert-fix) → S_SELECT_EXECUTOR → … → S_VERDICT. If the same hard-signal recurs (genuinely unfixable: e.g. odyssey keeps returning `ESCALATED`, or revise keeps hitting E005), the cycle S_VERDICT→S_AUTO_FULLCHAIN→S_DECIDE→…→S_VERDICT repeats with no convergence test. `auto_resolved:true` is recorded each time but never counted or compared. Combined with D1 (no budget), this is a guaranteed live-lock on adversarial inputs.
- **Severity**: **High**.
- **Fix**: Track a per-blocker fix-attempt counter in the ledger; after K attempts on the *same* signal, force `status:escalated` + `S_TERMINATE` (write-out, don't prompt — consistent with D3's "never stop to ask" by stopping *the work* with a recorded escalation).

### D9 — `S_REVISE_ROADMAP` non-auto E005 path can deadlock the loop (human gate with no exit edge defined)
- **Location**: `A_REVISE_ROADMAP` L122–126 ("非 --auto -y：撞 E005 → 走它的人确认护栏"), `transitions` L71 (`S_REVISE_ROADMAP → S_LOOP_INPUT : roadmap 已改 + 游标重算`).
- **Defect**: The only declared exit transition from S_REVISE_ROADMAP is "roadmap 已改 + 游标重算 → S_LOOP_INPUT". If (non-auto) the user *declines* the E005 confirmation, the roadmap is NOT changed, so the exit guard is unsatisfied and there is **no defined transition** for "revise rejected/aborted". Orphan terminal condition — the state machine has no edge back to S_DECIDE or to S_TERMINATE for a rejected revise.
- **Severity**: **Med**.
- **Fix**: Add `S_REVISE_ROADMAP → S_DECIDE (revise declined → fall back to advance/fix)` and/or `→ S_TERMINATE (status:escalated)`.

### D10 — Swarm/agy analysis branch and config `brain` segment lean on facts the basis marks as gaps (F7/F8/V6)
- **Location**: `A_DIVERGE` L104–106 (agy ant via `maestro delegate --to agy --mode analysis`), `<config_injection>` L221–225 ("后续加 `brain` config 段，需补 save 白名单").
- **Defect**: (a) F7: ant-colony analysis is "100% in-process, no external CLI path today". The command's primary branch is "若 tools.agy.enabled → 委派 agy" with in-process as *fallback*. This inverts the established reality — agy-as-external is the unverified/optional case, in-process is the only path that exists today. (b) F8/V6: a hand-written `brain` config section is **silently stripped by the save whitelist**; the command's `<config_injection>` correctly *notes* this ("需补 save 白名单") but still leaves "或后续加 brain config 段" as a live option without guarding against the strip. Not contradictions per se, but the doc presents not-yet-true capabilities as available.
- **Severity**: **Low**.
- **Fix**: Make in-process swarm the default branch and agy the opt-in; explicitly mark `brain` config segment as "do NOT use until whitelist patched (V6)".

### D11 — `S_DIVERGE`/`S_COMPLEXITY` low-complexity edge skips diverge but high path has no skip-back; `S_COMPLEXITY` self-decision has no failure edge
- **Location**: `<state_machine>` L47, `A_COMPLEXITY` L97–99.
- **Defect**: Minor — `A_COMPLEXITY` is a ◇self-decision with a binary high/low output and both edges defined (reachable, closes to S_ROADMAP). No orphan here. But there is no edge for "analyze产物 not ready / analyze failed" out of S_ANALYZE (transition L63 only covers success "analyze 产物就绪"). A failed analyze has no defined transition → stuck.
- **Severity**: **Low**.
- **Fix**: Add failure edges from S_ANALYZE / S_ROADMAP (e.g. retry once → escalate/terminate).

---

## What's solid

- **Core loop topology is sound and reachable**: S_INIT→…→S_ROADMAP→S_LOOP_INPUT→S_DECIDE→S_SELECT_EXECUTOR→S_DELIVER→S_AWAIT→S_REVIEW→S_VERDICT→S_LEDGER→S_LOOP_INPUT closes correctly for the happy path, and S_LEDGER→S_TERMINATE→END gives a real terminal state. No truly unreachable states; every named state has at least one inbound and outbound edge except the legitimately-terminal END.
- **Fidelity to invariants is high in the parts it does implement**: reviewer≠implementer (invariant#4, A_REVIEW L153 "强制 ≠ 实现 CLI"), child-writes-its-own-goal (invariant#5, A_DELIVER "只给短intent"), and the non-auto vs auto split at S_VERDICT correctly preserves a human path (A_VERDICT L159–160) — so it does NOT delete the non-auto branch.
- **It correctly internalizes the hard facts it cites**: F4 single-blob (A_DELIVER L134 "组装单 blob 不是两条命令"), F5 only-Claude-expands-slash (A_DELIVER L139–140 pre-expand for non-Claude), F8 role reuse + whitelist caveat (config_injection). The dangerous primitives (await, /goal, blob double-slash) are at least *named* as risks rather than silently assumed.
- **Anti-false-green design is faithful to F9/D2**: adaptive L1/L2/L3 tiers with cross-CLI consensus at L3 and brain's own cross-session drift self-check in A_AUTO_FULLCHAIN (addresses F6/V5).
- **Ledger gives genuine resumability scaffolding** (per-round records), and fail-closed verdict (L157 "解析失败→fix") is the right default.

---

## FATAL summary

1. **Never terminates in auto mode on unfixable input** (D1 + D8): "预算耗尽" stop condition is referenced but no budget/round-cap is defined or checked anywhere; A_AUTO_FULLCHAIN is mandated to "never stop"; the only real terminator is "roadmap fully complete", which an unfixable phase never reaches → infinite/live-lock. This is the single most important flaw and must be fixed before the command is usable in `--auto -y`.
2. **Loop closes on possibly-incomplete child data** (D6 + V4 unverified): S_AWAIT relies on a blocking-await-child primitive that the basis flags as nonexistent; for the Claude-slash path it's unverified whether `delegate` returns after the full child chain or after one turn. The loop closes mechanically but may verdict on half-done work.

No state is unreachable and the happy-path loop does close correctly — the fatal issues are termination-correctness (premature: D9 deadlock on declined revise; never: D1/D8) and await-correctness, not topology.
