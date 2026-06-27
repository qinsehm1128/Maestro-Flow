# Maestro Engineering Files & Multi-CLI Design Philosophy

> Research deliverable — how `.claude/`, `.codex/`, and Antigravity ("agy") tooling combine with CLI harnesses under maestro's "write the author once, project to many CLI harnesses" philosophy.
>
> Repo: `/home/user/Maestro-Flow` · Date: 2026-06-27 · Evidence cited as `path:line`.

## Table of Contents

1. [The Multi-Harness Philosophy](#1-the-multi-harness-philosophy)
2. [Anatomy of Each Artifact Type](#2-anatomy-of-each-artifact-type)
3. [`.claude` vs `.codex` Concretely](#3-claude-vs-codex-concretely)
4. [Hooks & Settings](#4-hooks--settings)
5. [Statusline, Monitors & Live Context Injection](#5-statusline-monitors--live-context-injection)
6. [The Generation / Sync Story](#6-the-generation--sync-story)
7. [Runtime Side: `--role` CLI Routing](#7-runtime-side---role-cli-routing)
8. [Synthesis: The Overarching Design Philosophy](#8-synthesis-the-overarching-design-philosophy)
9. [Ambiguities & Unverified Points](#9-ambiguities--unverified-points)
10. [Cross-References](#10-cross-references)

---

## 1. The Multi-Harness Philosophy

Maestro authors its agent/skill/command logic **once** in `.claude/` (markdown + YAML frontmatter), then **projects** that source into the dialects of other CLI harnesses. The canonical source-of-truth is `.claude/`; every code-driven converter reads only `.claude/`.

| Harness | Format | Source | Generated? | Tracked in git? |
|---|---|---|---|---|
| `.claude/` (Claude Code) | markdown + YAML frontmatter | — (**canonical author**) | No — authored | Yes |
| `.agy/` → `~/.gemini/antigravity-cli/` (Antigravity) | markdown | `.claude/` | **Yes** (converter) | No — gitignored |
| `.agents/` (Agent Skills Open Standard) | markdown | `.claude/` | **Yes** (converter) | No — gitignored |
| `.codex/` (OpenAI Codex) | **TOML** agents + markdown skills | — (own tree) | **No — hand-maintained** | Yes |

The converter header states the philosophy plainly: `convert-claude-to-agy.mjs:5-8` — *"Generates the .agy/ source mirror from .claude/. Outputs: .agy/skills/<name>/ ← from .claude/commands/<name>.md … .agy/agents/<name>.md ← from .claude/agents/<name>.md."* And `src/core/skill-converter.ts:1-9` — *"Used by the install pipeline to generate .agy/ (Antigravity) and .agents/ (Open Standard) mirrors from the canonical .claude/ source."*

**What stays identical vs. what is harness-specific:**

- **Identical (projected verbatim or near-verbatim):** the *body* of every skill/agent — its Role, Process, Input/Output, Constraints prose. Compare `.claude/agents/workflow-collab-planner.md:13-26` to `.codex/agents/workflow-collab-planner.toml:6-27`: byte-for-byte identical role text, only the *wrapper* differs.
- **Harness-specific (rewritten by the projector):** tool names (`Agent(` → `invoke_subagent` for agy; `AskUserQuestion` → `request_user_input` for Codex), file-reference mechanism (`@`-refs flattened where the target harness has no resolver), frontmatter shape (YAML vs TOML keys), and the *event vocabulary* of hooks (`PreToolUse:Agent` for Claude vs `SessionStart` for Codex).

The deep insight: maestro treats a CLI harness as a **rendering target**, not a home. Authoring lives in one dialect; each harness gets a mechanically-derived projection plus a thin per-harness adapter layer (hooks, MCP servers, settings).

---

## 2. Anatomy of Each Artifact Type

Maestro distinguishes three artifact types — **command**, **skill**, **agent** — governed by an explicit *content-separation discipline* (GSD-style). The canonical statement is `.claude/skills/prompt-generator/specs/command-design-spec.md:5-19`:

> *"Commands own process flow, user interaction, and agent coordination — NOT domain expertise."*

| Concern | Command/Skill (orchestrator) | Agent (role) |
|---|---|---|
| Argument parsing, path resolution | Yes | No |
| User prompts (`AskUserQuestion`) | Yes | No |
| Agent spawning, flow control | Yes | No |
| Domain knowledge, quality heuristics | No | Yes |
| Output-format rules, role identity | No | Yes |

(`command-design-spec.md:7-22`.) This is the **orchestrator vs. role vs. spec** separation: *commands/skills* are the orchestration layer, *agents* hold domain expertise, and *specs* (`specs/*.md`, `templates/*.json`) hold the reference contracts both consume.

### 2a. Command

- **Location:** `.claude/commands/<name>.md` (or grouped `.claude/commands/<group>/<name>.md`). (`command-design-spec.md:36-39`.)
- **Frontmatter (YAML):** `name`, `description`, `argument-hint`, `allowed-tools`. Example `.claude/commands/maestro-plan.md:1-14`.
- **Body:** XML semantic tags — `<purpose>`, `<required_reading>`, `<context>`, `<execution>`, `<success_criteria>`. (`command-design-spec.md:50-58`.)
- **Distinctive capability:** commands MAY use `@path` references in `<required_reading>` which the harness auto-resolves before execution: `maestro-plan.md:20-21` — `<required_reading>\n@~/.maestro/workflows/plan.md`. Deferred reading lets the command load templates only when needed (`maestro-plan.md:24-29`).

### 2b. Skill

A skill is "a variant of commands but loaded progressively inline" (`prompt-generator/SKILL.md:15`). The critical constraint (`command-design-spec.md:60-71`):

| Aspect | Command | Skill |
|---|---|---|
| Loading | Slash-command, `@`-refs resolved | Progressive **inline** load into conversation |
| `<required_reading>` | Yes — `@path` auto-resolved | **NO — `@`-refs do NOT work** |
| External-file access | `@` references | `Read()` tool calls inside `<process>` |
| Frontmatter | `name, description, argument-hint` | `name, description, allowed-tools` |

So a skill that needs an external spec must call `Read("phases/01-xxx.md")` from within a process step, never `@`. The `prompt-generator` skill itself is a multi-file package: `SKILL.md` + `specs/{command,agent,conversion}-design-spec.md` + `templates/{command,agent}-md.md` (directory listing confirmed). This is the **content-separation discipline in physical form**: the orchestrator router (`SKILL.md`) is small; reference contracts live in `specs/`, output shapes in `templates/`.

### 2c. Agent

- **Location:** `.claude/agents/<name>.md`.
- **Frontmatter (YAML):** `name`, `description`, `allowed-tools` (list). Example `.claude/agents/team-worker.md:1-12`.
- **Body:** `# Title`, `## Role`, `## Process`, `## Input`, `## Output`, `## Constraints` — pure domain logic, no argument parsing or path routing. See `team-worker.md:14-238`.
- **Boundary discipline encoded in prose:** `team-worker.md:213` — *"Cannot call Agent() to spawn other agents (use CLI tools or request coordinator help)"* — i.e., workers are leaves; spawning is an orchestrator concern. This is an **authored convention** (text in the role file), not code-enforced.

---

## 3. `.claude` vs `.codex` Concretely

### 3a. Format: Markdown frontmatter vs TOML

The same agent is wrapped differently per harness. Claude uses a markdown file with a YAML frontmatter block; Codex uses a TOML file where the entire prompt body is a triple-quoted `developer_instructions` string.

**Claude** (`.claude/agents/workflow-collab-planner.md:1-9`):
```yaml
---
name: workflow-collab-planner
description: Collaborative planner working within pre-allocated task ID ranges
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
---
# Collaborative Planner
## Role …
```

**Codex** (`.codex/agents/workflow-collab-planner.toml:1-4`):
```toml
name = "workflow-collab-planner"
description = "Collaborative planner working within pre-allocated task ID ranges"
developer_instructions = """
# Collaborative Planner
## Role …
"""
```

The role body is identical; only the envelope changes: YAML keys → TOML keys, `allowed-tools` list → absent (Codex agents declare tools differently), markdown body → `developer_instructions = """…"""`.

### 3b. Agent-definition differences (the real divergence)

`.codex/agents/team-worker.toml` is **not** a mechanical wrap of `.claude/agents/team-worker.md` — it is a *substantively rewritten* parallel author:

- Codex adds runtime-model config absent from Claude: `model = "gpt-5.4"`, `model_reasoning_effort = "high"`, `sandbox_mode = "workspace-write"` (`team-worker.toml:3-5`). Claude's equivalent carries none of this.
- The Codex name is `team_worker` (underscore) vs the file/Claude name `team-worker` (hyphen) (`team-worker.toml:1`).
- The bodies differ in length and structure: the Claude `team-worker.md` is ~238 lines of detailed lifecycle (full Progress-Milestone JS snippets, consensus tables); the Codex `team-worker.toml` is a ~50-line condensed "Boot Protocol" + "Output Schema" JSON (`team-worker.toml:7-60`). The Codex version references `tasks.json` as source-of-truth (`team-worker.toml:22`) and uses `report_agent_job_result` (`:19`), whereas Claude uses `TaskList()/TaskGet()/TaskUpdate()` MCP-style calls and `SendMessage` (`team-worker.md:50-61`).

So `team-worker` is **hand-maintained in parallel**, not generated — confirming `.codex/` sits outside the projection pipeline (§6).

### 3c. Command → Skill remapping

Codex has no "command" concept; Claude *commands* become Codex *skills*. `learn-investigate` exists as a Claude command (`.claude/commands/learn-investigate.md`) and a Codex skill (`.codex/skills/learn-investigate/SKILL.md`). Diffing the heads:

- Tool list rewritten: Claude `allowed-tools: … Agent, AskUserQuestion` → Codex `allowed-tools: Read, Write, Edit, Bash, Glob, Grep, request_user_input` (Codex drops `Agent`, swaps `AskUserQuestion`→`request_user_input`).
- The `<purpose>` and `<context>` are rephrased (Codex is more condensed, single-line Output), confirming independent authoring rather than a deterministic transform.

### 3d. The `multi-agents-v2-schema.md` — Codex's native sub-agent API

`.codex/multi-agents-v2-schema.md` documents the runtime sub-agent tools Codex exposes to a root agent — a *different* coordination model from Claude's `Agent()`/`SendMessage()`:

| Codex method | Purpose | Triggers target execution |
|---|---|---|
| `spawn_agent` | create child agent + initial task | Yes (`:19-29`) |
| `send_message` | message existing agent, no execution | No (`:58-67`) |
| `followup_task` | send follow-up task + execute | Yes (`:91-99`) |
| `wait_agent` | await any live agent's mailbox | n/a (`:122-130`) |
| `spawn_agents_on_csv` | batch workers per CSV row, structured export | Yes (`:211-225`) |

Key model differences vs Claude: canonical task-path naming (`/root/task1/task_3`, `:41`), `max_concurrent_threads_per_session = 4` (`:46`), and a mailbox/`FINAL_ANSWER` message protocol (`:293-309`). This schema is *why* the agy converter must rewrite `Agent(...)` into `invoke_subagent([...])` and Codex skills drop `Agent` from `allowed-tools` — **the target harness's primitive set dictates the projection's tool rewrites.**

---

## 4. Hooks & Settings

Hooks are the **adapter layer** that wires a harness's lifecycle events to maestro's TypeScript engine. The model is subprocess-based: the harness fires an event, spawns a Node entry point, pipes event JSON over stdin, reads a JSON decision / context-injection back over stdout.

### 4a. Committed settings carry only permissions

The committed `.claude/settings.json:1-15` contains **only** a `permissions.allow` array (`Read`, `Glob`, `Grep`, `Bash(npm *)`, `Bash(maestro *)`, …). `.claude/settings.local.json:1-10` adds four more permission entries. **No `hooks`, `env`, or `statusLine` block is committed.** Hook wiring is generated at install time into `~/.claude/settings.json` (authored convention: hooks are not version-controlled).

Likewise `.codex/config.toml:1-13` configures **only MCP servers** (`claude_dms3-chrome-devtools`, `exa`, `maestro` → `node bin/maestro-mcp.js`) with `MAESTRO_ENABLED_TOOLS = "write_file,edit_file,read_file,read_many_files,team_msg,store_knowhow"` (`:12-13`). No hooks in `config.toml` — Codex hooks live in a separate `~/.codex/hooks.json` gated by a `codex_hooks = true` flag.

### 4b. The two subprocess entry layers (code-enforced)

1. **`bin/maestro-hook-runner.js`** — a dedicated lightweight runner. Reads hook name from `argv[2]` (`:7`), reads stdin with a 500ms timeout (`:14-25`), dispatches through a `HOOKS` map (`:28`), and **fails silently** (`catch {}` … `// never block`, `:164-167`). Handles 7 hooks: `context-monitor`, `delegate-monitor`, `team-monitor`, `session-context`, `spec-injector`, `workflow-guard`, `prompt-guard`, `telemetry`.
2. **`maestro hooks run <name>`** — the full CLI path via `src/commands/hooks.ts` (`HOOK_RUNNERS` map, ~16 hooks). **This is the command string the installer actually writes into settings** (`installHooksByLevel` writes `{ type:'command', command: \`maestro hooks run ${name}\` }`, `src/commands/hooks.ts:387-392`).

The protocol is code-enforced: **exit 0 = allow, exit 2 = block** (only `workflow-guard` blocks, `maestro-hook-runner.js:98-115`).

### 4c. The lifecycle-event map (authored source-of-truth in `HOOK_DEFS`)

`src/commands/hooks.ts` `HOOK_DEFS` (≈`:79-99`) is the single registry of which hook binds to which event. Highlights:

| Hook | Event | Matcher | Effect |
|---|---|---|---|
| `spec-injector` | **PreToolUse:Agent** | `Agent` | rewrites the spawned agent's prompt (`updatedInput.prompt = specs + originalPrompt`, `maestro-hook-runner.js:88-95`) |
| `session-context` | **SessionStart** | `startup\|resume` | injects workflow state, project summary, source tree as `additionalContext` (`src/hooks/session-context.ts:62-103`) |
| `delegate-monitor` | PostToolUse | `Bash\|Agent` | surfaces completed async delegate jobs |
| `team-monitor` | Stop | — | heartbeat to team activity (side-effect only) |
| `workflow-guard` | PreToolUse | `Bash\|Write\|Edit` | blocks `DANGEROUS_PATTERNS` (rm -rf /, git push --force, drop table…) |
| `prompt-guard` | UserPromptSubmit | — | advisory injection-pattern warning (never blocks) |

Hook levels are **cumulative**: `none < minimal < standard < full` (`hooks.ts` `LEVEL_ORDER`). `minimal` = statusline + spec-injector; `standard` adds monitors/injectors/guards; `full` adds workflow-guard + prompt-guard. Toggle convention is **default-on**: a hook runs unless `config.toggles[name] === false` (`src/hooks/hook-manager.ts:19-21`).

### 4d. In-process tapable engine (separate from the harness boundary)

`src/hooks/hook-engine.ts:1-86` defines a zero-dependency, webpack-tapable-style hook system (`SyncHook`, `AsyncSeriesHook`, `AsyncSeriesBailHook` for veto, `AsyncSeriesWaterfallHook` for prompt transformation) used by the **coordinator/workflow engine internally** — not by the CLI harness. The subprocess hooks (§4b) are pure `evaluateXxx()` functions, deliberately I/O-free so one implementation serves all three harnesses.

### 4e. Claude vs Codex vs Antigravity hook dialects

The same evaluator is bound to different events per harness because each harness exposes different interception points (corroborated by `guide/hooks-guide-codex.md:24-39`):

| Dimension | Claude Code | Codex | Antigravity (agy) |
|---|---|---|---|
| Config file | `~/.claude/settings.json` | `~/.codex/hooks.json` + `config.toml` flag | `~/.gemini/config/hooks.json` |
| Feature flag | none | `codex_hooks = true` | — |
| PreToolUse scope | any tool | **Bash only** | agy tool names (`invoke_subagent`, `run_command`) |
| spec-injector binding | PreToolUse:Agent (prompt rewrite) | **SessionStart** (advisory additionalContext) | `PreInvocation` |
| Multi-hook exec | serial | concurrent | — |
| Block mechanism | `exit(2)` | `permissionDecision:"deny"` | — |

The crucial design point: **the evaluator logic is shared; only the binding adapter is per-harness.** Codex cannot intercept `Agent` calls, so spec-injection falls back from per-agent prompt-rewrite to a session-wide advisory injection.

---

## 5. Statusline, Monitors & Live Context Injection

Maestro injects live session state through two distinct channels:

### 5a. Statusline (out-of-band display, not model-visible)

`bin/maestro-statusline.js` is a shim into `dist/src/hooks/statusline.js`. Flow per `guide/statusline-guide.md:40-44`: *Claude Code → stdin JSON → maestro-statusline → stdout ANSI → status bar.* It reads Claude stdin (`model.display_name`, `context_window.remaining_percentage`, `cost.*`) plus maestro internal state (`.workflow/state.json` milestone/artifacts, coordinator/context bridge files in `$TMPDIR`, team activity `.workflow/.maestro/activity.ndjson`, Claude todos). It computes context % after deducting Claude's ~16.5% autocompact buffer. It is installed opt-in via `installStatusline()` writing `settings.statusLine = { type:'command', command:'maestro-statusline' }` (`src/commands/hooks.ts:333`).

### 5b. Monitors (model-visible vs side-effect)

| Monitor | Event | Injects into model? | What it surfaces |
|---|---|---|---|
| `context-monitor` | PostToolUse | **Yes** (additionalContext) | context-budget warnings when context runs low |
| `delegate-monitor` | PostToolUse | **Yes** (additionalContext) | completed/failed async delegate jobs from `$TMPDIR/maestro-notify-{session}.jsonl`, marked read once |
| `team-monitor` | Stop | No (side-effect) | heartbeat → team activity; consumed by statusline, not the model |
| `statusline` | n/a | No (status bar) | live workflow/context/cost state |

The `$TMPDIR` bridge files (`maestro-coord-{session}.json`, `maestro-ctx-{session}.json`, `maestro-notify-{session}.jsonl`) are the **shared-state backbone** connecting monitors → statusline → model injection. This is how maestro makes its engine's live workflow state visible inside an otherwise-stateless CLI turn.

---

## 6. The Generation / Sync Story

This is the heart of "write once, project to many." The mechanism is **code-enforced for agy + agents-standard, manual-discipline for Codex.**

### 6a. Two converter implementations, same maps

- **Standalone scripts** (publish-time): `scripts/convert-claude-to-agy.mjs` (→ `.agy/`) and `scripts/build-agents-standard.mjs` (→ `.agents/`). Wired via `package.json` `"build:mirrors"` and `"prepublishOnly"`. There is **no** `build:codex` script.
- **In-`src` converter** (install-time): `src/core/skill-converter.ts` — encodes `AGY_PROFILE` (`:477-512`) and `AGENTS_STANDARD_PROFILE` (`:518-601`) as data, exports `buildAgySkills/Agents`, `buildAgentsStandardSkills/Agents` (`:714-748`). **There is no `buildCodex*` function.**

### 6b. The converter is a true transpiler

`convert-claude-to-agy.mjs` does more than rename tools — it rewrites the orchestration primitives to match the agy harness:

- `Agent(...)` → `invoke_subagent([{...}])` (`:263-282`).
- `Skill(...)` → `view_file(...SKILL.md) + execute inline`, because *"Antigravity has no Skill() tool"* (`:284-316`).
- **Drops** tools with no agy equivalent: `TeamCreate`, `TaskCreate`, `TodoWrite`, `Skill`, `mcp__ccw-tools__team_msg` (`:91-98`).
- Tier-A/Tier-B name discipline: ambiguous English-verb names (`Read`, `Write`, `Bash`) rewritten **only at call sites** (`Read(`), so prose like "Read the docs" survives; unambiguous CamelCase (`SendMessage`) rewritten bare (`:54-74`).
- `rmrf(AGY_DIR)` at start → idempotent regeneration (`:469`).

### 6c. Install-time dispatch hardwires `.claude` as input

`src/core/install-executor.ts:158-166`:
```js
if (comp.def.build) {
  const result = comp.def.build(join(pkgRoot, '.claude'), comp.targetDir);   // generate (agy / agents-standard)
} else if (comp.def.inject) { … injectDocFile … }                            // shared doc injection
else { copyRecursive(comp.sourceFull, comp.targetDir, …); }                   // plain copy (codex!)
```

The `build` callback is **always passed `.claude/`** — hardcoded `join(pkgRoot, '.claude')` (`:159`). `.codex/` components (`codex-agents`, `codex-skills` in `src/core/component-defs.ts`) have **no `build` callback** — they fall to `copyRecursive`, copying the committed `.codex/` tree as-is. So Codex skills/agents are *not* projected from `.claude/`; they are authored independently and merely copied. (Corroborated by the substantive `team-worker` divergence in §3b.)

### 6d. Source-of-truth verdict

`.claude/` is canonical, confirmed three ways: (1) every converter reads only `.claude/`; (2) `install-executor.ts:159` hardcodes `.claude` as build input; (3) `.agy/` and `.agents/` are gitignored disposable artifacts while `.claude/` is committed. **Antigravity** is a pure projection target (most aggressive rewrite, because its primitive set differs most). **Codex** is the documented exception: hand-maintained in parallel, kept in sync only by authored discipline, with no code regenerating or validating it.

---

## 7. Runtime Side: `--role` CLI Routing

The projection story has a *runtime* twin. Beyond compiling artifacts into each harness, maestro decouples *work type* from *which CLI executes it* at run time via `--role` and `cli-tools.json` (`guide/role-routing-guide.md:9-18`):

```
command --role analyze → cli-tools.json → fallbackChain: [codex, gemini, claude] → first enabled tool
```

Seven fixed roles (`analyze`, `explore`, `review`, `implement`, `plan`, `brainstorm`, `research`) each declare a fallback chain across CLIs (`role-routing-guide.md:79-87`). Resolution order: user config `config.roles[role]` → built-in `DEFAULT_ROLE_MAPPINGS` → first enabled tool in chain → any enabled tool (`:91-96`). Config precedence: `{project}/.maestro/cli-tools.json` > `~/.maestro/cli-tools.json` > built-in defaults (`:30-34`).

This is the same philosophy at the orchestration layer: **commands declare a capability need, not a CLI binding** — so adding/removing a CLI tool requires no command edits, exactly as adding a harness requires no agent-body edits.

---

## 8. Synthesis: The Overarching Design Philosophy

Maestro's engineering-file design rests on five principles, in descending order of how strictly they are enforced:

1. **Single canonical author, many projections.** `.claude/` is the one source of truth. Agy and the Agent-Skills Open Standard are *generated* (code-enforced via `skill-converter.ts` + install dispatch). The cost of supporting a new harness is one converter profile, not a fork.

2. **The harness is a rendering target.** A CLI is reduced to: (a) a projected artifact tree, (b) a thin hook adapter binding lifecycle events to shared evaluators, (c) MCP/settings config. The *logic* (role bodies, evaluators) is harness-agnostic; only envelopes and event bindings are per-harness. Evidence: identical role text across `.md`/`.toml` (§3a), pure I/O-free `evaluateXxx()` hooks reused across Claude/Codex/agy (§4d).

3. **Content separation: orchestrator vs. role vs. spec.** Commands/skills own flow + user interaction + spawning; agents own domain knowledge; specs/templates own contracts (`command-design-spec.md:7-22`). The `prompt-generator` skill physically embodies this (router `SKILL.md` + `specs/` + `templates/`). This is what makes projection *possible* — orchestration concerns (which differ per harness: `Agent` vs `invoke_subagent` vs `spawn_agent`) are isolated from domain prose (which is portable).

4. **Decouple capability from binding, at both compile and run time.** Compile time: agent bodies don't name a harness. Run time: commands declare `--role`, not a CLI (§7). Both layers let you add/swap a backend without touching authored content.

5. **Fail-open adapters, default-on behavior.** Hooks never block tool execution on error (`maestro-hook-runner.js:164-167`); only an explicit `workflow-guard` veto exits 2. Live state is *injected advisorily* (additionalContext) rather than gating. Toggles are default-on (`=== false` to disable). The harness integration is designed to enhance, never to brick, a session.

**The one crack in the philosophy:** Codex is the exception that proves the rule — it is *not* projected (no `buildCodex*`, plain `copyRecursive`), so `.codex/` artifacts drift from `.claude/` (demonstrably, `team-worker`). The "write once" guarantee is mechanically real for agy + agents-standard, but for Codex it is an aspiration upheld only by manual authoring discipline.

---

## 9. Ambiguities & Unverified Points

1. **Two runner layers with divergent hook sets.** `bin/maestro-hook-runner.js` (7 hooks incl. `context-monitor`) vs `HOOK_RUNNERS` in `src/commands/hooks.ts` (~16 hooks, no `context-monitor`). The installer emits the `maestro hooks run` form, so the dedicated runner is an alternate/optimization path; whether it is used in production wiring is unresolved.
2. **`context-monitor` has no source file.** `src/hooks/context-monitor.ts` does not exist; binaries import the compiled-only `dist/src/hooks/context-monitor.js`. Its exact injection behavior is inferred, not source-confirmed.
3. **No committed hooks/env/statusline.** All hook wiring is install-time generated. The hook tables here derive from `HOOK_DEFS` (authored registry), not from committed settings. The repo `.claude/settings.json`/`.codex/config.toml` carry only permissions/MCP.
4. **Guide drift.** `guide/hooks-guide.md` still labels `session-context` as a `Notification` event; code uses `SessionStart` (matcher `startup|resume`). A Codex `task-continue` Stop hook is documented but unimplemented.
5. **Two converter implementations may drift.** `scripts/*.mjs` and `src/core/skill-converter.ts` share maps but differ slightly (the `.mjs` standard builder injects a "do not edit" header the TS path omits).
6. **Workspace-mode path collision.** In workspace mode, both agy-skills and agents-standard can target `<project>/.agents/`; global mode separates them (`~/.gemini/antigravity-cli/` vs `.agents/`).
7. **Whether `.codex/skills` was originally seeded from `.claude` then edited, or authored fresh, cannot be determined from code** — only that it is currently maintained independently.

---

## 10. Cross-References

- **Ralph** (`maestro-research/01-ralph.md`): ralph is an automated *state-based* command sequencer; it consumes the same `.claude/commands/*` artifacts described here and routes through the same `--role` CLI layer (§7). Ralph's hook touchpoints are `session-context`/`coordinator-tracker` (§4c).
- **Planning chain** (`maestro-research/02-planning-grill-roadmap-blueprint.md`): the `maestro-plan`/`grill`/`roadmap`/`blueprint` commands are exemplars of the command-artifact anatomy (§2a) — note `maestro-plan.md`'s `<required_reading>` + `<deferred_reading>` discipline and its `--collab` flag spawning `workflow-collab-planner` agents (compared across harnesses in §3).
- **External-CLI orchestration**: the `--role` fallback-chain routing (§7), the Codex `multi-agents-v2` sub-agent API (§3d), and the agy `invoke_subagent` rewrite (§6b) are the three faces of how maestro fans work out to non-Claude CLIs. See also `maestro collab` / `maestro delegate` (the `developer_instructions` in `team-worker.toml:55-59` mandate `maestro delegate` via `shell_exec`).
