---
name: maestro-impeccable
description: Production-grade UI design — 24 commands + chain orchestration with quality gates + design search
argument-hint: "<command|chain|intent> [target] [flags]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, request_user_input
---

<purpose>
Sequential UI design skill. Parse input → prerequisites → read workflow file → execute → track via status.json.

- **Direct**: single command via workflow file
- **Chain**: orchestrate command sequence with quality gates
- **Search**: query design knowledge base via CLI
</purpose>

<context>
$ARGUMENTS first word determines mode:

| First Word | Mode |
|------------|------|
| Known command (see routing table) | Direct |
| Chain name: build, redesign, improve, enhance, launch, harden, foundation, live | Chain |
| continue / next / -c | Resume |
| search | Search: `maestro impeccable search "$REST"` |
| Free text (concrete task) | Direct craft — has specific target + specs/reference |
| Free text (project intent) | Intent → classify → chain |
| (empty) | Menu: show commands by category |

**Common flags**: `-y` (auto-confirm), `--skip-harvest`, `--skip-design`, `--styles <N>`
**Chain flags**: `--threshold <N>` (default 26/40), `--max-loops <N>` (default 3)
</context>

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
- `{cmd...}` = enhance supports multiple commands, comma-separated: `enhance colorize,typeset target`

## Free Text Routing

Three-layer priority matching. Stop on first match.

### Layer 1: Intent matches single command → Direct

Match user description against Command Routing descriptions. Route to the closest single command.

| Intent signal | Command |
|---------------|---------|
| review, UX check, heuristic, 评审, 评分 | critique |
| a11y, audit, accessibility, performance audit, 技术检查 | audit |
| animation, motion, transitions, 动效, 加动画 | animate |
| color, palette, contrast, OKLCH, 配色, 颜色 | colorize |
| typography, font, type scale, 字体, 排版 | typeset |
| layout, spacing, grid, alignment, 布局, 间距 | layout |
| tone down, too loud, 太花, 视觉噪音 | quieter |
| too bland, bolder, more personality, 太平淡 | bolder |
| simplify, strip, too complex, cognitive load, 太复杂 | distill |
| polish, micro-adjust, pixel perfect, 打磨 | polish |
| copy, labels, error messages, UX writing, 文案 | clarify |
| responsive, mobile, breakpoints, 适配 | adapt |
| performance, loading, bundle, jank, 性能 | optimize |
| edge cases, error states, i18n, overflow, 边界 | harden |
| onboarding, first-run, empty state, 引导 | onboard |
| delight, personality, joy, memorable, 趣味 | delight |
| extraordinary, push limits, 炫酷, 极限 | overdrive |
| plan UX, wireframe, information architecture, 规划 | shape |
| variants, compare styles, multi-style, 多风格 | explore |
| PRODUCT.md, brand definition, 品牌定义 | teach |
| DESIGN.md, design documentation, 设计文档 | document |
| pull tokens, extract components, 提取组件 | extract |
| browser iteration, 实时迭代 | live |

### Layer 2: Concrete build task → Direct craft

Layer 1 missed, but intent is "build/create specific thing":
- Has specific file path or target
- Has detailed visual specs (layout, style, palette)
- Has reference material

→ Route to **craft** (Direct)

### Layer 3: Project intent → Chain

Layer 1+2 missed, broad project direction:

| Pattern | Chain |
|---------|-------|
| create, build, new, from scratch | build |
| redesign, rethink, restyle | redesign |
| improve, iterate, better | improve |
| enhance, visual upgrade | enhance |
| launch, deploy, ship, production-ready | launch |
| harden, production, edge cases | harden |
| design system, tokens, design spec | foundation |
| live, browser | live |

Ambiguous + no `-y` → `request_user_input`.

<invariants>
1. Prerequisites before any design work — never skip context loading or register detection
2. Read workflow file before execution — never execute a command without loading its .md
3. Interactive gates respected — teach, shape, craft retain user confirmation gates
4. status.json before chain steps — session created before any chain step runs
</invariants>

## Prerequisites

Before reading any command workflow:

1. **Context**: `maestro spec load --category ui` → if empty → `maestro impeccable load-context`
2. **PRODUCT.md**: missing/placeholder (<200 chars / `[TODO]`) → execute teach first, then resume original task
3. **Register**: identify brand/product → Read `~/.maestro/workflows/impeccable/{brand|product}.md`

## Direct Execution

1. Prerequisites ✓
2. **显示执行信息**：
   ```
   ── Command: {command} ────────────────────
   Category: {category} | Target: {target}
   ─────────────────────────────────────────
   ```
3. Read `~/.maestro/workflows/impeccable/{command}.md`
4. **TodoWrite 跟踪**：按 workflow 文件中的主要阶段创建 todo 项
   - 格式：`[{command}] {phase description}`
   - 每个阶段完成后立即标记 completed
5. Follow workflow file instructions
6. Post: suggest logical next command (teach→shape, shape→craft, craft→critique, etc.)

## Chain Execution

1. Prerequisites ✓
2. **显示执行链**：解析 chain 定义，输出完整步骤预览：
   ```
   ── Chain: build ──────────────────────────
    1. teach        (conditional: PRODUCT.md missing)
    2. explore      (conditional: DESIGN.md missing)
    3. shape
    4. craft
    5. critique     ◆ quality gate (threshold: 26/40)
    6. [refine]     ↺ auto-fix loop (max: 3)
    7. audit        ◆ quality gate (threshold: 14/20)
    8. polish
   ─────────────────────────────────────────
   Target: {target}
   ```
   - `◆` 标记 quality gate 步骤，显示阈值
   - `↺` 标记 refine loop，显示最大循环次数
   - conditional 步骤注明触发条件
   - 跳过的 conditional 步骤标记 `(skipped)`
3. Create session: `.workflow/.maestro/ui-craft-{YYYYMMDD-HHmmss}/status.json`
   ```json
   { "chain_type": "...", "target": "...", "steps": [...], "current_step": 0,
     "gate_history": [], "loop_count": 0, "status": "running" }
   ```
4. **TodoWrite 初始化**：为 chain 所有步骤创建 todo 项
   - 每步一项，格式：`[chain] step N: {command} — {description}`
   - conditional 步骤若跳过，立即标记 completed
   - quality gate 步骤标注阈值：`[chain] step 5: critique ◆ gate ≥26/40`
5. For each step:
   - Read `~/.maestro/workflows/impeccable/{command}.md` → execute
   - **步骤开始**：TodoWrite 标记当前步骤 in_progress
   - **步骤完成**：TodoWrite 标记 completed + update status.json (`current_step`, step `status`)
   - **步骤失败**：TodoWrite 标记 completed(with note) + 记录原因
6. **Quality gate** (critique/audit steps):
   - Parse score: critique `**Total** | | **N/40**`, audit `**Total** | | **N/20**`
   - Count `[P0]` / `[P1]` tags
   - Pass: score ≥ threshold AND P0 == 0 → advance
   - Fail: collect suggested commands from findings → execute → re-gate
   - Max loops exceeded → force advance with warning
   - TodoWrite：gate 结果记入当前步骤备注（score, P0/P1 count, pass/fail）
7. Final report: scores + trend + commands executed

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
