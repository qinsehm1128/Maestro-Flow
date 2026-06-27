# maestro-brainstorm — Technical Deep Dive

> Research deliverable. Source of truth: the authored orchestrator, its workflow template, the two role agents, and the `src/brainstorm-visualize/` code. Every non-trivial claim is cited as `path:line`. Authored-prompt (MANDATORY/BLOCKING) assertions are kept distinct from code-enforced behavior.

## Table of Contents

1. [Mental Model & Pipeline Position](#1-mental-model--pipeline-position)
2. [The Multi-Perspective / Multi-Role Method](#2-the-multi-perspective--multi-role-method)
3. [Phases & Flow of the Authored Command](#3-phases--flow-of-the-authored-command)
4. [Artifact Outputs](#4-artifact-outputs)
5. [The Visualization Subsystem (`src/brainstorm-visualize/`)](#5-the-visualization-subsystem-srcbrainstorm-visualize)
6. [maestro-brainstorm (single command) vs team-brainstorm (team skill)](#6-maestro-brainstorm-single-command-vs-team-brainstorm-team-skill)
7. [Multi-CLI Usage](#7-multi-cli-usage)
8. [End-to-End Walkthrough](#8-end-to-end-walkthrough)
9. [Authored-Prompt vs Code-Enforced — Summary Table](#9-authored-prompt-vs-code-enforced--summary-table)
10. [Ambiguities & Unverifiable Points](#10-ambiguities--unverifiable-points)
11. [Cross-References (Index)](#11-cross-references-index)

---

## 1. Mental Model & Pipeline Position

**What brainstorm is for.** `maestro-brainstorm` is "Multi-role brainstorming with cross-role conflict resolution" (`.claude/commands/maestro-brainstorm.md:15`). It is used "when exploring ideas, evaluating approaches, or needing multi-perspective analysis before implementation" (`maestro-brainstorm.md:3`). Its core output is a machine-readable **`guidance-specification.md`** plus a set of **per-role analysis files**, reconciled by a cross-role review.

**Where it sits.** The orchestrator declares the chain explicitly:

> "Pipeline: grill (optional) → **brainstorm** → roadmap / analyze / blueprint." (`maestro-brainstorm.md:17`)

- **Before** brainstorm: `maestro-grill` (optional) stress-tests an idea/requirement and emits a `context-package.json` that brainstorm can consume via `--from grill:ID` (`maestro-brainstorm.md:68`; `workflows/brainstorm.md:105,122-134`).
- **After** brainstorm: it routes to `maestro-blueprint`, `maestro-roadmap`, or `maestro-analyze`, each consuming `--from brainstorm:{artifact_id}` (`maestro-brainstorm.md:138-143`). The `command-usage-guide` lists a `brainstorm-driven` workflow `brainstorm→init→roadmap→...` "从头脑风暴开始" (`guide/command-usage-guide.md:312`).

**Brainstorm vs blueprint (explicitly NOT the same).** `maestro-blueprint` is the heavyweight "正式规格 / 6 阶段文档链 (Brief → PRD → Architecture → Epics)", described as "与 brainstorm 互补" (complementary to brainstorm) (`guide/command-usage-guide.md:341`). Brainstorm is the lighter, divergent, multi-perspective *exploration* stage that produces a guidance spec; blueprint is the convergent formal-spec stage.

**Output boundary (hard rule).** "ALL file writes MUST target `{output_dir}/` or `.workflow/state.json` only. NEVER modify source code or files outside these paths." (`maestro-brainstorm.md:38`). Output goes to `.workflow/scratch/{YYYYMMDD}-brainstorm-{slug}/` (`maestro-brainstorm.md:36`, `workflows/brainstorm.md:34`).

---

## 2. The Multi-Perspective / Multi-Role Method

This is brainstorm's defining mechanism: a **fan-out of role analyses + a single synthesis review**.

### 2.1 The role engine

There are **9 valid roles** (`maestro-brainstorm.md:41`, table in `workflows/brainstorm.md:52-62`): `data-architect, product-manager, product-owner, scrum-master, subject-matter-expert, system-architect, test-strategist, ui-designer, ux-expert`. `--count N` selects how many (default 3, capped at 9) (`maestro-brainstorm.md:48`; cap logic `workflows/brainstorm.md:104`).

### 2.2 Fan-out: `role-design-author` (one agent per role, parallel)

Step 4 spawns **one `role-design-author` agent per selected role in parallel** (`workflows/brainstorm.md:286-320`). The spawn block is marked "MANDATORY, NOT SUBSTITUTABLE by manual Read/Grep" (`workflows/brainstorm.md:291`).

Each `role-design-author`:
- Receives `role_name`, an **absolute** `role_template_path`, the `guidance_path`, an **absolute** `output_dir` (`{session}/{role}/`), `feature_list`, and optional `design_research`, `project_specs`, `user_context`, `style_skill` (`.claude/agents/role-design-author.md:17-28`). It fails fast with `TASK BLOCKED` if `output_dir` is not absolute (`role-design-author.md:22`).
- **Writes files only** — returning analysis as chat text is defined as failure (`role-design-author.md:31`, `maestro-brainstorm.md:316`). It must verify with Glob that files exist before emitting `TASK COMPLETE` (`role-design-author.md:193-210`).
- Produces an `analysis.md` **index** containing **§2 Decision Digest (4 tables)** + §3 Cross-Cutting Foundations + §4 File Index + §1 Role Mandate + §5 TODOs (`role-design-author.md:44-105`), one `analysis-F-{id}-{slug}.md` per feature (<2000 words), and optional `findings-{slug}.md` (<1000 words) (`role-design-author.md:36-42,107-149`).

**The "Decision Digest" concept (§2).** Each role's `analysis.md` must contain four tables (`role-design-author.md:58-78`):
1. **Decisions** — `ID | Feature | Stance | Constraints (RFC 2119)` (≥1 row per feature).
2. **Interfaces** — `Name | Contract | Consumers` (the consumers column names other roles that depend on this).
3. **Cross-Cutting Positions** — `Topic | Stance`.
4. **Findings Summary** — `Slug | Title | Impact`.

The Decision Digest is the **compressed, machine-comparable surface** the reviewer reads — the design intent is "read N role index files" rather than full prose (avoids context blow-up). Roles "Reference, Don't Duplicate" guidance decisions by ID (e.g. `SA-03`) (`role-design-author.md:171-176`).

### 2.3 Synthesis: `cross-role-reviewer` (one agent, read-only)

Step 4.5 spawns **exactly ONE `cross-role-reviewer`** to compare Decision Digests across all roles (`workflows/brainstorm.md:331-353`). It is **read-only** — "You do NOT write files... structured text that the orchestrator consumes" (`.claude/agents/cross-role-reviewer.md:12`).

It extracts each `analysis.md` §2 tables and compares across roles to surface three finding types (`cross-role-reviewer.md:28-33`):
- **Conflicts** — same feature/topic, contradictory stances between roles.
- **Gaps** — an Interface consumer references a role with no matching Decisions entry; or a cross-cutting topic addressed by one role but not another that should.
- **Synergies** — complementary Findings / compatible Interfaces that could be unified.

Every finding **MUST** carry a `patch_targets[]` block with **exact heading text** (sourced from §4 File Index) and a closed-set `edit_type` (`cross-role-reviewer.md:51,119-127,142`). The closed vocabulary is `annotate_after_heading | annotate_and_strikeout | append_to_section` and "The orchestrator MUST refuse to apply any edit whose `edit_type` is outside this set" (`cross-role-reviewer.md:119-127`). When a digest entry is too terse, the reviewer returns `need_deeper_context` and the orchestrator re-injects that sub-file and re-invokes (`cross-role-reviewer.md:37-47`, `workflows/brainstorm.md:358`).

### 2.4 Writeback (Step 5) — closing the loop

The orchestrator consumes `patch_targets[]` and applies edits to the **role files**, then logs to `guidance-specification.md §12 "Cross-Role Resolutions"` (`workflows/brainstorm.md:362-388`). Patch semantics by type:
- Conflict → `annotate_and_strikeout` (resolution blockquote after heading; original wrapped in `<!-- superseded -->`).
- Gap → breadcrumb at reference site + definition at owner site (both must succeed).
- Synergy → cross-reference in BOTH files, originals untouched (`workflows/brainstorm.md:373-377`).

On a heading mismatch: "skip patch, log finding ID, surface in Step 7 report. NEVER invent headings." (`workflows/brainstorm.md:378`; error `W006`, `maestro-brainstorm.md:166`).

**Fan-out + synthesis pattern in one line:** N parallel `role-design-author` writers → 1 `cross-role-reviewer` reader → orchestrator applies reconciliations back into the writers' files and the guidance §12.

---

## 3. Phases & Flow of the Authored Command

The command's `<execution>` says "Follow '~/.maestro/workflows/brainstorm.md' completely" (`maestro-brainstorm.md:76`). The detailed steps live in `workflows/brainstorm.md`; the command file owns the **Phase Gates**.

### 3.1 Mode detection (Step 1)

Priority order (`workflows/brainstorm.md:90-100`):
1. `--review-only` → Review-Only Mode (requires `--session ID`).
2. `--yes`/`-y` → Auto Mode (no questions).
3. First non-flag arg = valid role name → Single Role Mode.
4. First non-flag arg = number → Phase Mode (resolve phase dir, then auto).
5. Bare text → `AskUserQuestion` to choose auto / single-role / review-only.

Errors: `E001` missing args, `E002` no session for single-role, `E003` invalid role (`maestro-brainstorm.md:155-159`).

### 3.2 Auto-mode pipeline (the main flow)

| Step | Name | Input | Output | Citation |
|------|------|-------|--------|----------|
| 1.3 | Load Upstream Context (`--from`) | `grill:ID`/`blueprint:ID`/`@file`/path → `context-package.json` | pre-seeded terminology, constraints, non_goals, open_questions, insights, requirements | `workflows/brainstorm.md:122-134` |
| 1.5 | Load Project Specs | `maestro spec load --category arch` | `specs_content` | `workflows/brainstorm.md:138-143`; also `maestro-brainstorm.md:56` |
| 1.7 | External Research — Design Routes | topic + specs | `designResearchContext` → persisted `design-research.md`; spawns `workflow-external-researcher` (**MANDATORY, NOT SUBSTITUTABLE**) | `workflows/brainstorm.md:146-188` |
| 1.8 | Load Project Context | `.workflow/project.md`, `state.json.accumulated_context` | seeds + constraints | `workflows/brainstorm.md:192-197` |
| 2 | Terminology & Boundary | glossary.yaml + upstream terms | 5–10 terms + non_goals (via AskUserQuestion) | `workflows/brainstorm.md:201-210` |
| 3 | Interactive Framework Generation | all prior context | **`guidance-specification.md`** | `workflows/brainstorm.md:212-274` |
| 3.5 | Visual Style Foundation (conditional) | if `ui-designer` selected & no DESIGN.md | `.workflow/impeccable/DESIGN.md` via `maestro-impeccable explore` | `workflows/brainstorm.md:276-284` |
| 4 | Parallel Role Analysis | guidance §10 + research | N× `{role}/analysis.md` + per-feature files | `workflows/brainstorm.md:286-329` |
| 4.5 | Cross-Role Review | role `analysis.md` indexes | `conflicts[]`/`gaps[]`/`synergies[]`/`need_deeper_context[]` | `workflows/brainstorm.md:331-360` |
| 4.6 | Boundary Grill (non-blocking) | conflicts | warnings → guidance §12.5 | `maestro-brainstorm.md:92-94,182` |
| 5 | Apply Cross-Role Resolutions | `patch_targets[]` | patched role files + guidance §12 | `workflows/brainstorm.md:362-390` |
| 7 | Final Report | session state | standalone or ralph report | `workflows/brainstorm.md:437-466` |
| 7.5 | Generate Context Package | session artifacts | **`context-package.json`** (handoff) | `workflows/brainstorm.md:470-507` |

**Step 3 sub-phases** (seven, producing the guidance spec) (`workflows/brainstorm.md:212-274`): Phase 0 Context Collection → Phase 1 Topic Analysis (2–4 probing questions) → Phase 2 Role Selection (recommend count+2, multiSelect) → Phase 3 Role-Specific Questions (3–4 per role) → Phase 4 Conflict Resolution → Phase 4.5 Final Clarification + Feature Decomposition (max 8 features, `F-{3-digit}` IDs) → Phase 5 Generate Specification (RFC 2119 keywords; sections incl. §10 Feature Decomposition, §11 Decision Tracking, §12 Cross-Role Resolutions placeholder).

### 3.3 The Phase Gates (authored-prompt MANDATORY/BLOCKING)

These are asserted **in the command prompt**, not code-enforced (`maestro-brainstorm.md:78-101`):
- **GATE 1 (Framework → Role Analysis):** `guidance-specification.md` with §10 + RFC 2119 keywords AND role selection complete. *BLOCKED if missing.*
- **GATE 2 (Role Analysis → Cross-Role Review):** every selected role has `{role}/analysis.md` with §2 Decision Digest (4 tables) AND per-feature `analysis-F-*.md`. *BLOCKED if missing.*
- **GATE 2.5 (→ Boundary Grill):** boundary grill executed — **NON-BLOCKING**; conflicts logged as warnings.
- **GATE 3 (→ Completion):** reviewer output with `patch_targets[]`, boundary grill done, resolutions applied & logged. *BLOCKED if missing.*

The workflow restates per-step gates with Glob verification, e.g. "REQUIRED all `{role}/analysis.md` verified on disk via Glob" (`workflows/brainstorm.md:329`) and "Glob `{output_dir}/context-package.json` MUST exist before workflow report" (`workflows/brainstorm.md:507`). **All gate enforcement is prompt-level instruction to the model — there is no orchestration code that blocks these transitions** (see §9).

### 3.4 Other modes

- **Single Role Mode (Step 6):** Phase 1 → 3 only; validate role, detect session, optional context questions, spawn one `role-design-author`, validate `{role}/analysis.md` (`workflows/brainstorm.md:394-420`).
- **Review-Only Mode (Step 6.5):** `--review-only --session ID`; runs Step 4.5 + Step 5 on existing analyses. Errors `E006` (no `analysis.md`), `E007` (no guidance) (`workflows/brainstorm.md:424-433`, `maestro-brainstorm.md:159-160`).

---

## 4. Artifact Outputs

All under `.workflow/scratch/{YYYYMMDD}-brainstorm-{slug}/` (`workflows/brainstorm.md:68-84`):

```
guidance-specification.md          # Phase 2/3 machine contract (downstream consumes this)
design-research.md                 # optional Step 1.7 output
{role}/
  analysis.md                      # INDEX — §2 Decision Digest (4 tables) + §3 + §4 File Index
  analysis-F-{id}-{slug}.md        # one per feature, <2000 words
  findings-{slug}.md               # 0+ extra discoveries, <1000 words
context-package.json               # Step 7.5 handoff package
```

- **`guidance-specification.md`** — the central contract; §10 Feature Decomposition, §11 Decision Tracking, §12 Cross-Role Resolutions (populated by Step 5), and §11 interview decision table writeback (`maestro-brainstorm.md:70,171-173`; `workflows/brainstorm.md:256-274`).
- **Per-role index + per-feature files** — the multi-perspective deliverable described in §2.2 above.
- **`context-package.json`** (`$schema: context-package/1.0`) — the `--from`/`--to` handoff. Extraction mapping: `requirements[]` from §10, `constraints[]` from §4-N MUST/MUST NOT + role `analysis.md` §2 locked decisions, `domain` from §1-3, `non_goals[]`, `insights[]` from role §3 cross-cutting, `open_questions[]` from SHOULD/MAY, `references[]` listing guidance + each role analysis (`workflows/brainstorm.md:470-507`).
- **Artifact registration:** "On completion, registers artifact (type=brainstorm) in state.json" (`maestro-brainstorm.md:37`); the context-package path is recorded as `context_package: "{output_dir}/context-package.json"` (`workflows/brainstorm.md:504-505`). The artifact type `'brainstorm'` is a code-recognized enum value with prefix `BST` in `src/utils/state-schema.ts:44,209`. **⚠ Prefix discrepancy:** the guides use `BRN-{NNN}` / `brainstorm:BRN-001` (`guide/workflow-structure-guide.md:393,444,552`; `guide/command-usage-guide.md:226`), while code uses `BST` — see §10.
- **`finish-work`** seals the session: `SESSION_TYPE=brainstorm, SESSION_ID={artifact_id}` (`maestro-brainstorm.md:196-198`), and harvest promotes candidate terms to glossary at chain end (`workflows/brainstorm.md:208`).

---

## 5. The Visualization Subsystem (`src/brainstorm-visualize/`)

This is a **separate, code-backed HTTP server** — not part of the documented brainstorm phases. It renders authored HTML prototype fragments for side-by-side comparison.

### 5.1 What it shows

`frame.ts` builds the HTML frame, inline CSS design system (Notion-style warm palette, Inter + JetBrains Mono, light/dark) and three page renderers (`src/brainstorm-visualize/frame.ts:1-10,391`):
- **`indexPage`** — lists all `*.html` screens with a "Compare all →" link (`frame.ts:446-481`).
- **`wrapScreen`** — single screen; full HTML docs (`<!doctype`/`<html`) are served as-is, fragments get wrapped (`frame.ts:483-513`).
- **`comparePage`** — grid of panels (1/2/3-col layout toggles, expand overlay, keyboard nav); full-doc panels render in `iframe srcdoc` (`frame.ts:515-659`).
- **`emptyPage`** — "No screen files in this session yet" (`frame.ts:417-444`).

Semantic class names `.options/.cards/.mockup/.split/.pros-cons` are "used by the agent when writing prototype fragments" (`frame.ts:7-9`).

### 5.2 How/when the server is launched

`server.ts` runs as a **detached Node process** spawned by `maestro brainstorm-visualize start` (`src/brainstorm-visualize/server.ts:1-19`). Routes: `GET /` (index), `/screen/<name>`, `/compare?files=...`, `/healthz` (`server.ts:81-137`). It serves `*.html` from `BRAINSTORM_DIR` (`server.ts:35,46-56`). Selection happens "out-of-band via AskUserQuestion in the parent conversation — this server only renders" (`server.ts:6-7`).

**Lifecycle** (`server.ts:5-19,145-174`): shuts down on SIGTERM/SIGINT (via `stop`), when `BRAINSTORM_OWNER_PID` dies, or after a 30-min idle timeout. Path traversal is blocked in `readScreen` (`server.ts:58-66`).

The command wrapper `src/commands/brainstorm-visualize.ts` (alias `bv`) tracks the server via a **dedicated DelegateBrokerClient state file** so visualizer jobs never collide with `maestro delegate` (`brainstorm-visualize.ts:1-33,361-395`). `start` spawns detached, tails the log for the `server-started` JSON line, and returns `{execId, serveDir, logDir, url, ...}` (`brainstorm-visualize.ts:93-209`). Default serve dir is `.workflow/.brainstorm-visualize/<execId|session>/` (`brainstorm-visualize.ts:52-56`). Registered in the CLI as `brainstorm-visualize` / `bv` (`src/cli.ts:55-56`).

### 5.3 Relationship to the brainstorm run

The connection is **indirect and conditional**:
- The orchestrator's next-step routing fires only when "`html-prototypes/` produced with 2+ files and user wants to browse" → "Load `~/.maestro/workflows/brainstorm-visualize.md` and launch visualizer server" (`maestro-brainstorm.md:142`; `workflows/brainstorm.md:27` deferred reading).
- **`html-prototypes/` is NOT produced by brainstorm's own phases.** A grep of `workflows/brainstorm.md` shows the only prototype source is the `maestro-impeccable explore` sub-pipeline in Step 3.5 (`workflows/brainstorm.md:276-284`), which produces `DESIGN.md`. The actual HTML prototypes come from impeccable, and visualizing them is an *optional follow-on*.
- `maestro.md` defines a one-step intent route `brainstorm_visualize: [{ cmd: 'brainstorm-visualize', ... }]` (`workflows/maestro.md:369`).
- **⚠** The deferred workflow `~/.maestro/workflows/brainstorm-visualize.md` is referenced (`maestro-brainstorm.md:27`) but does not exist in the repo (it is a runtime-installed path) — see §10.

---

## 6. maestro-brainstorm (single command) vs team-brainstorm (team skill)

| Dimension | `maestro-brainstorm` (command) | `team-brainstorm` (team skill) |
|---|---|---|
| Invocation | `/maestro-brainstorm` slash command | `Skill(skill="team-brainstorm", ...)` |
| Architecture | Orchestrator prompt + inline `Agent()` spawns | SKILL.md **router** → coordinator role + `team-worker` agents (`.claude/skills/team-brainstorm/SKILL.md:11-31`) |
| Worker agents | `role-design-author` (writer) + `cross-role-reviewer` (reviewer) | `team-worker` agents loading `roles/<name>/role.md`: `ideator`, `challenger`, `synthesizer`, `evaluator` (`SKILL.md:34-40`) |
| Method | 9 domain *personas* (architect/PM/UX…), Decision Digest comparison | Generator-Critic loop: ideate → challenge → synthesize → evaluate (`SKILL.md:9`) |
| Pipelines | auto / single-role / review-only / phase | quick (3 beats) / deep (6, GC loop) / full (7, fan-out ideation) (`specs/pipelines.md:5-37`) |
| Coordination | Synchronous inline `Agent()` calls, orchestrator applies patches | `TeamCreate`, message bus `mcp__maestro__team_msg`, spawn-and-STOP + callbacks (`coordinator/role.md:79-112`) |
| Output | `guidance-specification.md` + role analyses + context-package | `ideas/`, `critiques/`, `synthesis/`, `evaluation/` under `.workflow/.team/BRS-<slug>-<date>/` (`SKILL.md:132-155`) |
| Session prefix | artifact `BST`/`BRN` in `.workflow/scratch/` | `BRS` in `.workflow/.team/` (`SKILL.md:57-58`) |

**When to use which:**
- **`maestro-brainstorm`** when you want a *structured guidance spec* with multi-discipline (architect/PM/UX/test/data…) decisions feeding directly into roadmap/blueprint/plan. It is the pipeline-integrated, artifact-producing variant.
- **`team-brainstorm`** when you want *divergent idea generation with adversarial critique* (a creative ideation swarm with a Generator-Critic convergence loop), less about producing a downstream contract.

**Architectural difference:** the command spawns purpose-built single-shot agents inline and the orchestrator does all reconciliation/file-editing itself; the team skill uses a persistent coordinator that creates a team, dispatches a task chain with `blockedBy` dependencies, spawns reusable `team-worker` agents in the background, then STOPs and reacts to callbacks (`coordinator/role.md:11-18,99-112`). The team variant manages a GC loop (max 2 rounds, severity-gated) (`specs/pipelines.md:18,40-44`); the command manages a one-pass cross-role review with optional `need_deeper_context` re-invocation.

---

## 7. Multi-CLI Usage

**No — `maestro-brainstorm` does NOT fan questions across external CLIs (collab-style).** Evidence:

- The single external-information step (Step 1.7) spawns **one** `workflow-external-researcher` agent, which "uses **Exa MCP**... using Exa search" (`.claude/agents/workflow-external-researcher.md:3,13`). This is web/MCP research, not multi-CLI fan-out.
- A grep of `maestro-brainstorm.md` for `delegate|external-cli|collab|multi-cli|cli-tool|maestro delegate` returns **no matches** in the orchestrator body (only the unrelated "Auto mode" example line). The command's `allowed-tools` are `Read, Write, Bash, Glob, Grep, Agent, AskUserQuestion` (`maestro-brainstorm.md:5-13`) — no delegate/CLI-orchestration tooling.
- Cross-verification across multiple CLI tools is the explicit job of a *different* command, `maestro-collab` ("when a question needs cross-verification from multiple CLI tools or diverse analytical perspectives" — from the skills registry), not brainstorm.

**Contrast:** the **team-brainstorm** variant *does* reference `maestro delegate --mode analysis/write` as its CLI tooling (`.claude/skills/team-brainstorm/SKILL.md:59`), but that is single-CLI delegation for workers, still not a multi-CLI collab fan-out.

**Conclusion:** brainstorm's "multi-perspective" comes from **multiple role personas analyzed by the same model**, not from multiple external CLIs.

---

## 8. End-to-End Walkthrough

A representative **auto-mode** run of `/maestro-brainstorm "Build real-time collaboration platform" --count 3`:

1. **Parse & route** (Step 1): no `--review-only`/role/number; treated as topic. Without `--yes`, the orchestrator would ask mode; with `--yes` it goes straight to Auto (`workflows/brainstorm.md:90-100`).
2. **Upstream context** (Step 1.3): if `--from grill:G-001` were passed, `context-package.json` pre-seeds terminology/constraints/non_goals/open_questions (`workflows/brainstorm.md:122-134`).
3. **Specs + research** (Steps 1.5–1.8): `maestro spec load --category arch`; spawn `workflow-external-researcher` (MANDATORY) → `design-research.md`; load `.workflow/` project context (`workflows/brainstorm.md:138-197`).
4. **Terminology & boundaries** (Step 2): extract 5–10 domain terms, ask Non-Goals (`workflows/brainstorm.md:201-210`).
5. **Framework generation** (Step 3, 7 sub-phases): topic analysis → recommend ~5 roles → user picks 3 (say `system-architect, ux-expert, data-architect`) → role-specific + conflict questions → feature decomposition (`F-001 agent-loop`, …, max 8) → write **`guidance-specification.md`** with RFC 2119 keywords, §10, §11, empty §12. **GATE 1** clears (`workflows/brainstorm.md:212-274`).
6. **(Conditional) Step 3.5:** since `ui-designer` not selected here, skipped (`workflows/brainstorm.md:276-284`).
7. **Parallel role analysis** (Step 4): 3 `role-design-author` agents spawned in parallel, each writing `{role}/analysis.md` (Decision Digest) + `analysis-F-*.md`. Orchestrator Globs to verify (**GATE 2**) (`workflows/brainstorm.md:286-329`).
8. **Cross-role review** (Step 4.5): one `cross-role-reviewer` compares §2 digests → returns `conflicts[]/gaps[]/synergies[]` with `patch_targets[]` (`workflows/brainstorm.md:331-360`). Boundary grill runs (Step 4.6, non-blocking).
9. **Apply resolutions** (Step 5): orchestrator edits role files (`annotate_and_strikeout` etc.), appends a resolution table to guidance **§12**, surfaces any heading-drift skips (`W006`) (`workflows/brainstorm.md:362-390`).
10. **Report + context package** (Steps 7, 7.5): emit `=== BRAINSTORM READY ===` block (`maestro-brainstorm.md:107-116`), write `context-package.json`, register artifact in `state.json`, seal via `finish-work` (`workflows/brainstorm.md:470-507`; `maestro-brainstorm.md:196-198`).
11. **Next step:** e.g. `/maestro-blueprint --from brainstorm:{artifact_id}` or `/maestro-roadmap --from brainstorm:{artifact_id}` (`maestro-brainstorm.md:138-143`). If impeccable produced `html-prototypes/` (≥2 files), optionally `maestro brainstorm-visualize start` to browse (`maestro-brainstorm.md:142`).

---

## 9. Authored-Prompt vs Code-Enforced — Summary Table

| Behavior | Authored-prompt (model-instructed) | Code-enforced |
|---|---|---|
| Phase Gates 1/2/2.5/3, BLOCKING semantics | ✅ `maestro-brainstorm.md:78-101` | ❌ no orchestration code |
| Glob-verify role files / context-package exists | ✅ `workflows/brainstorm.md:329,507` | ❌ |
| Role fan-out (`role-design-author`) & single reviewer | ✅ `workflows/brainstorm.md:286-353` | ❌ (spawned via `Agent` tool, no code path) |
| Decision Digest 4-table contract | ✅ `role-design-author.md:58-78` | ❌ |
| `edit_type` closed-set refusal rule | ✅ `cross-role-reviewer.md:127` | ❌ |
| Output boundary (`{output_dir}` only) | ✅ `maestro-brainstorm.md:38`; agent fail-fast on non-absolute path `role-design-author.md:22` | ❌ |
| Artifact type `brainstorm` enum + prefix | — | ✅ `src/utils/state-schema.ts:44,209` (`BST`) |
| Visualizer server (HTTP, routes, lifecycle, broker tracking) | — | ✅ `src/brainstorm-visualize/server.ts`, `src/commands/brainstorm-visualize.ts` |
| CLI command registration `brainstorm-visualize`/`bv` | — | ✅ `src/cli.ts:55-56` |
| `brainstorm_visualize` / `brainstorm-driven` intent routes | ✅ workflow data | ✅ data in `workflows/maestro.md:368-369` |

**Key takeaway:** the *brainstorm orchestration itself* (gates, fan-out, digests, reconciliation) is **entirely authored-prompt behavior** executed by the model. The only *code* in the brainstorm surface is (a) the `brainstorm` artifact-type enum/prefix in state-schema and (b) the standalone **visualizer** server+command (which renders impeccable-produced prototypes, not core brainstorm artifacts).

---

## 10. Ambiguities & Unverifiable Points

1. **Artifact prefix mismatch (`BST` vs `BRN`).** Code uses `brainstorm: 'BST'` (`src/utils/state-schema.ts:209`), but guides consistently use `BRN-{NNN}` and `--from brainstorm:BRN-001` (`guide/workflow-structure-guide.md:393,444,552`; `guide/command-usage-guide.md:226`). Which the runtime actually emits is unverified from static reading; documentation and code disagree.
2. **`~/.maestro/workflows/brainstorm-visualize.md` does not exist in-repo.** It is referenced as deferred reading (`maestro-brainstorm.md:27`) and as a "load … and launch" next step (`maestro-brainstorm.md:142`), but no such file is present (only the `src/` server). It is presumably installed to `~/.maestro/` at runtime; its exact contents are unverifiable here.
3. **`html-prototypes/` provenance.** The orchestrator routes to the visualizer when `html-prototypes/` has 2+ files, but no brainstorm phase writes that directory; the only prototype-producing step is the `maestro-impeccable explore` sub-pipeline (`workflows/brainstorm.md:276-284`). The exact directory name (`html-prototypes/` vs impeccable's actual output dir) is not reconciled in the brainstorm docs.
4. **Gate enforcement is advisory only.** "MANDATORY/BLOCKING" gates are prose instructions to the model; nothing in code blocks a transition. A model that skips a gate would not be stopped programmatically.
5. **`--review-only` flag documentation gap.** `--review-only` drives Mode detection #1 and Step 6.5 (`workflows/brainstorm.md:48,92,424-433`) but is absent from the command's `argument-hint` and Flags table (`maestro-brainstorm.md:4,43-54`). The flag is real but under-documented in the command header.
6. **`brainstorm-visualize` intent route arg shape.** `workflows/maestro.md:369` routes to `brainstorm-visualize "{description}"`, but the CLI command's actual subcommands are `start|stop|status` with options (`src/commands/brainstorm-visualize.ts:367-394`) — a bare description argument does not match the command's signature, so the route appears illustrative rather than literally executable.
7. **`--to` direction of handoff.** The task brief mentions `--from`/`--to`; only `--from` (upstream consume) is documented in the workflow. The producing side writes `context-package.json` for downstream `--from brainstorm:ID` consumption; an explicit `--to` flag was not found in the brainstorm files.

---

## 11. Cross-References (Index)

- **Planning chain — grill (upstream):** `maestro-grill` stress-tests before brainstorm and emits the `context-package.json` brainstorm reads via `--from grill:ID` (`maestro-brainstorm.md:17,68`). See research file on grill.
- **Planning chain — roadmap (downstream):** `maestro-roadmap --from brainstorm:{id}` consumes the guidance/context-package (`maestro-brainstorm.md:139`). See roadmap research.
- **Planning chain — blueprint (downstream, complementary):** `maestro-blueprint --from brainstorm:{id}`; the heavyweight 6-phase formal-spec chain, "互补" to brainstorm (`maestro-brainstorm.md:138`; `guide/command-usage-guide.md:341`). See blueprint research.
- **ralph (state machine):** brainstorm supports ralph-invoked completion via `maestro ralph complete <idx> --status …` (`maestro-brainstorm.md:118-129`). See ralph research.
- **External-CLI orchestration:** handled by `maestro-collab` (multi-CLI cross-verification), NOT brainstorm; brainstorm's only external reach is one Exa-backed `workflow-external-researcher` (§7). See external-CLI/collab research.
- **Engineering-file projection / context-package:** brainstorm's `context-package.json` (`$schema: context-package/1.0`) is the standard handoff schema shared across the planning chain (`workflows/brainstorm.md:470-507`). See context-package/engineering-projection research.
- **Impeccable (UI):** `maestro-impeccable explore` is the Step 3.5 sub-pipeline that establishes `DESIGN.md` and (separately) produces the HTML prototypes the visualizer renders (`workflows/brainstorm.md:276-284`). See impeccable research.
- **team-brainstorm (sibling):** Generator-Critic team-worker variant under `.claude/skills/team-brainstorm/` (§6). See team-skills research.
```