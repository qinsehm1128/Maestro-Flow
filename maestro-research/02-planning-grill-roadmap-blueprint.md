# Maestro Planning & Specification Chain: grill → roadmap → blueprint

Research deliverable covering the three planning/specification commands of Maestro Flow:
`maestro-grill`, `maestro-roadmap`, and `maestro-blueprint` (user called blueprint "boatstrain"
— same command). Evidence is cited as `path:line`. Authored-prompt instructions (`.md`) are kept
separate from code-enforced behavior; ambiguities are flagged explicitly.

> Scope note: All three commands are **prompt-only orchestrators**. There are no dedicated
> TypeScript command handlers in `src/commands/` for grill/roadmap/blueprint (verified — `src/commands/`
> contains `spec.ts`, `hooks.ts`, `search.ts`, `knowhow.ts`, `wiki.ts`, `load.ts`, etc., none for these
> three). The only code-enforced surface they touch is the shared artifact/milestone model in
> `.workflow/state.json` (template at `templates/state.json:1-18`) and CLI side-effects via
> `maestro spec load` / `maestro wiki search` / `maestro ralph complete`.

## Table of Contents

1. [maestro-grill](#1-maestro-grill)
2. [Grill vs Boundary-Grill](#2-grill-vs-boundary-grill)
3. [maestro-roadmap](#3-maestro-roadmap)
4. [maestro-blueprint (6-phase chain)](#4-maestro-blueprint-6-phase-chain)
5. [How the three connect: the planning pipeline](#5-how-the-three-connect-the-planning-pipeline)
6. [Agent / subagent orchestration](#6-agent--subagent-orchestration)
7. [Artifact storage map](#7-artifact-storage-map)
8. [Ambiguities and unverifiable points](#8-ambiguities-and-unverifiable-points)
9. [Cross-references for the index](#9-cross-references-for-the-index)

---

## 1. maestro-grill

**Source of truth**: `.claude/commands/maestro-grill.md`, `workflows/grill.md`.

### Purpose

Socratic, **adversarial** stress-testing of a plan/idea/requirement against *codebase reality*,
before any elaboration. Quoted purpose:

> "Socratic stress-testing of plans/ideas against codebase reality. Produces grill-report.md +
> terminology.md + context-package.json for downstream brainstorm/analyze/roadmap."
> — `.claude/commands/maestro-grill.md:16`

> "Pipeline position: BEFORE brainstorm (stress-test → then elaborate)."
> — `.claude/commands/maestro-grill.md:18`

### Inputs / modes / flags

`$ARGUMENTS` is the topic/plan text, or `--from <source>` for upstream input
(`.claude/commands/maestro-grill.md:30`). Three modes (`maestro-grill.md:32-36`):

- **Interactive** (default): topic text → full Socratic grilling with user Q&A.
- **Auto** (`-y`): code exploration answers the questions *instead of* the user.
- **Resume** (`-c` / `--session ID`): continue a previous grill session.

Flags (`maestro-grill.md:39-46`): `-y/--yes`, `-c/--continue`, `--session ID`,
`--depth shallow|standard|deep` (branch count **3/5/8**, default standard), and
`--from <source>` (`blueprint:ID`, `@file`, or path).

### The adversarial method

The interview is explicitly **not menu-driven** — it is "adversarial Socratic"
(`maestro-grill.md:60`). Question style (`maestro-grill.md:61-65`):

> "Reference specific code: 'The codebase uses `{symbol}` at `{file:line}` — your proposal calls it
> `{term}`. Which wins?'" … "Challenge contradictions: immediately surface conflicts with code
> evidence or prior answers" … "Escalating depth: per branch basic → specific → adversarial".

**Branch traversal** is depth-gated across 8 categories (`maestro-grill.md:66`,
`workflows/grill.md:216-225`): Scope & Boundaries → Data Model & State → Edge Cases & Failure Modes →
Integration & Dependencies → Scale & Performance → Security & Access Control → Observability &
Operations → Migration & Rollback. Shallow walks the first 3, standard 5, deep all 8.

The 7-step workflow (`workflows/grill.md:13-20`):
1. Parse & Route, 2. Discovery (docs + codebase scan), 3. Terminology Alignment (code vs proposal),
4. Branch Walking (the grilling loop), 5. Synthesis, 6. Context Package, 7. Register Artifact + finish-work.

Key mechanics:
- **Terminology collision check** (`grill.md:156-206`): extract 5-15 candidate terms, `Grep` each
  against the codebase, build a collision table, and challenge ambiguous terms via `AskUserQuestion`.
  In auto mode it "prefer[s] existing code naming; override only when name is semantically incorrect"
  (`grill.md:194`).
- **Branch walking** (`grill.md:210-336`): one branch at a time, one question per turn, 3-5 probing
  questions per branch, each answer **validated against code** (`grill.md:314-320` — e.g. "We'll use X
  pattern" → Grep for existing X). Every settled question is appended to `grill-report.md` as a
  Q&A block with `Answer / Evidence / Decision (locked|open|deferred) / Constraint (RFC 2119)`
  (`grill.md:322-332`).
- **Auto-mode answering** delegates to a CLI analysis: `maestro delegate "... MODE: analysis ...
  --role analyze --mode analysis"` (`grill.md:303-312`).

### Outputs

Output dir: `.workflow/scratch/{YYYYMMDD}-grill-{slug}/` (`maestro-grill.md:47`, `grill.md:71-73`).
Three produced files (`maestro-grill.md:48`, `grill.md:41-45`):

| File | Content |
|------|---------|
| `grill-report.md` | Branch Log table + all Q&A entries + Synthesis (Decision Summary, Verified Constraints, Open Questions, Risk Register) |
| `terminology.md` | Glossary crystallized during grilling, cross-referenced with code, locked/open status |
| `context-package.json` | Schema `context-package/1.0` — the standardized handoff to downstream commands |

The **context package** (`grill.md:391-427`) maps grilling outcomes into structured fields:
`requirements[]` (locked scope), `constraints[]` (locked RFC-2119 decisions),
`domain.problem_statement` / `domain.terminology[]`, `non_goals[]`, `insights[]` (code findings that
contradicted the proposal), `open_questions[]`, `references[]`.

### Phase gates (code-shaped blocking, but prompt-enforced)

Three BLOCKING gates in the command (`maestro-grill.md:75-93`): GATE 1 requires a codebase scan with
≥1 code reference before grilling; GATE 2 requires all depth-selected branches walked with ≥2 evidenced
Q&A pairs each, and **every locked decision backed by evidence — "NOT just orchestrator inference"**
(`maestro-grill.md:85`); GATE 3 requires all three artifacts written. These are authored prompt rules,
not compiler-enforced.

### Completion / registration

On completion the artifact is registered in `state.json` as `{ id: "GRL-{NNN}", type: "grill",
scope: "standalone", ... }` (`grill.md:444-464`) and the session is sealed via
`@~/.maestro/workflows/finish-work.md` (`maestro-grill.md:158`). Domain terms flow to
`.workflow/domain/glossary.yaml` via finish-work Step 3.5 — grill does **not** call `maestro domain add`
directly because terms may be overturned mid-grilling (`grill.md:466-477`).

Next-step routing table (`maestro-grill.md:125-131`): brainstorm / analyze / roadmap / blueprint /
continue, all consuming `--from grill:{artifact_id}`.

---

## 2. Grill vs Boundary-Grill

These are **different artifacts** despite the shared name.

| | `maestro-grill` (`workflows/grill.md`) | Boundary-Grill (`workflows/boundary-grill.md`) |
|---|---|---|
| Nature | Standalone command + full 7-step workflow | **Embedded mini-review protocol** appended into another command's output (`boundary-grill.md:1`) |
| Trigger | User invokes `/maestro-grill` before brainstorm | Auto-fires inside a host command when conflicts detected (`boundary-grill.md:13-18`) |
| Scope | 8 grilling branches, depth 3/5/8 | Max 3 conflicts × 3 questions = 9 (`boundary-grill.md:23`) |
| Conflict types | n/a (open-ended grilling) | `RSC` (scope-guard leak), `MOD` (cross-module change), `DEC` (locked decision contradicts code) — `boundary-grill.md:7-11` |
| Output | Standalone files in scratch dir | Appended "Boundary Grill Results" table to the host command's primary output (`boundary-grill.md:35-44`) |
| Blocking? | Has BLOCKING gates | **Non-blocking** — warnings + resolutions, never hard stops (`boundary-grill.md:46-49`) |
| Auto-mode resolution | code exploration answers questions | RSC→defer to target scope; MOD→follow existing pattern; **DEC→code wins** (`boundary-grill.md:26-32`) |

In short: `maestro-grill` is the *front-of-pipeline command*; boundary-grill is a *reusable
inline guardrail* that other commands embed to catch scope/module/decision conflicts with `file:line`
evidence (evidence is mandatory — "generic assertions invalid", `boundary-grill.md:47`).

---

## 3. maestro-roadmap

**Source of truth**: `.claude/commands/maestro-roadmap.md`, `workflows/roadmap.md`,
`workflows/roadmap-common.md`, template `templates/roadmap.md`.

### Purpose & pipeline position

> "Generate milestone/phase roadmap from requirements or upstream context. Three modes: create
> (default), revise (`--revise`), review (`--review`)." — `maestro-roadmap.md:16`
> "Pipeline: brainstorm/blueprint/analyze → **roadmap** → analyze {phase} → plan → execute."
> — `maestro-roadmap.md:18`

### Inputs

`$ARGUMENTS` = requirement text, `@file`, or upstream context source (`maestro-roadmap.md:30`).
Flags (`maestro-roadmap.md:34-44`): `-y`, `-c`, `-m progressive|direct|auto` (decomposition strategy,
default auto), `--from <source>` (consumes a `context-package.json` from `brainstorm:ID` /
`blueprint:BLP-xxx` / `analyze:ANL-xxx` / `@file` / path), `--from-brainstorm` (backward-compat alias),
`--revise [instructions]`, `--review`.

### Data model: milestones, phases, dependencies

The roadmap data model is the **Milestone > Phase** hierarchy, persisted to `.workflow/roadmap.md`
and mirrored into `state.json.milestones[]`. The milestone schema is documented inline in the state
template:

> `"_milestone_schema": "{ id, name, type: 'standard'|'adhoc', status, phases[], phase_slugs{},
> roadmap_ref, created_at }"` — `templates/state.json:8`

The **Minimum-Phase Principle** (`workflows/roadmap-common.md:73-131`) governs decomposition and is the
single most load-bearing rule:

> "Core rule: Phase = synchronization barrier. Each Phase triggers a full plan→execute→verify→transition
> serial cycle. … Default: 1 Phase." — `roadmap-common.md:75-80`

Constraints (`roadmap-common.md:79-86`): default **1 phase**, max **2**, exceptional **3** (must
justify), minimum **5 tasks per phase**. A phase split is justified only when **all three** hard-dependency
conditions hold (`roadmap-common.md:88-91`): (1) runtime dependency that cannot be mocked, (2) not
parallelizable via contract/interface, (3) full barrier (all of Phase A before any of Phase B).
Internal task ordering/parallelism is handled by a **wave DAG** inside each phase, not by adding phases.

Phase format (`roadmap-common.md:115-124`): `Goal`, `Depends on`, `Requirements` (REQ-IDs mapped from
`project.md` Active requirements), `Success Criteria` (observable behaviors). Phase numbering is integer
for planned work, decimal (2.1, 2.2) for inserted phases (`roadmap-common.md:126-128`). Phase directories
use `{NN}-{slug}` (e.g. `01-auth`). **Requirements traceability is enforced**: every Active requirement
must appear in exactly one phase, unmapped → surfaced as a gap (`roadmap-common.md:130`).

Progressive vs Direct (`roadmap-common.md:104-114`): Progressive layers (MVP → Usable → Refined) map to
**Milestones, not Phases**; Direct mode is a topologically-sorted task sequence with `parallel_group` for
independent tasks. Strategy is auto-selected by a **5-factor uncertainty assessment** (scope_clarity,
technical_risk, dependency_unknown, domain_familiarity, requirement_stability): ≥3 high → progressive,
≥3 low → direct, else ask (`workflows/roadmap.md:38`).

### Workflow (create mode)

`workflows/roadmap.md:1-71` — Step 1 Session Init → Step 2 Requirement Understanding & Strategy
(parse requirement, **mandatory** codebase exploration, optional external research producing
`apiResearchContext`, uncertainty assessment, strategy selection) → Step 3 Decomposition → Step 4
Iterative Refinement (max 5 rounds: Approve/Adjust/Reorder/Split-Merge/Re-decompose) → Step 5 Write
Outputs → Step 6 Handoff.

The command-level gates (`maestro-roadmap.md:79-99`) require: parsed requirement with goal/constraints/
stakeholders, milestones+phases defined, **every Active requirement mapped to exactly one phase**,
**no circular dependencies** (E003 otherwise), user approval, and `.workflow/roadmap.md` written with
`state.json` milestone entries registered.

### Artifact outputs & storage

- **Primary output**: `.workflow/roadmap.md` (`maestro-roadmap.md:95`, `roadmap.md:61`) using template
  `templates/roadmap.md` (Overview / Phases / Phase Details / Scope Decisions / Progress table) —
  template shown at `roadmap-common.md:140-168`.
- **Session dir**: `.workflow/.roadmap/RMAP-{slug}-{date}/` (`workflows/roadmap.md:16`).
- **state.json update** (`roadmap-common.md:182-190`): update `milestones` array and `current_milestone`
  (partial update). If `state.json` does not exist, do **not** create it (left to `maestro-init`).
- **Overwrite rules** (`roadmap-common.md:172-180`): create if absent; overwrite if no completed phases;
  **refuse overwrite** if completed phases exist → force `--revise` mode.

Important constraint: **no phase directories are created** at roadmap time — phases are labels in the
roadmap, not directories (`maestro-roadmap.md:163`). Directories materialize later (plan/execute).

### Revise / Review modes

- **Revise** (`roadmap.md:74-82`): load state, get instructions, impact analysis, apply while preserving
  completed phase markers/numbering, validate no circular deps and intact coverage. E005 if a revision
  invalidates completed phase work (`maestro-roadmap.md:147`).
- **Review** (`roadmap.md:86-106`): read-only health assessment → `.workflow/scratch/{date}-roadmap-review.md`.
  No state modifications.

---

## 4. maestro-blueprint (6-phase chain)

**Source of truth**: `.claude/commands/maestro-blueprint.md`, `workflows/blueprint.md`.
(User's "boatstrain" = blueprint.)

### Purpose

> "6-phase formal specification chain: Product Brief → PRD → Architecture → Epics. Pure documentation —
> no code generation." — `maestro-blueprint.md:16`
> "Pipeline: brainstorm (optional) → **blueprint** → analyze / roadmap / plan." — `maestro-blueprint.md:18`

**Output boundary** (hard rule, `maestro-blueprint.md:47`): all writes MUST target
`.workflow/blueprint/BLP-{slug}-{date}/` or `.workflow/state.json` — never source code.

### The phase chain (P0 → P6, with P1.5 and P6.5)

The "6-phase" name refers to the document phases P1–P6 (the chain header at `blueprint.md:14`), with
P0 prerequisite-loading and P1.5/P6.5 as sub-phases. The canonical chain
(`maestro-blueprint.md:73`, `blueprint.md:14`):

```
P0 Spec Study → P1 Discovery → P1.5 Req Expansion → P2 Product Brief →
P3 PRD → P4 Architecture → P5 Epics → P6 Readiness Check
P6 gate: Pass(≥80%)→Handoff | Review(60-79%)→Handoff w/caveats | Fail(<60%)→P6.5 Auto-Fix(max 2)→re-check
```

| Phase | Workflow step | Input doc(s) | Output doc(s) | Citation |
|-------|--------------|--------------|---------------|----------|
| **P0** Spec Study | Step 1 | doc standards, quality gates, templates | (loads project specs/history) | `blueprint.md:60-76` |
| **P1** Discovery & Seed Analysis | Step 2 | `$ARGUMENTS` / `--from` context-package / `@file` | `blueprint-config.json`, `discovery-context.json` (opt), `apiResearchContext` (in-mem) | `blueprint.md:77-134` |
| **P1.5** Req Expansion | Step 3 (skip if `--from`) | seed_analysis | `refined-requirements.json` | `blueprint.md:136-155` |
| **P2** Product Brief | Step 4 | `refined-requirements.json` / discovery | `product-brief.md`, `glossary.json` (5+ terms) | `blueprint.md:157-189` |
| **P3** PRD | Step 5 | product brief goals, glossary | `requirements/_index.md` + `REQ-NNN-*.md` + `NFR-{type}-NNN-*.md` | `blueprint.md:191-214` |
| **P4** Architecture | Step 6 | requirements, glossary, apiResearchContext | `architecture/_index.md` + `ADR-NNN-*.md` | `blueprint.md:216-252` |
| **P5** Epics & Stories | Step 7 | requirements, architecture | `epics/_index.md` + `EPIC-NNN-*.md` | `blueprint.md:254-280` |
| **P6** Readiness Check | Step 8 | all docs | `readiness-report.md`, `blueprint-summary.md` | `blueprint.md:282-308` |
| **P6.5** Auto-Fix (conditional, score<60%) | Step 9 | readiness report errors/warnings | updated P2–P5 docs (max 2 iter) | `blueprint.md:310-329` |

### How the chain is sequenced (gates)

Each phase produces artifacts that are prerequisites for the next (`maestro-blueprint.md:80-89`):

- **GATE P2→P3**: `product-brief.md` written with ≥5 glossary terms in `glossary.json` — BLOCKED if
  glossary < 5 terms (`blueprint.md:18`).
- **GATE P3→P4**: `requirements/_index.md` with MoSCoW table; all reqs have RFC 2119 keywords +
  acceptance criteria (`blueprint.md:19`, `maestro-blueprint.md:86`).
- **GATE P4→P5**: `architecture/` with `_index.md` + `ADR-*.md` (`maestro-blueprint.md:87`).
- **GATE P5→P6**: `epics/` with `_index.md` + `EPIC-*.md` + cross-Epic dependency map
  (`maestro-blueprint.md:88`).
- **GATE P6**: readiness score; Pass(≥80) or Review(≥60) required for handoff (`maestro-blueprint.md:89`).

### Key phase mechanics

- **P2 multi-CLI parallel analysis (3 perspectives)** — Product (role: analyze), Technical (role:
  review), User (role: explore) — synthesized into convergent themes/conflicts/unique insights
  (`blueprint.md:166-178`).
- **P4 architecture** must produce ADRs (context/decision/alternatives/consequences), data model
  (Mermaid erDiagram), and for service/platform types: state machine, configuration model, error
  handling strategy, observability (5+ metrics) — `blueprint.md:220-234`. Then a separate
  architecture **review** CLI pass challenges each ADR (`blueprint.md:236-240`).
- **P6 scoring**: 4 dimensions at 25% each — Completeness, Consistency (glossary compliance),
  Traceability (goals→requirements→architecture→epics matrix), Depth (`blueprint.md:286-293`).
- **glossary.json** generated in P2 is injected into every subsequent phase's CLI prompts to enforce
  terminology consistency (`blueprint.md:187-188`, `186`).

### Outputs & storage

Full directory layout at `blueprint.md:35-54`. Session ID `BLP-{slug}-{YYYY-MM-DD}`; output dir
`.workflow/blueprint/{session_id}/`. State tracked in `blueprint-config.json` with
`phasesCompleted[]` for resume (`blueprint.md:361-389`). On gate Pass/Review the session seals via
finish-work and registers a `type=blueprint` artifact plus a `context-package.json` for downstream
(`maestro-blueprint.md:160-167`). On **Fail**, the session stays active and is excluded from wiki search
(`maestro-blueprint.md:162`).

### Error degradation

Most phase failures are **non-blocking**, marking affected artifacts `[LOW CONFIDENCE]` and continuing
(`blueprint.md:393-406`). Only empty input (Phase 1) is hard-blocking.

---

## 5. How the three connect: the planning pipeline

The intended end-to-end flow (assembled from the three "Pipeline" headers and routing tables):

```
maestro-grill ──► maestro-brainstorm ──► maestro-roadmap ──► (maestro-plan ──► maestro-execute)
   (stress-test)     (elaborate)            (milestone/phase)
        │                                        ▲
        └──────────────► maestro-blueprint ──────┘
                          (formal spec: Brief→PRD→Arch→Epics)
```

Evidence for the wiring:
- grill is "BEFORE brainstorm" (`maestro-grill.md:18`); its routing offers brainstorm / analyze /
  roadmap / blueprint, all via `--from grill:{artifact_id}` (`maestro-grill.md:125-131`).
- blueprint sits "brainstorm (optional) → blueprint → analyze / roadmap / plan"
  (`maestro-blueprint.md:18`); its handoff routes to `maestro-roadmap --from blueprint:BLP-xxx`
  (`maestro-blueprint.md:124-127`, `blueprint.md:338-343`).
- roadmap sits "brainstorm/blueprint/analyze → roadmap → analyze {phase} → plan → execute"
  (`maestro-roadmap.md:18`); it consumes `--from blueprint:BLP-xxx` / `brainstorm:ID` / `analyze:ANL-xxx`
  (`maestro-roadmap.md:40`).
- The command-usage guide confirms the macro flow:
  `/maestro-init → /maestro-roadmap 或 /maestro-blueprint` and templates
  `full-lifecycle: init→blueprint→...` and `roadmap-driven: init→roadmap→...`
  (`guide/command-usage-guide.md:184, 310-312`).

**The connective tissue is the `context-package.json` (schema `context-package/1.0`)**. grill emits it
(`grill.md:393-417`); roadmap and blueprint both *consume* it via `--from` and map its fields
(`requirements[]`, `constraints[]`, `domain.terminology[]`, `non_goals[]`, `insights[]`,
`open_questions[]`) into their own seeds — see roadmap `roadmap.md:29` and blueprint `blueprint.md:90-98`.
Each stage also re-emits a context-package for the next, and registers its artifact (GRL-/RMAP-/BLP-)
in `state.json.artifacts[]` so `--from <type>:ID` can resolve it.

### Where each writes artifacts (pipeline view)

| Stage | Session dir | Primary artifacts | state.json effect |
|-------|-------------|-------------------|-------------------|
| grill | `.workflow/scratch/{date}-grill-{slug}/` | grill-report.md, terminology.md, context-package.json | register `GRL-{NNN}` (type=grill) |
| roadmap | session `.workflow/.roadmap/RMAP-{slug}-{date}/`; **output `.workflow/roadmap.md`** | roadmap.md (Milestone>Phase) | update `milestones[]` + `current_milestone` |
| blueprint | `.workflow/blueprint/BLP-{slug}-{date}/` | product-brief.md, requirements/, architecture/, epics/, readiness-report.md, context-package.json | register `BLP-...` (type=blueprint) |

---

## 6. Agent / subagent orchestration

| Command | Subagent / CLI invocation | Pattern | Citation |
|---------|--------------------------|---------|----------|
| grill | `Agent(subagent_type="Explore")` for codebase scan | single fan-out, read-only | `grill.md:100-117` |
| grill (auto) | `maestro delegate "... --role analyze --mode analysis"` per question | CLI-as-answerer | `grill.md:303-312` |
| roadmap | `cli-explore-agent` for codebase context | mandatory single agent | `roadmap-common.md:48-54` |
| roadmap | `workflow-external-researcher` for API/tech research | conditional, tech-keyword-triggered | `roadmap-common.md:56-69` |
| roadmap | **`cli-roadmap-plan-agent`** for decomposition | **referenced but missing — see §8** | `workflows/roadmap.md:46` |
| roadmap (alt) | `workflow-roadmapper` agent | the *actual* existing roadmap agent | `.claude/agents/workflow-roadmapper.md` |
| blueprint P2 | 3 parallel CLI perspectives (Product/Technical/User → roles analyze/review/explore) | **fan-out judge-style panel** then synthesis | `blueprint.md:166-178` |
| blueprint P4 | architecture-generate CLI then separate architecture-**review** CLI (role: review) | generate→critique | `blueprint.md:220-240` |
| blueprint P1/P3/P5/P6 | "Seed Analysis / Req Expansion / Epic Decomposition / Cross-Document Validation via CLI" — all marked MANDATORY, NOT SUBSTITUTABLE | sequential CLI calls | `blueprint.md:109, 195, 258, 286` |

Notable patterns:
- **Fan-out + synthesis**: blueprint P2 is the clearest judge-panel pattern — three role-tagged
  perspectives run in parallel, then convergent/conflict/unique themes are extracted
  (`blueprint.md:166-178`). It is *not* an adversarial scoring panel, just multi-perspective synthesis.
- **Generate-then-critique**: blueprint P4 separates ADR generation from a dedicated review pass that
  rates quality 1-5 (`blueprint.md:236-240`).
- **CLI-as-oracle**: grill auto-mode replaces the human with `maestro delegate` analysis
  (`grill.md:303-312`); this is the same external-CLI delegation mechanism used across Maestro.
- "MANDATORY, NOT SUBSTITUTABLE by manual Read/Grep" appears throughout to force agent/CLI use over the
  orchestrator doing the work inline (e.g. `grill.md:100, 305`; `roadmap-common.md:50, 58`;
  `blueprint.md:109, 166, 195, 220, 236, 258, 286`).

The full agent roster relevant to planning lives in `.claude/agents/`: `cli-explore-agent.md`,
`workflow-roadmapper.md`, `workflow-external-researcher.md`, `workflow-planner.md`,
`workflow-phase-researcher.md`, `workflow-collab-planner.md`, `workflow-research-synthesizer.md`,
`workflow-project-researcher.md`.

---

## 7. Artifact storage map

```
.workflow/
├── state.json                         # shared artifact registry + milestones (templates/state.json)
├── roadmap.md                         # roadmap output (Milestone > Phase)
├── scratch/
│   └── {YYYYMMDD}-grill-{slug}/       # grill session
│       ├── grill-report.md
│       ├── terminology.md
│       └── context-package.json
├── .roadmap/RMAP-{slug}-{date}/       # roadmap session working dir
└── blueprint/BLP-{slug}-{date}/       # blueprint session
    ├── blueprint-config.json
    ├── discovery-context.json
    ├── refined-requirements.json
    ├── glossary.json
    ├── product-brief.md
    ├── requirements/ (_index.md, REQ-*.md, NFR-*.md)
    ├── architecture/ (_index.md, ADR-*.md)
    ├── epics/ (_index.md, EPIC-*.md)
    ├── readiness-report.md
    └── blueprint-summary.md
```
Citations: `grill.md:71-73`, `roadmap.md:16` + `roadmap-common.md:138`, `blueprint.md:35-54`,
`templates/state.json:1-18`.

---

## 8. Ambiguities and unverifiable points

1. **`cli-roadmap-plan-agent` does not exist.** `workflows/roadmap.md:46` spawns
   `cli-roadmap-plan-agent` for decomposition, but no such agent file exists anywhere in the repo
   (verified: `find . -iname "*roadmap-plan*"` returns nothing; the agents dir contains
   `workflow-roadmapper.md`, not `cli-roadmap-plan-agent`). The two documents describe the roadmap agent
   under different names — `roadmap.md` says `cli-roadmap-plan-agent`, while `.claude/agents/` and the
   command's own subagent list provide `workflow-roadmapper`. **The decomposition agent name in the
   workflow is a dangling reference.** Likely the orchestrator resolves to `workflow-roadmapper` at
   runtime, but this is unverified.

2. **No code-enforced command handlers.** grill/roadmap/blueprint have no `src/commands/*.ts` handlers
   (verified). All "Phase Gates (MANDATORY, BLOCKING)" are *authored-prompt* assertions, enforced only
   by the model following the prompt — there is no compiler/runtime check that, e.g., blocks P3 if the
   glossary has < 5 terms. The only genuinely code-backed surfaces are `state.json` reads/writes and the
   `maestro spec/wiki/ralph/delegate` CLI calls.

3. **Roadmap agent vs workflow divergence.** `workflow-roadmapper.md` uses an older roadmap format
   (Vision/Phases with `Size: M`, `.workflow/research/SUMMARY.md` input — `agents/workflow-roadmapper.md:33-59`)
   that differs from the template in `roadmap-common.md:140-168` (Overview/Phase Details/Progress table).
   The agent file and the workflow template are not fully consistent; which one wins at runtime is
   unverified.

4. **"6-phase" naming.** The chain actually has P0–P6 plus P1.5 and P6.5 (9 phase markers). The "6-phase"
   label (`maestro-blueprint.md:3,16`) refers to the *document* phases P1–P6; this is a naming nuance,
   not a contradiction.

5. **Blueprint error table references concrete models** ("Gemini fails → Codex fallback",
   `blueprint.md:399`) but the workflow body uses abstract roles (analyze/review/explore). The mapping
   from roles to concrete CLIs is resolved elsewhere (a CLI fallback chain, `blueprint.md:406`) and not
   defined in these files.

---

## 9. Cross-references for the index

- **ralph integration**: all three commands support ralph-invoked completion via
  `maestro ralph complete <idx> --status {DONE|DONE_WITH_CONCERNS|NEEDS_RETRY|BLOCKED}`
  (`maestro-grill.md:110-122`, `maestro-roadmap.md:116-127`, `maestro-blueprint.md:107-118`).
  See the ralph research doc for how these status verdicts drive the ralph state machine.
- **coordinator / external-CLI**: the "MANDATORY, NOT SUBSTITUTABLE" agent spawns and `maestro delegate
  --role/--mode` calls are the external-CLI delegation layer; milestone/phase state is consumed by
  `src/coordinator/graph-walker.ts` + `graph-types.ts` (the only src that reads `milestones`/`artifacts`).
  Cross-ref the coordinator/external-CLI doc for how `state.json.milestones[]` becomes an execution graph.
- **engineering-file projection**: roadmap writes `.workflow/roadmap.md` and `state.json.milestones[]`
  but deliberately creates **no phase directories** (`maestro-roadmap.md:163`); directory projection
  (`{NN}-{slug}/`) happens downstream in plan/execute. Cross-ref the engineering-file-projection doc for
  how roadmap phases materialize into the `.workflow/` filesystem.
- **Shared context-package contract** (`context-package/1.0`) is the inter-command handoff format and
  should be indexed as a first-class artifact alongside `state.json`.
