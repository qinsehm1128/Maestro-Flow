---
name: maestro-ralph
description: Adaptive lifecycle engine — infer state, build command chain
argument-hint: "[-y] \"intent\" | status | continue"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Skill
  - AskUserQuestion
---
<purpose>
Closed-loop decision engine for the maestro workflow lifecycle.
Reads project state → infers position → builds adaptive chain → delegates execution.

Entry points:
- **`/maestro-ralph "intent"`** — New session: infer → build → execute
- **`/maestro-ralph continue`** — Resume via maestro-ralph-execute
- **`/maestro-ralph status`** — Display session progress

Three node types:
- **internal**: `Skill()` call (synchronous, lightweight)
- **external**: `maestro delegate --to claude` (context-isolated, heavy computation)
- **decision**: Hand back to ralph for re-evaluation (adaptive branching)

Key difference from maestro coordinator:
- maestro: static chain → one-time selection → runs all steps
- ralph: living chain → decision nodes re-evaluate → chain grows/shrinks dynamically

Session: `.workflow/.maestro/ralph-{YYYYMMDD-HHmmss}/status.json`
Mutual invocation with `/maestro-ralph-execute` forms a self-perpetuating work loop.
</purpose>

<context>
$ARGUMENTS — intent text, flags, or keywords.

**Parse:**
```
-y flag       → auto_confirm = true
.md/.txt path → input_doc (supplementary context only, NEVER substitutes lifecycle stages)
Remaining     → intent
```

**State files:**
- `.workflow/state.json` — artifact registry, milestones, phases
- `.workflow/roadmap.md` — milestone/phase structure
- `.workflow/.maestro/ralph-*/status.json` — ralph session state
</context>

<invariants>
1. **Ralph never executes steps** — only creates sessions and evaluates decisions
2. **Handoff via Skill("maestro-ralph-execute")** — at session creation and after decision evaluation
3. **Decision delegates read-only** — `maestro delegate --role analyze --mode analysis`
4. **External ≠ CLI call** — external spawns full Claude Code session executing the skill command
5. **Delegate sessions non-interactive** — all external skills MUST append `-y` to args inside the prompt
</invariants>

<state_machine>

<states>
S_PARSE_ROUTE     — 解析参数、路由入口                  PERSIST: —
S_STATUS          — 显示 session 进度                   PERSIST: —
S_CONTINUE        — 恢复执行                            PERSIST: —
S_INFER           — 读 state.json、推断生命周期位置      PERSIST: session.lifecycle_position
S_RESOLVE_PHASE   — 解析目标 phase                      PERSIST: session.phase
S_BUILD_CHAIN     — 构建步骤链                           PERSIST: session.steps[]
S_CREATE_SESSION  — 写 status.json                      PERSIST: session (全量)
S_CONFIRM         — 用户确认                             PERSIST: —
S_DISPATCH        — 移交 maestro-ralph-execute           PERSIST: —
S_DECISION_EVAL   — 委托评估质量门                       PERSIST: —
S_APPLY_VERDICT   — 应用裁决 + 插入命令                  PERSIST: session.steps[], session.passed_gates[]
S_FALLBACK        — 请求用户输入                         PERSIST: —
</states>

<transitions>

S_PARSE_ROUTE:
  → S_STATUS        WHEN: intent == "status"
  → S_CONTINUE      WHEN: intent == "continue"
  → S_DECISION_EVAL WHEN: running session with decision step in "running" status
  → S_INFER         WHEN: intent is non-empty
  → S_FALLBACK      WHEN: no intent AND no running session

S_STATUS:
  → END             DO: A_SHOW_STATUS

S_CONTINUE:
  → S_DISPATCH      WHEN: running session found
  → S_FALLBACK      WHEN: no running session               DO: display "无运行中的 ralph 会话"

S_INFER:
  → S_RESOLVE_PHASE WHEN: position resolved                 DO: A_INFER_POSITION
  → S_FALLBACK      WHEN: cannot infer

S_RESOLVE_PHASE:
  → S_BUILD_CHAIN   WHEN: phase resolved or null            DO: A_RESOLVE_PHASE
  → S_FALLBACK      WHEN: ambiguous
                     GUARD: auto_confirm does NOT skip phase ambiguity

S_BUILD_CHAIN:
  → S_CREATE_SESSION DO: A_BUILD_STEPS

S_CREATE_SESSION:
  → S_CONFIRM       WHEN: not auto_confirm                  DO: A_CREATE_SESSION
  → S_DISPATCH      WHEN: auto_confirm                      DO: A_CREATE_SESSION

S_CONFIRM:
  → S_DISPATCH      WHEN: user selects "Proceed"
  → S_BUILD_CHAIN   WHEN: user selects "Edit"
  → END             WHEN: user selects "Cancel"

S_DISPATCH:
  → END             DO: Skill({ skill: "maestro-ralph-execute" })

S_DECISION_EVAL:
  → S_APPLY_VERDICT WHEN: quality-gate (post-verify, post-business-test, post-review, post-test)
                     DO: A_DELEGATE_EVALUATE
  → S_APPLY_VERDICT WHEN: structural (post-milestone, post-debug-escalate)
                     DO: A_STRUCTURAL_EVALUATE

S_APPLY_VERDICT:
  → S_DISPATCH      WHEN: verdict == "proceed"              DO: A_APPLY_PROCEED
  → S_DISPATCH      WHEN: verdict == "fix"                  DO: A_APPLY_FIX
  → S_DISPATCH      WHEN: verdict == "escalate"             DO: A_APPLY_ESCALATE
  → S_DISPATCH      WHEN: post-milestone + next milestone   DO: A_ADVANCE_MILESTONE
  → END             WHEN: post-milestone + no next milestone DO: mark completed
  → END             WHEN: post-debug-escalate (always STOP)  DO: A_PAUSE_ESCALATE
  GUARD: retry_count >= max_retries → force escalate
  GUARD: confidence_score < 60 AND proceed → override to fix
  GUARD: confidence_score > 95 AND fix AND retry > 0 → suggest proceed
  GUARD: auto_confirm → skip user prompt, apply adjusted verdict
  GUARD: not auto_confirm → AskUserQuestion with override options

S_FALLBACK:
  → S_PARSE_ROUTE   WHEN: user provides input               DO: AskUserQuestion
  → END             WHEN: user cancels

</transitions>

<actions>

### A_SHOW_STATUS

1. Find latest ralph session (by created_at)
2. Display: Session, Status, Position, Progress, Current step
3. List steps: [✓] completed, [▸] current, [ ] pending, [◆] decision

### A_INFER_POSITION

**Intent-based override:** brainstorm/头脑风暴/探索/ideate/设计思路 → position = `brainstorm`

**Bootstrap detection:**

| Condition | Position |
|-----------|----------|
| No `.workflow/` + no source files | `brainstorm` |
| No `.workflow/` + has source files | `init` |
| Has `.workflow/` but no state.json | `init` |
| Has state.json | → artifact-based inference |

**Artifact-based inference:** Filter by current_milestone + target phase:

| Latest artifact type | Position |
|---------------------|----------|
| no milestones or no roadmap.md | `roadmap` |
| none for phase | `analyze` |
| analyze | `plan` |
| plan | `execute` |
| execute | `verify` |
| verify | → refine from result files |

**Refine from verify results:**

| Condition | Position |
|-----------|----------|
| verification.json: passed==false or gaps[] | `verify-failed` |
| passed==true, no review.json | `business-test` |
| review.json: verdict=="BLOCK" | `review-failed` |
| review.json: verdict!="BLOCK" | `test` |
| uat.md: all passed | `milestone-audit` |
| uat.md: has failures | `test-failed` |

### A_RESOLVE_PHASE

Priority: 1) regex from intent 2) latest artifact's phase 3) first incomplete phase 4) null if brainstorm/init/roadmap 5) AskUserQuestion if ambiguous

### A_BUILD_STEPS

Generate steps from lifecycle_position to milestone-complete:

| Stage | Skill | Type | Decision after |
|-------|-------|------|----------------|
| brainstorm | `maestro-brainstorm "{intent}"` | external | — |
| init | `maestro-init` | internal | — |
| roadmap | `maestro-roadmap "{intent}"` | internal | — |
| analyze | `maestro-analyze {phase}` | external | — |
| plan | `maestro-plan {phase}` | internal | — |
| execute | `maestro-execute {phase}` | external | — |
| verify | `maestro-verify {phase}` | internal | `post-verify` |
| business-test | `quality-auto-test {phase}` | internal | `post-business-test` |
| review | `quality-review {phase}` | internal | `post-review` |
| test-gen | `quality-auto-test {phase}` | internal | — |
| test | `quality-test {phase}` | internal | `post-test` |
| milestone-audit | `maestro-milestone-audit` | internal | — |
| milestone-complete | `maestro-milestone-complete` | internal | `post-milestone` |

Type rationale: `internal` = Skill(), lightweight/interactive; `external` = delegate --to claude, context-isolated heavy computation

Build rules: start from position, skip completed, insert decision nodes with `{ retry_count: 0, max_retries: 2 }`, args use placeholders resolved at execution time by ralph-execute

### A_CREATE_SESSION

1. Write `.workflow/.maestro/ralph-{YYYYMMDD-HHmmss}/status.json` (see Appendix: Session Schema)
2. Display chain overview with step list

### A_DELEGATE_EVALUATE

1. Resolve artifact dir: `.workflow/scratch/{artifact.path}/` with fallback glob
2. Parse decision metadata: `{ decision, retry_count, max_retries }`
3. Map result files:
   | Decision | Files |
   |----------|-------|
   | post-verify | verification.json |
   | post-business-test | .tests/auto-test/report.json |
   | post-review | review.json |
   | post-test | uat.md, .tests/test-results.json |
4. Check artifact for confidence section → include as signal
5. Execute delegate (run_in_background, STOP, wait for callback):
   ```
   maestro delegate "PURPOSE: 评估 {decision} 质量门结果
   TASK: 读取结果 | 分析状态 | 评估严重性 | 给出建议
   EXPECTED: ---VERDICT--- STATUS/REASON/GAP_SUMMARY/CONFIDENCE(high|medium|low)/CONFIDENCE_SCORE(0-100)/WEAKEST_DIMENSION ---END---
   CONSTRAINTS: 只评估 | 置信度<60% 倾向 fix | retry {n}/{max} 达上限必须 escalate"
   --role analyze --mode analysis
   ```
6. On callback: parse verdict; if parse fails → fallback STATUS="fix"
7. Confidence adjustment: <60 + proceed → fix; >95 + fix + retry>0 → suggest proceed

### A_STRUCTURAL_EVALUATE

**post-milestone:** Read state.json → next milestone? → insert lifecycle steps / complete
**post-debug-escalate:** Always STOP → set paused, display "请人工介入"

### A_APPLY_PROCEED

1. Mark decision completed, write status.json
2. Display: ◆ Decision: {type} → proceed ({reason})

### A_APPLY_FIX

1. Insert fix-loop commands after current step (see Appendix: Fix-Loop Templates)
2. Reindex steps, increment retry_count, write status.json
3. Display: ◆ Decision: {type} → fix, +{N} commands inserted

### A_APPLY_ESCALATE

1. Insert `[quality-debug "{gap_summary}", decision:post-debug-escalate]`
2. Increment retry_count, reindex, write status.json

### A_ADVANCE_MILESTONE

1. Update session: milestone, phase, reset passed_gates
2. Insert full lifecycle steps for next milestone
3. Reindex, write status.json

### A_PAUSE_ESCALATE

1. Set session status = "paused", write status.json
2. Display: ◆ 已达最大重试次数，debug 已执行。请人工介入。
3. Display: /maestro-ralph continue 恢复

</actions>

</state_machine>

<appendix>

### Session Schema

```json
{
  "session_id": "ralph-{YYYYMMDD-HHmmss}",
  "source": "ralph", "status": "running",
  "intent": "", "lifecycle_position": "",
  "phase": null, "milestone": "",
  "auto_mode": false, "quality_mode": "standard",
  "cli_tool": "claude", "passed_gates": [],
  "context": { "issue_id": null, "scratch_dir": null, "plan_dir": null,
    "analysis_dir": null, "brainstorm_dir": null },
  "steps": [{ "index": 0, "type": "internal|external|decision",
    "skill": "", "args": "", "status": "pending" }],
  "waves": [], "current_step": 0
}
```

### Fix-Loop Templates

**post-verify:**
```
quality-debug "{gap_summary}"
maestro-plan --gaps {phase}
maestro-execute {phase}                [external]
maestro-verify {phase}
decision:post-verify {retry+1}
```

**post-business-test:**
```
quality-debug --from-business-test "{gap_summary}"
maestro-plan --gaps {phase}
maestro-execute {phase}                [external]
maestro-verify {phase}
decision:post-verify {retry: 0}
quality-auto-test {phase}
decision:post-business-test {retry+1}
```

**post-review:**
```
quality-debug "{gap_summary}"
maestro-plan --gaps {phase}
maestro-execute {phase}                [external]
quality-review {phase}
decision:post-review {retry+1}
```

**post-test:**
```
quality-debug --from-uat "{gap_summary}"
maestro-plan --gaps {phase}
maestro-execute {phase}                [external]
maestro-verify {phase}
decision:post-verify {retry: 0}
quality-auto-test {phase}
decision:post-business-test {retry: 0}
quality-review {phase}
decision:post-review {retry: 0}
quality-auto-test {phase}
quality-test {phase}
decision:post-test {retry+1}
```

### Error Codes

| Code | Severity | Description | Recovery |
|------|----------|-------------|----------|
| E001 | error | No intent and no running session | Prompt for intent |
| E002 | error | Cannot infer lifecycle position | Show raw state, ask |
| E003 | error | Artifact dir not found for decision | Show glob, ask |
| E004 | error | Delegate verdict parse failed | Fallback: "fix" |
| E005 | error | Delegate execution failed | Fallback: "fix" |
| W001 | warning | Decision expanded chain | Auto-handled |
| W002 | warning | Max retries, escalating | Auto-handled |
| W003 | warning | Multiple running sessions | Use latest, warn |
| W004 | warning | Low delegate confidence | Show warning |

### Success Criteria

- [ ] State parsed, position inferred from bootstrap + artifacts + result files
- [ ] Quality pipeline generated: verify → business-test → review → test-gen → test
- [ ] Decision nodes delegate-evaluated via maestro delegate --role analyze
- [ ] Verdict parsed with confidence adjustment
- [ ] Fix-loop templates applied with retry tracking
- [ ] Ralph never executes steps — only creates sessions and evaluates decisions
- [ ] Handoff to maestro-ralph-execute via Skill() at creation and after decisions

</appendix>
