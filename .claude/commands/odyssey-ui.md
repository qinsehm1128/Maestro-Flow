---
name: odyssey-ui
description: Long-running UI optimization cycle — visual survey, multi-dimensional audit, divergent exploration, fix, verify, generalize, and design knowledge persistence
argument-hint: "<target> [--dimensions <list>] [--skip-fix] [--skip-generalize] [--auto] [-y] [-c] [--heartbeat]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---
<base>@~/.maestro/workflows/odyssey-base.md</base>

<purpose>
Deep UI polish cycle: survey → 6-dimension audit → divergent creative exploration →
fix → verify → generalize → discover → persist. Every pixel is a learning opportunity.
</purpose>

<boundary>
**范围内:** 目标组件/页面的视觉体验优化 — 审查 6 维度 → 发散探索 → 修复 → 泛化到兄弟组件
**范围外:** 后端逻辑 / 数据模型 / API 设计 / 业务规则 → `/odyssey-planex` | 深度 bug 调查 → `/odyssey-debug` | 代码质量审查 → `/odyssey-review-test-fix`
**探索自由度:** 边界内最大自由 — S_DIVERGE 阶段鼓励发散思维，不设创意上限。审查 + 发散可发现任何视觉/交互/可访问性细节。在约束下尽可能完善每个像素。
**Zero-residual principle:** Every finding/idea MUST have a concrete action (fix / issue / decision). "Report and shelve" is not allowed. "Pre-existing design debt" is not a valid skip reason — if discovered within scope, it must be addressed.
⚠️ **Decision gate** — ONLY these qualify as decisions (not fixes):
  - Brand/style direction requiring human creative judgment
  - Layout restructuring that changes user flow significantly
  - Requires new design tokens or breaking component API
❌ "Unsure how to fix", "Large scope", "Pre-existing issue" are NOT valid decision reasons — either fix it, or explain specifically why it's unfixable
</boundary>

<context>
$ARGUMENTS — target and optional flags.

**Target resolution:** Component path → audit component | Page/route → audit page | `staged`/`HEAD` → diff UI changes | Feature area → resolve to components/pages

**Flags:**
| Flag | Effect | Default |
|------|--------|---------|
| `--dimensions <list>` | Comma-separated subset of 6 dimensions | all 6 |
| `--fix-threshold <severity>` | 修复到哪个 severity 为止 | all |
| `--skip-fix` | Audit + diverge only, no code changes | false |
| `--skip-generalize` | Skip S_GENERALIZE and S_DISCOVER | false |
| `--auto` | CLI delegates without confirmation | false |
| `-y` | Auto-confirm all decisions (see appendix) | false |
| `-c` | Resume most recent session | — |
| `--heartbeat` | Enable heartbeat progress reporting | false |

**Session**: `SESSION_DIR = .workflow/scratch/{YYYYMMDD}-ui-odyssey-{slug}/`

**Output — 3 files:** `session.json` (state + audit/diverge results + patterns + phase_goals) | `evidence.ndjson` (phases: survey, audit, diverge, fix, discovery, decision, self-iteration) | `understanding.md` (8-section narrative)

**session.json unique fields:** `target`, `dimensions`, `audit_result` {dimensions_audited, finding_count, severity_distribution}, `diverge_result` {improvements_proposed, creative_ideas}, `patterns[]` {id, source_finding, layer, signature, description, risk, fix_template, confidence}, `confirmation` {test_result, cli_review, overall}, `generalization_stats` {patterns_extracted, total_hits, cross_layer_confirmed, regression_risks, by_layer, deepening_triggered}

**phase_goals[]:**
| ID | Goal | Phase | skip_when |
|----|------|-------|-----------|
| G1 | Survey completed | S_SURVEY | — |
| G2 | Audit completed | S_AUDIT | — |
| G3 | Divergent exploration done | S_DIVERGE | — |
| G4 | Zero remaining: all findings/ideas fixed and verified | S_VERIFY | skip_fix |
| G5 | Pattern generalized | S_GENERALIZE | skip_generalize |
| G6 | Discoveries triaged | S_DISCOVER | skip_generalize |
| G7 | Learnings persisted | S_RECORD | — |

**understanding.md:** §1 Target & Design Context | §2 Survey | §3 Audit | §4 Diverge | §5 Verify | §6 Generalize | §7 Discover | §8 Learnings

### Pre-load（可选，缺失不阻塞）
ARCHITECTURE.md | `maestro search "<target>" --json` (top 5) | `maestro load --type spec --category ui` | `maestro load --type spec --category coding` | `maestro search --category ui` → load knowhow | Glob prior sessions

### Knowledge Persistence（S_RECORD 写入 understanding.md §8）
| 分类 | 写入内容 | 后续建议命令 |
|------|---------|-------------|
| 设计 pattern | 组件模式 + 适用场景 + token 引用 | `/spec-add ui "..."` |
| 交互规范 | 状态定义 + 转场规则 + 反馈模式 | `/spec-add ui "..."` |
| 可访问性规则 | WCAG 要求 + 实现方案 | `/spec-add ui "..."` |
| 可复用泛化 pattern | pattern 签名 + 应用范围 | `/spec-add coding "..."` |
</context>

<self_iteration>
适用阶段: S_SURVEY, S_AUDIT, S_DIVERGE, S_GENERALIZE
</self_iteration>

<state_machine>

<states>
S_INTAKE     — Parse target, load design context, resume session           PERSIST: session.json + understanding.md §1
S_SURVEY     — Visual landscape: design tokens, pattern inventory          PERSIST: evidence.ndjson (survey) + understanding.md §2
S_AUDIT      — 6-dimension parallel review                                 PERSIST: evidence.ndjson (audit) + understanding.md §3
S_DIVERGE    — Divergent creative exploration: polish + delight            PERSIST: evidence.ndjson (diverge) + understanding.md §4
S_FIX        — Implement improvements (skip if --skip-fix)                 PERSIST: code changes + evidence.ndjson (fix)
S_VERIFY     — Visual verification + test (skip if --skip-fix)             PERSIST: session.json.confirmation + understanding.md §5
S_GENERALIZE — Pattern extraction + 4-agent scan (skip if --skip-gen)      PERSIST: session.json.patterns + understanding.md §6
S_DISCOVER   — Classify hits, create issues (skip if --skip-gen)           PERSIST: evidence.ndjson (discovery|decision) + understanding.md §7
S_RECORD     — Design knowledge persistence + final report                 PERSIST: understanding.md §8 + spec entries
</states>

<transitions>
S_INTAKE:
  → S_INTAKE      WHEN -c + session found        DO A_RESUME
  → S_SURVEY      WHEN target resolved            DO A_INTAKE
  → S_INTAKE      WHEN no target                  DO AskUserQuestion

S_SURVEY       → S_AUDIT        DO A_SURVEY
S_AUDIT        → S_DIVERGE      DO A_AUDIT

S_DIVERGE:
  → S_FIX          WHEN !skip_fix AND actionable findings/ideas           DO A_DIVERGE
  → S_GENERALIZE   WHEN (skip_fix OR no actionable) AND !skip_gen        DO A_DIVERGE
  → S_RECORD       WHEN (skip_fix OR no actionable) AND skip_gen         DO A_DIVERGE

S_FIX          → S_VERIFY       DO A_FIX
S_VERIFY:
  → S_GENERALIZE   WHEN verified AND !skip_gen    DO A_VERIFY
  → S_RECORD       WHEN verified AND skip_gen     DO A_VERIFY
  → S_FIX          WHEN needs_rework              DO A_VERIFY

S_GENERALIZE:
  → S_DISCOVER     WHEN hits found                DO A_GENERALIZE
  → S_RECORD       WHEN no hits                   DO A_GENERALIZE

S_DISCOVER → S_AUDIT  : new component to audit → cross_phase_loops++
S_DISCOVER → S_FIX    : fixable sibling, !skip_fix → cross_phase_loops++
S_DISCOVER → S_RECORD : remaining_actionable == 0 OR loops >= max_loops (MUST log each unfixed item)

S_RECORD   → END      DO A_RECORD
</transitions>

<actions>

### A_INTAKE
1. Parse arguments: target, flags, `--dimensions` subset
2. Generate slug, create `SESSION_DIR`
3. Pre-load: `maestro search` + Glob prior sessions + ARCHITECTURE.md + spec load ui/coding
4. Derive `phase_goals[]` from flags (apply `skip_when`)
5. Write `session.json` + `understanding.md` §1
6. Emit Goal Prompt (see Appendix)
📌 `git commit -m "odyssey-ui({slug}): INTAKE — 目标解析"`

### A_RESUME
Find latest session via Glob → read `session.json` → display summary → jump to `current_state`.

### A_SURVEY
1. **Design system inventory**: Scan for design tokens, CSS variables, theme imports
2. **Current state analysis**: Styling patterns, layout strategy, component hierarchy
3. **CLI-assisted** (optional): `maestro delegate` with `--role analyze` — survey tokens, spacing, typography, hierarchy, consistency
4. Append evidence (phase: "survey"). Update §2. Mark G1 done.
📌 `git commit -m "odyssey-ui({slug}): SURVEY — 视觉调查"`

### A_AUDIT
Spawn 6 parallel Agents (one per dimension, or `--dimensions` subset):

| Dimension | Focus |
|-----------|-------|
| visual_hierarchy | Spacing, typography scale, color contrast, alignment, whitespace, visual weight |
| interaction_states | Hover, focus, active, disabled, loading, error, empty, selected states |
| accessibility | WCAG AA contrast, focus management, aria labels, keyboard nav, screen reader |
| responsiveness | Breakpoints, overflow, touch targets, fluid typography, container queries |
| micro_interactions | Transitions, animations, feedback indicators, loading states, progress |
| edge_cases | Long text truncation, empty data, error states, extreme values, i18n, RTL |

Each returns `[{title, severity, file, line, description, suggestion, dimension}]`.
Merge → evidence (phase: "audit"). Write `audit_result`. Update §3 (severity matrix). Mark G2 done.
📌 `git commit -m "odyssey-ui({slug}): AUDIT — 多维审查"`

### A_DIVERGE
Goes beyond defect fixing — "what would make this delightful?"

**Step 1 — 2 parallel Agents:**
- **Polish Agent**: Shadows, borders, transitions, hover states, feedback, empty states, skeleton loading, scroll behavior
- **Delight Agent**: Motion design, progressive disclosure, smart defaults, contextual hints, celebratory feedback, personality in copy

Each returns `[{idea, category (polish|delight), impact, effort, description, inspiration}]`

**Step 2 — CLI-assisted** (optional): `maestro delegate` with `--role analyze` — polish opportunities, micro-interactions, visual rhythm, delight moments

**Step 3 — Consolidate**: Merge audit findings + divergent ideas → prioritized list (severity x impact x effort).
Append evidence (phase: "diverge"). Update §4. Mark G3 done.
📌 `git commit -m "odyssey-ui({slug}): DIVERGE — 发散探索"`

### A_FIX
Skip if `--skip-fix`.
1. **穷尽修复**: ALL findings/ideas by priority tier (critical→high→medium→low + high-impact ideas). After each tier, re-review — new findings append.
2. Each fix → evidence (phase: "fix")
3. **Normal**: AskUserQuestion per-fix. **`-y`**: auto-proceed, record `deferred`.
📌 `git commit -m "odyssey-ui({slug}): FIX — 优化实现"`

### A_VERIFY
1. Run tests (lint, unit, visual regression)
2. **CLI-assisted**: `maestro delegate` with `--role review` — visual correctness, interaction states, accessibility, responsive
3. `needs_rework` → S_FIX. `verified` → mark G4 done. Update §5, write `confirmation`.
📌 `git commit -m "odyssey-ui({slug}): VERIFY — 验证"`

### A_GENERALIZE
按 base A_GENERALIZE 执行。Pattern 来源: audit findings + diverge ideas (severity >= medium OR impact = high)。Mark G5 done.
📌 `git commit -m "odyssey-ui({slug}): GENERALIZE — 泛化扫描"`

### A_DISCOVER
按 base A_DISCOVER 执行。Mark G6 done.
📌 `git commit -m "odyssey-ui({slug}): DISCOVER — 发现分类"`

### A_RECORD
1. Finalize §8: 按 Knowledge Persistence 表分类记录，completion summary 列出建议的 `/spec-add` 命令
2. Pending decisions: **Normal** → AskUserQuestion. **`-y`** → skip, show deferred count
3. Goal audit: all confirmed → `phase_goals_all_done = true`. **Normal** → AskUserQuestion | **`-y`** → auto accept
4. Mark G7 done. Emit completion summary:
```
--- UI ODYSSEY COMPLETE ---
Target: {target} | Dimensions: {dimensions_audited}
Findings: {C}C {H}H {M}M {L}L | Diverge: {improvements} polish + {creative} delight
Fix: {fixed_count} applied, verified={yes|skipped}
Patterns: {extracted} ({by_layer}) | Scan hits: {total} ({cross_layer} cross-layer)
Issues: {N} | Decisions: {N} resolved, {M} pending, {K} deferred
Learnings: {N} entries | Self-iter: {N} rounds | Goals: {done}/{total} ({skipped} skipped)
---
```
📌 `git commit -m "odyssey-ui({slug}): RECORD — 会话总结"`

</actions>

<appendix>

### Goal Prompt Template
**⚠️ 仅在 A_INTAKE 完成后显示一次。A_RECORD 完成时禁止重新显示。**

```
📋 UI Odyssey 会话已创建。可随时复制以下 /goal 设定终止条件：

/goal 完成以下目标：
{for each G in phase_goals where status != "skipped":}
- {G.id}: {G.goal} — 完成条件: {G.done_when}
{end for}
穷尽迭代：直到 audit + diverge findings 均已处理（fix/issue/decision）
且 phase_goals_all_done=true 才停。修复按 impact×severity 逐轮迭代。
每轮修复后重审修改区域，新发现追加继续修。
遇到 phase=decision 的 pending 必须 AskUserQuestion。不允许"只报告不处理"。
```

### `-y` Auto-Confirm (5 decision points)
| Decision Point | Normal | `-y` |
|----------------|--------|------|
| A_FIX improvement confirmation | AskUserQuestion | auto-proceed, `deferred` |
| A_DISCOVER hit routing | AskUserQuestion | auto create issue, `deferred` |
| A_DISCOVER ambiguous items | AskUserQuestion | all `deferred` |
| A_RECORD pending decisions | AskUserQuestion | skip, show deferred count |
| A_RECORD goal audit | AskUserQuestion | auto accept |

`deferred` → "待决策" in completion summary; recoverable via `-c`.

</appendix>

</state_machine>

<error_codes>
| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E001 | error | No target specified | Provide target |
| E002 | error | Target path not found | Check path |
| W001 | warning | No design system detected | Proceed with defaults |
| W002 | warning | Some dimension agents failed | Partial coverage |
</error_codes>

<success_criteria>
- [ ] 6-dimension audit with severity matrix + divergent exploration (polish + delight)
- [ ] Improvements implemented and verified (unless --skip-fix)
- [ ] Multi-layer generalization + discoveries classified (unless --skip-generalize)
- [ ] Every unfixed finding has individual classification and reason
- [ ] understanding.md §8 finalized; phase_goals G1-G7 tracked; `-y` no blocking prompts
</success_criteria>

<next_step_routing>
| Condition | Next step |
|-----------|-----------|
| Finding needs deeper debug | `/odyssey-debug "<finding>"` |
| Issues created from discoveries | `/manage-issue list --source ui-odyssey` |
| Design pattern worth documenting | `/spec-add ui "..."` |
| Want full review of changes | `/odyssey-review-test-fix <changed-files>` |
| Sibling components to polish | `/odyssey-ui "<sibling>"` |
</next_step_routing>
