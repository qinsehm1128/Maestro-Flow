# Maestro

Workflow orchestration CLI with MCP endpoint support and extensible architecture.

- **Coding Philosophy**: @~/.maestro/workflows/coding-philosophy.md

## Delegate & CLI

- **Delegate Usage**: @~/.maestro/workflows/delegate-usage.md
- **CLI Endpoints Config**: @~/.maestro/cli-tools.json

**Strictly follow the cli-tools.json configuration**

Available CLI endpoints are dynamically defined by the config file

## Code Diagnostics

- **Prefer `mcp__ide__getDiagnostics`** for code error checking over shell-based TypeScript compilation

## Knowledge System

### Design Principles

- **Single search entry** — `maestro search` is the only user-facing search command
- **Silent-skip-is-bug** — if knowledge exists but search misses it, that is a defect
- **Layer 2 auto-injection** — agents receive specs via hooks, rarely need manual `spec load`

### Search — Three-Layer Architecture

**Before planning or implementing, search first.** Load the right knowledge at the right time.

| Layer | Command | When to Use |
|-------|---------|-------------|
| **1. Unified** | `maestro search "<query>" [--type spec\|knowhow\|issue] [--category <cat>]` | Daily search — BM25 full-text across all knowledge types |
| **2. Agent injection** | `maestro spec load --category <cat> [--keyword <kw>]` | Domain rules for implementation (auto-injected by hooks) |
| **3. Code structure** | `maestro kg search <symbol>` / `maestro kg context <node>` | Tracing dependencies, call chains, module boundaries |

**Deprecated** (do not use): `spec search`, `knowhow search`, `wiki search` — all replaced by Layer 1.

KG stays fresh via hooks (`kg-sync` on UserPromptSubmit, `kg-context-injector` on Agent spawn). Manual `maestro kg index --sqlite` only needed on initial setup.

### Proactive Search — Mandatory Triggers

Search is **not optional**. Execute these commands before acting in the corresponding scenarios:

| Trigger Condition | Command | Purpose |
|---|---|---|
| Starting any implementation task | `maestro search "<feature/module keywords>"` | Load relevant specs, knowhow, existing issues |
| Encountering unknown symbol/module | `maestro kg search "<symbol>"` | Understand code structure and dependencies |
| Understanding module boundaries | `maestro kg context <file-or-symbol>` | Get callers, callees, related code |
| Making architecture decisions | `maestro search --type spec --category arch` | Load architecture constraints |
| Debugging unfamiliar code | `maestro kg callers <function>` / `maestro kg callees <function>` | Trace call chains |
| Before writing tests | `maestro search --type spec --category test "<module>"` | Load test patterns and requirements |
| Before refactoring | `maestro kg search "<module>" --code` | Map impact radius before changes |

### Fallback — When Hooks Are Not Firing

If automatic injection seems absent (no `<maestro-context>` blocks appearing):

1. Check hook status: `maestro hooks status`
2. Sync graph manually: `maestro kg sync`
3. Search directly: `maestro search "<query>"` or `maestro kg search "<symbol>"`
4. Reinstall hooks if needed: `maestro hooks install --level standard`

### Record — Capture Knowledge

When execution surfaces non-obvious knowledge, persist it:

- **Spec entry** (short rule/constraint) → `/spec-add <category> "title" "content" --keywords kw1,kw2 --description "summary"`
- **Knowhow document** (detailed recipe/template/decision) → `/manage-knowhow-capture`
  - Use `--spec-category <cat>` to bridge knowhow into agent injection
  - Files use `{PREFIX}-{YYYYMMDD}-{slug}.md` naming for readable filenames

Category routing: decisions→`arch`, patterns→`coding`, pitfalls→`debug`/`learning`, rules→`review`, test strategy→`test`.
