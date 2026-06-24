# Explore Usage

```bash
maestro explore "<PROMPT>" [more prompts...] [options]
```

## When to Use

| Scenario | Example |
|----------|---------|
| Multi-angle codebase scan | 3 prompts scanning DB/API/error patterns in parallel |
| Quick code lookup | Single prompt, foreground |
| Per-prompt endpoint routing | JSON file with different endpoints per prompt |
| Lightweight read-only analysis | Where delegate is overkill (no session, no history) |

**Not for**: write-mode tasks, long sessions, interactive follow-ups — use `delegate` instead.

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-e, --endpoint <names>` | Endpoint name(s), comma-separated | First available |
| `--all` | Fan out each prompt to all endpoints | — |
| `--parallel <n>` | Max concurrent endpoint queues | Config or `4` |
| `--ep-concurrency <n>` | Max concurrent jobs per endpoint | `1` (serial) |
| `--max-turns <n>` | Max agent turns per job | Config or `6` |
| `-f, --file <path>` | Load prompts from JSON or text file | — |
| `--cd <dir>` | Working directory | Current |
| `-o, --output-dir <dir>` | Custom session save directory | `.workflow/explore/` |
| `--no-save` | Skip session save | — |
| `--json` | Output results as JSON | — |

**1 prompt = 1 agent**. Endpoint resolution: `--endpoint` > `--all` > first available.

## Prompt Template

```
FIND: [what to search for — the core query]
SCOPE: [file patterns, directories, or modules]
EXCLUDE: [what to skip — files, patterns, false positives]
ATTENTION: [caveats, edge cases, things to watch for]
EXPECTED: [output format — evidence list, summary, JSON]
```

Only `FIND` required. Plain text (no `FIND:` prefix) also works.

| Field | Role | Example |
|-------|------|---------|
| `FIND` | What to search for | `All database query patterns that could cause N+1` |
| `SCOPE` | Where to look | `src/db/**/*.ts`, `src/api/` |
| `EXCLUDE` | What to skip | `test files, generated code, node_modules` |
| `ATTENTION` | What to watch for | `ORM lazy-loading traps, raw SQL in service layer` |
| `EXPECTED` | Output format | `file:line evidence list with severity` |

## Execution Model

**Serial within endpoint, parallel across endpoints.**

Same API → jobs queue and run one-by-one (avoids rate limits).
Different APIs → queues run concurrently.

```
Endpoint A:  [job1] → [job2] → [job3]    (serial)
Endpoint B:  [job4] → [job5]              (serial)
                                           ↑ parallel ↑
```

Raise per-endpoint parallelism with `--ep-concurrency 2` when the API allows it.

## Multi-Prompt Input

**Inline**: `maestro explore "prompt1" "prompt2" "prompt3"`

**JSON file** (`-f prompts.json`):

```json
[
  "simple string prompt",
  { "prompt": "FIND: auth bypass\nSCOPE: src/api/", "endpoint": "deepseek" }
]
```

Per-prompt `endpoint` overrides global `--endpoint`.

**Text file** (`-f prompts.txt`): paragraphs separated by blank lines.

**Mixed**: `maestro explore "inline" -f file.json`

## Session

Results auto-save to `.workflow/explore/{session-id}.json` per workspace.

```bash
maestro explore show                  # list sessions
maestro explore output <id>           # view session results
maestro explore output <id> --json    # JSON output
```

## Endpoint Config

File: `~/.maestro/api-explore.json`

```json
{
  "endpoints": {
    "qwen": { "baseUrl": "https://...", "apiKey": "sk-xxx", "model": "Qwen/Qwen3-8B" },
    "deepseek": { "baseUrl": "https://...", "apiKey": "sk-yyy", "model": "deepseek-chat" }
  },
  "maxTurns": 6,
  "concurrency": 4
}
```

Proxy auto-inherited from `~/.maestro/cli-tools.json`. Legacy single-endpoint and env vars also supported.

## Execution Rules

Multi-prompt — **background**:

```
Bash({ command: "maestro explore \"p1\" \"p2\" --json", run_in_background: true })
```

Single quick lookup — foreground is fine:

```
Bash({ command: "maestro explore \"Where is X defined?\"" })
```
