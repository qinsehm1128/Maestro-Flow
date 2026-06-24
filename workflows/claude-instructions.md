# Maestro

- **Coding Philosophy**: @~/.maestro/workflows/coding-philosophy.md

## Delegate & CLI

- **Delegate Usage**: @~/.maestro/workflows/delegate-usage.md
- **Explore Usage**: @~/.maestro/workflows/explore-usage.md
- **CLI Endpoints Config**: @~/.maestro/cli-tools.json

**Strictly follow the cli-tools.json configuration**

## Explore Priority

`maestro explore` takes priority over Glob, Grep, and Read. When locating files or searching code patterns, call `maestro explore` first and stop to wait for results.

## Knowledge System

**Gate rule: On any coding/modification/debugging task, run `maestro search` BEFORE reading code or editing files. Use targeted queries — multiple short searches beat one long one.**

### Required search (every task, no exceptions)

```bash
maestro search "<1-3 word topic phrase>"
```

**Query rules:**
- Use **1-3 core keywords** per query — never dump all context into one search
- Separate concepts from symbols: `maestro search "topology layout"` then `maestro search "DetailedTopologySVG" --code`
- Run multiple targeted searches rather than one broad query

```bash
# ❌ Bad: keyword dump (5+ unrelated terms → diluted BM25 scores)
maestro search "topology display frontend DetailedTopologySVG elk"

# ✅ Good: targeted multi-search
maestro search "topology layout"
maestro search "DetailedTopologySVG" --code
maestro search "elk layout" --type knowhow
```

### Required follow-up (after initial search, MUST execute before implementation)

**Step 2 — Load specs**: After search, ALWAYS load relevant specs before writing code:

```bash
# Coding task → load coding specs
maestro load --type spec --category coding

# Architecture decision → load arch specs
maestro load --type spec --category arch

# Test writing → load test specs
maestro load --type spec --category test

# UI work → load ui specs
maestro load --type spec --category ui
```

**Step 3 — Deep search** (when initial search shows relevant symbols/patterns):

```bash
# Code symbol deep dive → KG search
maestro search "SymbolName" --kg

# Call chain analysis
maestro kg callers <fn>
maestro kg callees <fn>

# Node context (7-element: focal + ancestors + children + refs)
maestro kg context <node>
```

### Load (unified knowledge loading)

```bash
maestro load --type <type> [--list] [--category <cat>] [--keyword <word>] [--id <id>]
```

| 用法 | 命令 |
|------|------|
| 加载 spec | `maestro load --type spec --category coding` |
| 列出 session | `maestro load --type session --list` |
| 加载 knowhow | `maestro load --type knowhow --id <id>` |
| 搜索 session | `maestro search "query" --type session` |
| 代码图谱搜索 | `maestro search "symbol" --code` |
| KG 全源搜索 | `maestro search "query" --kg` |

Types: `spec`, `knowhow`, `domain`, `issue`, `session`, `scratch`, `note`, `project`, `roadmap`

### Record

- **Spec** → `/spec-add <category> "title" "content" --keywords kw1,kw2 --description "summary"`
- **Knowhow** → `/manage-knowhow-capture` (use `--spec-category <cat>` to bridge into agent injection)

Category routing: decisions→`arch`, patterns→`coding`, pitfalls→`debug`/`learning`, rules→`review`, tests→`test`.

### Confidence & Conflict Marking

When search results conflict with current context, **mark the entry**:

```bash
maestro spec conflict mark <file> <line> --note "<conflict reason>"
maestro spec conflict list                    # view all marked entries
```

Confidence levels: `high` (verified) → `medium` (default) → `low` (stale) → `contested` (conflict detected).

- `contested` → 注入时排末尾，`[CONTESTED]` 标记 + 冲突说明
- `low` → `[LOW CONFIDENCE]` 标记
- 消除由 `/manage-knowledge-audit` 审查命令专门处理
