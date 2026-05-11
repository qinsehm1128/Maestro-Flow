---
name: maestro-tools-register
description: Register tool specs - extract, generate, or optimize reusable process definitions
argument-hint: "[description or intent]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, Agent
---

<purpose>
Codify reusable business processes as knowhow documents with `tool: true` in YAML frontmatter. Once registered, entries are auto-discovered by downstream agents via `spec load --category` — plan agents pick up design/architecture flows, test agents pick up verification methods, coding agents pick up execution steps.

Three modes:

1. **Extract** — Pull reusable processes from conversations/code/docs
2. **Generate** — Create new tool definitions from user description
3. **Optimize** — Improve existing tool spec steps, structure, clarity

Short processes (<10 steps) inline; long processes (>=10 steps or with code examples) use ref mode with knowhow detail doc (RCP-/DOC-).
</purpose>

<context>
$ARGUMENTS — User intent description, or empty (interactive guidance)

```bash
$maestro-tools-register "extract OAuth PKCE token exchange flow from src/auth/"
$maestro-tools-register "generate Stripe webhook idempotency verification"
$maestro-tools-register "generate E2E checkout flow with payment gateway mock setup"
$maestro-tools-register "optimize e2e-checkout tool"
```

**Tool registration**: Creates knowhow documents in `knowhow/` folder with `tool: true` in YAML frontmatter. Tools are auto-discovered by `spec load` based on category + tool flag.

**Knowhow format**:
```yaml
---
title: Tool Name
type: recipe
category: coding
summary: "Use when <timing>. <scope description>"
tags: [testing, api]
tool: true
---
Step content...
```
</context>

<execution>

### Step 1: Intent Detection

Parse $ARGUMENTS to determine mode:
- Contains "extract" → extract mode
- Contains "optimize/improve" → optimize mode
- Other → generate mode
- Empty → ask user with AskUserQuestion

### Step 2: Gather Information

**Extract mode**:
- Identify source (current conversation, specified files, codebase scan)
- Extract step sequence, prerequisites, expected outputs

**Generate mode**:
- Confirm tool name, applicable roles, target scenario
- If unclear, ask user with AskUserQuestion

**Optimize mode**:
- Load existing tool: `maestro spec load --category coding --keyword <name>`
- Analyze improvement points (step splitting, prerequisites, error handling)

**For all modes** — identify the usage timing: when should an agent or user invoke this tool? This becomes the first line of the entry description (see Step 5).

### Step 3: Determine Category

Infer applicable category from context, or ask user:
- coding — execution tools (build, deploy, integrate)
- test — testing tools (test flows, verification steps)
- review — review tools (checklists, audit standards)
- arch — planning tools (design flows, analysis steps)
- debug — analysis tools (diagnostic flows, investigation steps)

### Step 4: Decide Inline vs Ref

- Steps <10 and no code blocks → **inline mode**
- Steps >=10 or contains code examples/config → **ref mode**

### Step 5: Write

**Description format**: First line after `### Title` must state **when to use** this tool (the usage timing from Step 2). This is critical for ref entries — `spec load` only shows the first 200 chars after the heading as the summary.

```
### {Title}

Use when {timing/trigger condition}.

1. Step one ...
```

**Inline mode**:
Create a knowhow document in `knowhow/` with `tool: true` frontmatter:
```yaml
---
title: <Title>
type: recipe
category: <category>
summary: "Use when <timing>. <scope description>"
tags: [<keywords>]
tool: true
---
Use when <timing>.

1. <step1>
2. <step2>
```

**Ref mode**:
1. Generate knowhow detail document (RCP- or DOC- prefix). YAML frontmatter must include `summary` with usage timing and `tool: true`:
```yaml
---
title: <Title>
type: recipe
category: <category>
summary: "Use when <timing>. <scope description>"
tags: [<keywords>]
tool: true
---
```

### Step 6: Verify

- `maestro spec load --category <category> --keyword <keyword>` to confirm loadable
- Display result: title, category, keywords, storage location

</execution>

<error_codes>
| Code | Severity | Description |
|------|----------|-------------|
| E001 | fatal | `.workflow/specs/` does not exist — run `maestro spec init` |
| E002 | warning | Duplicate tool name detected — confirm overwrite/optimize |
| E003 | fatal | category parameter empty — tools must declare applicable category |
</error_codes>

<success_criteria>
- [ ] Tool registered as knowhow document with `tool: true` frontmatter
- [ ] category attribute correctly set
- [ ] keywords auto-extracted (3-5 terms)
- [ ] Loadable via `spec load --category <category>`
- [ ] Long processes use ref mode with knowhow file created
</success_criteria>
