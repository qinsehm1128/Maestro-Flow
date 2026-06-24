---
name: domain-discover
description: Discover domain term candidates from codebase
argument-hint: "[--auto]"
allowed-tools: Read, Bash, Glob, Grep
---

<purpose>
Scan codebase for potential domain terms not yet in `.workflow/domain/glossary.yaml`. Presents candidates with confidence scores for interactive registration.

`--auto`: auto-register candidates with confidence ≥ 0.8 without prompting.
</purpose>

<execution>

### Step 1: Scan Codebase

Run `maestro domain discover` to scan TypeScript interfaces, types, enums, const patterns, API routes, and README headings.

### Step 2: Filter Existing

Remove candidates already registered in glossary.yaml (by canonical name or alias match).

### Step 3: Present Candidates

Display ranked candidates with confidence scores:

```
=== DOMAIN TERM CANDIDATES ({N} found) ===

  0.92  session-context — Runtime state container for active workflow session
  0.85  skill-resolver — Module that maps skill names to SKILL.md file paths
  0.71  chain-graph — DAG definition for multi-step command sequences
  ...

Register? (all | select by number | skip)
```

### Step 4: Register Selected

For each confirmed candidate, run `maestro domain add "<canonical>" "<definition>"`.

</execution>
