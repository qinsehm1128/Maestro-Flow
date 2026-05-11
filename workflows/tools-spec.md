# Tool Spec Reference

Shared reference for tool spec registration and execution commands.

## Storage

Tool specs are stored as knowhow documents in `.workflow/knowhow/` with `tool: true` in YAML frontmatter. Tool registration creates knowhow files, not spec entries. The `category` field determines which `spec load --category` queries match this tool.

## Entry Format

Knowhow document (`knowhow/RCP-<slug>.md`):
```yaml
---
title: Tool Name
type: recipe
tool: true
summary: "Use when {timing}. {scope description}"
tags: [keyword1, keyword2]
category: coding
---

## Prerequisites
...

## Steps
1. ...
```

## Description Rules

- First line after `### Title` must state **when to use** this tool
- For ref entries: `spec load` shows only the first 200 chars after heading — timing must be in that window
- For ref knowhow docs: YAML `summary` field is shown by `wiki list` and wiki-role-loader hook

## Discovery Path

```
Register → tools.md → spec load --category <category> / spec-injector auto-inject → agent discovers tool
```

Agents discover tool specs via:
- `spec load --category <category>` — returns entries matching the category
- `spec-injector` hook — auto-injects at Agent launch based on agent type
- `spec load --keyword <word>` — keyword search across all entries

## Category Reference

| Category | Agent types | Tool examples |
|----------|-------------|---------------|
| coding | code-developer, workflow-executor | Build, deploy, integrate |
| test | tdd-developer, test-fix-agent | Test flows, verification steps |
| review | workflow-reviewer | Checklists, audit standards |
| arch | workflow-planner | Design flows, analysis steps |
| debug | debug-explore-agent | Diagnostic flows, investigation |

## CLI Commands

```bash
# Register tool as knowhow document
maestro knowhow add "knowhow/RCP-<slug>.md" --type recipe --tool

# Load specs by category
maestro spec load --category <category>
maestro spec load --category <category> --keyword <word>
```
