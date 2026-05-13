---
name: maestro-ralph
description: Adaptive lifecycle engine -- infer state, build command chain
argument-hint: "\"intent\" [-y] | status | continue | execute"
allowed-tools: spawn_agents_on_csv, Read, Write, Edit, Bash, Glob, Grep, request_user_input
---

<purpose>
Closed-loop decision engine for the maestro workflow lifecycle.
Coordinator assembles fully-resolved skill calls → spawns via `spawn_agents_on_csv` →
delegates evaluation at decision nodes → dynamically expands/shrinks chain.

Entry points:
- **`$maestro-ralph "intent"`** — New session: infer → build chain → execute
- **`$maestro-ralph execute`** / **`continue`** — Resume: next wave(s) until decision or completion
- **`$maestro-ralph status`** — Display session progress

Two node types:
- **external**: Executed via `spawn_agents_on_csv`. Barrier steps solo; non-barriers parallel.
- **decision**: Delegate evaluation via `maestro delegate --role analyze`, then expand/proceed/escalate.

Session at `.workflow/.maestro/ralph-{YYYYMMDD-HHmmss}/status.json`.
</purpose>

<context>
$ARGUMENTS — intent text, flags, or keywords.

**Parse:**
```
-y / --yes    → auto_mode = true
.md/.txt path → input_doc (supplementary context, NEVER substitutes lifecycle stages)
Remaining     → intent
```

**`-y` downstream propagation** (appended to skill_call in CSV):

| Skill | Flag | Effect |
|-------|------|--------|
| maestro-init | `-y` | 跳过交互提问 |
| maestro-analyze | `-y` | 跳过 scoping 交互 |
| maestro-brainstorm | `-y` | 跳过交互提问 |
| maestro-roadmap | `-y` | 跳过交互选择 |
| maestro-plan | `-y` | 跳过确认和澄清 |
| maestro-execute | `-y` | 跳过确认，blocked 自动继续 |
| quality-auto-test | `-y` | 跳过计划确认 |
| quality-test | `-y --auto-fix` | 自动触发 gap-fix loop |
| maestro-milestone-complete | `-y` | 跳过 knowledge promotion 交互 |
| maestro-verify | `-y` | 跳过交互确认 |
| quality-review | `-y` | 跳过交互确认 |
| quality-debug | `-y` | 跳过交互确认 |
| maestro-milestone-audit | `-y` | 跳过交互确认 |

**State files:**
- `.workflow/state.json` — artifact registry, milestones, phases
- `.workflow/roadmap.md` — milestone/phase structure
- `.workflow/.maestro/ralph-*/status.json` — ralph session state
</context>

<invariants>
1. **ALL external steps via spawn_agents_on_csv** — coordinator NEVER executes skill logic directly
2. **Coordinator = prompt assembler** — classify → enrich args → build CSV → spawn → read results → assemble next
3. **Decision nodes delegate-evaluate** — use `maestro delegate --role analyze`; structural decisions (post-milestone, post-debug-escalate) evaluated directly
4. **Barrier = solo wave** — analyze, plan, execute, brainstorm, roadmap always run alone
5. **Non-barriers can parallel** — consecutive non-barrier, non-decision external steps grouped into one wave
6. **Wave-by-wave** — never start wave N+1 before wave N results are read
7. **Coordinator owns context** — sub-agents never read prior results; coordinator assembles full skill_call
8. **Quality mode governs steps** — full/standard/quick determines which quality stages are included
9. **passed_gates skip** — already-passed gates not re-run in retry loops (unless code changed)
</invariants>

<state_machine>

<states>
S_PARSE_ROUTE     — 解析参数、路由入口点                PERSIST: —
S_STATUS          — 显示 session 进度后结束             PERSIST: —
S_INFER           — 读 state.json、推断生命周期位置      PERSIST: session.lifecycle_position
S_RESOLVE_PHASE   — 解析目标 phase 编号                 PERSIST: session.phase
S_QUALITY_MODE    — 确定质量模式 full/standard/quick     PERSIST: session.quality_mode
S_BUILD_CHAIN     — 从 position 构建步骤链               PERSIST: session.steps[]
S_CREATE_SESSION  — 写 status.json、初始化 tracking      PERSIST: session (全量写入)
S_CONFIRM         — 用户确认（auto_mode 跳过）            PERSIST: —
S_LOAD_NEXT       — 加载 session、找下一个 pending step   PERSIST: —
S_WAVE_EXEC       — 构建并执行 wave（external 节点）      PERSIST: session.waves[], session.current_step, session.context
S_DECISION_EVAL   — 委托评估质量门（decision 节点）       PERSIST: —
S_APPLY_VERDICT   — 应用裁决（proceed/fix/escalate）     PERSIST: session.passed_gates[], step.retry_count
S_FIX_LOOP        — 插入修复步骤、重索引                  PERSIST: session.steps[] (expanded), session.passed_gates = []
S_COMPLETE        — 标记完成、释放目标                    PERSIST: session.status = "completed"
S_PAUSED          — 暂停等待人工介入                      PERSIST: session.status = "paused"
S_FALLBACK        — 条件不匹配、请求用户输入              PERSIST: session.status = "paused"
</states>

<transitions>

S_PARSE_ROUTE:
  → S_STATUS        WHEN: intent == "status"
  → S_LOAD_NEXT     WHEN: intent == "execute" | "continue"
  → S_DECISION_EVAL WHEN: running session with decision step in "running" status
  → S_INFER         WHEN: intent is non-empty
  → S_FALLBACK      WHEN: no intent AND no running session

S_STATUS:
  → END             DO: A_SHOW_STATUS

S_INFER:
  → S_RESOLVE_PHASE WHEN: position resolved                DO: A_INFER_POSITION
  → S_FALLBACK      WHEN: cannot infer                     DO: show raw state

S_RESOLVE_PHASE:
  → S_QUALITY_MODE  WHEN: phase resolved or null (brainstorm/init/roadmap)  DO: A_RESOLVE_PHASE
  → S_FALLBACK      WHEN: ambiguous AND auto_mode does NOT skip this

S_QUALITY_MODE:
  → S_BUILD_CHAIN   DO: A_DETERMINE_QUALITY_MODE

S_BUILD_CHAIN:
  → S_CREATE_SESSION DO: A_BUILD_STEPS

S_CREATE_SESSION:
  → S_CONFIRM       WHEN: not auto_mode                    DO: A_CREATE_SESSION
  → S_LOAD_NEXT     WHEN: auto_mode                        DO: A_CREATE_SESSION

S_CONFIRM:
  → S_LOAD_NEXT     WHEN: user confirms "Proceed"
  → S_BUILD_CHAIN   WHEN: user selects "Edit"
  → S_QUALITY_MODE  WHEN: user selects "Change quality mode"
  → S_PAUSED        WHEN: user selects "Cancel"

S_LOAD_NEXT:
  → S_DECISION_EVAL WHEN: next_step.type == "decision"
  → S_WAVE_EXEC     WHEN: next_step.type == "external"
  → S_COMPLETE      WHEN: no pending steps

S_WAVE_EXEC:
  → S_LOAD_NEXT     WHEN: wave completed successfully      DO: A_BUILD_AND_SPAWN_WAVE
  → S_PAUSED        WHEN: step failed AND auto_mode
                     GUARD: auto_mode → retry once then pause
  → S_PAUSED        WHEN: step failed AND not auto_mode
                     DO: mark remaining skipped

S_DECISION_EVAL:
  → S_APPLY_VERDICT WHEN: quality-gate decision (post-verify, post-business-test, post-review, post-test)
                     DO: A_DELEGATE_EVALUATE
  → S_APPLY_VERDICT WHEN: structural decision (post-milestone, post-debug-escalate)
                     DO: A_STRUCTURAL_EVALUATE

S_APPLY_VERDICT:
  → S_LOAD_NEXT     WHEN: verdict == "proceed"             DO: A_APPLY_PROCEED
  → S_FIX_LOOP      WHEN: verdict == "fix"                 DO: A_APPLY_FIX
  → S_PAUSED        WHEN: verdict == "escalate"            DO: A_APPLY_ESCALATE
  → S_LOAD_NEXT     WHEN: post-milestone + has next milestone  DO: A_ADVANCE_MILESTONE
  → S_COMPLETE      WHEN: post-milestone + no next milestone
  → S_PAUSED        WHEN: post-debug-escalate (always, regardless of -y)
  GUARD: retry_count >= max_retries → force escalate
  GUARD: confidence_score < 60 AND verdict == "proceed" → override to "fix"
  GUARD: confidence_score > 95 AND verdict == "fix" AND retry_count > 0 → suggest "proceed"
  GUARD: auto_mode → skip user prompt, apply adjusted verdict directly
  GUARD: not auto_mode → request_user_input with override options

S_FIX_LOOP:
  → S_LOAD_NEXT     DO: A_INSERT_FIX_LOOP

S_COMPLETE:
  → END             DO: A_FINALIZE

S_PAUSED:
  → END             DO: A_PAUSE_SESSION

S_FALLBACK:
  → S_PARSE_ROUTE   WHEN: user provides input              DO: request_user_input
  → END             WHEN: user cancels

</transitions>

<actions>

### A_SHOW_STATUS

1. Find latest ralph session (by created_at)
2. Display: Session, Status, Position, Quality, Progress, Current step
3. List all steps with status markers: [✓] completed, [▸] current, [ ] pending, [◆] decision

### A_INFER_POSITION

**Intent-based override:** If intent matches brainstorm pattern (contains "brainstorm", "头脑风暴", "探索", "ideate", "设计思路") → position = `brainstorm`

**Bootstrap detection:**

| Condition | Position |
|-----------|----------|
| No `.workflow/` + no source files | `brainstorm` |
| No `.workflow/` + has source files | `init` |
| Has `.workflow/` but no state.json | `init` |
| Has state.json | → artifact-based inference |

**Artifact-based inference:** Filter by `milestone == current_milestone`, target phase. Find latest completed artifact:

| Latest artifact type | Position |
|---------------------|----------|
| none for phase | `analyze` |
| analyze | `plan` |
| plan | `execute` |
| execute | `verify` |
| verify | → refine from result files |

**Refine from verify results** (read `{artifact_dir}/`):

| Condition | Position |
|-----------|----------|
| verification.json: passed==false or gaps[] non-empty | `verify-failed` |
| passed==true, no review.json, has auto-test report | `review` |
| passed==true, no review.json, no auto-test report | `business-test` (full) / `review` (standard/quick) |
| review.json: verdict=="BLOCK" | `review-failed` |
| review.json: verdict!="BLOCK" | `test` |
| uat.md: all passed | `milestone-audit` |
| uat.md: has failures | `test-failed` |

**resolve_artifact_dir:** `.workflow/scratch/{artifact.path}/` with fallback glob `*-P{phase}-*/ sorted by date DESC`

### A_RESOLVE_PHASE

Priority order:
1. Regex from intent: `phase\s*(\d+)` or bare number
2. Latest in-progress artifact's phase field
3. First incomplete phase in current milestone's `phases[]`
4. `null` if position is brainstorm/init/roadmap (deferred)
5. `request_user_input` if ambiguous (auto_mode does NOT skip this)

### A_DETERMINE_QUALITY_MODE

| Condition | Mode | Quality pipeline |
|-----------|------|-----------------|
| Has requirements/REQ-*.md + phase scope | `full` | verify → business-test → review → test-gen → test |
| Default | `standard` | verify → review → test (test-gen if coverage < 80%) |
| User explicit `--quality quick` | `quick` | verify → review --tier quick |

### A_BUILD_STEPS

**Lifecycle stages** (start from inferred position, skip completed, filter by quality_mode):

| Stage | Skill | Barrier | Decision after |
|-------|-------|---------|----------------|
| brainstorm | `maestro-brainstorm "{intent}"` | yes | — |
| init | `maestro-init` | no | — |
| roadmap | `maestro-roadmap "{intent}"` | yes | — |
| analyze | `maestro-analyze {phase}` | yes | — |
| plan | `maestro-plan {phase}` | yes | — |
| execute | `maestro-execute {phase}` | yes | — |
| verify | `maestro-verify {phase}` | no | `post-verify` |
| business-test | `quality-auto-test {phase}` | no | `post-business-test` (full only) |
| review | `quality-review {phase}` | no | `post-review` |
| test-gen | `quality-auto-test {phase}` | no | — (full; standard if coverage < 80%) |
| test | `quality-test {phase}` | no | `post-test` |
| milestone-audit | `maestro-milestone-audit` | no | — |
| milestone-complete | `maestro-milestone-complete` | no | `post-milestone` |

**Build rules:**
1. Start from inferred position, skip completed stages
2. Filter by quality_mode
3. After decision-triggering stages, insert decision node: `{ type: "decision", retry_count: 0, max_retries: 2 }`
4. Conditional steps (test-gen in standard) use: `{ condition: "check_coverage", threshold: 80 }`

### A_CREATE_SESSION

1. Write `.workflow/.maestro/ralph-{YYYYMMDD-HHmmss}/status.json`:
   ```json
   { "session_id", "source": "ralph", "intent", "status": "running",
     "lifecycle_position", "phase", "milestone", "auto_mode", "quality_mode",
     "passed_gates": [], "context": { "issue_id", "scratch_dir", "plan_dir",
     "analysis_dir", "brainstorm_dir" },
     "steps": [...], "waves": [], "current_step": 0 }
   ```
2. `create_goal({ objective: "Ralph lifecycle: {position} → milestone-complete | {N} steps | quality={mode}" })`
3. `update_plan({ plan: steps.map(step => { step: label, status: "pending" }) })`
4. Display chain overview with step list

### A_BUILD_AND_SPAWN_WAVE

1. **Conditional step evaluation**: `check_coverage` → read validation.json; if `coverage >= threshold` → skip
2. **buildNextWave**: barrier → solo; non-barrier → batch consecutive non-barrier, non-decision steps; stop at decision
3. **buildSkillCall** per step:
   - Resolve placeholders: `{phase}`, `{intent}`, `{scratch_dir}`, `{plan_dir}`, `{analysis_dir}`
   - Apply enrichment:
     | Skill | Enrichment |
     |-------|-----------|
     | maestro-plan | resolve latest analyze artifact → `--dir .workflow/scratch/{path}` |
     | maestro-execute | resolve latest plan artifact → `--dir .workflow/scratch/{path}` |
     | quality-debug | append gap_summary or `--from-uat`/`--from-business-test` |
   - Append auto flag if auto_mode (see context: -y propagation table)
4. Write `{sessionDir}/wave-{N}.csv` (columns: id, skill_call, topic)
5. `spawn_agents_on_csv({ csv_path, id_column: "id", instruction: WAVE_INSTRUCTION, max_workers, max_runtime_seconds: 3600, output_csv_path, output_schema: RESULT_SCHEMA })`
6. Read results → update step statuses
7. **Barrier context update**:
   | Barrier | Read | Update |
   |---------|------|--------|
   | maestro-analyze | context.md, state.json | context.analysis_dir |
   | maestro-plan | plan.json | context.plan_dir |
   | maestro-execute | results | context.exec_status |
   | maestro-brainstorm | .brainstorming/ | context.brainstorm_dir |
   | maestro-roadmap | specs/ | context.spec_session_id |
8. Persist: write status.json + sync update_plan

### A_DELEGATE_EVALUATE

1. Read decision metadata: `{ decision, retry_count, max_retries }`
2. Resolve result files:
   | Decision | Files |
   |----------|-------|
   | post-verify | verification.json |
   | post-business-test | .tests/auto-test/report.json |
   | post-review | review.json |
   | post-test | uat.md, .tests/test-results.json |
3. Check artifact for existing confidence section → include as signal
4. Execute delegate:
   ```
   maestro delegate "PURPOSE: 评估 {decision} 质量门结果
   TASK: 读取结果文件 | 分析通过/失败 | 评估严重性 | 给出建议
   MODE: analysis
   CONTEXT: @{result_files}
   EXPECTED: ---VERDICT---
   STATUS: proceed | fix | escalate
   REASON: 一句话
   GAP_SUMMARY: 问题描述
   CONFIDENCE: high | medium | low
   CONFIDENCE_SCORE: 0-100
   WEAKEST_DIMENSION: 最弱维度
   ---END---
   CONSTRAINTS: 只评估 | 置信度<60% 倾向 fix | retry {n}/{max} 达上限必须 escalate"
   --role analyze --mode analysis
   ```
5. Parse verdict; if parse fails → fallback: STATUS="fix", GAP_SUMMARY=generic
6. **Confidence adjustment**:
   - score < 60 AND STATUS=="proceed" → override to "fix"
   - score > 95 AND STATUS=="fix" AND retry_count > 0 → suggest "proceed"

### A_STRUCTURAL_EVALUATE

**post-milestone:**
1. Read state.json → check next milestone (pending/active)
2. If found: update session (milestone, phase, reset passed_gates), re-infer quality_mode, insert lifecycle steps
3. If none: proceed → session completes naturally

**post-debug-escalate:**
1. Set session status = "paused"
2. Display: ◆ 已达最大重试次数，debug 已执行。请人工介入。
3. STOP (always, regardless of -y)

### A_APPLY_PROCEED

1. Add gate to `passed_gates[]`
2. Mark decision step "completed"
3. Write status.json + sync update_plan
4. Display: ◆ Decision: {type} → proceed ({reason})
5. If auto_mode: continue; else: STOP with "⏸ 使用 $maestro-ralph execute 继续"

### A_APPLY_FIX

1. Clear `passed_gates = []` (code will change via execute)
2. Increment triggering decision's `retry_count`
3. Transition to S_FIX_LOOP

### A_APPLY_ESCALATE

1. Insert `[quality-debug "{gap_summary}", decision:post-debug-escalate]` after current
2. Increment `retry_count`
3. Reindex steps, write status.json

### A_INSERT_FIX_LOOP

Select fix-loop template by decision type, insert after current position, reindex all steps:

**post-verify:**
```
quality-debug "{gap_summary}"
maestro-plan --gaps {phase}           [barrier]
maestro-execute {phase}               [barrier]
maestro-verify {phase}
decision:post-verify {retry+1}
```

**post-business-test (full mode):**
```
quality-debug --from-business-test "{gap_summary}"
maestro-plan --gaps {phase}           [barrier]
maestro-execute {phase}               [barrier]
maestro-verify {phase}
decision:post-verify {retry: 0}
quality-auto-test {phase}
decision:post-business-test {retry+1}
```

**post-review:**
```
quality-debug "{gap_summary}"
maestro-plan --gaps {phase}           [barrier]
maestro-execute {phase}               [barrier]
maestro-verify {phase}
decision:post-verify {retry: 0}
quality-review {phase}
decision:post-review {retry+1}
```

**post-test:**
```
quality-debug --from-uat "{gap_summary}"
maestro-plan --gaps {phase}           [barrier]
maestro-execute {phase}               [barrier]
maestro-verify {phase}
decision:post-verify {retry: 0}
quality-auto-test {phase}                          # full only
decision:post-business-test {retry: 0}             # full only
quality-review {phase}
decision:post-review {retry: 0}
quality-auto-test {phase}                          # full; standard if coverage < 80%
quality-test {phase}
decision:post-test {retry+1}
```

### A_ADVANCE_MILESTONE

1. Read state.json → find next milestone
2. Update session: milestone, phase, reset passed_gates
3. Re-infer quality_mode via A_DETERMINE_QUALITY_MODE
4. Build new lifecycle steps via A_BUILD_STEPS for next milestone
5. Insert steps, reindex, write status.json

### A_FINALIZE

1. Set `session.status = "completed"`, write status.json
2. Sync update_plan: all steps → "completed"
3. `update_goal({ status: "complete" })` — release goal constraint
4. Display completion report with step list and wave count

### A_PAUSE_SESSION

1. Set `session.status = "paused"`, write status.json
2. Do NOT call update_goal — goal stays for resume
3. Display: ⏸ 使用 $maestro-ralph execute 继续

</actions>

</state_machine>

<appendix>

### Session JSON Schema

```json
{
  "session_id": "ralph-{YYYYMMDD-HHmmss}",
  "source": "ralph",
  "created_at": "ISO", "updated_at": "ISO",
  "intent": "", "status": "running|paused|completed",
  "lifecycle_position": "", "phase": null,
  "milestone": null, "auto_mode": false,
  "quality_mode": "standard",
  "passed_gates": [],
  "context": {
    "issue_id": null, "milestone_num": null, "spec_session_id": null,
    "scratch_dir": null, "plan_dir": null, "analysis_dir": null, "brainstorm_dir": null
  },
  "steps": [{ "index": 0, "type": "external|decision", "skill": "", "args": "",
    "barrier": false, "status": "pending", "wave_n": null }],
  "waves": [], "current_step": 0
}
```

### Worker Contract

```
你是 CSV job 子 agent。
执行技能调用：{skill_call}
任务说明：{topic}
限制：不要修改 .workflow/.maestro/ 下的 status 文件
完成后调用 `report_agent_job_result`，返回：
{"status":"completed|failed","skill_call":"{skill_call}","summary":"一句话结果","artifacts":"产物路径","error":"失败原因"}
```

Result schema: `{ status, skill_call, summary, artifacts, error }` — all string

### Wave CSV Schema

```csv
id,skill_call,topic
"3","$maestro-verify 1","Ralph step 3/14: verify phase 1"
```

Rules: skill_call from buildSkillCall(); decision nodes NEVER in CSV; barrier → single-row; non-barrier → multi-row

### Error Codes

| Code | Severity | Description | Recovery |
|------|----------|-------------|----------|
| E001 | error | No intent and no running session | Prompt for intent |
| E002 | error | Cannot infer lifecycle position | Show raw state, ask user |
| E003 | error | Artifact dir not found for decision | Show glob results, ask user |
| E004 | error | Delegate verdict parse failed | Fallback: treat as "fix" |
| E005 | error | Delegate execution failed | Fallback: treat as "fix" |
| E006 | error | Wave timeout | Mark step failed, pause |
| E007 | error | No session found for execute/continue | Suggest $maestro-ralph "intent" |
| W001 | warning | Decision node expanded chain | Auto-handled, log expansion |
| W002 | warning | Max retries reached, escalating | Auto-handled |
| W003 | warning | Multiple running sessions found | Use latest, warn user |
| W004 | warning | Delegate confidence == "low" | Show warning in interactive |

### Success Criteria

- [ ] state.json parsed with actual schema (type, path, scope, milestone, depends_on)
- [ ] Lifecycle position inferred from bootstrap + artifact chain + result files
- [ ] Quality mode correctly inferred and governs step generation
- [ ] Conditional steps evaluated at decision time (coverage threshold)
- [ ] buildSkillCall() completes arg enrichment + auto flag
- [ ] Quality-gate decisions delegate-evaluated via `maestro delegate --role analyze`
- [ ] Delegate verdict parsed: STATUS / REASON / GAP_SUMMARY / CONFIDENCE_SCORE / WEAKEST_DIMENSION
- [ ] Confidence-based verdict adjustment applied
- [ ] `-y` mode: auto-follow adjusted verdict, no STOP (except post-debug-escalate)
- [ ] Interactive mode: display recommendation + request_user_input with override
- [ ] passed_gates[] tracks quality gates, cleared on code changes
- [ ] Fix-loop templates use gap_summary from delegate
- [ ] retry_count tracked per decision, max_retries enforced → escalation
- [ ] ALL external steps via spawn_agents_on_csv
- [ ] Barrier steps solo wave, non-barriers parallel
- [ ] status.json persisted after every wave and decision
- [ ] Command insertion + reindex preserves step integrity

### Golden Examples

**New session from "plan" position, standard quality:**
```
S_PARSE_ROUTE → S_INFER → S_RESOLVE_PHASE → S_QUALITY_MODE → S_BUILD_CHAIN → S_CREATE_SESSION
→ S_CONFIRM → S_LOAD_NEXT → S_WAVE_EXEC(plan) → S_LOAD_NEXT → S_WAVE_EXEC(execute)
→ S_LOAD_NEXT → S_WAVE_EXEC(verify) → S_LOAD_NEXT → S_DECISION_EVAL(post-verify)
→ S_APPLY_VERDICT(proceed) → S_LOAD_NEXT → ...
```

**Decision fix-loop:**
```
S_DECISION_EVAL(post-verify) → A_DELEGATE_EVALUATE → verdict="fix"
→ S_APPLY_VERDICT → A_APPLY_FIX → S_FIX_LOOP → A_INSERT_FIX_LOOP
→ S_LOAD_NEXT → S_WAVE_EXEC(debug) → S_WAVE_EXEC(plan --gaps) → ...
```

**Resume mid-decision:**
```
S_PARSE_ROUTE(continue) → detect running session with decision in "running"
→ S_DECISION_EVAL → resume delegate evaluation
```

</appendix>
