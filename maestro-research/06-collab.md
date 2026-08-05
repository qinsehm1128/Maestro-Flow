# Maestro — `maestro-collab` (Cross-Verification / Multi-CLI Consensus)

`maestro-collab` is Maestro's **multi-CLI consensus** command: it fans the *same*
question out to several independent CLI tools in parallel, then cross-verifies their
answers into **consensus / conflict / unique** buckets and synthesizes a unified,
plan-compatible report. It is the TRUE multi-CLI owner of the suite.

> **Scope note — read this first.** This document separates **code-enforced**
> behavior (TypeScript under `src/`) from **authored-prompt** behavior (markdown/skill
> files that instruct a *host* agent what shell commands to run). For collab this
> distinction is unusually load-bearing: there is a **naming collision** in the repo.
> The file `src/commands/collab.ts` does **not** implement cross-verification at all —
> it is an entirely different command (human-team collaboration). The cross-verify
> behavior lives **only** in authored prompt/skill files. See §2 and §3.

---

## Table of Contents

1. [Mental model — what collab is for](#1-mental-model--what-collab-is-for)
2. [The naming collision: two unrelated "collab"s](#2-the-naming-collision-two-unrelated-collabs)
3. [The two cross-verify implementations & their divergence](#3-the-two-cross-verify-implementations--their-divergence)
4. [Fan-out & parallelism](#4-fan-out--parallelism)
5. [Synthesis algorithm (consensus / conflict / unique)](#5-synthesis-algorithm-consensus--conflict--unique)
6. [Inputs & outputs (flags, artifacts, downstream)](#6-inputs--outputs-flags-artifacts-downstream)
7. [Relationship to delegate / coordinate / adapters](#7-relationship-to-delegate--coordinate--adapters)
8. [End-to-end walkthrough of one collab run](#8-end-to-end-walkthrough-of-one-collab-run)
9. [Ambiguities & unverifiable points](#9-ambiguities--unverifiable-points)
10. [Cross-references](#10-cross-references)

---

## 1. Mental model — what collab is for

Use `maestro-collab` when you have **one question** and you want it **independently
answered by multiple, different CLI tools** (Claude, Codex/`gpt`, Gemini, Qwen, `agy`,
…), then reconciled. The value is *cross-model agreement*: a finding that three
different model backends independently surface is far more trustworthy than one
model's opinion, and disagreements are surfaced explicitly rather than averaged away.

The output is deliberately decision-shaped:

- **Consensus** — agreed by 2+ tools → high trust → becomes **Locked** in `context.md`.
- **Conflict** — tools disagree → resolved by evidence-weighted voting, or → **Deferred**.
- **Unique** — only one tool saw it → kept as **Free** when evidence is strong.

### 1.1 Contrast with the neighbors

| Command | Axis of diversity | Backends | Question | Reference |
|---------|-------------------|----------|----------|-----------|
| **maestro-collab** | **Multiple CLI tools** (different model backends) | **N CLIs, 1 prompt each** | Same question to all | this doc |
| **maestro-brainstorm** | **Multiple personas/roles** | **Single CLI** spawned per role (or sub-agents), all the same backend | Same topic, different lenses | see doc 05 |
| **maestro coordinate** | Sequential/graph of *steps* | One delegate spawn per graph node | Different sub-tasks | doc 03 §5 |
| **maestro delegate** | None (atomic) | One CLI to completion | One task | doc 03 §2 |

The crisp distinction: **brainstorm varies the *persona* against a single CLI;
collab varies the *CLI tool itself*** and asks every tool the identical prompt
(`.codex/skills/maestro-collab/SKILL.md:71` — *"Same prompt, different --to"*).
Coordinate/delegate decompose work into *different* tasks; collab is pure
*replication* of one task for cross-checking.

---

## 2. The naming collision: two unrelated "collab"s

There are **two completely different things** named "collab" in this repo. Conflating
them is the single biggest trap.

### 2.1 `maestro collab` (the CLI) — human-team collaboration, NOT cross-verify

`src/commands/collab.ts` (1343 lines) is registered as the `collab` **and** `team`
CLI subcommands:

```ts
// src/cli.ts:52-53
collab:     async () => (await import('./commands/collab.js')).registerCollabCommand,
team:       async () => (await import('./commands/collab.js')).registerCollabCommand,
```

Its own header states its purpose plainly
(`src/commands/collab.ts:1-19`): *"human-team collaboration CLI (team-lite)"*, whose
subcommands are `join`, `whoami`, `report`, `status`, `sync`, `preflight`, `guard`,
`spec`, `role`, `task` (`src/commands/collab.ts:736-885`). It manages multi-*human*
teammates working the same repo: member registry, activity log
(`.workflow/collab/activity.jsonl`), git stash/pull/push sync
(`runSync`, `:454-681`), overlay-bundle import (`syncOverlays`, `:237-320`), and a
task tracker (`task create/list/show/status/assign/check`, `:1094-1337`).

**There is no fan-out, no delegate spawn, no CLI tool selection, and no
consensus/conflict/unique logic anywhere in `collab.ts`.** It never imports
`delegate.ts`, `cli-agent-runner`, or `cli-tools-config`. It writes only to
`.workflow/collab/**` and explicitly avoids the agent pipeline
(`src/commands/collab.ts:18-19`). This resolves the open question doc 03 flagged
("`collab.ts` internals were not fully read here", `03-...md:594-597`): the 1343-line
file is **not** a cross-verify implementation at all.

### 2.2 `maestro-collab` (the slash command / skill) — the real cross-verify

The actual cross-verification command exists **only** as authored prompt files:

- `.claude/commands/maestro-collab.md` — the Claude Code slash-command orchestrator.
- `.codex/skills/maestro-collab/SKILL.md` — the Codex/skill variant (parallel content).

Both fan out to multiple CLIs via `maestro delegate` and synthesize consensus. Neither
has a backing TypeScript file that performs the orchestration; the host agent executes
the prose. This is *orchestration-by-prose over the `delegate` CLI* (consistent with
doc 03 §7, `03-...md:429-431`).

> **Implication:** "`maestro collab …`" on the terminal runs the *team* CLI;
> "`/maestro-collab …`" inside a Claude/Codex session runs the *cross-verify*
> orchestrator. They share a name and nothing else.

---

## 3. The two cross-verify implementations & their divergence

Within the *cross-verify* meaning there are two authored implementations: the
`.claude` command and the `.codex` skill. The remainder of this document is about
these (not `collab.ts`).

### 3.1 (a) `.claude/commands/maestro-collab.md` — the Claude orchestrator

- **State machine** (`maestro-collab.md:37-160`):
  `S_PARSE → S_DISCOVER → S_CONFIRM → S_FANOUT → S_COLLECT → S_CROSS_VERIFY →
  S_BOUNDARY_GRILL → S_SYNTHESIZE → S_REGISTER → S_REPORT`.
- **Fan-out mechanism:** launch ALL delegates in **one message** as multiple
  `Bash(run_in_background: true)` calls, then **STOP** and wait for background
  callbacks (`:108-123`, action `A_PARALLEL_DELEGATE`). Each call is
  `maestro delegate "${prompt}" --to {tool} --mode ${mode} [--rule ${rule}]`
  (`:119-122`).
- **Collection:** on each callback, `maestro delegate output <id>` → write
  `per-tool/{tool}-output.md` (`:125-127`).
- **Output dir:** `.workflow/scratch/{YYYYMMDD}-collab-{slug}/` (`:30, :106`).

### 3.2 (b) `.codex/skills/maestro-collab/SKILL.md` — the Codex skill

- **State machine** (`SKILL.md:76-116`):
  `S_PARSE → S_CONFIRM → S_FAN_OUT → S_CROSS_VERIFY → S_BOUNDARY_GRILL →
  S_SYNTHESIZE → S_AGGREGATE`.
- **Fan-out mechanism:** parallel **`shell_exec`** (not background Bash) — one
  `shell_exec("maestro delegate … --to <tool> …", { timeout: 30000 })` per tool, and
  *each `shell_exec` blocks until its delegate completes* (`SKILL.md:139-168`).
- **Hard invariants** (`SKILL.md:64-74`): all analysis MUST go through
  `shell_exec → maestro delegate`; the coordinator NEVER analyzes internally, NEVER
  fire-and-forgets, NEVER caps timeout, and uses **indefinite wait** until the CLI
  returns (`:64-74, :158-175`).
- **Session/scratch dirs:** session `.workflow/.maestro/{YYYYMMDD}-collab-{slug}/`
  **and** scratch `.workflow/scratch/{YYYYMMDD}-collab-{slug}/` (`SKILL.md:46-47`).

### 3.3 Divergence analysis (`.claude` vs `.codex`)

| Dimension | `.claude/…/maestro-collab.md` | `.codex/…/SKILL.md` | Divergence |
|-----------|-------------------------------|---------------------|------------|
| Launch primitive | `Bash(run_in_background: true)` per tool (`:119`) | `shell_exec(..., {timeout:30000})` per tool (`SKILL.md:145`) | **Different concurrency model** — async/detached + callback vs blocking shell calls |
| Wait model | Launch then **STOP**, resume on callback (`:123`) | **Block** in-line until each completes; indefinite wait, no timeout cap (`SKILL.md:151-175`) | Async vs synchronous |
| Stated `shell_exec` timeout | n/a | `30000` in example, but invariant says **NO max timeout** (`SKILL.md:70, :145`) | **Internal inconsistency** in the skill (see §9) |
| Min-completed gate | `S_COLLECT`: continue if **1+** succeeded (W001), E004 only if all fail (`:71-73`) | `S_FAN_OUT`: needs **2+** completed, else E004 (`SKILL.md:99, :163-167`) | **Different join policy** — collab.md tolerates 1 survivor, skill requires 2 |
| Output dir | scratch only (`:30`) | session **and** scratch (`SKILL.md:46-47`) | Skill writes a second session dir |
| Spec enrichment | not in actions | `maestro spec add arch …` per Locked decision (`SKILL.md:243`) | Skill persists Locked decisions into specs |
| `update_plan`/plan tracking | implicit | explicit `update_plan` calls (`SKILL.md:135, :245`) | Skill is more state-tracked |
| Low-consensus warning code | **W003** (`:168`) | **W004** (`SKILL.md:272`) | **Different error code** for the same `<40%` condition |
| `cross-verify.md` artifact | not separately persisted | persisted at `{scratchDir}/cross-verify.md` (`SKILL.md:82, :190`) | Skill emits an extra intermediate file |

Both agree on: ≥2 eligible tools required (E002); default = first 3 enabled in config
order; `--mode write` excludes `api-endpoint` tools; identical
consensus/conflict/unique table and `consensus_level` formula; boundary-grill on
conflicts (max 3×3, non-blocking); the same three output files
(`collab-report.md`, `context.md`, `conclusions.json`).

> **Net:** the `.codex` skill is the stricter, more fully specified variant (blocking
> waits, 2-survivor minimum, extra `cross-verify.md` + session dir + spec enrichment).
> The `.claude` command is the leaner async/callback variant (1-survivor tolerance).
> The divergence is in *concurrency model, join policy, and warning codes*, not in the
> core synthesis algorithm.

---

## 4. Fan-out & parallelism

**Concurrency model.** Neither cross-verify variant uses the code-level
semaphore-bounded scheduler `ParallelCliRunner` (`src/agents/parallel-cli-runner.ts`,
doc 03 §6). Parallelism is achieved by the *host agent* issuing N concurrent shell
launches:

- `.claude`: N `Bash(run_in_background:true)` in a single message → all spawn at once,
  then the orchestrator yields and waits for completion callbacks
  (`maestro-collab.md:119-123`).
- `.codex`: N parallel `shell_exec` calls, each blocking on its own delegate
  (`SKILL.md:139-156`).

There is no explicit max-concurrency limit in either prompt — the degree of
parallelism equals the number of selected tools (default 3; `:25, SKILL.md:44`).

**Session grouping.** Each fan-out gets one session/scratch dir keyed by
`{YYYYMMDD}-collab-{slug}` (`:30`, `SKILL.md:46-47`); per-tool raw outputs land under
`per-tool/{tool}-output.md`. Each underlying `maestro delegate` run is itself a tracked
execution with its own `execId` in the delegate history store (see §7).

**Join policy.**
- `.claude`: **any-but-not-none** — proceed once callbacks arrive; continue with
  partial results if **1+** succeeded (`maestro-collab.md:71-73`); E004 only if all
  failed.
- `.codex`: **majority-of-two** — require **≥2** completed for a valid cross-verify
  (cross-verification is meaningless with one answer), else E004
  (`SKILL.md:99, :163-167`).

**Failure handling.** One tool failing → **W001**, log the error, continue with the
rest (partial degradation, `:167, SKILL.md:73, :168`). All failing (or, for the skill,
<2 succeeding) → **E004**, abort with per-tool error detail.

---

## 5. Synthesis algorithm (consensus / conflict / unique)

This is the heart of collab and is **identical** across both variants
(`maestro-collab.md:129-157`, `SKILL.md:176-238`).

### 5.1 Classification (cross-verify)

The coordinator reads every `per-tool/{tool}-output.md` and tags each finding:

```
| Condition                              | Tag       |
|----------------------------------------|-----------|
| 2+ tools agree on the same finding     | CONSENSUS |
| Tools have contradictory findings      | CONFLICT  |
| Only 1 tool identified it              | UNIQUE    |
```
(`.codex` `SKILL.md:180-184`; `.claude` `maestro-collab.md:133-138`.)

For each CONFLICT, the coordinator records *which* tools disagree, their evidence, and
their confidence levels (`SKILL.md:186`).

### 5.2 Consensus level

```
consensus_level = consensus_count / total_findings * 100
```
(`maestro-collab.md:139`, `SKILL.md:188`). If `consensus_level < 40%`, raise the
low-confidence warning — **W003** in the `.claude` command (`:140, :168`) vs **W004**
in the `.codex` skill (`SKILL.md:272`) — and flag for manual review.

### 5.3 Boundary-grill on conflicts

Before final synthesis, CONFLICT findings are passed through a *boundary grill*
(`~/.maestro/workflows/boundary-grill.md`), capped at **max 3 conflicts × 3 questions**
and **non-blocking** (`maestro-collab.md:78-82, :142-146`; `SKILL.md:105-108, :192-196`).
Resolutions feed into synthesis; if no boundary conflicts, it is a pass-through.

### 5.4 Conflict resolution (synthesis) — evidence-weighted voting

The `.claude` command spells out the resolution rule explicitly
(`maestro-collab.md:150-151`):

> Resolve conflicts via evidence-weighted voting:
> - **Higher confidence wins**; **more specific evidence (file:line) wins over
>   general**; **tied → SUGGESTED**.

The result of classification then maps onto the plan vocabulary
(`maestro-collab.md:154-155`, `SKILL.md:226`):

- **CONSENSUS → Locked**
- **UNIQUE (with strong evidence) → Free**
- **CONFLICT (unresolved) → Deferred**

---

## 6. Inputs & outputs (flags, artifacts, downstream)

### 6.1 Flags (both variants, `:22-28`, `SKILL.md:23-28`)

| Flag | Default | Meaning |
|------|---------|---------|
| `<requirement>` (positional) | — (required; else AskUserQuestion) | The question to cross-verify |
| `--tools <list>` | first **3** enabled tools, config order | Comma-separated CLI tool names |
| `--mode analysis\|write` | `analysis` | Delegate mode; `write` excludes `api-endpoint` tools |
| `--rule <template>` | none | Shared rule template applied to *all* delegates |
| `-y` | off | Skip plan confirmation |

`--rule` accepts named templates resolved by `maestro delegate --rule` (the skill lists
a catalog: `analysis-review-code-quality`, `analysis-diagnose-bug-root-cause`,
`planning-plan-architecture-design`, etc. — `SKILL.md:29-43`).

### 6.2 Tool discovery & default set

Discovery reads `~/.maestro/cli-tools.json`, filters `enabled == true` (and excludes
`type == "api-endpoint"` when `--mode write`), and auto-selects the **first 3 in config
order** when no `--tools` is given
(`maestro-collab.md:96-104`; `SKILL.md:44`). The shipped default tool registry
(`src/config/cli-tools-defaults.json:2-9`) is: `gemini`, `claude`, `codex`,
`opencode`, `agy`, `api-explore` — so a default fan-out is typically
`gemini + claude + codex`. Minimum **2** eligible tools required, else **E002**.

> Caveat: the `.claude` discovery action calls
> `maestro tools list --json 2>/dev/null || cat ~/.maestro/cli-tools.json`
> (`maestro-collab.md:99`). In code, `maestro tools list` launches a **TUI**
> (`src/commands/tools.ts:72`), not JSON — so the `|| cat` fallback path is what
> actually runs. See §9.

### 6.3 Output artifacts

Written to `.workflow/scratch/{YYYYMMDD}-collab-{slug}/` (`:30-35`):

| File | Contents | Reference |
|------|----------|-----------|
| `collab-report.md` | Summary, Consensus, (Resolved) Conflicts, Unique Insights, Recommendations, Per-Tool Confidence table; + Boundary Grill Results when conflicts found | `:154, :176-178`; `SKILL.md:202-224` |
| `context.md` | **Locked / Free / Deferred** decisions — standard plan-compatible format | `:155`; `SKILL.md:226` |
| `conclusions.json` | `session_id, subject, mode, tools[], consensus_level, recommendation (Go/No-Go/Conditional), confidence, dimensions[], decisions[]` | `:156`; `SKILL.md:228-238` |
| `per-tool/{tool}-output.md` | Raw verbatim CLI outputs | `:34, :127`; `SKILL.md:153-156` |
| `cross-verify.md` | Intermediate classification (**`.codex` only**) | `SKILL.md:82, :190` |

A **CLB artifact** is registered in `state.json` (`type: collab, scope: adhoc`)
(`maestro-collab.md:87, :177`; `SKILL.md:243`).

### 6.4 Downstream consumption

`context.md`'s **Locked/Free/Deferred** shape is deliberately **plan-compatible**
(`:155`, `SKILL.md:51, :226`). The skill documents the consumer matrix
(`SKILL.md:55-62`):

| Consumer | Artifact consumed |
|----------|-------------------|
| `maestro-plan` | `context.md` + `conclusions.json` via `--dir {scratchDir}` |
| `maestro-analyze` | `context.md` as prior context (via `state.json`) |
| `maestro-ralph` | artifact-chain lookup by `type=collab` |

Next-step routing (`:181-185`, `SKILL.md:289-293`): deep feasibility →
`/maestro-analyze`; plan → `/maestro-plan --dir {dir}`; expand → `/maestro-brainstorm`.

---

## 7. Relationship to delegate / coordinate / adapters

Cross-verify collab is a **pure consumer of the `maestro delegate` CLI** — it does
**not** reuse the coordinator, and it does not call the adapter layer directly. Every
fanned-out analysis is one invocation of `maestro delegate "<prompt>" --to <tool>`
(`maestro-collab.md:119-122`; `SKILL.md:145-146, :65`).

That single `maestro delegate` call then drops into the **shared spawn/adapter layer**
documented in doc 03:

1. `registerDelegateCommand` parses `--to/--role/--mode/--rule/--effort/--timeout`
   (`src/commands/delegate.ts:316-339`).
2. It loads `cli-tools.json` and resolves the tool — priority **`--to` > `--role` >
   first-enabled fallback** (`delegate.ts:373-409`), via `selectTool` /
   `selectToolByRole` (`src/config/cli-tools-config.ts:158-214`). Collab always passes
   `--to <tool>` explicitly, so role resolution is bypassed in the fan-out (though
   `--role` exists and maps through `DEFAULT_ROLE_MAPPINGS`,
   `cli-tools-defaults.json:10-18`).
3. Sync by default (collab's `.codex` variant relies on this blocking behavior);
   `--async` would detach (`delegate.ts:497-508`). The runner
   `CliAgentRunner.run()` (`src/agents/cli-agent-runner.ts:524`) spawns the CLI through
   `createAdapterForType` (`cli-agent-runner.ts:251`) → `adapter.spawn(config)`
   (`:589`) → `node:child_process.spawn(<cli>, …)`, normalizing each CLI's wire format
   into the common `NormalizedEntry` stream (doc 03 §1, §3).
4. Output is fetched back with `maestro delegate output <id>`
   (`maestro-collab.md:127`), reading from the `CliHistoryStore`
   (`delegate.ts:640-691`).

So: **collab reuses the entire delegate → cli-agent-runner → adapter-factory → spawn
chain** (the same one in doc 03 §§2-3). It does **not** reuse `src/coordinator/*`
(`GraphWalker`, `CliExecutor`) — there is no ChainGraph; the "graph" is just N parallel
identical leaves driven by prose. It also does **not** reuse `ParallelCliRunner` — the
parallelism is host-agent-issued shell concurrency, not the code semaphore
(doc 03 §6, `03-...md:587`).

---

## 8. End-to-end walkthrough of one collab run

Concrete trace for `/maestro-collab "Is the auth token refresh logic correct?" --tools claude,codex,gemini` (`.claude` variant):

1. **S_PARSE** — extract requirement, `tools=[claude,codex,gemini]`, `mode=analysis`,
   no rule, `autoYes=false` (`maestro-collab.md:53-55`).
2. **S_DISCOVER** — read `~/.maestro/cli-tools.json`; the three named tools are enabled
   → eligible ≥ 2, proceed (`:57-60, :96-104`). (No `--tools` would default to the
   first 3 enabled: `gemini,claude,codex`.)
3. **S_CONFIRM** — show plan; user confirms (or `-y`) → `A_SETUP_SESSION` creates
   `.workflow/scratch/20260627-collab-auth-token-refresh/` + `per-tool/` (`:61-66, :104-106`).
4. **S_FANOUT** — build the shared 6-field prompt (PURPOSE/TASK/MODE/CONTEXT/EXPECTED/
   CONSTRAINTS, `:110-118`) and launch **three** background delegates in one message:
   `maestro delegate "<prompt>" --to claude --mode analysis`, `… --to codex …`,
   `… --to gemini …` (`:119-122`). Each spins up the delegate → adapter → spawn chain
   (§7). **STOP** (`:123`).
5. **S_COLLECT** — as each background callback arrives, run
   `maestro delegate output <id>` and write `per-tool/claude-output.md`,
   `per-tool/codex-output.md`, `per-tool/gemini-output.md` (`:125-127`). With 1+
   succeeding, continue (W001 if one failed; E004 if all failed).
6. **S_CROSS_VERIFY** — read all three outputs; tag each finding CONSENSUS (≥2 agree) /
   CONFLICT (disagree) / UNIQUE (1 tool); compute
   `consensus_level = consensus/total*100` (`:129-139`). If <40% → W003.
7. **S_BOUNDARY_GRILL** — run boundary grill on conflict items (≤3×3, non-blocking);
   attach resolutions (`:78-82, :142-146`).
8. **S_SYNTHESIZE** — evidence-weighted voting resolves conflicts
   (higher-confidence / more-specific-evidence wins; tie → SUGGESTED, `:150-151`).
   Write `collab-report.md`, `context.md` (CONSENSUS→Locked, strong UNIQUE→Free,
   unresolved CONFLICT→Deferred), `conclusions.json` (`:148-157`).
9. **S_REGISTER** — append a `collab` artifact (scope `adhoc`) to `state.json`
   (`:86-87`).
10. **S_REPORT** — print summary (requirement, per-tool status, `consensus_level`,
    artifact id, output dir) and next-step routing → `/maestro-plan --dir …`
    (`:89-91, :181-185`).

(The `.codex` skill follows the same arc but blocks synchronously on each `shell_exec`,
requires ≥2 survivors, additionally writes `cross-verify.md`, enriches specs from
Locked decisions, and reports W004 for low consensus — see §3.3.)

---

## 9. Ambiguities & unverifiable points

1. **Name collision (highest-impact).** `src/commands/collab.ts` (the `maestro collab`
   / `maestro team` CLI) is **human-team collaboration**, completely unrelated to the
   cross-verify `maestro-collab`. Doc 03 left this as an open question
   (`03-...md:594-597`); confirmed here from `collab.ts:1-19` and `cli.ts:52-53`.
   **There is no compiled/code-backed cross-verify command** — it is authored prose only.
2. **No code enforcement of the synthesis algorithm.** Consensus/conflict/unique
   classification, the `consensus_level` formula, evidence-weighted voting, and the
   Locked/Free/Deferred mapping exist **only** in the markdown/skill prose. There is no
   TypeScript classifier; correctness depends entirely on the host agent following the
   prompt. Nothing validates the produced `conclusions.json` schema.
3. **`maestro tools list --json` likely does not exist.** The `.claude` discovery step
   runs `maestro tools list --json 2>/dev/null || cat …` (`maestro-collab.md:99`), but
   in code `maestro tools list` launches a TUI (`src/commands/tools.ts:72`), with no
   `--json`. The `|| cat ~/.maestro/cli-tools.json` fallback is what actually feeds
   discovery. Not fatal, but the first clause is dead.
4. **Skill timeout contradiction.** `.codex` SKILL shows
   `shell_exec(…, {timeout: 30000})` in the fan-out example (`SKILL.md:145`) while
   invariant #6/#9 mandate **NO max timeout / indefinite wait** (`SKILL.md:70, :160`).
   These cannot both hold; the actual behavior depends on the host's `shell_exec`
   semantics.
5. **Divergent warning codes.** Low-consensus (`<40%`) is **W003** in the `.claude`
   command vs **W004** in the `.codex` skill (`:168` vs `SKILL.md:272`) — same
   condition, different code. Join policy also differs (1-survivor vs 2-survivor, §3.3).
6. **`A_BOUNDARY_GRILL --from` reference.** Both variants mention "check upstream scope
   if `--from` used" (`:145`, `SKILL.md:195`), but `--from` is **not** in the documented
   flag list (`:22-28`). Likely vestigial / inherited from another command's template.
7. **Parallelism is host-dependent.** "Parallel" launch is asserted in prose; whether N
   delegates truly run concurrently depends on the host agent honoring
   `run_in_background` / concurrent `shell_exec`. No code-level semaphore
   (`ParallelCliRunner`) is involved, so there is no enforced concurrency ceiling.
8. **`per-tool/{tool}-output.md` collision risk.** Outputs are keyed by tool *name*,
   so fanning two aliases of the same base tool (e.g. `claude` and `claude-analysis`)
   could collide — unverified, but plausible given alias support in `cli-tools-config.ts`.

---

## 10. Cross-references

- **Doc 03 — External CLI Orchestration** (`maestro-research/03-external-cli-orchestration.md`):
  the shared spawn/adapter layer collab rides on — `delegate` mechanism (§2),
  adapter-factory/`CliAgentRunner` (§3), tool config & role routing (§4),
  `ParallelCliRunner` (§6), and its own §7 on collab fan-out. **This doc supersedes
  03's open question** about `collab.ts` internals (03 §12 / `:594-597`): `collab.ts`
  is the team CLI, not cross-verify.
- **Doc 05 — Brainstorm** (`maestro-research/05-brainstorm.md`): the multi-**persona,
  single-CLI** contrast. Brainstorm varies the lens against one backend; collab varies
  the CLI/backend itself with one identical prompt (§1.1). Both emit plan-compatible
  context.
- **Doc 01 — Ralph**: consumes collab output via artifact-chain lookup
  (`type=collab`) when sequencing commands (§6.4).
- **Doc 02 — Planning chain**: `maestro-plan --dir {scratchDir}` ingests collab's
  `context.md` + `conclusions.json` (Locked/Free/Deferred) as plan input (§6.4).

---

### Source-of-truth file index

| File | Role |
|------|------|
| `.claude/commands/maestro-collab.md` | Cross-verify orchestrator (Claude slash command) — async/background fan-out |
| `.codex/skills/maestro-collab/SKILL.md` | Cross-verify orchestrator (Codex skill) — blocking `shell_exec` fan-out |
| `src/commands/collab.ts` | **Unrelated** — human-team collaboration CLI (`maestro collab`/`team`) |
| `src/cli.ts:52-53` | Registers `collab`/`team` → team CLI |
| `src/commands/delegate.ts` | The `maestro delegate` CLI that collab fans out to |
| `src/config/cli-tools-config.ts` | Tool registry, `selectTool`/`selectToolByRole`, role routing |
| `src/config/cli-tools-defaults.json` | Default tool set + role fallback chains |
| `src/agents/cli-agent-runner.ts` | Per-delegate spawn → adapter → NormalizedEntry |
