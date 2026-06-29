# Maestro-Ralph: The Autonomous, State-Driven Execution Loop

> Research deliverable. Source of truth: the engine TypeScript under `src/ralph/` and the
> authored command files `.claude/commands/maestro-ralph*.md`. Secondary corroboration from
> `guide/maestro-ralph-guide.md`. Every non-trivial claim is cited as `path:line`.
>
> **Convention used throughout:** *Authored-prompt behavior* = instructions the LLM is told to
> follow inside the `.md` command files (advisory, model-enforced). *Engine-enforced behavior* =
> logic the TypeScript CLI actually executes and validates (hard, deterministic). The two layers
> are deliberately split, and I flag which is which.

---

## Table of Contents

1. [Mental Model](#1-mental-model)
2. [Two-Layer Architecture: Authored Prompt vs Engine](#2-two-layer-architecture-authored-prompt-vs-engine)
3. [Session & State Model](#3-session--state-model)
4. [The Status Schema](#4-the-status-schema)
5. [Command Surface (CLI subcommands)](#5-command-surface-cli-subcommands)
6. [What "the loop" actually does each iteration](#6-what-the-loop-actually-does-each-iteration)
7. [Skill Resolution & Scanning](#7-skill-resolution--scanning)
8. [Goals & Termination](#8-goals--termination)
9. [Decision Nodes & Quality Gates](#9-decision-nodes--quality-gates)
10. [Relationship to Odyssey cycles and the Coordinator](#10-relationship-to-odyssey-cycles-and-the-coordinator)
11. [End-to-end walkthrough of one loop iteration](#11-end-to-end-walkthrough-of-one-loop-iteration)
12. [Ambiguities & unverified points](#12-ambiguities--unverified-points)
13. [Cross-references for the index](#13-cross-references-for-the-index)

---

## 1. Mental Model

**Problem ralph solves.** When a user has an intent but the *optimal command sequence is unclear*,
ralph reads project state, infers where in the lifecycle the project sits, builds an adaptive
chain of commands, and then drives that chain to completion automatically — picking the next
command from a pool by state, executing it, evaluating quality gates, and growing/shrinking the
chain until a goal is reached. This is summarized in the command description itself:
`maestro-ralph` is "Use when the optimal command sequence is unclear and needs automated
state-based determination" (`.claude/commands/maestro-ralph.md:3`) and its purpose line:
"Closed-loop decision engine: read project state → infer position → build adaptive chain →
delegate execution" (`.claude/commands/maestro-ralph.md:16`).

**"Pick next command from a pool by state" philosophy.** The "pool" is the set of installed
commands and skills, discovered at build time by scanning `.claude/commands/`, `.claude/skills/`,
`.codex/skills/`, `.agents/skills/`, `.agy/skills/` (`src/ralph/skill-scanner.ts:5-15`). State
lives entirely in one file — `status.json` — which is declared the single source of truth
("status.json 是唯一真源", `.claude/commands/maestro-ralph.md:47`). The "next command" is simply
the first `pending` execution step in `steps[]` (`src/ralph/cmd-next.ts:90`). The chain is a
*live chain* (活链) that can grow or shrink during execution — this is the distinction the guide
draws from the static Maestro coordinator (`guide/maestro-ralph-guide.md:18`).

**Two distinct roles.** Ralph *builds and evaluates*; `ralph-execute` *runs steps*. "Ralph
builds/evaluates; ralph-execute runs steps" (`.claude/commands/maestro-ralph.md:17`), reinforced
by invariant 1: "Ralph never executes steps — only creates sessions and evaluates decisions"
(`.claude/commands/maestro-ralph.md:43`). The two commands invoke each other to form "a
self-perpetuating work loop" (`.claude/commands/maestro-ralph-execute.md:17`).

---

## 2. Two-Layer Architecture: Authored Prompt vs Engine

There are two cooperating planes:

| Plane | Artifacts | Responsibility |
|-------|-----------|----------------|
| **Authored prompt (FSM)** | `maestro-ralph.md`, `maestro-ralph-execute.md`, `workflows/ralph-amend-goal.md` | LLM-interpreted state machines: parse intent, infer lifecycle position, decompose goals, *build* `steps[]`, evaluate decision/quality gates, handoff between the two commands. |
| **Engine (CLI)** | `src/ralph/*.ts`, exposed via `maestro ralph <sub>` | Deterministic step loader + `status.json` driver: pick next pending step, resolve+inline required reading, write/clear `active_step_index`, validate completion consistency, atomic persistence. |

The CLI is registered in the main `maestro` binary: `src/cli.ts:46` maps the `ralph` subcommand
to `registerRalphCommand` (`src/commands/ralph.ts:38`). The header comment is explicit that this
is "NOT to be confused with `maestro coordinate` (graph chain walker)"
(`src/commands/ralph.ts:13-14`).

**The division of labor is the key design decision.** The build phase (`A_BUILD_STEPS`) only
validates that a command *path exists on disk* via `maestro ralph skills`; it does **not** read
.md content (`.claude/commands/maestro-ralph.md:50`, `:434`). Reading frontmatter, expanding
`<required_reading>`/`<deferred_reading>`, inlining file bodies into the prompt, and writing
`step.load.*` all happen at *execution* time inside `maestro ralph next`
(`src/ralph/cmd-next.ts:111-135`). This means the FSM never touches the filesystem read path for
skill bodies — the engine guarantees the prompt is fully expanded and the completion protocol is
attached.

---

## 3. Session & State Model

### 3.1 Creation

`/maestro-ralph "<intent>"` walks a long FSM (`S_PARSE_ROUTE` → `S_RESOLVE_PHASE` → `S_INFER` →
`S_RESOLVE_SCOPE` → `S_QUALITY_MODE` → `S_PLANNING_MODE` → `S_DECOMPOSE` → `S_BUILD_CHAIN` →
`S_CREATE_SESSION`; states at `.claude/commands/maestro-ralph.md:63-81`). The terminal build
action `A_CREATE_SESSION` writes the session file at
`.workflow/.maestro/ralph-{YYYYMMDD-HHmmss}/status.json` (`:454`, purpose line `:17`). A parallel
prefix `maestro-*` is produced by the static `/maestro` chain; both share the same schema and are
driven uniformly by the same CLI (`src/ralph/status-store.ts:29-47`).

Phase resolution precedes position inference (`A_RESOLVE_PHASE` at `:201`), and includes a
"D-007" phase→milestone reverse lookup (`:216-223`) that forbids reading `current_phase`/
`current_milestone` directly — artifact filtering is keyed on `session.phase`
(`:272`, invariant `:448`).

### 3.2 Storage & resolution

Sessions live under `.workflow/.maestro/` (`src/ralph/status-store.ts:17-19`). Directory names
must start with `ralph-` or `maestro-` (`src/ralph/status-store.ts:45-47`). `resolveSession`
either takes an explicit `--session <id>` or, absent that, returns the **latest by mtime DESC**
that parses successfully (`src/ralph/status-store.ts:53-75`; sort at `:41`). An optional
`requireRunning` flag filters to `status === "running"` (`:70`).

### 3.3 Persistence (atomicity)

All writes go through `writeStatus`, which stages to a `.tmp` file then `renameSync`s — so a
crash never leaves a partial file (`src/ralph/status-store.ts:82-87`). This is what makes the
loop resume-safe (invariant 7 in the execute command: "status.json 每步骤后由 CLI 原子写盘 —
resume-safe", `.claude/commands/maestro-ralph-execute.md:53`).

### 3.4 Advancement (the single-holder invariant)

At most one step is "active" at a time, tracked by `session.active_step_index`
(`src/ralph/status-schema.ts:122`). This is the consistency mechanism that "replaces locks"
("一致性取代锁", `.claude/commands/maestro-ralph-execute.md:50`):

- `ralph next` refuses (exit code 3) if `active_step_index` already points at a non-completed
  step (`src/ralph/cmd-next.ts:71-81`).
- `ralph complete` refuses (E008) unless the index passed equals `active_step_index`
  (`src/ralph/cmd-complete.ts:48-53`), and refuses (E009) unless the target step status is
  `running` (`:56-59`).
- `ralph next` auto-clears a *stale* `active_step_index` that points to an already-`completed`
  step (W005) (`src/ralph/cmd-next.ts:71-74`).

---

## 4. The Status Schema

Defined as a TypeScript shape in `src/ralph/status-schema.ts`; the canonical JSON template is
mirrored in the appendix of the command file (`.claude/commands/maestro-ralph.md:695-768`).

**Protocol version.** `RALPH_PROTOCOL_VERSION = '2'` (`src/ralph/status-schema.ts:9`). Legacy
sessions lack the field and fall back to pre-CLI inline logic; `"2"` = structured completion +
enhanced session anchor (`.claude/commands/maestro-ralph.md:699`).

**Enum types** (`src/ralph/status-schema.ts:11-15`):

- `StepStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed'`
- `CompletionStatus = 'DONE' | 'DONE_WITH_CONCERNS' | 'NEEDS_RETRY' | 'BLOCKED'`
- `SessionStatus = 'running' | 'paused' | 'completed' | 'failed'`

**`RalphStep`** (`src/ralph/status-schema.ts:24-51`) — note `decision: string | null` is the
discriminator: non-null ⇒ decision node, null ⇒ executable step (`:34`). `command_path` is the
absolute path resolved at build time (`:35`); `load` is populated only by `ralph next` (`:50`).
Structured completion fields — `completion_summary`, `completion_decisions`, `completion_caveats`,
`completion_deferred` (`:42-45`) — feed the session anchor.

**`RalphTaskDecompositionItem`** (`:53-66`) — the outcome-oriented sub-goals (`id`, `goal`,
`done_when`, `evidence`, `lifecycle[]`, `status: pending|done|superseded`, `origin` linking to a
`CHG-xxx`).

**`GoalChangelogEntry`** (`:68-86`) — before/after snapshots for goal amendments.

**`RalphSession`** (`:97-134`) — top-level fields: `intent`, `lifecycle_position`, `phase`,
`milestone`, `quality_mode`, `planning_mode`, `scope_verdict`, `boundary_contract`,
`execution_criteria`, `task_decomposition`, `goal_changelog`, plus the CLI protocol fields
`ralph_protocol_version` and `active_step_index` (`:120-122`).

---

## 5. Command Surface (CLI subcommands)

All registered in `src/commands/ralph.ts:38-161` under `maestro ralph`. Each subcommand is
lazily imported (`:19-33`) and `process.exit`s with the handler's return code.

### 5.1 `maestro ralph next` — load next pending step

- **Source:** `src/ralph/cmd-next.ts` (`runNext`, `:35`). Registered at `src/commands/ralph.ts:81-89`.
- **Inputs:** optional `--session <id>` (`:84`).
- **Side effects / engine-enforced flow** (`src/ralph/cmd-next.ts`):
  1. Resolve session; must be `running`, else exit 1 (`:43-46`).
  2. Run `checkStatus`; if any **E-level** finding, it *pauses the session* (`status='paused'`,
     `active_step_index=null`) and exits 1 — deliberately, to break the "infinite-retry trap"
     (`:49-68`, with a long explanatory comment at `:57-62`).
  3. Auto-clear stale `active_step_index` or refuse with exit 3 (`:71-81`).
  4. Pick `data.steps.find(s => s.status === 'pending' && !s.decision)` (`:90`). Decision nodes
     are *skipped* — the CLI never loads them; the calling skill must evaluate them (`:83-103`).
  5. If no pending execution step but a pending decision node exists → exit 2 with a hint not to
     re-invoke `next` for that step (`:92-100`).
  6. `loadSkill(normalizeStoredPath(next.command_path))` reads frontmatter + required files
     (`:113`); throws E007 on missing required reading (`src/ralph/skill-resolver.ts:167-169`).
  7. Persist `next.load` (loaded_at, required_files, deferred_files), set `status='running'`,
     `active_step_index=next.index`, write atomically (`:120-132`).
  8. **stdout** = the framed prompt: a `<session_anchor>` block (`:178-273`) + the fully-inlined
     skill body (`inlineRequiredReading`, `:333-359`) + optional skill-config defaults
     (`:301-324`) + the completion-protocol comment block (`emitPrompt`, `:139-175`).
- **Exit codes** (documented at `src/ralph/cmd-next.ts:15-19`): `0` printed a step; `2` no more
  pending; `3` active step already held; `1` generic/E-level error.

> Note: the stdout MUST be captured whole. The authored command forbids any truncating pipe
> (`| head`, `| tail`) because the stdout *is* the skill prompt (invariant 9,
> `.claude/commands/maestro-ralph-execute.md:55`).

### 5.2 `maestro ralph complete <index> --status <S>` — finalize a step

- **Source:** `src/ralph/cmd-complete.ts` (`runComplete`, `:35`). Registered at
  `src/commands/ralph.ts:92-139`.
- **Inputs:** required `--status` (one of `DONE|DONE_WITH_CONCERNS|NEEDS_RETRY|BLOCKED`,
  validated at `src/commands/ralph.ts:115-119`); repeatable `--evidence`, `--decisions`,
  `--deferred` (collected, `:96/100/102/163-165`); `--summary`, `--concerns`, `--reason`,
  `--caveats`, `--session`.
- **Engine-enforced consistency** (hard errors): E008 `index != active_step_index`
  (`src/ralph/cmd-complete.ts:48-53`); E009 step not `running` (`:56-59`); index range check
  (`:43-46`).
- **Side effects (`applyStatus`, `:69-129`):**
  - `DONE` → `status='completed'`, `completion_confirmed=true`, records summary/decisions/
    caveats/deferred/evidence, clears `active_step_index` (`:80-92`).
  - `DONE_WITH_CONCERNS` → same plus `concerns` (`:94-106`).
  - `NEEDS_RETRY` → `status='pending'`, `retried=true`, `completion_confirmed=false`, clears
    active (`:108-116`).
  - `BLOCKED` → `step.status='failed'`, **`session.status='paused'`**, clears active
    (`:118-127`).
- **Note on `NEEDS_CONTEXT`:** explicitly removed — context shortage is no longer a valid verdict
  because the harness auto-compacts (`src/ralph/cmd-complete.ts:14-17`).

### 5.3 `maestro ralph retry <index>` — sugar

- Registered at `src/commands/ralph.ts:142-160`; just calls `runComplete` with
  `status: 'NEEDS_RETRY', evidence: []` (`:152-159`).

### 5.4 `maestro ralph check` — health-check status.json

- **Source:** `src/ralph/cmd-check.ts` (`runCheck`, `:15`). Registered at `src/commands/ralph.ts:57-67`.
- Runs `checkStatus` (`src/ralph/status-checker.ts:17`), prints findings, `--json` mode available
  (`src/ralph/cmd-check.ts:32-40`). Exit `0` iff zero E-level findings (`:58`). Exposes
  `hasErrors` for internal callers (used by `ralph next`'s prelude) (`:62-64`).

### 5.5 `maestro ralph session` — show summary

- **Source:** `src/ralph/cmd-session.ts` (`runSession`, `:11`). Registered at `src/commands/ralph.ts:69-78`.
- Read-only; prints session id, status, lifecycle, phase, milestone, quality/planning mode,
  protocol version, progress (`completed/total`), active step, and the sub-goal checklist
  (`src/ralph/cmd-session.ts:28-56`).

### 5.6 `maestro ralph skills` — list the command/skill pool

- **Source:** `src/ralph/cmd-skills.ts` (`runSkills`, `:15`). Registered at `src/commands/ralph.ts:43-55`.
- `--platform <claude|codex|agent|agy>` (validated, `src/ralph/cmd-skills.ts:13-19`); warns if
  omitted (returns all platforms, `:20-25`). `--json` emits one JSON line per entry
  (`:28-44`) with `missing_required`; `--quiet` for build consumption (`:46`). This is the
  command `A_BUILD_STEPS` calls to pre-validate `command_path`
  (`.claude/commands/maestro-ralph.md:430`).

---

## 6. What "the loop" actually does each iteration

The loop is the mutual self-invocation of `maestro-ralph-execute` (runs steps) and
`maestro-ralph` (evaluates decisions). Per iteration, for an **execution step**
(`.claude/commands/maestro-ralph-execute.md` action `A_EXEC_STEP`, `:183-217`):

1. `Bash("maestro ralph next --session <id>")` — capture full stdout (no truncation)
   (`:185`). Exit code routing: `0` execute inline; `2` → `S_LOCATE`; `3` active held; `1` pause
   (`:186-189`).
2. (Protocol < 2 only) prepend a `<goal_context>` block; for protocol ≥ 2 this is skipped because
   the session anchor already carries goal context (`:190-201`).
3. Inline-execute the skill body from stdout; `deferred_reading` read on demand (`:202`).
4. `Bash("maestro ralph complete N --status <S> ...")` (or `retry N`) — `--summary` is MUST for
   DONE/DONE_WITH_CONCERNS (`:203-214`).
5. Propagate context signals into `status.json.context` (`:215`).
6. Self-invoke `Skill("maestro-ralph-execute")` to advance (`:217`).

For a **decision step** (`step.decision != null`), execution does *not* call the CLI. Instead
`A_EXEC_DECISION` hands off via `Skill("maestro-ralph")`, and ralph evaluates the gate
(`.claude/commands/maestro-ralph-execute.md:176-182`, and HARD RULE at `:41`). Ralph then routes
through `S_DECISION_EVAL` → `S_APPLY_VERDICT` and hands back to `maestro-ralph-execute` via
`S_DISPATCH` (`.claude/commands/maestro-ralph.md:139-140`).

**Termination of the self-invocation chain** is governed by invariant 10 (execute): the only
legal stop conditions are *all steps `completion_confirmed`*, *session paused*, or *decision
handoff to ralph* — stopping "for context reasons" is an invariant violation
(`.claude/commands/maestro-ralph-execute.md:56`).

---

## 7. Skill Resolution & Scanning

### 7.1 Discovery (the pool)

`scanAllSkills` (`src/ralph/skill-scanner.ts:107`) enumerates commands and skills across four
platforms × {global `~/`, project `<cwd>/`} (`src/ralph/skill-scanner.ts:115-160`):
`.claude/commands/*.md` (type command) and `*/SKILL.md` under
`.claude|.codex|.agents|.agy/skills/` (type skill). **Project overrides global** per
`(platform, type, name)` key (`:166-176`). Each entry's manifest is parsed (frontmatter +
required/deferred counts + `missingRequired`) by `scanOne` (`:62-93`). `findSkill` does a single
lookup by name (`:188-195`).

This is what scores candidates for "next step" — but note the scoring is *existence-based*, not
semantic: the build phase asks "does this skill name resolve to a real file?" and records the
absolute path or marks `command_scope = "missing"` (→ E006)
(`.claude/commands/maestro-ralph.md:430-433`). There is **no fuzzy/relevance ranking** in the
engine; the *sequence* of candidate skills is chosen by the authored `A_BUILD_STEPS` lifecycle
table (`.claude/commands/maestro-ralph.md:386-405`), not by the scanner.

### 7.2 Manifest parsing & path expansion

`skill-resolver.ts` parses a command/skill `.md`:

- YAML frontmatter via a minimal parser (`parseFrontmatter`, `:85-120`).
- `<required_reading>` and `<deferred_reading>` blocks (`:39-40`); paths extracted from `@path`
  tokens or markdown bullets (`extractPathsFromBlock`, `:122-142`).
- Path expansion rules (`expandPath`, `:63-82`): `~/` and `@~/` → homedir; absolute kept;
  `.claude/`-prefixed → scope-root-relative; else relative to the `.md`'s directory.
- `loadSkill` (`:165-176`) reads all required files and **throws `E007`** if any are missing
  (`:167-169`); `parseSkillManifest` (`:145-162`) does the read-free version used by the checker
  and scanner.

### 7.3 Inlining (execution-time)

`ralph next` calls `inlineRequiredReading` (`src/ralph/cmd-next.ts:333-359`) to replace each
`@path` line inside `<required_reading>` with the actual file content, producing a fully expanded
skill body so the LLM sees no separate banner blocks. `deferred_reading` is *recorded only*
(`step.load.deferred_files`) and read on demand during execution (invariant 3, execute, `:49`).

---

## 8. Goals & Termination

### 8.1 Defining goals (decomposition)

`A_DECOMPOSE_TASKS` (`.claude/commands/maestro-ralph.md:343-380`) runs once before chain build.
It classifies intent breadth (broad/medium/narrow, `:349-355`), clarifies the boundary via ≤3
`AskUserQuestion` rounds for broad/medium intents (`:357-363`), and derives:
`boundary_contract` (in_scope/out_of_scope/constraints/definition_of_done), `execution_criteria`,
and `task_decomposition` (outcome-oriented sub-goals with objective `done_when` referencing
ralph-produced artifacts, `:369-376`). Each sub-goal starts `status: "pending"` +
`completion_confirmed: false` (`:378`).

The user binds termination via a copy-pasteable `/goal` prompt (Goal Prompt Template,
`:836-848`). Crucially, "`/goal` 由用户输入；ralph 输出提示词后继续 handoff，不阻塞" — ralph
emits the prompt and continues without blocking (`:850`, invariant 9 `:51`).

### 8.2 Amending goals at runtime

`/maestro-ralph --amend [change]` routes to `S_AMEND_GOAL`
(`.claude/commands/maestro-ralph.md:88`, requires a running session, else `S_FALLBACK` `:89`).
The detailed 5-phase flow is loaded via `<deferred_reading>` from `workflows/ralph-amend-goal.md`
(`.claude/commands/maestro-ralph.md:20-22`, `:674`). The phases (`workflows/ralph-amend-goal.md`):
Phase 1 snapshot (`:10-24`); Phase 2 parse change request (`:26-40`); Phase 3 **mandatory** mini
grill via `maestro delegate --role analyze` to assess impact (`:42-78`); Phase 4 confirm
(`:80-90`); Phase 5 apply — append a `CHG-{NNN}` changelog entry (`:94-112`), supersede affected
goals (`:114-118`), write new goals with `origin: CHG-NNN` (`:120-127`), rebuild the chain
(`:129-141`), update boundary (`:143-146`), persist + handoff (`:148-157`). `RISK_LEVEL == high`
disables auto_confirm (`:90`); already-`done` goals cannot be superseded (`:118`).

### 8.3 Completion detection

Two layers:

- **Per-step:** a step is "done" only when `completion_confirmed === true`, written exclusively by
  `ralph complete --status DONE|DONE_WITH_CONCERNS` (`src/ralph/cmd-complete.ts:82/96`;
  invariant 6, `.claude/commands/maestro-ralph.md:48`). The checker flags W006 if
  `status==completed` but `completion_confirmed==false`
  (`src/ralph/status-checker.ts:68-76`).
- **Per-session:** `A_COMPLETE_SESSION` (`.claude/commands/maestro-ralph-execute.md:234-254`)
  verifies all steps `completion_confirmed` (except skipped) and, when decomposition exists,
  `task_decomposition_all_done == true` before setting `session.status="completed"`. The
  goal-level audit that flips sub-goals to `done` is `A_GOAL_AUDIT_EVALUATE` /
  `A_APPLY_GOAL_DONE` (`.claude/commands/maestro-ralph.md:515-556`, `:654-658`).

The checker also emits W008 if the chain does not terminate in `maestro-milestone-complete`
(`src/ralph/status-checker.ts:127-135`) — a soft expectation, not enforced.

---

## 9. Decision Nodes & Quality Gates

Decision nodes are steps with `decision != null` and no `command_path`
(`src/ralph/status-schema.ts:34`). They are skipped by `ralph next` (engine) and handled by the
FSM (authored). `A_BUILD_STEPS` inserts a decision after each gate-producing stage
(`.claude/commands/maestro-ralph.md:418`): `post-execute`, `post-business-test`, `post-review`,
`post-test`, `post-frontend-verify`, plus structural `post-milestone`/`post-debug-escalate`,
`post-analyze-scope`, periodic `post-reground` (every 3 execution steps, build rule 5.5,
`:420-424`), and `post-goal-audit` (`:419`).

Evaluation is delegated read-only: `A_DELEGATE_EVALUATE` runs
`maestro delegate --role analyze --mode analysis` and parses a `---VERDICT---` block
(`:458-488`). Verdict routing in `S_APPLY_VERDICT` (`:154-174`): `proceed`/`fix`/`escalate`,
with confidence-score guards (`<60 + proceed → fix`, `:171`; `retry >= max_retries → escalate`,
`:169`). `fix` inserts fix-loop templates (`:621-625`, Appendix `:772-834`) that grow `steps[]`,
re-index, and increment `retry_count`. A drift "circuit breaker" — `A_REGROUND_HALT` — pauses the
session when accumulated work has drifted from intent and is *not* skippable by auto_confirm
(`:601-614`, guard `:174`).

The engine has no notion of these gate semantics; they live entirely in the authored FSM. The
engine's only contribution is to *not* load decision steps and to surface a pending decision node
as a hint (`src/ralph/cmd-next.ts:92-100`).

---

## 10. Relationship to Odyssey cycles and the Coordinator

**Coordinator (`maestro coordinate`).** A separate "graph chain walker"; the ralph CLI header
explicitly separates itself from it (`src/commands/ralph.ts:13-14`, registered at
`src/cli.ts:45`). The guide frames the distinction as live-chain (ralph) vs the static Maestro
coordinator chain (`guide/maestro-ralph-guide.md:18`). Both produce `status.json` sessions under
`.workflow/.maestro/` (`ralph-*` from the adaptive chain, `maestro-*` from the static chain) and
both are driven by the *same* `maestro-ralph-execute` runner and the same CLI
(`src/ralph/status-store.ts:24-28`). So: ralph and coordinate are two *builders* of the same
status.json contract; ralph-execute is the shared *executor*.

**Odyssey cycles.** Odyssey is a ralph-style long-running cycle but a *separate subsystem* with
its own state file (`session.json`, not `status.json`) and its own FSM states (`S_INTAKE`,
`S_DIAGNOSE`, `S_FIX`, `S_RECORD`, etc.) (`workflows/odyssey-base.md:30-39`). It shares ralph's
philosophy — never abort for context exhaustion (`workflows/odyssey-base.md:21`, cf. ralph
invariant 10), phase-goal lifecycle with `completion_confirmed` (`:231-235`), a `/goal` prompt
for termination (`:204-219`), and stall/anti-drift machinery (`:65-114`). The odyssey skills
(`odyssey-debug`, `odyssey-improve`, `odyssey-planex`, `odyssey-review-test-fix`, `odyssey-ui`)
each extend `odyssey-base`. **Key difference:** odyssey is a *self-contained* iterative cycle
keyed on `phase_goals`/`session.json`, whereas ralph orchestrates *whole maestro commands* as
steps keyed on `task_decomposition`/`status.json`. They are siblings, not nested — there is no
code path in `src/ralph/` that references odyssey, so the relationship is conceptual/parallel
rather than an integration (see [§12](#12-ambiguities--unverified-points)).

---

## 11. End-to-end walkthrough of one loop iteration

Assume a running session `ralph-20260627-120000` with `ralph_protocol_version: "2"`, where step 3
is `maestro-execute 2` (pending), step 4 is a `post-execute` decision node, and `active_step_index`
is `null`.

1. **Executor invoked.** `maestro-ralph-execute` enters `S_LOCATE`, finds the session running
   (`A_LOCATE_SESSION`, `.claude/commands/maestro-ralph-execute.md:107-112`), resolves args
   (`A_RESOLVE_ARGS`, incl. `--from`/`--dir` injection from `state.json`, `:114-174`).

2. **Load next.** Runs `Bash("maestro ralph next --session ralph-20260627-120000")`. The engine:
   - resolves the session, confirms `status==running` (`src/ralph/cmd-next.ts:43`);
   - runs `checkStatus`; no E findings (`:49`);
   - `active_step_index` is null, so no clear/refuse (`:71`);
   - picks step 3 (first `pending && !decision`) (`:90`);
   - `loadSkill` reads `maestro-execute`'s frontmatter + required reading (`:113`);
   - writes `step[3].load`, `step[3].status='running'`, `active_step_index=3`, atomic write
     (`:120-132`);
   - prints the `<session_anchor>` (intent, boundary contract, last-5 completion summaries, goals
     overview, accumulated caveats/deferred — `:178-272`) + the inlined `maestro-execute` body +
     the completion-protocol comment (`emitPrompt`, `:139-175`). Exit 0.

3. **Inline execute.** Because protocol ≥ 2, the executor skips the legacy `<goal_context>`
   prepend (`.claude/commands/maestro-ralph-execute.md:191`) and runs the skill body directly.

4. **Complete.** On finish:
   `Bash("maestro ralph complete 3 --status DONE --summary \"实现 phase-2 执行，新增 4 端点\" --evidence .workflow/scratch/.../verification.json")`.
   The engine checks `3 == active_step_index` (E008 pass), `step[3].status==running` (E009 pass)
   (`src/ralph/cmd-complete.ts:48-59`), sets `completed`/`completion_confirmed=true`/summary/
   evidence, clears `active_step_index` (`:80-92`), atomic write.

5. **Self-invoke.** Executor self-invokes `Skill("maestro-ralph-execute")`
   (`.claude/commands/maestro-ralph-execute.md:217`).

6. **Next iteration hits a decision.** `ralph next` now finds no pending *execution* step before
   step 4, which is a pending decision node → exits 2 with a hint (`src/ralph/cmd-next.ts:92-100`).
   The executor's `A_EXEC_DECISION` hands off via `Skill("maestro-ralph")`
   (`.claude/commands/maestro-ralph-execute.md:176-182`).

7. **Ralph evaluates the gate.** `maestro-ralph` `S_DECISION_EVAL` → `A_DELEGATE_EVALUATE` runs a
   read-only `maestro delegate` on `verification.json`, parses the verdict
   (`.claude/commands/maestro-ralph.md:458-488`). On `proceed`, `A_APPLY_PROCEED` marks the
   decision complete and `S_DISPATCH` hands back to `maestro-ralph-execute` (`:616-619`, `:139`),
   resuming the loop at step 5+1. On `fix`, fix-loop steps are inserted and re-indexed, growing
   the live chain (`:621-625`).

This continues until all steps + sub-goals are `completion_confirmed` (session marked
`completed`), the session is `paused` (BLOCKED / drift halt / max-retry escalate), or a decision
hands off indefinitely.

---

## 12. Ambiguities & unverified points

- **Odyssey↔ralph integration is conceptual, not coded.** No file under `src/ralph/` references
  odyssey, and `workflows/odyssey-base.md` uses a different state file (`session.json`). I treated
  them as parallel siblings sharing philosophy; if the index expects a code-level link, none
  exists in the evidence read.
- **"Scoring" of skills.** The prompt asked about how candidates are "scored" for the next step.
  The engine only does *existence resolution* (`skill-scanner.ts` + `command_path` validation);
  the actual sequencing is the authored lifecycle table in `A_BUILD_STEPS`. There is no numeric
  ranking in code.
- **`maestro ralph skills` ordering vs. selection.** `scanAllSkills` sorts alphabetically by
  (platform, type, scope, name) (`src/ralph/skill-scanner.ts:179-184`); this ordering is for
  listing, not for next-step selection.
- **`current_step` / `waves` fields** exist in the schema (`src/ralph/status-schema.ts:118-119`)
  but I found no engine logic consuming them in the read files — likely legacy/coordinate-shared.
- I read `maestro-ralph.md` in full and the entire `src/ralph/` tree except `__tests__/`; behavior
  of the test suite was not inspected.

---

## 13. Cross-references for the index

- **Coordinator** (`maestro coordinate`) — sibling *static-chain* builder of the same
  `status.json` contract; shares the `maestro-ralph-execute` runner. See `src/commands/ralph.ts:13-14`,
  `src/cli.ts:45`, `src/ralph/status-store.ts:24-28`. → link to a coordinator subsystem doc.
- **External-CLI / delegate** (`maestro delegate --role analyze --mode analysis`) — the read-only
  evaluation backend for every decision/goal/reground/amend gate. See
  `.claude/commands/maestro-ralph.md:471-477`, `:521-549`, `workflows/ralph-amend-goal.md:44-76`.
  → link to the external-CLI / delegate subsystem doc.
- **Planning chain** (`maestro-analyze` → `maestro-plan` → `maestro-execute`, plus `maestro-roadmap`,
  `maestro-blueprint`, `quality-*`) — the actual command pool ralph sequences in `A_BUILD_STEPS`
  (`.claude/commands/maestro-ralph.md:386-405`) and the `--from`/`--dir` artifact chaining
  (`.claude/commands/maestro-ralph-execute.md:142-161`). → link to the planning-chain doc.
- **Engineering-file projection / state registry** (`.workflow/state.json`, `.workflow/roadmap.md`,
  `.workflow/scratch/`) — the artifact registry ralph reads for phase/milestone/scope resolution
  and `--from` injection (`.claude/commands/maestro-ralph.md:36-39`, `:144-159`, `:201-272`).
  → link to the engineering-file projection doc.
- **Odyssey cycles** (`workflows/odyssey-base.md`, `odyssey-*` skills) — parallel long-running
  loop subsystem sharing ralph's no-abort/goal-confirmation philosophy. → link to an odyssey doc.
- **Skill/command authoring** (`prompt-generator`, `src/ralph/skill-resolver.ts`,
  `skill-scanner.ts`) — the `<required_reading>`/`<deferred_reading>` manifest format the engine
  parses. → link to the skill-authoring / prompt-format doc.
