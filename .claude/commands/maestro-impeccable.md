---
name: maestro-impeccable
description: Production-grade UI design — 24 commands + chain orchestration with quality gates + design search
argument-hint: "<command|chain|intent> [target] [flags]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
  - TodoWrite
---

<purpose>
UI design command. Parse input → prerequisites → read workflow file → execute → track.

- **Direct**: single command via workflow file
- **Chain**: orchestrate command sequence with quality gates
- **Search**: query design knowledge base via CLI
</purpose>

## Input

$ARGUMENTS first word determines mode:

| First Word | Mode |
|------------|------|
| Known command (see routing table) | Direct |
| Chain name: build, redesign, improve, enhance, launch, harden, foundation, live | Chain |
| continue / next / -c | Resume |
| search | Search: `maestro impeccable search "$REST"` |
| Free text | Intent → classify → chain |
| (empty) | Menu: show commands by category |

## Command Routing

All workflows at `~/.maestro/workflows/impeccable/{command}.md`:

| Command | Category | Description |
|---------|----------|-------------|
| craft | Build | Shape then build end-to-end — full page/component implementation |
| shape | Build | Plan UX/UI before code — information architecture, wireframe, visual direction |
| teach | Build | Set up PRODUCT.md — users, brand, tone, anti-references, principles |
| document | Build | Generate DESIGN.md from existing code — extract tokens, typography, colors |
| extract | Build | Pull tokens/components into reusable design system |
| explore | Build | Multi-style comparison — generate variants, render prototypes, visual compare, select/mix |
| critique | Evaluate | UX heuristic review with Nielsen scoring (/40) + P0/P1 findings |
| audit | Evaluate | Technical quality checks — a11y, performance, responsive, code quality (/20) |
| polish | Refine | Final quality pass — micro-adjustments, pixel perfection |
| bolder | Refine | Amplify bland/safe designs — stronger personality, more contrast |
| quieter | Refine | Tone down aggressive/overwhelming designs — reduce visual noise |
| distill | Refine | Strip to essence — remove clutter, reduce cognitive load |
| harden | Refine | Production-ready — error states, i18n, edge cases, overflow, empty states |
| onboard | Refine | First-run flows, empty states, activation paths, progressive disclosure |
| animate | Enhance | Add purposeful motion — transitions, micro-interactions, scroll effects |
| colorize | Enhance | Add strategic color — OKLCH palette, contrast, color strategy |
| typeset | Enhance | Improve typography — scale, hierarchy, font pairing, line length |
| layout | Enhance | Fix spacing, rhythm, visual hierarchy, alignment, grid |
| delight | Enhance | Add personality — memorable details, joy, surprise moments |
| overdrive | Enhance | Push past conventional limits — ambitious visual effects |
| clarify | Fix | Improve UX copy — labels, error messages, microcopy, CTAs |
| adapt | Fix | Adapt for devices/screens — responsive, touch targets, breakpoints |
| optimize | Fix | Fix UI performance — loading, rendering, bundle, paint/layout jank |
| live | Iterate | Browser-based variant iteration — real-time design in DevTools |

Reference files (loaded by workflow as needed, not standalone commands):
brand.md, product.md, design.md, codex.md, heuristics-scoring.md, cognitive-load.md,
color-and-contrast.md, interaction-design.md, motion-design.md, personas.md,
responsive-design.md, spatial-design.md, typography.md, ux-writing.md

## Chains

| Chain | Steps | Scenario |
|-------|-------|----------|
| build | teach? → explore? → shape → craft → critique → [refine] → audit → polish | 从零新建 |
| redesign | document → explore → shape → craft → critique → [refine] → audit → polish | 基于现有代码重设计 |
| improve | critique → [refine] → polish → audit | 迭代改进 |
| enhance | {cmd...} → critique → [refine] → polish | 定向增强（支持多命令） |
| launch | harden → adapt → optimize → audit → polish | 全方位上线准备 |
| harden | harden → audit → polish | 边界加固 |
| foundation | teach? → explore → document → extract | 纯设计系统建设 |
| live | live | 实时迭代 |

- `?` = conditional: teach if PRODUCT.md missing; explore if DESIGN.md missing and --skip-design not set
- `[refine]` = quality gate loop: gate fails → auto-select fix commands from findings → re-gate
- `{cmd...}` = enhance 支持多命令，逗号分隔：`enhance colorize,typeset landing-page`

Chain flags: --threshold <N> (default 26/40), --max-loops <N> (default 3), --skip-design, --styles <N>, -y

## Intent → Chain

| Pattern | Chain |
|---------|-------|
| 新建, create, build, new, landing, page | build |
| 重做, redesign, 重新设计, rethink, 换风格, 改版 | redesign |
| 改进, improve, fix, iterate, better | improve |
| 动画, 颜色, 排版, animate, color, bold, delight | enhance |
| 上线, launch, deploy, ship, 发布准备, production-ready | launch |
| 加固, harden, edge case, i18n, 边界 | harden |
| 设计系统, design system, tokens, 设计规范, 设计基建 | foundation |
| 实时, live, browser | live |

Ambiguous + no `-y` → AskUserQuestion.

## Prerequisites

Before reading any command workflow:

1. **Context**: `maestro spec load --category ui` → if empty → `maestro impeccable load-context`
2. **PRODUCT.md**: missing/placeholder (<200 chars / `[TODO]`) → execute teach first, then resume original task
3. **Register**: identify brand/product → Read `~/.maestro/workflows/impeccable/{brand|product}.md`

## Direct Execution

1. Prerequisites ✓
2. Read `~/.maestro/workflows/impeccable/{command}.md`
3. Follow workflow file instructions
4. TodoWrite: track steps within command
5. Post: suggest logical next command (teach→shape, shape→craft, craft→critique, etc.)

## Chain Execution

1. Prerequisites ✓
2. Create session: `.workflow/.maestro/ui-craft-{YYYYMMDD-HHmmss}/status.json`
   ```json
   { "chain_type": "...", "target": "...", "steps": [...], "current_step": 0,
     "gate_history": [], "loop_count": 0, "status": "running" }
   ```
3. TodoWrite: one item per chain step
4. For each step:
   - Read `~/.maestro/workflows/impeccable/{command}.md` → execute
   - Update status.json (`current_step`, step `status`) + TodoWrite
5. **Quality gate** (critique/audit steps):
   - Parse score: critique `**Total** | | **N/40**`, audit `**Total** | | **N/20**`
   - Count `[P0]` / `[P1]` tags
   - Pass: score ≥ threshold AND P0 == 0 → advance
   - Fail: collect suggested commands from findings → execute → re-gate
   - Max loops exceeded → force advance with warning
6. Final report: scores + trend + commands executed

## Resume

Scan `.workflow/.maestro/ui-craft-*/status.json` for `status == "running"` → most recent → resume from `current_step`.

## Quality Gate — Finding → Command Fallback

When findings lack explicit suggested command:

| Finding Category | Command |
|-----------------|---------|
| Layout, spacing, hierarchy, alignment | layout |
| Color, contrast, palette | colorize |
| Typography, font, readability | typeset |
| Animation, motion, transitions | animate |
| Copy, labels, UX writing | clarify |
| Responsive, mobile, breakpoints | adapt |
| Performance, loading, speed | optimize |
| Complexity, overload, clutter | distill |
| Bland, safe, generic | bolder |
| Aggressive, overwhelming | quieter |
| Onboarding, empty state | onboard |
| Edge cases, i18n, error handling | harden |
| Personality, memorability | delight |

Never auto-select: teach, shape, craft, live, document, extract, overdrive, critique, audit.
