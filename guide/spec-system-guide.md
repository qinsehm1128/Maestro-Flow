# Knowledge Management System Guide

Maestro's knowledge management consists of **Spec** (coded constraints/tools) and **Wiki** (broad knowledge graph). Spec provides category-based project specifications, Wiki provides knowhow, design assets, and learning notes. Both layers are unified through `<entry>` tag format, WikiIndexer indexing, and category-based retrieval.

## Table of Contents

- [Spec System](#spec-system)
  - [Scope](#scope)
  - [File → Category Mapping](#file--category-mapping)
  - [Entry Format](#entry-format)
  - [Tool Discovery](#tool-discovery)
  - [Commands](#spec-commands)
  - [Progressive Fill](#progressive-fill)
  - [Auto-Init](#auto-init)
  - [Keyword System](#keyword-system)
- [Wiki Knowledge Graph](#wiki-knowledge-graph)
  - [Knowhow System](#knowhow-system)
  - [Category-Based Retrieval](#category-based-retrieval)
  - [Three-Layer Loading](#three-layer-loading)
  - [Wiki Commands](#wiki-commands)
- [Unified Index & Injection](#unified-index--injection)
  - [Atomic Node Index](#atomic-node-index)
  - [Write Path](#write-path)
  - [Write Protection](#write-protection)
  - [Auto-Injection](#auto-injection)
  - [Session Dedup](#session-dedup)
- [File Structure](#file-structure)
- [CLI Reference](#cli-reference)

---

## Spec System

### Scope

Spec supports 4 scopes via `--scope`:

| Scope | Directory | Purpose | Auto-Init |
|-------|-----------|---------|-----------|
| `project` (default) | `.workflow/specs/` | Project-level specs, shared by all | Yes |
| `global` | `~/.maestro/specs/` | Cross-project universal specs | Yes |
| `team` | `.workflow/collab/specs/` | Team shared specs | No |
| `personal` | `.workflow/collab/specs/{uid}/` | Personal preference overrides | No |

**Loading priority** (low → high): global → project → team → personal. Later layers append, never overwrite.

### File → Category Mapping

Each spec file is the **primary document** for a category. `spec load --category` loads the primary file in full, plus cross-file entries matched by keywords.

| File | Category | Implicit Role | Purpose |
|------|----------|---------------|---------|
| `coding-conventions.md` | coding | implement | Naming, imports, formatting, coding patterns |
| `architecture-constraints.md` | arch | plan | Module structure, layer boundaries, arch decisions |
| `review-standards.md` | review | review | Quality rules, review checklists, enforcement standards |
| `debug-notes.md` | debug | analyze | Debug tips, root cause records, known issues |
| `test-conventions.md` | test | test | Test framework, patterns, coverage requirements |
| `learnings.md` | learning | implement | Bugs, pitfalls, lessons learned |

**Category → implicit delegate role**: each category maps to a delegate system role. This mapping is internal — users only interact with `category`, the role resolution is transparent.

```
coding   → implement    arch     → plan
review   → review       debug    → analyze
test     → test         learning → implement
```

### Entry Format

All entries use `<spec-entry>` closed tags with **`category`** as a required single-value attribute:

```markdown
<spec-entry category="coding" keywords="auth,token,rotation" date="2026-04-21">

### Token rotation needs email carried through refresh flow

Revoked column must be set rather than deleting tokens.

</spec-entry>
```

| Attribute | Required | Format | Description |
|-----------|----------|--------|-------------|
| `category` | Yes | Single value | One of: coding, arch, review, debug, test, learning |
| `keywords` | Yes | Comma-separated, lowercase | Searchable keywords for cross-category discovery |
| `date` | Yes | `YYYY-MM-DD` | Creation date |
| `source` | No | String | Origin (manual / agent / phase) |
| `ref` | No | Path | Reference to knowhow detail document |

**Two dimensions, clear separation**:
- `category` = **who is responsible** (determines file routing, agent injection)
- `keywords` = **what it's about** (enables cross-category discovery)

### Tool Discovery

Tools are no longer registered in a dedicated `tools.md` file. Instead, any knowhow document can be marked as a tool via the `tool: true` YAML frontmatter field.

**Knowhow as tool** (in `knowhow/` folder):
```markdown
---
title: Payment Gateway Idempotency Verification
type: recipe
category: coding
keywords: [payment, gateway, idempotency, testing]
tool: true
---

## When to Use

Use when testing payment integration endpoints for retry safety and webhook delivery guarantees.

## Steps

1. Generate idempotency key (UUID v4)
2. Submit charge request with key
3. Retry same request with same key — assert identical response
4. Submit different amount with same key — assert 409 conflict
5. Verify gateway webhook delivers exactly once
6. Assert ledger entry matches charge amount
```

**Spec ref entry** (optional — index pointer in `specs/` for discoverability):
```markdown
<spec-entry category="coding" keywords="payment,gateway,idempotency" date="2026-05-10"
  ref="knowhow/RCP-payment-idempotency.md">

### Payment Gateway Idempotency Verification

Use when testing payment integration endpoints for retry safety and webhook delivery guarantees.

</spec-entry>
```

**`spec load` display for ref entries** — summary + load command, not full content:
```
### Payment Gateway Idempotency Verification (tool)

Use when testing payment integration endpoints for retry safety and webhook delivery guarantees.

→ Detail: maestro wiki load knowhow-payment-idempotency
```

**Tool discovery flow**: `spec load --category coding` automatically scans `knowhow/` for documents with matching `category` + `tool: true`, and appends tool summaries to the output. No explicit registration required.

**Registration**: `/maestro-tools-register` — codify reusable processes as knowhow tool documents. Creates a knowhow file with `tool: true` and optionally a spec ref entry for index discoverability.

**Execution**: `/maestro-tools-execute` — load tool by name or category from knowhow, execute step-by-step.

### Spec Commands

```bash
# Initialize
maestro spec init [--scope <scope>] [--uid <uid>]

# Add entry
maestro spec add coding "Always use named exports" --keywords "exports,naming"
maestro spec add coding "OAuth PKCE" "Summary" --keywords "oauth,pkce" --ref "knowhow/RCP-oauth.md"
echo '{"category":"coding","title":"...","content":"..."}' | maestro spec add --stdin
maestro spec add coding "title" "content" --json   # JSON output

# Load
maestro spec load --category coding                 # Primary doc + cross-file keyword matches + tools
maestro spec load --category coding --keyword auth  # With keyword filter
maestro spec load --keyword auth                    # Keyword-only filter across all files
echo '{"category":"coding"}' | maestro spec load --stdin

# CLI equivalent
maestro spec add <category> "<title>" "<content>" --keywords kw1,kw2 [--uid <uid>]
maestro spec load --category <category> [--keyword <word>] [--uid <uid>] --json
```

### Progressive Fill

Specs are progressively enriched by pipeline phases:

```
maestro-init       → spec-setup (skeleton + scan)
maestro-analyze    → Locked decisions → arch, code patterns → coding
maestro-plan       → Design conventions → coding/arch, test strategy → test
maestro-execute    → Learnings → learning, root causes → debug
maestro-verify     → Quality findings → review
```

### Auto-Init

`loadSpecs()` auto-detects and creates missing spec directories (with 6 seed files), no manual init required.

### Keyword System

- `spec add` auto-extracts 3-5 domain keywords
- `spec load --keyword <kw>` matches `<spec-entry>` `keywords` attribute across all category files
- Keywords enable cross-category discovery: an entry in `test-conventions.md` with `keywords="auth,jwt"` is discoverable via `spec load --category coding --keyword auth`
- Legacy heading entries fallback to text search

---

## Wiki Knowledge Graph

### Knowhow System

Knowhow is broad knowledge storage supporting multiple document types. All files stored in `.workflow/knowhow/`, distinguished by filename prefix:

| Prefix | Type | Purpose |
|--------|------|---------|
| `KNW-` | session | Session compact records |
| `TIP-` | tip | Quick context tips |
| `TPL-` | template | Code/config templates |
| `RCP-` | recipe | Step-by-step guides |
| `REF-` | reference | External doc summaries |
| `DCS-` | decision | Architecture/design decisions |
| `AST-` | asset | General code assets (API contracts, data models, UI prototypes) |
| `BLP-` | blueprint | Architecture blueprints, system designs |
| `DOC-` | document | Long-form specs/documents (general fallback) |

#### YAML Frontmatter

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Document title |
| `type` | Yes | Knowhow type (session, tip, template, recipe, etc.) |
| `category` | No | Single-value category (coding, arch, review, debug, test, learning). Maps to delegate role for agent injection. |
| `keywords` | No | Searchable keyword list. Used for cross-category discovery and wiki search. |
| `tool` | No | `true` to mark this document as an executable tool. Discovered by `spec load` and `/maestro-tools-execute`. |
| `summary` | No | One-line description with usage timing. Shown by `wiki list` and auto-injection. Falls back to first paragraph if absent. |
| `created` | Auto | Creation timestamp |
| Type-specific | No | `lang`, `source`, `status`, `assetType`, `codePaths` |

```markdown
---
title: OAuth PKCE Authorization Flow
type: recipe
category: coding
keywords: [oauth, pkce, auth, token]
tool: true
summary: "Use when implementing OAuth 2.0 login for public clients (SPA/mobile). Complete PKCE flow with code_verifier, token exchange, refresh rotation."
---

## Prerequisites
...

## Steps
1. Generate code_verifier (43-128 chars, URL-safe random)
2. Derive code_challenge = BASE64URL(SHA256(code_verifier))
...
```

#### Container Pattern (`<knowhow-entry>`)

Knowhow files support container multi-entry mode:

```markdown
---
title: Session Compact 20260510
type: session
category: debug
---

<knowhow-entry keywords="pattern,auth,jwt" date="2026-05-10" category="coding">

### JWT Refresh Token Rotation

Always rotate refresh tokens on use to prevent replay attacks.

</knowhow-entry>
```

Each `<knowhow-entry>` is parsed by WikiIndexer as an independent WikiEntry sub-node. Sub-entries inherit container's `category`. Entry-level `category` overrides container when present.

#### Code Asset Association (codePaths)

Code asset documents (AST-/BLP-) associate source code via frontmatter `codePaths`:

```yaml
---
title: Auth API Contract
type: asset
assetType: api-contract
category: coding
keywords: [auth, api, jwt]
codePaths:
  - src/api/auth/
  - src/types/auth.ts
---
```

#### Ref Pattern (Spec → Knowhow Bridge)

Spec is the index/rule layer, Knowhow is the detail layer. When a topic is too complex for inline spec-entry, use `ref` to bridge:

```markdown
<!-- Inline mode (short insight) -->
<spec-entry category="coding" keywords="auth,jwt" date="2026-05-10">

### JWT Token Rotation

Always rotate refresh tokens on use.

</spec-entry>

<!-- Ref mode (complex topic → knowhow detail) -->
<spec-entry category="coding" keywords="oauth,pkce" date="2026-05-10"
  ref="knowhow/RCP-oauth-flow.md">

### OAuth 2.0 Integration

Complete OAuth PKCE flow design. See referenced document.

</spec-entry>
```

**`spec load` display comparison**:

Inline entry (full content):
```
### JWT Token Rotation
> coding · auth, jwt · 2026-05-10

Always rotate refresh tokens on use.
```

Ref entry (summary + load command):
```
### OAuth 2.0 Integration

Use when implementing OAuth 2.0 login for public clients. Complete PKCE flow design.

→ Detail: maestro wiki load knowhow-oauth-flow
```

**Separation principle**:
- **Spec** (`specs/`) = index + rules. Short entries, auto-loaded by agents
- **Knowhow** (`knowhow/`) = detail docs. Full documents, loaded on demand
- **ref** = bridge from index entry to detail doc

### Category-Based Retrieval

Wiki entries support `category` annotation, aligned with the 6 spec categories:

```
coding | arch | review | debug | test | learning
```

Each category implicitly maps to a delegate role for agent auto-injection.

Declared via frontmatter `category: coding` or entry-level `category` attribute.

```bash
# Browse knowledge index by category
maestro wiki list --category coding

# Filter by keyword
maestro wiki list --keyword auth

# List all tools
maestro wiki list --tool

# Load selected documents
maestro wiki load knowhow-auth-api spec:project:arch-001
```

Sub-entries inherit container's category. Entry-level category overrides container when present.

### Three-Layer Loading

| Layer | Command | Depth | Use |
|-------|---------|-------|-----|
| Index browse | `maestro wiki list --category <cat>` | id + title | Browse, decide what to load |
| Precise load | `maestro wiki load <id1> [id2...]` | Full body | Load selected docs by ID |
| Hook auto-inject | `loadWikiByCategory()` | title + summary | Lightweight context injection (sync) |

**Usage flow** (commands/agents):
1. `maestro wiki list --category debug` → browse category-relevant doc index
2. Analyze index, identify task-relevant entries
3. `maestro wiki load <id1> <id2>` → load selected full docs
4. Review loaded knowledge, then execute

### Wiki Commands

```bash
# Entry management
maestro wiki list [--type <type>] [--category <cat>] [--keyword <kw>] [--tool] [-q <query>]
maestro wiki load <id1> [id2...] [--json]
maestro wiki get <id>
maestro wiki search <query>
maestro wiki create --type knowhow --slug <slug> --title <title>
maestro wiki append <containerId> --body <text> --keywords <kw>
maestro wiki remove-entry <subEntryId>

# Knowhow CLI
maestro knowhow add --type <type> --title <title> --body <text>
maestro knowhow add --type asset --asset-type api-contract --code-paths "src/api/"
maestro knowhow list [--type <type>]
maestro knowhow search <query>

# Graph analysis
maestro wiki health
maestro wiki graph
maestro wiki orphans
maestro wiki hubs
```

---

## Unified Index & Injection

### Atomic Node Index

WikiIndexer parses `<spec-entry>` and `<knowhow-entry>` into independent WikiEntry sub-nodes:

```
Container file                      WikiEntry nodes
┌───────────────────┐        ┌──────────────────────────┐
│ specs/coding-     │   ──>  │ spec:project:coding      │ (container)
│   <spec-entry>    │   ──>  │ spec:project:coding-001  │ (sub-node, parent=container)
│   <spec-entry>    │   ──>  │ spec:project:coding-002  │
└───────────────────┘        └──────────────────────────┘
```

Sub-nodes inherit container's `category`, `createdBy`, `sourceRef`. Entry-level `category` overrides container. Keywords bubble up to container frontmatter.

### Write Path

Spec and Knowhow share unified WikiWriter write path:

```
/spec-add coding "..."              ──┐
maestro wiki append spec-...        ──┤──> WikiWriter.appendEntry()
maestro wiki append knowhow-...     ──┘     │
                                            ├── Detect container type → <spec-entry> or <knowhow-entry>
                                            ├── Append entry block
                                            ├── Bubble keywords to frontmatter
                                            └── Refresh WikiIndex
```

### Write Protection

| Operation | specs/*.md | knowhow/*.md | virtual (issue) |
|-----------|:---------:|:-----------:|:---------------:|
| Read | Y | Y | Y |
| title/frontmatter update | Y | Y | -- |
| body overwrite | **Forbidden (403)** | **Forbidden (403)** | -- |
| Entry append (appendEntry) | Y | Y | -- |
| Entry remove (removeEntry) | Y | Y | -- |
| File delete | Y | Y | -- |

### Auto-Injection

#### Spec Injection (by category)

`spec-injector` hook at `PreToolUse:Agent` auto-injects specs based on agent type → category mapping:

```typescript
const AGENT_CATEGORY_MAP: Record<string, string[]> = {
  'code-developer':        ['coding', 'learning'],
  'tdd-developer':         ['coding', 'test'],
  'workflow-executor':     ['coding'],
  'universal-executor':    ['coding'],
  'test-fix-agent':        ['coding', 'test'],
  'cli-lite-planning-agent': ['arch'],
  'action-planning-agent':   ['arch'],
  'workflow-planner':        ['arch'],
  'workflow-reviewer':     ['review'],
  'debug-explore-agent':   ['debug'],
  'workflow-debugger':     ['debug'],
};
```

For each mapped category:
1. Load primary spec file in full
2. Load cross-file entries with matching keywords
3. Discover knowhow tools with matching category

#### Wiki Injection (by category)

`spec-injector` simultaneously loads category-relevant wiki knowledge (title + summary) from `wiki-index.json`.

Both layers merged and controlled by context budget (full/reduced/minimal/skip).

#### Keyword Injection

`keyword-spec-injector` at `UserPromptSubmit` extracts keywords from prompt, matches spec entries across all category files (max 5 per trigger, session-deduped).

### Session Dedup

- **Bridge file**: `{tmpdir}/maestro-spec-kw-{sessionId}.json`
- Records injected keywords + entry IDs
- Three injection points (user input / Agent launch / Coordinator) share bridge

---

## File Structure

```
~/.maestro/
└── specs/                              # scope: global
    ├── coding-conventions.md
    └── ...

.workflow/
├── specs/                              # scope: project
│   ├── coding-conventions.md           # category: coding
│   ├── architecture-constraints.md     # category: arch
│   ├── review-standards.md             # category: review
│   ├── debug-notes.md                  # category: debug
│   ├── test-conventions.md             # category: test
│   └── learnings.md                    # category: learning
├── knowhow/                            # Broad knowledge (unified markdown)
│   ├── KNW-20260427-1912.md            # Session records
│   ├── TPL-20260427-1913.md            # Templates
│   ├── RCP-20260428-0900.md            # Recipes / tool procedures (tool: true)
│   ├── REF-20260428-1000.md            # References
│   ├── DCS-20260429-1100.md            # Decisions
│   ├── TIP-20260429-1200.md            # Tips
│   ├── AST-auth-api.md                 # Code assets (API contracts)
│   ├── BLP-microservice-arch.md        # Architecture blueprints
│   └── DOC-api-design-standard.md      # Long-form documents
├── collab/
│   └── specs/                          # scope: team
│       └── {uid}/                      # scope: personal
├── issues/
│   └── issues.jsonl                    # Issue tracking (virtual entry)
├── learning/
│   └── patterns.jsonl                  # SelfLearningService internal data
└── wiki-index.json                     # Persisted index (auto-generated)
```

---

## CLI Reference

```bash
# ── Spec ────────────────────────────────────────────────────────
maestro spec init [--scope <scope>] [--uid <uid>]
maestro spec load [--category <cat>] [--keyword <kw>] [--scope <scope>] [--json] [--uid <uid>] [--stdin]
maestro spec add <category> "<title>" "<content>" [--keywords kw1,kw2] [--source <src>] [--ref <path>] [--knowhow-type <type>] [--uid <uid>] [--stdin] [--json]
maestro spec list [--scope <scope>] [--uid <uid>]
maestro spec ls [--scope <scope>] [--uid <uid>]               # list alias
maestro spec status [--scope <scope>] [--uid <uid>]

# ── Tool Discovery (via knowhow) ────────────────────────────────
/maestro-tools-register "<description>"          # Create knowhow doc with tool: true
/maestro-tools-execute "<name>" | --category <cat>  # Load and execute tool step-by-step

# ── Wiki Retrieval ────────────────────────────────────────────
maestro wiki list [--type <type>] [--category <cat>] [--keyword <kw>] [--tool] [-q <query>] [--group] [--json]
maestro wiki load <id1> [id2...] [--json]
maestro wiki get <id> [--json]
maestro wiki search <query> [--json]

# ── Wiki Write ────────────────────────────────────────────────
maestro wiki create --type <spec|knowhow> --slug <slug> --title <title> [--body <text>]
maestro wiki append <containerId> --body <text> [--keywords <kw>]
maestro wiki remove-entry <subEntryId>
maestro wiki update <id> [--title <title>] [--frontmatter <json>]
maestro wiki delete <id>

# ── Wiki Graph ────────────────────────────────────────────────
maestro wiki health
maestro wiki graph
maestro wiki orphans
maestro wiki hubs [--limit N]
maestro wiki backlinks <id>
maestro wiki forward <id>

# ── Knowhow ──────────────────────────────────────────────────
maestro knowhow add --type <type> --title <title> --body <text> [--keywords <csv>]
maestro knowhow add --type asset --asset-type <type> --code-paths <paths>
maestro knowhow list [--type <type>] [--json]
maestro knowhow search <query> [--json]
maestro knowhow get <id> [--json]

# ── Hook Management ───────────────────────────────────────────
maestro hooks install --level standard
maestro hooks status
```
