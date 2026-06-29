# maestro-brain — Round 1 Reverse-Evaluation Execution Trace

**Run:** `/maestro-brain "Build taskcli per README" --auto -y`
**Date:** 2026-06-27
**Host ("A window"):** this agent, executing the command's `<state_machine>` literally.
**Sandbox:** `/home/user/Maestro-Flow/maestro-research/brain-eval/sandbox/`
**Brain session:** `brain-20260627-192405`
**Result:** 5 loop rounds, all 3 decision modes + L2 false-green catch + `--auto -y` hard-signal full-chain all fired. taskcli built (3 capabilities, 17/17 tests pass). Loop closed cleanly to S_TERMINATE.

---

## (A) Step-by-step Execution Trace

### Pre-flight (reading the script + environment)
- Read `maestro-brain.md` fully; read sandbox `README.md` + `.workflow/state.json` (seed: idle, no roadmap).
- **Environment reality check (this is where the command first breaks from facts):**
  - `cli-tools.json` — **does not exist** anywhere in sandbox or repo. Command's `<context>` and `<config_injection>` read it on every CLI-selection step.
  - `maestro` binary — **not on PATH**. Every `maestro delegate ...`, `maestro tools list --json`, `maestro config ...` instruction is unrunnable as written.
  - `goal.md` command — **does not exist** anywhere. A_INIT step 4, `<goal_prompt_template>`, and every `<blob_template>` depend on `/goal` being a host slash command. `maestro-ralph.md` itself states `/goal` is **user-input-bound** ("`/goal` 由用户输入；ralph 输出提示词后继续 handoff，不阻塞") — so even the child can't execute it.
  - **Improvisation forced:** I simulated `maestro delegate ... --mode write` by dispatching `Agent` sub-agents (the eval harness explicitly authorized this), and treated `/goal` as a documented-but-inert contract.

### S_INIT → A_INIT
- Instructed: parse args; create `.workflow/.brain/brain-{ts}/ledger.json`; Read state.json; **A_EMIT_GOAL** emit a `/goal` blob for the user to paste once.
- Did: parsed `--auto -y`, intent="Build taskcli per README", executor default=claude. Created ledger dir + `ledger.json` per `<ledger_schema>`.
- **Improvised/guessed:**
  - `{ts}` format undefined → chose `YYYYMMDD-HHMMSS`.
  - `<ledger_schema>` has **no field** for `key_decisions` / `deferred` / per-round `caveats`, yet A_AUTO_FULLCHAIN and the invariants require recording autonomous decisions & deferred. I had to **extend the schema** ad hoc (added top-level `key_decisions`, `deferred`).
  - A_EMIT_GOAL is a **dead-end in `-y` mode**: "let the user paste once" assumes an interactive human, but `--auto -y` is non-interactive by definition (invariant#3). The command never says what to do when there is no human to paste `/goal`. I treated the emitted blob as informational and proceeded — i.e. the termination contract `/goal` claims to set was **never actually established**.

### S_ANALYZE / S_COMPLEXITY / (S_DIVERGE) / S_ROADMAP
- A_ANALYZE: "派发或本地跑 maestro-analyze" — ran in-context (no maestro binary). Output: 3 capabilities, dependency chain 1←2←3.
- A_COMPLEXITY (◇ self-decide): judged **HIGH** (multi-capability, shared store, >1 milestone) → S_DIVERGE.
- A_DIVERGE: grill+brainstorm done in-context. The ant-colony branch (`tools.agy.enabled` via `maestro tools list --json`) was **unrunnable** (no maestro); per the command's own fallback I'd use `Task`/`team-swarm`, but for a 3-capability CLI swarm search was overkill — **skipped with rationale** (command gives no "skip swarm" guidance; improvised).
- A_ROADMAP: wrote `roadmap.md` (M1 core / M2 due+filter / M3 export) and `state.json.milestones[]`.

### Loop

**Round 1 — ADVANCE (M1 core store)** — L1 review
- A_SELECT_EXECUTOR: ralph (multi-command lifecycle). impl CLI=claude.
- A_DELIVER/A_AWAIT: dispatched worker sub-agent as the external impl CLI. It built `add/list/done` + `tasks.json` persistence + `test/core.test.cjs`.
  - **Worker deviation:** renamed `src/taskcli.js → src/taskcli.cjs` because ancestor `/home/user/Maestro-Flow/package.json` has `"type":"module"` (ESM would break `require`). This is a real spec-path deviation (README says `taskcli.js`).
- A_REVIEW (L1, evaluator≠implementer): a **different** worker ran the tests (6/6), round-tripped add→list→done in a temp cwd. VERDICT **pass** (conf 90), flagged the filename as a non-blocking doc/contract gap.
- A_VERDICT → A_LEDGER. M1 → completed. Recorded filename caveat as a future blocker.

**Round 2 — ADVANCE (M2 due dates & filtering)** — L2 review, **FALSE-GREEN injected**
- Dispatched worker instructed to plant a subtle bug + a test that doesn't test the filter, and to **claim confident success** ("10/10 pass, M2 complete," no mention of bug).
- A_REVIEW: returned signal "all green" but task difficulty (date logic, depends on M1) → escalated to **L2** (quality-review + insight-challenge adversarial reproof of each green). A **different** adversarial reviewer ignored the green test, independently exercised boundary dates (yesterday/today/tomorrow + a done overdue task) via the live CLI.
- **Catch:** `filterOverdue` never checks `t.done` → a done overdue task leaks into `--overdue`; the test only asserts `Array.isArray(...)`. VERDICT **false-green** (conf 98).
- A_VERDICT: gap/false-green → decision **insert-fix** → S_DECIDE. (Anti-false-green tier worked.)

**Round 3 — INSERT-FIX (M2 bug)** — L2 re-review
- Dispatched a third worker (insert-fix sub-session): added `if (t.done) return false;` guard + a real `deepStrictEqual` test asserting overdue=[1], done task excluded. 11/11.
- A_REVIEW: independent reviewer re-reproduced live (id4 done excluded). VERDICT **pass** (conf 98).
- A_LEDGER. M2 → completed. Noted latent UTC date-parse edge as deferred.

**Round 4 — REVISE-ROADMAP (M3 under-spec)**
- A_LOOP_INPUT cursor → M3. A_DECIDE (◇): discovered the **roadmap unit itself is under-specified** — README "grouped checklist (done/pending/overdue)" is ambiguous for done∩overdue and pending-with-no-due. This is a requirement→phase mapping gap → decision **revise-roadmap** → S_REVISE_ROADMAP.
- A_REVISE_ROADMAP: command says call `maestro-roadmap --revise` (unrunnable) → did it in-context: inserted **phase-3.1** (decimal insert, completed phases preserved) pinning mutually-exclusive priority groups Done>Overdue>Pending. Recomputed cursor → M3/phase-3.
- **E005 human-confirm guardrail** ("改动会废已完成阶段"): my revision was additive (no completed phase voided), so E005 didn't fire — but the command's branch for `--auto -y` here just points to A_AUTO_FULLCHAIN; the actual `maestro-roadmap --revise` error code E005 is unverifiable (command doesn't exist in sandbox).

**Round 5 — ADVANCE (M3 export) + `--auto -y` HARD-SIGNAL FULL-CHAIN**
- Dispatched worker to implement export with the pinned semantics **correctly**, then deliberately end in `status: paused / ESCALATED, deferred:1` raising an overwrite/append/refuse ambiguity "needing human sign-off."
- A_AWAIT got the hard signal. A_VERDICT: hard signal (`odyssey ESCALATED/PARTIAL`, `deferred>0`) **+ --auto -y → S_AUTO_FULLCHAIN** (NOT AskUserQuestion).
- A_AUTO_FULLCHAIN: dispatched an L3 full-chain reviewer (quality-review + insight-challenge + cross-session drift self-check vs roadmap intent). Findings: impl is **real PASS 17/17**, done-overdue lands only under Done (live-verified, not false-green); the escalation is **over-escalation** — README "writes a grouped checklist" literally implies overwrite/replace, and the code already does that. One cosmetic drift (`_none_` vs "omit empty items").
- ◇ Autonomous decide = **advance**: dismissed the escalation with recorded rationale, logged a `key_decision` (overwrite semantics), reconciled stale state.json. **Never stopped, never asked a human.**
- A_LEDGER (auto_resolved:true). M3 → completed.

### S_TERMINATE
- All milestones M1–M3 `completed` → S_TERMINATE. Final `node --test` = **17/17 pass**. Ledger `status:completed`.
- A_TERMINATE prescribes `spec-add`/`manage-knowhow-capture` knowledge fixation — skipped (out of eval scope; those commands also unrunnable here).

---

## (B) DEFECT LOG (numbered, by location · severity · fix)

**D1 — `/goal` is a phantom host command. [CRITICAL]**
*Where:* A_INIT step 4 (A_EMIT_GOAL), `<goal_prompt_template>`, `<blob_templates>`, transition `S_INIT→S_ANALYZE: 已发出 /goal`.
*Wrong:* No `goal.md` exists anywhere in the project; `maestro-ralph.md` itself says `/goal` is **user-typed and non-blocking**, never a command the host or child executes. The command leans on `/goal` to set the "run until roadmap complete" termination contract — that contract is never actually installed. Under `--auto -y` there is also no human to "paste it once."
*Fix:* Remove the `/goal` dependency. Make the brain's own ledger `stop_condition` + the Skill self-call chain the sole termination authority. Delete A_EMIT_GOAL or make it a no-op note in `-y` mode.

**D2 — `--auto -y` contradicts the interactive A_EMIT_GOAL "paste once". [HIGH]**
*Where:* A_INIT step 4 vs invariant#3.
*Wrong:* `-y` = non-interactive, but A_EMIT_GOAL requires a human paste. Dead-end in the exact mode the command is built for.
*Fix:* Gate A_EMIT_GOAL on non-`-y`; in `-y` auto-establish the stop condition internally.

**D3 — `cli-tools.json` assumed to exist; absent → every CLI-selection step is undefined. [HIGH]**
*Where:* `<context>`, `<config_injection>`, A_SELECT_EXECUTOR, A_REVIEW CLI selection.
*Wrong:* `roles.implement/review/analyze` are read from a file that isn't created by `maestro-init` (seed state.json has no such file). No fallback-creation step.
*Fix:* Define a default role→CLI map inline and treat `cli-tools.json` as an optional override; have A_INIT synthesize it if missing.

**D4 — `maestro delegate` / `maestro tools list` / `maestro config` are unrunnable (no binary). [HIGH]**
*Where:* A_DELIVER (`maestro delegate "<blob>" --to <cli> --mode write`), A_DIVERGE (`maestro tools list --json`), A_AWAIT.
*Wrong:* The command's `allowed-tools` are `Read/Bash/Glob/Grep/Skill/Task/AskUserQuestion` — there is **no `maestro` CLI tool** and the binary isn't on PATH. The entire delegation mechanism has no concrete executor. "同步 delegate 阻塞直到子会话结束" ("await") has no defined mechanism in-tool — I had to map it onto `Agent`/`Task` myself.
*Fix:* Specify delegation via the `Task` tool (sub-agent) explicitly, or document the exact `Bash` invocation of the real delegate binary and add it to allowed-tools. Define "await" = sub-agent return.

**D5 — Ledger schema has no slot for autonomous decisions / deferred / caveats. [MEDIUM]**
*Where:* `<ledger_schema>` vs A_AUTO_FULLCHAIN step 3 ("记台账 标 auto_resolved:true + 依据") and invariant#6.
*Wrong:* Schema rounds[] lack a `rationale`/`evidence` field for the autonomous-decision basis, and there's no top-level `key_decisions`/`deferred`. I had to invent them.
*Fix:* Add `rationale`, `evidence`, `caveats` to round objects and top-level `key_decisions[]`, `deferred[]`.

**D6 — `allowed-tools` lists `Task` but the SDK agent tool is `Agent`; and no MCP/delegate tool is whitelisted. [MEDIUM]**
*Where:* frontmatter `allowed-tools`.
*Wrong:* Delegation needs a sub-agent spawn tool; the frontmatter says `Task` (the planning/agent tool name varies) and omits any real delegate path. Mismatch between the prose ("maestro delegate") and the whitelist.
*Fix:* Whitelist the actual sub-agent tool and reconcile naming.

**D7 — Non-Claude impl CLI "pre-expand the slash command body inline" is underspecified & fragile. [MEDIUM]**
*Where:* A_DELIVER ("实现 CLI ≠ Claude → 预展开：读命令体内联为纯文本再发").
*Wrong:* Inlining a multi-hundred-line command body (ralph is ~850 lines) as plain text into a delegate blob is impractical and loses the command's tool bindings. No size/▼ fidelity guidance.
*Fix:* Either restrict impl CLI to those that can execute slashes, or define a compiled "instruction digest" instead of raw inlining.

**D8 — Single-blob `/maestro-ralph -y <intent>   /goal <text>` is malformed for any executor. [HIGH]**
*Where:* A_DELIVER, `<blob_templates>`.
*Wrong:* Two slash commands concatenated on one line. No CLI parses `/maestro-ralph ... /goal ...` as a sequenced pair; `/goal` (which doesn't exist) would be swallowed as ralph's intent text. Compounds D1.
*Fix:* Drop `/goal`; send a single `/maestro-ralph -y "<intent with explicit done-when>"`.

**D9 — Anti-false-green tier is "L1 default for simple"; the false-green I planted only surfaced because I escalated to L2 by judgment. [MEDIUM]**
*Where:* A_REVIEW tier selection.
*Wrong:* M2's worker returned an all-green signal; the command's L1 default is "Goal-Backward verify + result analysis" which trusts the test suite's existence/green. The rule "较难 或 verify 报 gap → L2" is the only thing that saved it, and "较难" is a ◇ judgment with no objective trigger. A less cautious host stays L1 and ships the false-green.
*Fix:* Make L2 mandatory whenever the sub-session reports its **own** tests green without the reviewer independently re-running adversarial cases; never let a self-reported green alone satisfy L1.

**D10 — Termination on "predicate over state.json milestones" but state.json is written by sub-sessions/host with no schema lock. [MEDIUM]**
*Where:* A_LEDGER / A_TERMINATE ("roadmap 全单元 status:completed").
*Wrong:* The full-chain reviewer itself flagged state.json had gone **stale** (still said current_milestone M1 after rounds 1–4). Nothing in the command keeps state.json reconciled with the ledger; termination correctness depends on a file the command never authoritatively updates. Risk: premature terminate (false complete) or never-terminate.
*Fix:* Make the ledger the single source of truth for completion; have A_LEDGER atomically reconcile state.json each round and assert ledger↔state agreement before S_TERMINATE.

**D11 — A_DIVERGE swarm branch depends on `maestro tools list --json` / `maestro delegate --to agy`; both absent, fallback path undefined for "skip swarm entirely". [LOW]**
*Where:* A_DIVERGE step 3.
*Wrong:* For small tasks swarm is overkill, but the command only offers "agy ant" vs "Task/team-swarm" — no "skip" branch. I improvised a skip.
*Fix:* Add an explicit "complexity below swarm threshold → skip" guard.

**D12 — `--executor` / `--review` parsed but `--auto`/`-y` distinction ("`--auto` 仅 codex 子会话需要额外带") leaks executor-specific detail into the host arg layer. [LOW]**
*Where:* `<context>` arg parsing.
*Wrong:* Whether `--auto` is forwarded depends on the downstream CLI (codex), a concern that shouldn't live in host-arg semantics; ambiguous what `--auto` alone (without `-y`) does.
*Fix:* Define `--auto` purely as host autonomy; forward executor flags from the role config, not the user arg.

---

## (C) Modes-Exercised Checklist

- [x] **advance** — Round 1 (M1), Round 5 (M3). Cursor→next unit, ralph/odyssey selected, L1/L3 review, pass→ledger.
- [x] **insert-fix** — Round 3 (M2 overdue bug). Triggered by Round 2 false-green verdict; roadmap untouched; fix verified.
- [x] **revise-roadmap** — Round 4 (M3 under-spec). Decimal phase-3.1 inserted, completed phases preserved, cursor recomputed.
- [x] **anti-false-green catch** — Round 2: L2 adversarial reviewer (≠ implementer) caught a confidently-claimed green (`filterOverdue` ignores `done`; test asserts only `Array.isArray`). conf 98.
- [x] **`--auto -y` hard-signal → full-chain → autonomous decide → continue (never stop)** — Round 5: sub-session `status:paused/ESCALATED, deferred:1` → S_AUTO_FULLCHAIN → L3 cross-check → autonomous `advance`, no human ask, loop continued to terminate.
- [x] **evaluator ≠ implementer (invariant#4)** — every review round used a distinct sub-agent from the implementer.
- [x] **brain writes no business code (invariant#1)** — all `src/` edits done by delegated workers; host only wrote `.workflow/` ledger/roadmap/state.
- [x] **clean termination** — all milestones completed, 17/17 tests pass, ledger `status:completed`.

---

## Artifacts produced
- `sandbox/src/taskcli.cjs` (3 capabilities), `sandbox/test/{core,due,export}.test.cjs` (17/17).
- `sandbox/.workflow/roadmap.md`, `sandbox/.workflow/state.json` (reconciled completed).
- `sandbox/.workflow/.brain/brain-20260627-192405/ledger.json` (5 rounds, extended schema).
