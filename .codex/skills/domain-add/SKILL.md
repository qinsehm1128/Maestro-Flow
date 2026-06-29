---
name: domain-add
description: Register a domain term into project glossary
argument-hint: "<canonical> <definition>"
allowed-tools: Read, Write, Bash, Glob, Grep
---

<purpose>
Register a domain term into `.workflow/domain/glossary.yaml`. Domain terms are automatically injected into agent context via hooks (domain-compact for all prompts, domain-expanded on keyword match).

```bash
$domain-add "auth-token" "Short-lived credential for API authentication"
$domain-add "event-bus" "Central pub-sub message broker for cross-module communication"
```

**CLI alternative**: `maestro domain add "<canonical>" "<definition>" --tier core|extended|peripheral`. Used by finish-work for programmatic domain term extraction from session outputs.
</purpose>

<context>
$ARGUMENTS — `<canonical> <definition>` where canonical is a kebab-case term name.

**Prerequisites**: `.workflow/domain/` must exist (run `maestro domain init` if missing).

**Domain term lifecycle**: discover/manual → register → active → (optional) deprecated → removed
</context>

<execution>

### Step 1: Parse Input

Extract canonical (first token, kebab-case) and definition (remainder) from arguments.
- Validate canonical is non-empty, kebab-case (lowercase, hyphens only)
- Validate definition is non-empty, ≤200 chars (E001 if missing)

### Step 2: Validate Domain Directory

Verify `.workflow/domain/glossary.yaml` exists (E002). If not, run `maestro domain init`.

### Step 3: Check Duplicates

Read existing glossary and check for:
- Exact duplicate (same canonical name) → report existing entry, exit
- Near match (Levenshtein ≤ 2 or alias overlap) → warn, ask to confirm or merge

### Step 4: Extract Metadata

Auto-derive from the definition and codebase context:
- **aliases** (1-3): common abbreviations, Chinese translations, alternate forms
- **keywords** (3-5): search terms for discovery
- **tier**: `core` | `extended` | `peripheral`
- **relationships**: scan existing glossary for related terms

### Step 5: Register Term

```bash
maestro domain add "<canonical>" "<definition>" --tier <tier>
maestro domain update "<canonical>" --aliases "alias1,alias2" --keywords "kw1,kw2" --relationships "rel1,rel2"
```

### Step 6: Confirm

Display: canonical name, definition, aliases, tier, relationships, and verify command `maestro domain list`.
</execution>

<error_codes>
| Code | Severity | Description |
|------|----------|-------------|
| E001 | fatal | Canonical name and definition are both required |
| E002 | fatal | `.workflow/domain/` not initialized — run `maestro domain init` first |
| E003 | fatal | Term already registered with same canonical name |
</error_codes>

<success_criteria>
- [ ] Canonical name and definition parsed and validated
- [ ] No duplicate term in glossary
- [ ] Aliases and keywords auto-extracted
- [ ] Term written to glossary.yaml with tier and relationships
- [ ] Confirmation displayed with verify command
</success_criteria>
