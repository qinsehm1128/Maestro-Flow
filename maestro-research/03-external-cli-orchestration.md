# Maestro — External CLI Orchestration

How Maestro calls and orchestrates external coding-agent CLIs (Claude Code, Codex,
Gemini/Qwen, OpenCode, Antigravity/`agy`) as subprocesses, monitors them, and
coordinates them into multi-step and multi-agent workflows.

> Scope note: this document distinguishes **code-enforced** behavior (TypeScript in
> `src/` and `dashboard/src/`) from **authored-prompt** behavior (markdown command
> files under `.claude/commands/` that instruct the *host* agent what shell
> commands to run). Where a claim rests only on prose, it is flagged.

---

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [The delegate mechanism](#2-the-delegate-mechanism)
3. [CLI abstraction & adapter layer](#3-cli-abstraction--adapter-layer)
4. [Tool configuration, detection & role routing](#4-tool-configuration-detection--role-routing)
5. [The coordinator: graph-walker + llm-decider](#5-the-coordinator-graph-walker--llm-decider)
6. [Parallel execution model](#6-parallel-execution-model)
7. [maestro-collab: cross-verification fan-out](#7-maestro-collab-cross-verification-fan-out)
8. [tools-register / tools-execute](#8-tools-register--tools-execute)
9. [Antigravity (`agy`) integration](#9-antigravity-agy-integration)
10. [Monitors (the `*-monitor.js` binaries)](#10-monitors-the--monitorjs-binaries)
11. [End-to-end trace](#11-end-to-end-trace-of-one-external-cli-delegation)
12. [Ambiguities & unverifiable points](#12-ambiguities--unverifiable-points)
13. [Cross-references](#13-cross-references)

---

## 1. Architecture overview

There are **two stacked layers** that drive external CLIs:

| Layer | Entry | Drives | Concurrency |
|-------|-------|--------|-------------|
| **Delegate** (`maestro delegate` / `maestro cli`) | `src/commands/delegate.ts`, `src/agents/cli-agent-runner.ts` | one external CLI to completion | single process |
| **Coordinator** (`maestro coordinate`) | `src/commands/coordinate.ts`, `src/coordinator/*` | a graph of steps, each step = a delegate spawn | optional fork/join parallel |

Both layers funnel through one **adapter layer** (`dashboard/src/server/agents/*-adapter.ts`)
that normalizes each CLI's wire protocol into a common `NormalizedEntry` event stream.

```
maestro-collab.md (authored)            maestro coordinate (code)
        │  fans out N×                         │  walks ChainGraph
        ▼                                      ▼
  maestro delegate ──┐              GraphWalker.handleCommand
  (one per tool)     │                         │ executor.execute()
                     ▼                         ▼
            CliAgentRunner.run()  ◄──── CliExecutor → SpawnFn (execFile "maestro cli")
                     │
                     ▼
         createAdapterForType(agentType)   ← adapter-factory.ts
                     │
   ┌────────┬────────┼────────┬────────┬────────┐
 Claude    Codex   Gemini    Qwen   OpenCode   agy
 adapter   adapter  (stream-json)            adapter
                     │
         node:child_process.spawn(<cli>, args)
                     │
        stdout → adapter parse → NormalizedEntry → renderEntry / broker
```

Key files:
- `src/agents/cli-agent-runner.ts` — orchestrates one delegate run (spawn → render → exit).
- `dashboard/src/server/agents/adapter-factory.ts` — maps `AgentType` → adapter class.
- `dashboard/src/server/agents/base-adapter.ts` — `BaseAgentAdapter` lifecycle.
- `src/coordinator/cli-executor.ts` — `CliExecutor` (the coordinator's `CommandExecutor`).
- `src/agents/parallel-cli-runner.ts` — semaphore-bounded parallel scheduler.
- `src/config/cli-tools-config.ts` + `cli-tools-defaults.json` — tool registry & role routing.

---

## 2. The delegate mechanism

### 2.1 Command surface

`maestro delegate [prompt]` is registered in `registerDelegateCommand`
(`src/commands/delegate.ts:316`). Notable options
(`src/commands/delegate.ts:323-338`): `--to <tool>`, `--role <role>`, `--mode
analysis|write`, `--model`, `--cd`, `--rule`, `--id`, `--resume`, `--backend
direct|terminal`, `--effort`, `--timeout`, `--async`, and a hidden `--worker`.

Tool resolution priority is **`--to` > `--role` > first-enabled fallback**
(`src/commands/delegate.ts:373-421`); `--to` overrides `--role` with a warning
(`delegate.ts:376-378`).

### 2.2 Sync vs async delegation (code-enforced)

The **default is synchronous** (`delegate.ts:501`):

```ts
const useAsync = !opts.worker && opts.async === true;   // delegate.ts:501
```

- **Sync** (`delegate.ts:510-584`): constructs `new CliAgentRunner()`, runs
  `runner.run({ ...request, sync: true })`, blocks until exit, then auto-appends a
  status line and the assistant output to stderr/stdout and publishes one final
  broker event. No MCP notifications are sent in sync mode.
- **Async** (`delegate.ts:502-508`): `launchDetachedDelegateWorker(request)` spawns a
  **detached** child (`delegate.ts:192-197`, `detached: true, stdio: 'ignore'`,
  `MAESTRO_DISABLE_DASHBOARD_BRIDGE=1`) that re-invokes
  `node <entryScript> delegate <prompt> --worker ...`
  (`buildDetachedDelegateWorkerArgs`, `delegate.ts:139-172`). The parent returns
  immediately printing the exec ID; results are delivered later via the broker +
  MCP channel notification.

The comment at `delegate.ts:497-500` explains why channel auto-detection was
dropped: Claude Code's `--channels` mode is not observable from the MCP server
side, so async is opt-in only.

### 2.3 The runner (`CliAgentRunner.run`)

`src/agents/cli-agent-runner.ts:524`. Flow:

1. Map `tool` → `AgentType` via `TOOL_TO_AGENT_TYPE` (`cli-agent-runner.ts:96-106`,
   `claude` → `claude-code`, `agy` → `agy`, etc.). Unknown tool → exit 1.
2. Generate exec ID (`generateCliExecId`, `cli-agent-runner.ts:140-148`,
   prefix per tool, e.g. `cld-HHMMSS-xxxx`), printed as
   `[MAESTRO_EXEC_ID=...]` to stderr (`cli-agent-runner.ts:534`).
3. `--resume`: prepend prior session via `CliHistoryStore.buildResumePrompt`
   (`cli-agent-runner.ts:543-556`).
4. **Prompt assembly** (`assemblePrompt`, `cli-agent-runner.ts:173-232`):
   `[mode protocol]` + `[PROJECT SPECS]` (category-filtered by role then mode,
   `ROLE_SPEC_CATEGORIES`/`MODE_SPEC_CATEGORIES` at `:158-171`) + user prompt +
   optional `--rule` template. This is **code-enforced** prompt injection.
5. `createAdapter(agentType, backend)` (`cli-agent-runner.ts:238-253`): `terminal`
   backend → `TerminalAdapter`; otherwise the dashboard `adapter-factory` via the
   `#maestro-dashboard/agents/adapter-factory.js` package import.
6. Build `AgentConfig` (`cli-agent-runner.ts:574-587`): maps `mode === 'write'` →
   `approvalMode: 'auto'`, else `'suggest'`; threads `model`, `settingsFile`
   (`~` expanded), `reasoningEffort`, `streamTimeoutMs`, and resolved `proxyEnv`.
7. `adapter.spawn(config)` → an `AgentProcess`.
8. Subscribe `adapter.onEntry` (`cli-agent-runner.ts:873`): each `NormalizedEntry`
   is persisted to JSONL history, rendered, optionally forwarded to the dashboard
   bridge and broker. The `run()` promise **resolves on `status_change: stopped`
   (exit 0/130) or `status_change: error` (exit 1/130)** (`cli-agent-runner.ts:934-957`).

### 2.4 Result capture & notification

- **History**: every entry appended to JSONL via `CliHistoryStore`
  (`cli-agent-runner.ts:875`); `delegate output <id>` reads it back
  (`delegate.ts:640-691`, `store.getOutput(..., { lastReply: true })`).
- **Broker events**: `publishEvent` (`cli-agent-runner.ts:610-644`) writes to the
  file-backed `DelegateBroker`; `running` on start, terminal status on stop.
  Snapshots during execution are disabled (`shouldPublishSnapshot` returns `false`,
  `cli-agent-runner.ts:428-431`).
- **MCP channel notification** (primary async path,
  `CliAgentRunner.sendChannelNotification`, `cli-agent-runner.ts:486-519`): pushes a
  `notifications/claude/channel` message `[DELEGATE DONE] <id> <tool>/<mode>` to the
  in-process MCP server when present.
- **JSONL fallback** (`cli-agent-runner.ts:696-708`): appends to
  `/tmp/maestro-notify-<sessionId>.jsonl`, which the delegate-monitor hook later
  reads (see §10).

### 2.5 Cancellation & follow-up injection

A 750 ms poller (`cli-agent-runner.ts:814-867`) watches the broker for
`cancelRequestedAt` and for queued **inject** messages. Interactive adapters
(Claude) receive injected messages via `adapter.sendMessage` (stdin); non-interactive
adapters fall back to cancel + resume (`cli-agent-runner.ts:855-861`). On terminal
status, `dispatchQueuedFollowup` (`cli-agent-runner.ts:753-811`) may spawn a
detached worker to continue with a queued message.

---

## 3. CLI abstraction & adapter layer

### 3.1 The adapter contract

`AgentAdapter` (`dashboard/src/server/agents/base-adapter.ts:21-33`):
`spawn / stop / sendMessage / onEntry / onApproval / respondApproval /
supportsInteractive / endInput`. `BaseAgentAdapter` (`base-adapter.ts:40`)
implements process tracking and the `onEntry`/`onApproval` callback fan-out, and
exposes abstract `doSpawn / doStop / doSendMessage / doRespondApproval` hooks
(`base-adapter.ts:180-194`). Each concrete adapter normalizes its CLI's output into
`NormalizedEntry` events via `EntryNormalizer`.

### 3.2 The factory (single source of truth)

`createAdapterForType` (`dashboard/src/server/agents/adapter-factory.ts:15-56`) is a
lazy `switch` over `AgentType`:

| AgentType | Adapter | Underlying CLI |
|-----------|---------|----------------|
| `claude-code` | `ClaudeCodeAdapter` | `claude` |
| `gemini` | `StreamJsonAdapter('npx -y @google/gemini-cli', 'gemini')` | `gemini` |
| `gemini-a2a` | `GeminiA2aAdapter` | `gemini` (A2A) |
| `qwen` | `StreamJsonAdapter('qwen', 'qwen')` | `qwen` |
| `codex` | `CodexCliAdapter` | `codex` |
| `codex-server` | `CodexAppServerAdapter` | `codex` (app-server) |
| `opencode` | `OpenCodeAdapter` | `opencode` |
| `agy` | `AgyAdapter` | `agy` (Antigravity) |
| `api-explore` | `ApiExploreAdapter` | in-process (no external CLI) |

### 3.3 Per-CLI spawn details (the load-bearing argv)

Each adapter constructs argv and calls `node:child_process.spawn`. The
**mode → approval-flag** translation is where Maestro normalizes "analysis vs write"
into each CLI's native permission model:

**Claude Code** (`claude-code-adapter.ts:141-216`):
- Non-interactive argv: `--output-format=stream-json --verbose --print <prompt>`
  (`:158-163`); interactive sends the prompt as a stream-json `user` message over
  stdin (`:151-157`, `:222-234`).
- `approvalMode: 'auto'` → `--permission-mode bypassPermissions`;
  `'suggest'` → `--permission-mode default --allowedTools Read,Glob,Grep,WebFetch,WebSearch`
  (`:185-189`).
- `--effort`, `--settings`, `--mcp-config` threaded (`:166-178`). Stdout parsed
  line-by-line as stream-json (`parseClaudeMessage`, `:403`).
- The **only interactive adapter**: `supportsInteractive() === true` (`:137-139`).

**Codex** (`codex-cli-adapter.ts:205-262`):
- argv: `exec --dangerously-bypass-approvals-and-sandbox --json --skip-git-repo-check -`
  (`:209-215`); prompt piped to **stdin** then closed (`:261-262`).
- `--profile <settingsFile>` (`:218-220`); reasoning effort → `-c model_reasoning_effort="..."`
  with `max → xhigh` (`:222-227`).

**Gemini / Qwen** (`stream-json-adapter.ts`):
- `buildArgs`: `-o stream-json` (`:408`), `-m <model>` if set (`:411`),
  `approvalMode: 'auto'` → `--approval-mode yolo` (`:414-415`).
- Prompt written to **stdin** then closed (`:134-135`).

**Common spawn hardening** (across adapters): POSIX `detached: process.platform !== 'win32'`
so `killProcessTree` can signal the whole tree; `windowsHide: true`; a
`StreamMonitor` + `createStaleHandler` heartbeat that force-kills a silent CLI
after `streamTimeoutMs` (default 10 min, `DEFAULT_STREAM_TIMEOUT_MS`); env sanitized
via `cleanSpawnEnv`; optional `loadEnvFile`.

### 3.4 Terminal backend (alternative)

With `--backend terminal`, `TerminalAdapter` (`src/agents/terminal-adapter.ts:88`)
drives the CLI inside a tmux/wezterm pane instead of a piped child. `detectBackend`
requires `TMUX` or `WEZTERM_PANE` env (`cli-agent-runner.ts:243-244`).

---

## 4. Tool configuration, detection & role routing

### 4.1 The registry

`~/.maestro/cli-tools.json`, loaded by `loadCliToolsConfig`
(`src/config/cli-tools-config.ts:112-143`) with priority
**`{workDir}/.maestro/cli-tools.json` > `~/.maestro/cli-tools.json` > defaults**.
Each `ToolEntry` (`cli-tools-config.ts:29-48`) carries `enabled`, `primaryModel`,
`secondaryModel`, `tags`, `type`, `settingsFile`, `baseTool`, `reasoningEffort`,
`streamTimeoutMs`, `proxy`.

### 4.2 Detection

`isCliAvailable(cmd)` runs `"<cmd> --version"` with a 5 s timeout
(`cli-tools-config.ts:400-407`). `initCliToolsConfig` / `resetCliToolsConfig`
populate `enabled` from this probe over `TOOL_DEFS` loaded from
`cli-tools-defaults.json` (`:396-398`). Defaults
(`src/config/cli-tools-defaults.json`): `gemini`, `claude`, `codex`, `opencode`,
`agy`, `api-explore`, with `claude` primary model `claude-sonnet-4-6`, `codex`
`gpt-5.5`, `gemini` `gemini-3.1-pro-preview`.

### 4.3 Role routing

`selectToolByRole` (`cli-tools-config.ts:189-214`) resolves a capability role to a
tool via user `config.roles` → built-in `DEFAULT_ROLE_MAPPINGS` (from
`cli-tools-defaults.json` `roleMappings`) → direct `tool` or ordered `fallbackChain`
→ first enabled. Default chains (`cli-tools-defaults.json:10-18`), e.g.
`analyze/explore/review/plan: [codex, gemini, claude]`,
`implement: [codex, claude, gemini]`, `brainstorm/research: [gemini, codex, claude]`.
Roles: `analyze, explore, review, implement, plan, brainstorm, research`
(`DELEGATE_ROLES`, `:81-83`). `rankToolsByDomain` (`:275-296`) ranks by `tags`
(frontend/backend/fullstack/...) for domain-aware selection.

### 4.4 Proxy

`resolveProxyEnv` (`cli-tools-config.ts:306-334`) builds `HTTP(S)_PROXY`/`NO_PROXY`
env from global `proxy` config unless a tool opts out (`proxy: false`).
`delegate` probes reachability via `checkProxyReachable` before applying
(`delegate.ts:463-475`).

---

## 5. The coordinator: graph-walker + llm-decider

`maestro coordinate` walks a `ChainGraph` — a node graph persisted as
`walker-state.json` — autonomously dispatching each `command` node to an external
CLI. Wiring is in `createWalker` (`src/commands/coordinate.ts:133`).

### 5.1 The execution bridge — how the coordinator reaches a CLI

`CliExecutor` (`src/coordinator/cli-executor.ts:36`) is the coordinator's
`CommandExecutor`. It is **decoupled** from adapters: it delegates to an injected
`SpawnFn` (`cli-executor.ts:18-30`), holds an `AbortController` for `abort()`,
and never throws (errors become `{ success: false }`, `cli-executor.ts:60-66`).

The concrete `SpawnFn` is `createSpawnFn` (`coordinate.ts:67-118`). Crucially, it
does **not** call adapters directly — it shells out to `maestro cli` as a
sub-subprocess:

```ts
const { stdout, stderr } = await execFileAsync(process.execPath, [
  entryScript, 'cli', '-p', config.prompt,
  '--tool', tool, '--mode', mode, '--cd', config.workDir,
], { cwd: config.workDir, timeout: 600000, maxBuffer: 10*1024*1024,
    signal: config.signal });                          // coordinate.ts:80-92
```

So a coordinated command node = `node maestro coordinate` → `execFile node maestro
cli` → `CliAgentRunner.run` → adapter → external CLI. A clean exit is treated as
"ran" (`success: true`); the walker derives the real verdict from the report file or
the OutputParser (`coordinate.ts:98-107`).

### 5.2 The walker state machine

`GraphWalker.walk` (`src/coordinator/graph-walker.ts:142`) loops while
`status === 'running'`, dispatching by node type (`:193-215`): `command, decision,
gate, eval, fork, join, terminal`. Guards: per-node `max_visits` (default 10,
`:154-166`) and step-mode pause after each command (`:228-230`).

`handleCommand` (`graph-walker.ts:242-377`):
1. `assembler.assemble(...)` builds the prompt; optional `transformPrompt` hook
   waterfall (`:271-276`).
2. Clears any stale report file (`:281`).
3. Runs `executeWithRetry` (`:1082-1106`, exponential backoff per
   `resolveRetryPolicy`, `:1069-1080`) wrapping `executor.execute({ prompt,
   agent_type: state.tool, work_dir, approval_mode: auto_mode ? 'auto' :
   'suggest', timeout_ms, ... })` (`:305-313`).
4. **Success rule**: `result.success && parsed.structured.status === 'SUCCESS'`
   (`:314-317, :343`). Result is loaded **file-first** via `loadNodeResult`
   (`:946-978`): if the spawned agent wrote `<sessionDir>/<sid>/reports/<node>.json`
   (via `maestro coordinate report`), that JSON is authoritative; otherwise fall
   back to the stdout OutputParser.
5. On failure: route to `on_failure`, else auto-skip in auto-mode if configured
   (`shouldAutoContinue`, `:1108-1114`), else `status = 'failed'`.

### 5.3 LLM decision routing

`handleDecision` (`graph-walker.ts:379-433`) supports `strategy: 'expr'` (default)
and `strategy: 'llm'`. For LLM strategy (or as an `expr` fallback when no edge
matches, `:418-428`), `askLLMDecider` (`:437-462`) builds a decision prompt
(`buildDecisionPrompt`, `:467-514`) — node purpose + available edges + truncated
walker context (4 KB cap) + a strict two-line response contract
(`DECISION: <target>` / `REASONING: <line>`).

`DefaultLLMDecider` (`src/coordinator/llm-decider.ts:28`) is a thin spawn+parse
wrapper: it sends the prompt through the **same `SpawnFn`** as command execution
(`llm-decider.ts:45-50`, `coordinate.ts:169`), parses with `parseDecision`
(`llm-decider.ts:66-80`, regex `DECISION:\s*(\S+)`), validates the target against
the closed edge set, and returns `null` on any failure so the walker falls through
to its `default` edge. **Distinction**: the decision *prompt format* is authored by
the walker in code; the *choice* is delegated to whatever CLI the coordinator is
configured to use (default `gemini`, `llm-decider.ts:36`).

### 5.4 Delegate (sub-graph) terminals

A `terminal` node with `status: 'delegate'` (`graph-walker.ts:745-775`) pushes a
frame onto `delegate_stack`, loads `delegate_graph`, merges `delegate_inputs`
templates, and walks the sub-graph; on completion it pops back to the parent. This
is **graph-level delegation** (chain → chain), distinct from CLI delegation.

### 5.5 Telemetry

`CoordinateBrokerAdapter` (`src/coordinator/coordinate-broker-adapter.ts:35`)
forwards every `CoordinateEvent` into the file-backed broker as a job keyed by
`session_id` (`:41-56`), so `maestro coordinate watch` / MCP tools stream progress
without polling. Fire-and-forget; failures logged and swallowed.

---

## 6. Parallel execution model

### 6.1 Fork/join in the walker

`handleFork` (`graph-walker.ts:570-642`): validates branch nodes, marks them
running, and — when a `ParallelCommandExecutor` is injected (only with `--parallel`,
`coordinate.ts:156-159`) — calls `parallelExecutor.executeBranches(branchTasks,
strategy)`. Without it, a **sequential fallback** just visits each branch with empty
results (`:630-639`). `handleJoin` (`:644-739`) evaluates the join strategy
(`all` / `any` / `majority`, `:676-688`) and merges branch outputs by `merge` mode
(`concat` / `last` / `best_score`, `:691-723`).

### 6.2 The bridge

`DefaultParallelExecutor` (`src/coordinator/parallel-executor.ts:52`) maps each
`BranchTask` to a `ParallelTask` (mapping `agentType` → tool name via
`AGENT_TYPE_TO_TOOL`, `:40-46`, default `gemini`) and calls
`ParallelCliRunner.runAll`.

### 6.3 The scheduler

`ParallelCliRunner` (`src/agents/parallel-cli-runner.ts:103`):
- **Session grouping** (`groupBySession`, `:173-181`): tasks sharing a `sessionKey`
  (default `tool:workDir`) run **serially**; different keys run in parallel.
- **Semaphore** (`:67-91`) caps total concurrency (`maxConcurrency` default 4, `:121`).
- **Join `any`** races groups and aborts the rest on first completion
  (`:155-159`).
- Each task → `executeViaSpawn` (`:229-281`, the injected `SpawnFn`) or
  `executeViaTerminal` (`:287-350`, tmux/wezterm). Per-task hard timeout
  `DEFAULT_TASK_TIMEOUT_MS = 10 min` (`:97, :248`), merged with the global
  `AbortSignal`.

> Note: the coordinator's `--parallel` path reuses the **same `createSpawnFn`**
> (`coordinate.ts:158`), so each parallel branch is itself a `maestro cli`
> sub-subprocess.

---

## 7. maestro-collab: cross-verification fan-out

`.claude/commands/maestro-collab.md` is an **authored command** — it instructs the
*host* agent (the Claude running the slash command), not compiled code. Behavior:

- **Discover** eligible tools: `maestro tools list --json` or read
  `~/.maestro/cli-tools.json`, filter `enabled`; default = first 3
  (`maestro-collab.md:96-104, :54-60`). Requires ≥ 2 tools (else E002).
- **Fan-out** (`A_PARALLEL_DELEGATE`, `:108-123`): build one shared structured
  prompt (PURPOSE/TASK/MODE/CONTEXT/EXPECTED/CONSTRAINTS), then launch **all**
  delegates in a single message as `Bash(run_in_background: true)` calls:
  `maestro delegate "${prompt}" --to {tool} --mode ${mode} [--rule ${rule}]`, and
  **STOP** to await background callbacks.
- **Collect**: on each callback, `maestro delegate output <id>` →
  `per-tool/{tool}-output.md` (`:125-127`).
- **Cross-verify** (`A_CLASSIFY_FINDINGS`, `:129-141`): tag each finding
  CONSENSUS (≥2 agree) / CONFLICT / UNIQUE; `consensus_level =
  consensus_count / total * 100`.
- **Boundary grill** on CONFLICT items, then **synthesize** three outputs:
  `collab-report.md`, `context.md` (Locked/Free/Deferred — plan-compatible),
  `conclusions.json` (`:148-157`). Registers a `collab` artifact in `state.json`.
- **Partial degradation**: continues if ≥1 tool succeeds (W001).

So `maestro-collab` is *orchestration-by-prose over the delegate CLI*: the parallel
fan-out and synthesis are driven by the host agent shelling out to `maestro
delegate`, not by `ParallelCliRunner`. (`src/commands/collab.ts` (1343 lines) backs
the `maestro collab` CLI variant; the markdown command relies on `delegate`.)

---

## 8. tools-register / tools-execute

These are the **tool-spec system** — reusable *process recipes*, not external-CLI
binaries. Both are authored commands reading `~/.maestro/workflows/tools-spec.md`.

- **`maestro-tools-register`** (`.claude/commands/maestro-tools-register.md`):
  codifies a business process as a **knowhow document** with `tool: true`
  frontmatter under `.workflow/knowhow/` (`:15-17, :103-116`). Four modes —
  Extract / Generate / Optimize / Promote (`:42-48`). Picks a `category` (coding /
  test / review / arch / debug, `:73-79`) keyed to the consumer agent; short
  processes inline, long ones use **ref mode** with a `spec add ... --ref` index
  entry (`:118-122`).
- **`maestro-tools-execute`** (`.claude/commands/maestro-tools-execute.md`): loads
  a registered tool by name or `--category` via `maestro load --type spec`
  (`:42-56`), confirms with the user, then executes the recipe **step by step**
  (`:74-96`) with progress reporting and interactive blocker handling.

These register/invoke *capabilities expressed as documented steps* (executed by the
host agent), distinct from the CLI-tool registry of §4 (external binaries). They are
not a generic external-CLI plugin protocol.

---

## 9. Antigravity (`agy`) integration

`agy` is Google's **Antigravity CLI** — a Gemini-based coding agent. It is a
first-class delegate target: tool `agy` → AgentType `agy`
(`cli-agent-runner.ts:104`), terminal cmd `agy` (`:121`), exec-id prefix `agy`
(`:137`), and a registry default (`cli-tools-defaults.json:7`).

`AgyAdapter` (`dashboard/src/server/agents/agy-adapter.ts:105`) is the most
specialized adapter because **agy emits nothing to stdout in non-TTY mode**
(`agy-adapter.ts:5-18`):

- **Binary resolution** (`:70-87`): `~/.local/bin/agy`, `/usr/local/bin/agy`, or
  Windows `LOCALAPPDATA/agy/bin/agy.exe`, else PATH (`shell: true` fallback).
- **argv** (`:118-181`): `--print-timeout <n>s` (Go duration, floored 60 s);
  `approvalMode: 'auto'` → `--dangerously-skip-permissions` (`:131-133`);
  `--add-dir` for include dirs (`:166-168`); resume via `--conversation <id>` or
  `-c` (`:171-175`). **Prompt must use `--prompt`/`-p`, not `--print`** (a parser
  quirk, `:176-181`). stdin is `'ignore'` because `agy --print` waits for stdin EOF
  (`:201-203`).
- **Transcript-first output capture** (`enrichFromTranscript`, `:356-450`): after
  exit, the adapter locates the conversation via
  `~/.gemini/antigravity-cli/cache/last_conversations.json[workdir]` (`:315-347`),
  then replays
  `~/.gemini/antigravity-cli/brain/<conv>/.system_generated/logs/transcript.jsonl`
  entries newer than spawn time. `PLANNER_RESPONSE.content` becomes the authoritative
  `assistant_message`; `tool_calls` and tool-result types become `tool_use` entries
  (`:393-433`). Records `agy.conversationId=...` so a follow-up `--resume` can
  re-attach (`:444-449`).
- **No interactive messages** in `--print` mode (`doSendMessage` throws,
  `:292-296`).

There is also a **Windows symlink workaround** (`:142-168`): without Developer Mode,
agy's per-project symlink creation fails and it silently degrades, so the adapter
launches from `homedir()` and exposes the real workdir via `--add-dir`.

The `guide/antigravity_tools_guide.md` documents agy's *internal* tool surface
(`invoke_subagent`, `run_command`, `define_subagent`, `schedule`, etc.) — relevant
because agy can itself spawn sub-agents, but Maestro drives it purely as a one-shot
`--prompt` delegate.

---

## 10. Monitors (the `*-monitor.js` binaries)

The `bin/*.js` files are thin ESM shims that import compiled hook logic:

- `bin/maestro-delegate-monitor.js` → `dist/src/hooks/delegate-monitor.js`.
- `bin/maestro-team-monitor.js` → `dist/src/hooks/team-monitor.js`.
- `bin/maestro-context-monitor.js` → `dist/src/hooks/context-monitor.js`.

They are **Claude Code PostToolUse hooks** (stdin JSON, 3 s timeout, exit 0), not
process supervisors — they observe and inject context, they do not spawn or kill the
CLIs.

**delegate-monitor** (`src/hooks/delegate-monitor.ts`): the **fallback** path for
async delegate completion (primary = MCP channel). On each PostToolUse it reads
`/tmp/maestro-notify-<sessionId>.jsonl` (`:40-48`), filters unread entries, marks
them read, and emits `additionalContext`
`[DELEGATE done] <id> <tool>/<mode> — "<preview>"` (`:56-78`) so the host model
learns a delegated task finished.

**team-monitor** (`src/hooks/team-monitor.ts`): a silent heartbeat for team mode.
Each PostToolUse appends a line to `.workflow/collab/activity.jsonl` via
`reportActivity` (`:97-159`), with a 60 s dedupe window (`:60-91`) and an advisory
namespace guard on Write/Edit (`:107-146`). No stdout. Exits silently if team mode
is off.

**context-monitor**: referenced by the bin but **absent from `src/` and `dist/`**
(verified — see §12). Per `delegate-monitor`'s comment it is the third hook that
injects `additionalContext`; its actual logic could not be confirmed from source.

---

## 11. End-to-end trace of one external-CLI delegation

Trace a single delegation triggered from within `maestro-collab`, with citations:

1. **Command (authored)**: host agent runs, in background,
   `maestro delegate "<structured prompt>" --to codex --mode analysis`
   (`maestro-collab.md:119-122`).
2. **Tool resolution (code)**: `registerDelegateCommand` action loads
   `cli-tools.json` (`delegate.ts:362`), `--to codex` → `selectTool('codex', ...)`
   (`delegate.ts:379`); model = entry `primaryModel` `gpt-5.5`
   (`delegate.ts:424`); proxy resolved + probed (`delegate.ts:463-475`).
3. **Sync dispatch (code)**: `useAsync` is false (no `--async`), so
   `new CliAgentRunner().run({ ...request, sync: true })` runs in-process and blocks
   (`delegate.ts:510, :539`). One `running` broker event is published first
   (`delegate.ts:520-533`).
4. **AgentType map (code)**: `codex` → `'codex'` (`cli-agent-runner.ts:99`); exec ID
   `cdx-HHMMSS-xxxx` printed (`cli-agent-runner.ts:534`).
5. **Prompt assembly (code)**: protocol + role/mode specs + prompt
   (`cli-agent-runner.ts:559`, `assemblePrompt :173`).
6. **Adapter (code)**: `createAdapterForType('codex')` → `CodexCliAdapter`
   (`adapter-factory.ts:33-36`).
7. **Spawn (code)**: `spawn(codex, ['exec',
   '--dangerously-bypass-approvals-and-sandbox', '--json', '--skip-git-repo-check',
   '-'], {cwd, detached})`; prompt piped to stdin then closed
   (`codex-cli-adapter.ts:209-262`). Stale heartbeat armed.
8. **Stream → events (code)**: Codex `--json` lines parsed into `NormalizedEntry`s;
   each persisted to JSONL and (in sync mode) streamed to stderr as progress
   (`cli-agent-runner.ts:873-895`).
9. **Completion (code)**: on `status_change: stopped`, `run()` resolves exit 0
   (`cli-agent-runner.ts:934-944`); `saveMeta('completed', 0)` writes meta and, in
   async, the MCP channel notification (`cli-agent-runner.ts:663-720`). In this sync
   case `delegate.ts:543-582` appends the status line + `delegate output` text and
   publishes the terminal broker event.
10. **Capture back in collab (authored)**: the delegate-monitor hook (or the broker
    callback) signals completion; `maestro-collab` runs `maestro delegate output
    <id>` → `per-tool/codex-output.md` (`maestro-collab.md:125-127`), then
    cross-verifies and synthesizes.

For a **coordinator** node the trace inserts one extra hop at step 3:
`GraphWalker.handleCommand` → `CliExecutor.execute` → `createSpawnFn`'s
`execFile node maestro cli -p <prompt> --tool codex --mode analysis`
(`coordinate.ts:80-92`), which then re-enters at step 4 as a fresh `maestro cli`
process. The node's pass/fail comes from the report file `reports/<node>.json` if
written, else the stdout parser (`graph-walker.ts:946-978`).

---

## 12. Ambiguities & unverifiable points

- **context-monitor missing from source.** `bin/maestro-context-monitor.js` imports
  `dist/src/hooks/context-monitor.js`, but no `context-monitor.ts` exists in `src/`
  and the compiled file is absent from `dist/` in this checkout
  (`find` returned nothing). Its behavior is inferred only from the delegate-monitor
  comment. Treat as a build-artifact gap or an out-of-tree file.
- **Two parallel paths, different entry points.** Coordinator parallelism
  (`ParallelCliRunner`, code) is separate from `maestro-collab`'s fan-out (authored,
  host agent shells out). They do not share a scheduler; only `delegate` is common.
- **`createSpawnFn` always shells `maestro cli`.** The coordinator never calls the
  adapter factory directly (`coordinate.ts:80-92`) — it spawns a second `maestro`
  process per node. This is intentional (decoupling) but means coordinator runs
  carry double process overhead and the `--tool` is hard-mapped (`claude-code` →
  `claude`, `coordinate.ts:71`) with no role routing at the node level.
- **`maestro collab` (CLI, `src/commands/collab.ts`, 1343 lines) vs
  `maestro-collab` (authored command)** are two implementations of cross-verify; the
  markdown command was the primary evidence and drives `delegate`. The compiled
  `collab.ts` internals were not fully read here.
- **`gemini-a2a`, `codex-server`, `opencode`, `api-explore`** adapters exist in the
  factory but only `gemini-a2a`/`codex`/`claude`/`gemini`/`agy` argv were inspected
  in depth.
- **Success semantics differ by layer.** `delegate` reports success by process exit
  code; the coordinator overrides this with a structured `status === 'SUCCESS'`
  contract from the report file. A clean exit is *not* sufficient for a coordinator
  node to advance.

---

## 13. Cross-references

For the documentation index, this file connects to:

- **ralph** (`maestro-ralph*`, `src/ralph/*`): ralph's state-based "next command"
  determination ultimately drives the same `delegate`/`coordinate` surfaces analyzed
  here; `src/ralph/cmd-next.ts` references `delegate`. See a dedicated ralph doc for
  how it picks commands that this layer then executes.
- **planning chain** (`maestro-plan` / `maestro-blueprint` / `maestro-roadmap`):
  `maestro-collab` emits a plan-compatible `context.md` (Locked/Free/Deferred,
  `maestro-collab.md:154-157`) consumed by `maestro-plan`; role specs injected at
  delegate time (`cli-agent-runner.ts:158-171`) come from the spec store the planning
  chain populates.
- **engineering-file projection** (spec/knowhow stores): `tools-register` writes
  `.workflow/knowhow/*` with `tool: true` (§8); `assemblePrompt` projects
  `[PROJECT SPECS]` into every delegate prompt via `loadSpecs`
  (`cli-agent-runner.ts:189-216`). The role→category map
  (`ROLE_SPEC_CATEGORIES`) is the projection contract.
- **coordinator graph model** (`maestro-coordinator-guide.md`, `chains/*`): the
  `ChainGraph` node types and delegate-terminal sub-graphs (§5.4) are the structural
  backbone the CLI executor plugs into.
