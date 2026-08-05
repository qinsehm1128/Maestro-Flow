# Critic — v2 Fix-Verification of `maestro-brain.md`

Target: `/home/user/Maestro-Flow/.claude/commands/maestro-brain.md` (v2, with `<changelog_v2>`)
Basis: round-1 defect lists (`critic-controlflow.md` CF-D1..D11, `critic-delegation.md` DG-D1..D9, `exec-trace.md` EX-D1..D12) + `08-maestro-brain-flow.md` (F1–F9, V1–V6).
Method: static analysis only (not executed). Line refs are to v2 `maestro-brain.md`.

Skeptic's rule applied: a `<changelog_v2>` claim is treated as a *hypothesis*; verified only against the actual `<state_machine>`/`<transitions>`/`<actions>`/`<ledger_schema>` text.

---

## 1. Consolidated round-1 defect list (deduped)

Overlaps merged across the three sources. The same real defect was often filed under different IDs:

| C# | Consolidated defect | Round-1 sources |
|----|---------------------|-----------------|
| **C1** | No budget / round-cap → never terminates in auto on unfixable input | CF-D1, DG-D8(budget row), EX-(implied by D10) |
| **C2** | A_AUTO_FULLCHAIN self-retriggers with no convergence test (secondary live-lock) | CF-D8 |
| **C3** | Fix/full-chain/revise re-enter S_DECIDE bypassing S_LOOP_INPUT (inputs not reassembled; round_type ambiguity) | CF-D2 |
| **C4** | A_DECIDE branches not mutually-exclusive/exhaustive; no terminate-first; cursor-empty fires executor | CF-D3 |
| **C5** | Round-1 input guard mis-specified ("三类输入装配完成" false on r1) | CF-D4 |
| **C6** | `/goal` phantom host command treated as termination contract | CF-D5, EX-D1, DG-D3(goal part) |
| **C7** | `--auto -y` vs interactive A_EMIT_GOAL "paste once" contradiction | EX-D2 |
| **C8** | A_AWAIT conflates one-CLI-exit with full ralph/odyssey run → half-done false-green | CF-D6, DG-D3, EX-(implied) |
| **C9** | Two-slash single blob `/maestro-ralph … /goal …` malformed / V1 unverified, no guard | DG-D1, EX-D8 |
| **C10** | Non-Claude pre-expand "inline command body" underspecified & fragile | DG-D2, EX-D7 |
| **C11** | evaluator≠implementer mechanism hand-wavy; common-path self-grade; single-CLI case; alias collision | DG-D4, DG-D9, EX-(implied), CF-(noted solid intent) |
| **C12** | insight-challenge mis-applied to "greens"; tier-selection rule vague | DG-D5, EX-D9 |
| **C13** | agy detection via blocking TUI `maestro tools list --json` | DG-D7, EX-D11(part), CF-D10(part) |
| **C14** | `brain` config segment silently stripped by save whitelist; swarm/revise `--to` not persisted | DG-D6, CF-D10, EX-(config) |
| **C15** | Unhandled edges: child crash / delegate timeout / empty roadmap / analyze fail / zero-CLI / state.json missing | DG-D8, CF-D11, EX-D3, EX-D4 |
| **C16** | S_REVISE_ROADMAP non-auto E005 decline → no exit edge (deadlock) | CF-D9 |
| **C17** | cli-tools.json assumed to exist; absent → CLI-selection undefined | EX-D3, DG-(implied) |
| **C18** | maestro binary / delegate / config unrunnable; delegation has no concrete executor; allowed-tools `Task` vs `Agent` | EX-D4, EX-D6 |
| **C19** | Ledger schema lacks rationale/evidence/caveats/deferred/key_decisions slots | EX-D5, CF-(noted) |
| **C20** | Termination predicate over state.json but state.json goes stale; no reconcile | EX-D10 |
| **C21** | Swarm branch inverts reality (agy-external as primary vs in-process truth); no skip branch | CF-D10, EX-D11, DG-(part) |
| **C22** | `--auto` semantics leak executor-specific detail into host arg layer | EX-D12 |
| **C23** | Pre-loop pipeline (init/analyze/roadmap) has residual hard-stops not covered by auto-rule | CF-D7 |

23 consolidated defects.

---

## 2. Fix-verification matrix

Verdict legend: **FIXED** = state machine + actions actually implement the fix. **PARTIAL** = addressed but a gap remains. **NOT-FIXED** = changelog silent or text still defective. **N-A** = was eval-harness artifact, not a command defect.

| C# | Defect (short) | v2 verdict | Evidence in v2 (line/section) — and the gap if PARTIAL/NOT |
|----|----------------|------------|-----------------------------------------------------------|
| **C1** | No budget → infinite auto loop | **FIXED** | `max_rounds` default 30 parsed `A_INIT`#1 (L108); `<context>` L52; `A_LOOP_INPUT`#5 `round++; round>max_rounds → budget_exhausted` (L134); `A_DECIDE`#1 terminate-first on `budget_exhausted` (L139-140); `error_handling` "max_rounds 兜底…强制 S_TERMINATE(PARTIAL)" (L211); `S_TERMINATE(PARTIAL)`. Hard cap exists on the *round* counter, which every cycle passes through (see New-Defect N1 for the residual). |
| **C2** | A_AUTO_FULLCHAIN self-retrigger no convergence | **PARTIAL** | A_AUTO_FULLCHAIN now ends `→ S_LOOP_INPUT` (L193) which does `round++` and is gated by max_rounds, so it can no longer spin *infinitely* — bounded by max_rounds. BUT there is **no per-blocker attempt counter**; the *same* hard-signal can burn all 30 rounds before PARTIAL. CF-D8's specific fix (force-escalate after K attempts on the *same* signal) was **not** implemented. Bounded, not converged. |
| **C3** | Fix/full-chain/revise bypass S_LOOP_INPUT | **FIXED** | State machine reworked: `S_VERDICT → S_LOOP_INPUT` for insert-fix (L66, L92); `S_AUTO_FULLCHAIN → S_LOOP_INPUT` (L67, L95); `S_REVISE_ROADMAP → S_LOOP_INPUT` (L64, L86). All three re-entries now re-run A_LOOP_INPUT reassembly. Changelog [HIGH] "统一回 S_LOOP_INPUT 重装配" matches text. **Gap (minor):** no `round_type: advance|fix|revise` field still (CF-D2's secondary ask); cursor still "next-incomplete" with no fix-vs-advance marker → see N3. |
| **C4** | A_DECIDE not exclusive/exhaustive; terminate order | **FIXED** | `A_DECIDE` L136-143 now "按优先级，互斥穷尽": (1) terminate-check FIRST (all-completed OR budget_exhausted), (2) roadmap-problem, (3) result-problem, (4) default advance. Explicit precedence note "roadmap 问题优先于结果问题" resolves the BOTH-hold tie. Cursor-empty → caught by terminate-check #1 before any executor select. Matches CF-D3 fix. |
| **C5** | Round-1 input guard mis-specified | **FIXED** | `transitions` L82 reworded: "三类输入装配完成（首轮：结果/裁决为空，仅游标）". A_LOOP_INPUT#2/#3 say "首轮空" (L131-132). Guard no longer false on r1. |
| **C6** | `/goal` phantom termination contract | **FIXED** | invariant#3 names §budget hard-cap as the sole stop authority (L27-28); `A_INIT`#2 "终止契约写进 ledger.stop_condition（这才是真正的循环终止依据，不依赖 `/goal`）" (L109-110); A_EMIT_GOAL demoted to "可选、非阻塞" and "**`--auto -y` 时跳过**…`/goal` 是 host 命令、非 maestro 命令、不是终止依据" (L111-113). `/goal` fully removed from delivery (L159). |
| **C7** | auto vs interactive paste contradiction | **FIXED** | `A_INIT`#3 (A_EMIT_GOAL) explicitly gated "若**非 auto** 且有人在场" and "**`--auto -y` 时跳过**" (L111-113). No dead-end in `-y`. |
| **C8** | A_AWAIT conflates exit with full run | **FIXED** | `A_AWAIT` fully rewritten (L168-174): "等子会话到终态，而非一次 CLI 退出"; "子会话 = 一整条 ralph/odyssey 运行，不是单次 delegate 调用"; explicit completion predicate reading `status.json` (ralph: `status ∈{completed,paused}` AND `task_decomposition_all_done`) or `session.json` (odyssey). "未到终态不得进 S_REVIEW". `transitions` L89 matches. Strongest fix in v2. (Terminal-field correctness checked separately in New-Defect N5.) |
| **C9** | Two-slash blob, V1 unverified, no guard | **FIXED** | `A_DELIVER` L159: "**目标 done_when 直接并入 intent 串**（不发独立 `/goal`——…单 blob 内两条 slash 不保证都触发）". Single-command shape is now default; the V1-unverified two-slash shape is gone entirely. Changelog [CRIT] matches. |
| **C10** | Non-Claude pre-expand underspecified | **FIXED** | `A_DELIVER` L162-166 replaces "inline command body" with concrete mechanism: non-Claude → **A-window in-window `Skill("maestro-ralph")`** spins the sub-session, whose execute step ships **atomic write-code tasks one-by-one via `maestro delegate --to <cli> --mode write`**. Explicitly states "非 Claude 不能整条 ralph 丢过去跑…预展开纯文本无法复现". This is the DG-D2 recommended fix (distill, don't inline). (Consistency with invariant#1 checked in New-Defect N4.) |
| **C11** | evaluator≠implementer hand-wavy | **FIXED** | invariant#4 (L29) + `A_SELECT_EXECUTOR` L156-157 give the algorithm: `review_cli` = first enabled in `roles.review` chain `≠ impl_cli`; single-CLI → different `--model` or upgrade to `maestro-collab`; still indistinguishable → record blocker + flag "自评风险". `impl_cli` is pinned/recorded (`A_SELECT_EXECUTOR` "记为 impl_cli", ledger `impl_cli`/`review_cli` fields L227). **Gap:** alias/baseTool collision (DG-D9) is **not** mentioned — comparison is by CLI name, so `claude` vs `claude-analysis` still passes ≠. Minor, was LOW. |
| **C12** | insight-challenge mis-applied; tier vague | **PARTIAL** | tier selection now has concrete predicates: L1 = "仅无代码改动/纯文档轮"; L2 =含代码默认下限 (invariant#7); L3 = critical/低置信/auto撞硬信号 (L176-180). insight-challenge framing improved: "把'测试通过/已完成'当**待证声明**" (L178) — this *is* the reframe-green-to-claim step DG-D5 asked for, stated inline. **Gap:** the L1/L2/L3 boundary is cleaner than r1 but "critical" for L3 still leans on A_COMPLEXITY criteria by reference, not restated; acceptable. Mostly fixed; downgraded concern. |
| **C13** | agy detection via blocking TUI | **FIXED** | `environment_preflight` L43 + `A_DIVERGE` (via changelog [HIGH]) + explicit "读 `cli-tools.json` 的 `tools.<cli>.enabled` 标志，**不要**跑 `maestro tools list`——它是 TUI 会卡住 auto" (L43); `A_DIVERGE` L124 "若 `cli-tools.json` `tools.agy.enabled==true`". TUI invocation removed. |
| **C14** | brain config stripped; revise `--to` not persisted | **PARTIAL** | `config_injection` L239 now says "手写 `brain` config 段会被 save 白名单剥掉，勿依赖" — the "或后续加 brain 段" live-option was removed (good, DG-D6 main ask met). **Gap:** swarm/roadmap-revise `--to` choice still not persisted across rounds in the ledger (DG-D6 sub-point 2) — no field for it; every round re-specifies. Minor. |
| **C15** | Unhandled edges | **FIXED** | New `<error_handling>` block (L206-212): child crash/delegate timeout → hard-signal branch; zero-CLI → Task fallback (preflight) then escalate; analyze/roadmap fail → retry-1-then-continue/escalate; empty roadmap → redo-once-then-escalate; max_rounds backstop. `S_ANALYZE` failure edge added (L77). Covers all six rows of DG-D8/CF-D11. (Crash-loop bound now exists via C1.) |
| **C16** | E005 decline deadlock | **FIXED** | `A_REVISE_ROADMAP` L147-150: non-auto E005 + user-decline → "回退：改为'加补充阶段'最小增量…仍前进（**declined-fallback**）"; auto E005 → A_AUTO_FULLCHAIN logic. `transitions` L86 "改被拒→回退方案(declined-fallback)". Exit edge now defined; no orphan. |
| **C17** | cli-tools.json assumed present | **FIXED** | `environment_preflight` L40-41: absent → "用内置默认 roleMappings (analyze/implement/review/brainstorm = `[codex,claude,gemini]` 序…)，并记一条 blocker". A_PREFLIGHT synthesizes default. |
| **C18** | maestro binary unrunnable; Task vs Agent | **PARTIAL** | `environment_preflight` L38-39: maestro not on PATH → "纯 Skill 模式: 用 `Skill()` 调 maestro 命令、用 `Task` 子代理替代 `maestro delegate`". This handles the no-binary case structurally. allowed-tools still lists `Task` (frontmatter L11) — in this SDK the spawn tool surfaced is `Agent`, and the harness exposes `Task*` (TaskCreate etc.) as different tools. **Gap:** EX-D6 naming mismatch (`Task` vs `Agent`) is **not** reconciled; "纯 Skill 模式" leans on a `Task` tool whose exact identity is still ambiguous. Functional intent fixed, tool-name precision not. |
| **C19** | Ledger schema missing slots | **FIXED** | `<ledger_schema>` L214-233 now has top-level `key_decisions`, `blockers`, `deferred`, `stop_condition`; per-round `rationale`, `evidence_refs`, `caveats`, `deferred`, `auto_resolved`. Matches EX-D5 exactly. |
| **C20** | state.json stale; no reconcile | **FIXED** | invariant#7 (L33-34) "终止前以子会话 status.json/实际代码为准重对账，不信可能过期的 state.json"; `A_LEDGER` L196 "**对账**：以子会话实际产物/status.json 更新 brain 视图，不信可能过期的 state.json"; `A_DECIDE`#1 "以对账后的真值". Reconcile step now explicit each round. |
| **C21** | Swarm branch inverts reality; no skip | **FIXED** | `A_DIVERGE`#2 L122-125: in-process is now the **default** ("蚁群默认**在进程内**…符合现状"), external agy is explicit **opt-in** ("opt-in 外部"). Skip guidance present: "仅当需在多候选方案空间搜索最优才用；否则跳过（小任务不强制）". Reality-order corrected + skip branch added. |
| **C22** | `--auto` semantics leak executor detail | **PARTIAL** | `<context>` L49 still says "`--auto` 仅 codex 子会话额外带" — the executor-specific note **remains** in the host arg layer. The auto-propagation is at least localized, but EX-D12's ask (define `--auto` purely as host autonomy, forward executor flags from role config) is **not** done. Low severity, unchanged. |
| **C23** | Pre-loop residual hard-stops | **PARTIAL/FIXED** | `environment_preflight` auto-creates state.json ("先 `Skill("maestro-init")` 或就地建种子 state.json", L42); analyze/roadmap failures now have retry-then-continue edges (`error_handling` L208-210, `transitions` L77). **Gap:** whether delegated `maestro-analyze`/`maestro-roadmap` sub-commands emit their *own* interactive confirm gates under auto is still not explicitly suppressed (CF-D7's deeper point) — the `-y` propagation to those sub-skills is assumed, not stated. Mostly fixed; one residual. |

### Tally
- **FIXED**: C1, C3, C4, C5, C6, C7, C8, C9, C10, C11, C13, C15, C16, C17, C19, C20, C21 = **17**
- **PARTIAL**: C2, C12, C14, C18, C22, C23 = **6**
- **NOT-FIXED**: **0**
- **N-A**: **0** (all 23 were real command-layer or behavioral defects; the harness-only artifacts like "maestro binary absent" were folded into structural mode-handling C17/C18 and are addressed at the design level)

---

## 3. New-defect hunt (did v2's changes introduce problems?)

### N1 — max_rounds is enforced, but NOT every cycle decrements via a path that is *immune* to skipping A_LOOP_INPUT (MED — verify-the-fix)
**Where:** `A_LOOP_INPUT`#5 (L134) is the *only* place `round++` and the `budget_exhausted` check happen. Every re-entry edge in the new state machine routes through S_LOOP_INPUT (insert-fix L92, full-chain L95, revise L86, ledger-continue L96) — verified: **there is no path back into S_DECIDE that bypasses S_LOOP_INPUT**. So the counter *is* hit on every cycle including revise and insert-fix re-entries. **Good — the C1 fix holds on every loop.** Residual nit: `round++` counts *revise* and *fix* rounds the same as *advance* rounds, so a roadmap that legitimately needs many advances can hit the cap as fast as a livelock; max_rounds=30 conflates "progress rounds" with "thrash rounds." Not a bypass, but a calibration smell. **Severity: MED (it's a real guarantee, with a tuning caveat).**

### N2 — A_DECIDE priority order can starve a real result-problem behind a sticky roadmap-problem (MED)
**Where:** `A_DECIDE` L140-142. Priority is terminate → revise-roadmap → insert-fix → advance, with explicit note "若同时存在，先修 roadmap，结果问题下一轮再处理". **Starvation scenario:** if the roadmap-problem detector keeps returning true every round (e.g. a dependency the brain *thinks* is mis-mapped but revise can't actually resolve, or revise applies a no-op increment via declined-fallback that doesn't clear the condition), the result-problem (a real failing phase) is deferred "下一轮" forever — each round re-picks revise. Because revise's declined-fallback "仍前进" without guaranteeing the roadmap-problem predicate flips to false, the loop can revise-revise-revise until max_rounds, never touching the failing result. **The priority order trades C4's determinism for a new starvation surface.** Mitigated only by C1 (it ends in PARTIAL at 30), not by progress. **Severity: MED.** Fix: require the roadmap-problem branch to be *self-clearing* (a revise that doesn't change the roadmap-problem predicate must not re-fire) or interleave (after a declined-fallback revise, force-handle the pending result-problem next round).

### N3 — Cursor cannot distinguish "fixed, re-verify" from "advance" after insert-fix (MED — residual of C3)
**Where:** `A_LOOP_INPUT`#1 "从 state.json 求 next-incomplete phase/milestone" (L130). After an insert-fix round completes and routes S_VERDICT→S_LOOP_INPUT, the cursor derivation is still pure "next-incomplete." If the fix marked the unit complete, the brain advances; if not, it re-picks the same unit and (via A_DECIDE) may either re-fix or — if the unit now *looks* complete in stale state.json — wrongly advance. The C20 reconcile (A_LEDGER updates brain view from status.json) mitigates this, but A_LOOP_INPUT reads `state.json` for the cursor (#1) while reconcile writes the *brain view* — if those two aren't the same store, the cursor can still read stale state.json. v2 didn't add the `round_type` field CF-D2 recommended. **Severity: MED.** Fix: derive cursor from the reconciled ledger truth, not raw state.json; add `round_type`.

### N4 — Non-Claude in-window `Skill("maestro-ralph")` path tensions invariant#1 (MED — new from C10 fix)
**Where:** `A_DELIVER` L162-166. For non-Claude impl, the **A-window itself now runs `Skill("maestro-ralph")` in-window**, and ralph's execute step delegates atomic writes out. invariant#1 says "A 窗口只分析与调度，从不亲自写/改业务代码…一切实现派发给外部 CLI 或 ralph/odyssey 子会话". Running ralph *in the A-window* means the A-window is now hosting the ralph orchestration engine (loop control, status.json anchoring, decomposition) — it does not write business code (the atomic writes still go to the CLI), so invariant#1's letter ("写/改业务代码") is preserved, but its spirit ("只分析与调度…实现派发给…子会话") is bent: the sub-session is no longer an independent child, it's the A-window wearing ralph's hat. This blurs the "brain ≠ executor" boundary that the whole design rests on, and risks the A-window's context being polluted by ralph's inner loop (the exact thing delegation was meant to isolate). **Consistent with invariant#1 narrowly; inconsistent with the isolation intent.** **Severity: MED.** Recommend: state explicitly that in-window ralph runs in a *separate `Task`/sub-agent context*, not the brain's own context, to preserve isolation.

### N5 — await-child terminal fields: ralph correct, odyssey field-name unverified (LOW-MED)
**Where:** `A_AWAIT` L171-173. ralph: reads `status.json`, `status ∈ {completed, paused}` AND `task_decomposition_all_done` — consistent with F3/F6 (ralph is status.json-anchored, paused = A_REGROUND_HALT). odyssey: reads `session.json`, `phase_goals_all_done` OR `status ∈ {ESCALATED, PARTIAL, INCONCLUSIVE}`. **The field names `task_decomposition_all_done` / `phase_goals_all_done` / `session.json` are introduced by v2 and not traced to any F-fact or source file in the basis** — 08-flow.md F3 says odyssey is a "纯提示词 FSM 自走" with no named completion field, and the round-1 docs reference `status.json` for ralph but never a `session.json` schema for odyssey. So the *predicate shape* is right (terminal-state gating, fixes C8) but the *exact fields* are asserted, not verified — a Phase-0 must confirm odyssey actually writes `session.json.phase_goals_all_done`. If odyssey writes a differently-named field (or none), A_AWAIT either never sees terminal or crashes parsing → re-introduces a softer C8. **Severity: LOW-MED (correct design, unverified field contract).**

### N6 — invariant#7's L2-floor + "auto never stops" can force expensive L2/L3 on every thrash round (LOW)
**Where:** invariant#7 (L33) + A_REVIEW L176-180. Every code-touching round is now L2-minimum, and every auto hard-signal is L3 (collab multi-CLI). Combined with N2's revise-thrash or N1's round inflation, a livelocked auto run now burns L2/L3 (multi-CLI fan-out) on *every* one of up to 30 rounds before PARTIAL — a real cost/latency blow-up that v1 didn't have (v1 had no floor). Correctness-positive, cost-negative. **Severity: LOW.**

### N7 — `S_VERDICT → S_AUTO_FULLCHAIN` only on hard-signal; gap/false-green under auto still routes to S_LOOP_INPUT insert-fix (consistency, LOW)
**Where:** `A_VERDICT` L185-187. Under `--auto -y`: a *gap/false-green* → S_LOOP_INPUT (insert-fix), a *hard-signal* → S_AUTO_FULLCHAIN. This is internally consistent, but note the insert-fix path for auto gaps does **not** run the A_AUTO_FULLCHAIN full-chain analysis — it just loops to fix. That's fine for an ordinary gap, but a *recurring* false-green (child keeps lying green) under auto will insert-fix forever (bounded by max_rounds) without ever triggering the heavier full-chain drift self-check that might catch the systematic lie. Minor asymmetry. **Severity: LOW.**

---

## 4. Residual-risk ranking (top risks for a real Phase-0 build)

1. **[HIGHEST] Auto-mode thrash burns max_rounds without progress (N2 + N1 + C2-partial).** The infinite loop (C1) is killed, but its replacement — a *bounded* loop that can spend all 30 rounds on revise-thrash or repeated same-signal fixes, each at L2/L3 cost (N6) — degrades to PARTIAL after heavy spend rather than escalating early. No per-blocker convergence counter (C2 NOT fully fixed). For a real build this means "it terminates" but possibly "it terminates expensively having made no progress." **This is the single biggest residual risk.**

2. **[HIGH] await terminal-field contract for odyssey is unverified (N5 + residual C8).** A_AWAIT's correctness — the load-bearing fix that kills structural false-green — depends on `session.json.phase_goals_all_done` existing. If odyssey doesn't write that field, the strongest v2 fix silently regresses. Must be confirmed against `odyssey-*.md`/`src` in Phase 0.

3. **[HIGH] In-window ralph for non-Claude blurs brain≠executor isolation (N4).** The C10 fix is concrete but moves ralph's engine into the A-window. Risk of context pollution and invariant#1 spirit-violation unless explicitly sandboxed into a sub-agent context.

4. **[MED] Cursor still reads raw state.json; fix-vs-advance ambiguity (N3 + residual C3/C20).** Reconcile writes the brain view but the cursor derivation still references state.json; no `round_type`. Resume-after-fix correctness is probabilistic, leaning on reconcile timing.

5. **[MED] Delegation tool identity unresolved (C18-partial).** "纯 Skill 模式" + `Task`-substitutes-delegate is a design answer, but the actual spawn-tool name (`Task` vs `Agent` vs harness `Task*`) is still unreconciled in allowed-tools — a real run may find the whitelisted tool doesn't exist.

6. **[LOW] Cost blow-up of mandatory L2-floor + L3-on-every-auto-hard-signal (N6).** Correct but potentially expensive at scale.

7. **[LOW] Alias/baseTool self-grade (C11-residual DG-D9), `--auto` arg leak (C22), brain-config non-persistence (C14).** All carried-over LOW items, unchanged.

---

## 5. Bottom line

v2 is a **substantial, genuine** improvement: the two round-1 FATALs (C1 never-terminate, C8 await-conflation) are both **really fixed** in the state machine (not just claimed) — max_rounds is hit on every cycle with no bypass path, and A_AWAIT now gates on child terminal state. 17 of 23 consolidated defects FIXED, 6 PARTIAL, 0 NOT-FIXED, 0 N-A. The residual risk has **shifted from "infinite loop" to "bounded but unproductive thrash"** (N2/N1/C2) plus an **unverified odyssey terminal-field contract** (N5) that the headline await-fix silently depends on.
