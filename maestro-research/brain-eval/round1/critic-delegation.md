# Critic — maestro-brain: Delegation, Robustness & Executability Defects (Round 1)

> Static reverse-evaluation of `.claude/commands/maestro-brain.md` against researched reality
> (`08-maestro-brain-flow.md` §6/§8, F1–F9; `03-external-cli-orchestration.md`; `06-collab.md`).
> Severity: **CRITICAL** (will silently fail / produce false-green) · **HIGH** (breaks in common paths) ·
> **MED** (degrades or surprises) · **LOW** (polish).

---

## Defect list

### D1 — A_DELIVER single-blob assumes UNVERIFIED slash behavior, no guard (CRITICAL)
**Location:** `A_DELIVER` (cmd L133-142), `<blob_templates>` (L209-219), transition `S_DELIVER→S_AWAIT` (L73).
**Reality:** F5 — maestro never expands `/cmd`; **only Claude headless** expands custom slash (v2.1.181+); codex/gemini/qwen/agy send it as literal text. V1 (§8) — *whether two slash commands in one blob both fire in Claude headless is UNVERIFIED*. V2 (§8) — *whether `/goal` (a host command, F1) is honored by an external headless CLI is UNVERIFIED*.
**Defect:** The command hard-codes the two-slash blob `/maestro-ralph -y … /goal …` as the primary delivery shape (L135-137, L211-213) and the state machine treats `blob 已发外部 CLI` as the only precondition for advancing to S_AWAIT. It does **not** gate on V1/V2. If V1 is false, the `/goal` segment is silently swallowed (or the whole second command is treated as args to the first) and the stop-contract never lands — brain thinks it delivered a goal it didn't. If the impl CLI is non-Claude and the pre-expand fallback isn't taken, **the entire blob is literal text** and ralph never runs at all — a silent no-op that the await step will misread as "child produced nothing."
**Severity:** CRITICAL.
**Fix:** (a) Add a Phase-0 capability probe state (resolve impl-CLI vendor + Claude version) before first delivery; record V1/V2 result in the ledger. (b) Make the default delivery shape **single-command**: fold the goal text into the ralph intent/`/goal`-equivalent argument rather than a second slash line; only emit the second `/goal` line when impl-CLI==Claude AND V1 verified. (c) Treat "two slashes in one blob" as opt-in, not default.

### D2 — Pre-expand fallback is not concrete enough to execute (HIGH)
**Location:** `A_DELIVER` (L140), `<blob_templates>` (L218).
**Reality:** F4 (single blob only), F5 (non-Claude = literal), V3 (§8 — inlining the command body must still drive the sub-flow correctly).
**Defect:** The fallback is one clause: *"读命令体内联为纯文本再发；或强制实现 CLI 用 Claude"* (read the command body, inline as plain text, then send). This hand-waves the hard part: `maestro-ralph.md` is itself a host-agent orchestrator that issues `Skill("maestro-ralph-execute")` self-calls anchored on `status.json` (F3) and uses Bash/Read tools. Pasting its markdown body as a prompt to codex/gemini does **not** reproduce that engine — the sub-CLI has no `maestro-ralph-execute` skill and no self-call loop. So "inline the command body" yields a one-shot read of instructions, not a ralph run. There is no spec of *what* to inline (full file? a distilled task contract?) nor a verification that the sub-flow still closes.
**Severity:** HIGH.
**Fix:** Default to option (b) — force impl-CLI=Claude for any ralph/odyssey delivery (the doc's own "省事/符合默认" path, §6). Reserve non-Claude impl only for leaf `maestro delegate --mode write` tasks that need no slash engine. If cross-CLI ralph is truly wanted, specify it as "distill ralph into an explicit step-list task contract," not "inline the command body," and add a V3 acceptance check.

### D3 — A_AWAIT conflates "one CLI exit" with "a full ralph/odyssey RUN" (CRITICAL)
**Location:** `A_AWAIT` (L144-146), transition `S_AWAIT→S_REVIEW : 子会话结束 + 结果取回` (L74).
**Reality:** 03 §2.2/§2.3 — sync `maestro delegate` blocks, but `CliAgentRunner.run()` **resolves on the spawned CLI's `status_change: stopped` (process exit 0/130)** — i.e. *one CLI process completing*, not a multi-round ralph self-call chain. F3 — ralph's "continuous progress" engine is a `Skill("maestro-ralph-execute")` self-call chain inside the host agent; odyssey is a prompt-FSM. V4 (§8) — *the await primitive is unconfirmed; `src/ralph/` has no await-sibling primitive (r1c)*.
**Defect:** The command asserts "sync delegate 阻塞直到子会话结束" (L145) as if one synchronous delegate call runs a whole ralph milestone-lifecycle to completion and returns. But what blocks-and-returns is **a single headless CLI invocation**. Whether that single invocation internally runs the *entire* ralph self-call chain to roadmap-phase completion is exactly V4, and is unverified. If the headless child does one ralph "next step" and exits (the status.json-anchored model), brain's await returns after step 1, A_REVIEW grades a partially-done phase as the finished phase, and the outer loop advances on an incomplete unit — a structural false-green that no review tier is designed to catch (review checks *quality of what came back*, not *did the child run all N internal steps*).
**Severity:** CRITICAL.
**Fix:** (a) Explicitly resolve V4 in Phase 0: confirm whether a single headless `claude -p "/maestro-ralph …"` runs the ralph self-call chain to completion or returns after one step. (b) If it returns early, brain must own the iteration: loop `delegate` per ralph step and poll the child's `status.json` for `completed` before leaving S_AWAIT — add a `S_AWAIT_POLL` sub-state with an explicit completion predicate (`child status.json == completed/paused/escalated`), not "delegate returned." (c) Document that there is no await-sibling primitive and the loop is brain-driven.

### D4 — Evaluator≠implementer mechanism is hand-wavy; can self-grade (HIGH)
**Location:** invariant #4 (L27), `A_REVIEW` (L148-153, esp. L153: *"若 config 解析到同一个，则 `--to` 换下一个"*).
**Reality:** 03 §4.3 — `selectToolByRole` resolves role→tool via user `roles` → default chains → first-enabled. Default chains overlap heavily: `review: [codex,gemini,claude]` and `implement: [codex,claude,gemini]` — **both start with `codex`**. So with defaults, `--role implement` and `--role review` resolve to the *same* tool (codex).
**Defect:** The "force ≠" mechanism is a single prose clause with no algorithm: *"若 config 解析到同一个，则 `--to` 换下一个"* ("if config resolves to the same one, use `--to` to swap to the next"). It doesn't say next *in what list*, doesn't pin the implementer's actually-used tool (the impl CLI may have been overridden by `--executor` or domain-ranking `rankToolsByDomain`, so the review side must compare against the *resolved* impl tool, not the role default), and doesn't handle the single-enabled-tool case (only Claude installed → no different CLI exists → invariant #4 is unsatisfiable and the clause silently picks "next" = nothing or wraps back to the implementer). With shipped defaults this fires on the **common path** (both roles → codex), so unless the swap is bulletproof the implementer grades itself.
**Severity:** HIGH.
**Fix:** Specify deterministically: (1) record `impl_cli_resolved` in the ledger at delivery time; (2) review selection = first enabled tool in the review chain whose name ≠ `impl_cli_resolved` (and ≠ same base tool, to avoid alias collision — see D9); (3) if no distinct tool exists, fall back to *different model on same CLI* and explicitly down-rank confidence / flag `evaluator_eq_implementer:true` in the ledger rather than proceeding silently; for L3, require `collab` (multi-CLI) which structurally guarantees ≠ implementer.

### D5 — insight-challenge mis-applied; tier selection rule is vague (MED)
**Location:** `A_REVIEW` L150-152 ("对每条'绿'对抗反驳"), L148 ("按任务难度 × 返回信号选档").
**Reality:** Skill registry — `insight-challenge` = *"Adversarial review of code quality **findings**… challenges insights with counter-evidence."* It is **finding-oriented** (takes a claimed finding, hunts counter-evidence). F9 — it is a real anti-false-green primitive.
**Defect (a):** Applying `insight-challenge` to "每条绿/green claims" is a category mismatch. A "green" (a pass with no finding) is the *absence* of a finding; insight-challenge expects a *finding* to challenge. To use it correctly you must first **reframe each green into a falsifiable claim** ("X is implemented and works") so it becomes a finding the skill can attack. The command skips this reframing step, so the skill may have nothing to chew on and return vacuous "no counter-evidence" — a hollow ritual that reads as confirmation. **Defect (b):** Tier selection is "任务难度 × 返回信号" with no deterministic predicate — "较难" (harder) and "critical" are undefined. The earlier A_COMPLEXITY (L97-99) *does* have concrete criteria; A_REVIEW reuses none of them. So tier choice is left to model whim, undermining reproducibility and letting an under-tier slip a false-green.
**Severity:** MED.
**Fix:** (a) Add an explicit "reframe greens → falsifiable claims" step before invoking `insight-challenge`, and feed those claims as the findings to challenge. (b) Make tier selection a table keyed to concrete signals already available: L1 = complexity-low AND child status normal AND verify clean; L2 = verify gap OR complexity-high OR deferred==0-but-caveats>0; L3 = critical-domain (data-model/migration/security per A_COMPLEXITY criteria) OR confidence<60 OR any hard signal under --auto -y. State that `--review` overrides.

### D6 — Config injection: brain-section save-strip is acknowledged but the default path still risks silent loss (MED)
**Location:** `<config_injection>` (L221-225), esp. L224 (*"或后续加 `brain` config 段，需补 save 白名单"*).
**Reality:** F8 — `maestro config` manages 3 stores; role→CLI priority lives in `cli-tools.json`'s **7 fixed roles**; a hand-added `brain` config section **is stripped by the save whitelist** (`cli-tools-config.ts:131-136` & `:249-254`) unless *both* merge whitelists are patched. swarm / roadmap-revise have **no role**.
**Defect:** The command does correctly state swarm/roadmap-revise have no role and that a `brain` section "needs save-whitelist patching." Good as far as it goes. But: (1) it presents adding a `brain` section as a live option ("或后续加") inside a command-layer doc, without flagging that **today, with no source patch, any `brain` config a user writes is silently dropped** — a user following this could configure brain CLIs and have them vanish on next save with no error. (2) For swarm/roadmap-revise it says "用 `--to <cli>` 显式指定" — fine — but nothing persists that choice across rounds/sessions, so every round re-specifies or re-guesses. (3) The config reload precedence (workDir > home > defaults, 03 §4.1) isn't acknowledged, so `--executor` vs `cli-tools.json` vs default-Claude (A_SELECT_EXECUTOR L131) could resolve differently than the user expects.
**Severity:** MED.
**Fix:** Drop the "或后续加 brain 段" suggestion from the command (it's a source change, not a command-time option) or hard-flag it as "requires patching both whitelists at `:131-136` and `:249-254`, else silently stripped (F8/V6)." For swarm/roadmap-revise, persist the chosen `--to` into the ledger so it's stable across rounds. Reuse the 7 fixed roles only.

### D7 — A_DIVERGE agy detection uses a TUI command, not the enabled flag (HIGH)
**Location:** `A_DIVERGE` step 3 (L104-106): *"若 `tools.agy.enabled`（`maestro tools list --json` 查）"*.
**Reality:** F7 / r3d — agy availability = `isCliAvailable("agy")` / `tools.agy.enabled` (`cli-tools-config.ts:400-407`). 06-collab.md §9.3 + 03 — **`maestro tools list` launches a TUI** (`src/commands/tools.ts:72`); there is **no `--json`** subcommand. The collab command's identical `maestro tools list --json` line is documented as a *dead clause* whose `|| cat ~/.maestro/cli-tools.json` fallback is what actually runs.
**Defect:** The command tells the agent to query `tools.agy.enabled` *via* `maestro tools list --json`. That invocation either errors (no `--json`) or, worse, **opens a TUI and blocks** a non-interactive `--auto -y` run indefinitely. There is no `|| cat` fallback here (collab at least had one). So the agy-vs-self branch detection is built on a non-existent/blocking command.
**Severity:** HIGH (a blocking TUI under `--auto -y` is a hang, not a degrade).
**Fix:** Replace with a non-interactive probe: read `~/.maestro/cli-tools.json` (or `{workDir}/.maestro/cli-tools.json`) and check `tools.agy.enabled == true`; or `maestro delegate`-side `isCliAvailable` equivalent (`agy --version`). Never call `maestro tools list` in an autonomous path. The fallback to `Task`/`team-swarm` (L106) is concrete enough — keep it.

### D8 — Unhandled error/edge cases (HIGH, aggregate)
**Location:** state machine (L46-82), actions throughout. The following paths have **no transition or handler**:
| Edge | Where it should be caught | Current state | Severity |
|------|---------------------------|---------------|----------|
| **Child CLI crash / non-zero exit** (delegate returns exit 1) | A_AWAIT (L144) | No branch. A_AWAIT assumes a transcript + status.json exist. A crashed child = no/partial status.json → A_REVIEW parses garbage. Only `confidence<60`/`解析失败` at A_VERDICT (L157) half-covers it, and that routes to "插入修复" which re-delivers — possible infinite crash-loop with no budget check. | HIGH |
| **delegate timeout** (10-min stale-kill, 03 §3.3 `DEFAULT_STREAM_TIMEOUT_MS`) | A_AWAIT | Unhandled. A force-killed child looks identical to a crash; same loop risk. No mention of `--timeout`. | HIGH |
| **Empty roadmap / roadmap produced 0 milestones** | A_ROADMAP (L108) → A_LOOP_INPUT | A_LOOP_INPUT (L111) does "next-incomplete" with no empty guard → cursor undefined → A_DECIDE defaults to "推进" on nothing. | MED |
| **analyze fails / produces no artifact** | A_ANALYZE (L94) | No failure branch; A_COMPLEXITY (L97) reads a missing artifact. | MED |
| **No external CLI available at all** (only host, none enabled) | A_SELECT_EXECUTOR (L131), invariant #4 | "默认 Claude" assumes Claude is enabled; if zero CLIs enabled, delivery + the ≠-implementer rule both have nothing. No E-code. | HIGH |
| **Budget exhaustion** | A_LEDGER (L168-170) names "预算耗尽" as a terminate trigger but **budget is never defined, tracked, or decremented** anywhere (no field in ledger_schema L176-194). It can never actually fire. | MED |
| **state.json missing** | A_INIT (L86-92, "不存在则标记需先 maestro-init") | Marked but no transition — does the machine halt, prompt, or proceed? Undefined. | LOW |
**Fix:** Add an `S_CHILD_FAIL` branch off A_AWAIT for exit≠0/timeout/missing-status, routed to a **bounded** retry (max-N, tracked in ledger) then escalate (non-auto) or A_AUTO_FULLCHAIN (auto). Define a real budget (rounds and/or wall-clock) as a ledger field and decrement it in A_LEDGER. Add empty-roadmap and analyze-fail guards. Add an E-code for zero-enabled-CLI.

### D9 — Alias / same-base-tool collision not considered in ≠-implementer (LOW)
**Location:** A_REVIEW L153.
**Reality:** 06-collab.md §9.8 — outputs keyed by tool *name* can collide when two aliases share a base tool (`claude` vs `claude-analysis`). 03 §4.3 — domain ranking can pick aliases.
**Defect:** "≠ 实现 CLI" compares CLI *names*; two aliases of the same backing model satisfy "different name" while being the same model self-grading.
**Severity:** LOW.
**Fix:** Compare `baseTool`, not display name, when enforcing evaluator≠implementer.

---

## What's solid

- **Invariant set (L22-30) is sound and faithful** to the researched design positions (D1–D3 in §2 of the flow doc): A-window analyzes/schedules only, in-context self-decide, never-stop-under-`--auto -y`. The "evaluator≠implementer" *intent* (#4) is correct even though its *mechanism* (D4) is weak.
- **Default-advance + two-exception decision shape** (A_DECIDE L117-120) correctly mirrors the canonical FSM (flow §3.9) — advance / insert-fix (roadmap untouched) / revise-roadmap.
- **A_EMIT_GOAL paste-once + Skill() self-call chain** (L90-93, L196-207) correctly reflects F2/F3 — it does *not* misuse `/loop` as the driver and correctly treats `/goal` as a host stop-contract emitted once. This is the right mental model.
- **Adaptive review tiers exist and name the right primitives** (verify / quality-review / insight-challenge / collab, F9) and correctly identify `collab` as the only multi-CLI escape from single-model self-grading (L152). The *structure* is right; the *selection rule* and one *application* (D5) need tightening.
- **A_AUTO_FULLCHAIN cross-session drift self-check** (L162-166) correctly internalizes V5/F6 — brain does its own drift check rather than trusting the child's self-halt (which is prompt-enforced, not engine-enforced). Good.
- **Ledger / resumability** (L29, L176-194) is present and round-keyed — the right shape for auditability (modulo the missing budget field, D8).
- **agy-else-self *fallback target*** (Task/team-swarm, L106) is concrete and correct (F7); only the *detection* command is wrong (D7).
- Config injection **correctly identifies** the 7-fixed-role reuse and that swarm/roadmap-revise have no role (L224) — the awareness is right even if the residual-loss warning (D6) needs hardening.

---

## Severity tally
CRITICAL: D1, D3 · HIGH: D2, D4, D7, D8 · MED: D5, D6 · LOW: D9.
The two CRITICALs (D1 delivery-contract, D3 await-conflation) both trace to the same root: the command treats **UNVERIFIED Phase-0 items (V1/V2/V4) as settled facts** and bakes them into the state machine with no probe and no fallback gating.
