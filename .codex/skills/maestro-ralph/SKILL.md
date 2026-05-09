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
- **`$maestro-ralph "intent"`** — New session: read state → infer → build → execute
- **`$maestro-ralph execute`** / **`continue`** — Resume: run next wave(s) until decision or completion
- **`$maestro-ralph status`** — Display session progress

Two node types:
- **external**: Executed via `spawn_agents_on_csv`. Barrier steps solo; non-barriers parallel.
- **decision**: Delegate evaluation via `maestro delegate --role analyze`, then expand/proceed/escalate.

Key difference from maestro coordinator:
- maestro: static chain → run all waves
- ralph: living chain → decision nodes delegate-evaluate → chain adapts dynamically

Session at `.workflow/.maestro/ralph-{YYYYMMDD-HHmmss}/status.json`.
</purpose>

<context>
$ARGUMENTS — intent text, flags, or keywords.

**State files:**
- `.workflow/state.json` — artifact registry, milestones, phases
- `.workflow/roadmap.md` — milestone/phase structure
- `.workflow/.maestro/ralph-*/status.json` — ralph session state

**Parse & Route:**
```
Parse $ARGUMENTS:
  -y / --yes    → auto_mode = true
  .md/.txt path → input_doc (supplementary context for downstream commands)
  Remaining     → intent

Route:
  intent == "status"   → handleStatus(). End.
  intent == "execute" | "continue" → Phase 2 (Wave Execution).

  Check running ralph session (.workflow/.maestro/ralph-*/status.json, status=="running"):
    If found AND steps[current_step].type == "decision" AND steps[current_step].status == "running":
      → Phase 2, Step 2.2 (Delegate Evaluation — resume mid-decision)
    Else if intent is non-empty:
      → Phase 1 (New Session)
    Else:
      → request_user_input: "请描述目标，或输入 status/continue/execute"
```

HARD RULE: `input_doc` is supplementary context only. It NEVER substitutes for lifecycle stages.

### handleStatus()
```
Find latest ralph session (by created_at).
Display:
  Session:  {id}
  Status:   {status}
  Position: {lifecycle_position}
  Quality:  {quality_mode}
  Progress: {completed}/{total} steps ({decision_count} decisions)
  Current:  [{current_step}] {steps[current_step].skill} [{type}]

  Steps:
    [✓] 0. maestro-analyze 1         [W1, barrier]
    [▸] 1. maestro-plan 1            [barrier]
    [ ] 2. maestro-execute 1         [barrier]
    [ ] 3. ◆ post-verify             [decision]
    ...
End.
```

**Flags:**
- `-y` / `--yes` → `session.auto_mode = true`
  - Skip confirmation prompts
  - Decision nodes: auto-follow delegate verdict (no STOP), except post-debug-escalate
  - Failures: retry once then pause

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

未列出的命令无 auto flag，原样执行。
</context>

<invariants>
1. **ALL external steps via spawn_agents_on_csv** — coordinator NEVER executes skill logic directly
2. **Coordinator = prompt assembler** — classify → enrich args → build CSV → spawn → read results → assemble next
3. **Decision nodes delegate-evaluate** — use `maestro delegate --role analyze` for quality-gate assessment; structural decisions (post-milestone, post-debug-escalate) evaluated directly
4. **Decision STOP behavior** — default: STOP after evaluation; `-y` mode: auto-continue (except post-debug-escalate always STOPs)
5. **Barrier = solo wave** — analyze, plan, execute, brainstorm, roadmap always run alone
6. **Non-barriers can parallel** — consecutive non-barrier, non-decision external steps grouped into one wave
7. **Wave-by-wave** — never start wave N+1 before wave N results are read
8. **Coordinator owns context** — sub-agents never read prior results; coordinator assembles full skill_call
9. **Abort on failure** — `-y`: retry once then pause; non-`-y`: mark remaining skipped → pause
10. **Quality mode governs steps** — full/standard/quick determines which quality stages are included
11. **passed_gates skip** — already-passed gates not re-run in retry loops (unless code changed)
</invariants>

<execution>

## Phase 1: New Session

### 1.1: Read project state

Read `.workflow/state.json` schema:
```json
{
  "current_milestone": "MVP",
  "milestones": [{ "id": "M1", "name": "MVP", "status": "active", "phases": [1, 2] }],
  "artifacts": [{
    "id": "ANL-001", "type": "analyze|plan|execute|verify",
    "milestone": "MVP", "phase": 1, "scope": "phase|milestone|adhoc|standalone",
    "path": "phases/01-auth-multi-tenant",  // relative to .workflow/scratch/
    "status": "completed", "depends_on": "PLN-001", "harvested": true
  }],
  "accumulated_context": { "key_decisions": [], "deferred": [] }
}
```

### 1.2: Infer lifecycle position

**Intent-based override:**

If intent matches brainstorm pattern (contains "brainstorm", "头脑风暴", "探索", "ideate", or "设计思路"), position = `brainstorm` regardless of project state.

Chain for existing project: `brainstorm → roadmap → analyze → ...` (skip init if `.workflow/state.json` exists).

**Bootstrap detection:**

| Condition | Position | Chain starts at |
|-----------|----------|-----------------|
| No `.workflow/` + no source files | `brainstorm` | brainstorm → init → roadmap → ... |
| No `.workflow/` + has source files | `init` | init → roadmap → ... |
| Has `.workflow/` but no state.json | `init` | init → roadmap → ... |
| Has state.json | → Artifact-based inference below |

**Artifact-based inference:**

Filter by `milestone == current_milestone`, target phase. Find latest completed artifact type:

| State | Position |
|-------|----------|
| No milestones[] or no roadmap.md | `roadmap` |
| No artifacts for target phase | `analyze` |
| Latest == "analyze" | `plan` |
| Latest == "plan" | `execute` |
| Latest == "execute" | `verify` |
| Latest == "verify" | → Refine by result files |

**Refine from verify results** (read `{artifact_dir}/`):

| Condition | Position |
|-----------|----------|
| verification.json: `passed==false` or `gaps[]` non-empty | `verify-failed` |
| verification.json: `passed==true`, no review.json, has `.tests/auto-test/report.json` | `review` |
| verification.json: `passed==true`, no review.json, no `.tests/auto-test/report.json` | `business-test` (full) / `review` (standard/quick) |
| review.json: `verdict=="BLOCK"` | `review-failed` |
| review.json: `verdict!="BLOCK"` | `test` |
| uat.md: all passed | `milestone-audit` |
| uat.md: has failures | `test-failed` |

**resolve_artifact_dir(artifact):**
```
Full path = .workflow/scratch/{artifact.path}/
Fallback: glob .workflow/scratch/*-P{phase}-*/ sorted by date DESC, take first
```

### 1.3: Resolve phase number

Priority order:
1. Regex from intent: `phase\s*(\d+)` or bare number
2. Latest in-progress artifact's phase field
3. First incomplete phase in current milestone's `phases[]`
4. `null` if position is brainstorm/init/roadmap (deferred to post-roadmap)
5. request_user_input if ambiguous (auto_mode does NOT skip this)

### 1.4: Determine quality mode

**Auto-inference (can be overridden by user to any mode):**

| Condition | Mode | Pipeline |
|-----------|------|----------|
| Has requirements/REQ-*.md + phase scope | `full` | verify → business-test → review → test-gen → test |
| Default | `standard` | verify → review → test (test-gen conditional on coverage < 80%) |
| User explicit `--quality quick` | `quick` | verify → review --tier quick |

User can specify `--quality full|standard|quick` to override auto-inference.

### 1.5: Build command sequence

**Lifecycle stages:**

| Stage | Skill | Barrier | Decision after | Condition |
|-------|-------|---------|----------------|-----------|
| brainstorm | `maestro-brainstorm "{intent}"` | yes | — | intent-override or 0→1 bootstrap |
| init | `maestro-init` | no | — | always |
| roadmap | `maestro-roadmap "{intent}"` | yes | — | always |
| analyze | `maestro-analyze {phase}` | yes | — | always |
| plan | `maestro-plan {phase}` | yes | — | always |
| execute | `maestro-execute {phase}` | yes | — | always |
| verify | `maestro-verify {phase}` | no | `post-verify` | always |
| business-test | `quality-auto-test {phase}` | no | `post-business-test` | full only |
| review | `quality-review {phase}` | no | `post-review` | always (quick: +`--tier quick`) |
| test-gen | `quality-auto-test {phase}` | no | — | full; standard if coverage < 80% |
| test | `quality-test {phase}` | no | `post-test` | full/standard |
| milestone-audit | `maestro-milestone-audit` | no | — | always |
| milestone-complete | `maestro-milestone-complete` | no | `post-milestone` | always |

**Build rules:**
1. Start from inferred position, skip completed stages
2. Filter by quality_mode (remove inapplicable stages)
3. After each decision-triggering stage, insert decision node: `{ decision, retry_count: 0, max_retries: 2 }`
4. Conditional steps (test-gen in standard) use: `{ "condition": "check_coverage", "threshold": 80 }`
5. Phase-independent commands (brainstorm, roadmap, init) use `"{intent}"` as args
6. Commands needing prior output (analyze→plan, plan→execute) have args resolved via artifact lookup at wave build time by coordinator (see buildSkillCall enrichment table in 2.3)
7. Args use placeholders resolved at wave build time by coordinator

**Example — from "plan" position, standard quality mode:**
```json
[
  { "index": 0, "type": "external", "skill": "maestro-plan", "args": "{phase}", "barrier": true },
  { "index": 1, "type": "external", "skill": "maestro-execute", "args": "{phase}", "barrier": true },
  { "index": 2, "type": "external", "skill": "maestro-verify", "args": "{phase}" },
  { "index": 3, "type": "decision", "skill": "maestro-ralph", "args": "{\"decision\":\"post-verify\",\"retry_count\":0,\"max_retries\":2}" },
  { "index": 4, "type": "external", "skill": "quality-review", "args": "{phase}" },
  { "index": 5, "type": "decision", "skill": "maestro-ralph", "args": "{\"decision\":\"post-review\",\"retry_count\":0,\"max_retries\":2}" },
  { "index": 6, "type": "external", "skill": "quality-auto-test", "args": "{phase}", "condition": "check_coverage" },
  { "index": 7, "type": "external", "skill": "quality-test", "args": "{phase}" },
  { "index": 8, "type": "decision", "skill": "maestro-ralph", "args": "{\"decision\":\"post-test\",\"retry_count\":0,\"max_retries\":2}" },
  { "index": 9, "type": "external", "skill": "maestro-milestone-audit", "args": "" },
  { "index": 10, "type": "external", "skill": "maestro-milestone-complete", "args": "" },
  { "index": 11, "type": "decision", "skill": "maestro-ralph", "args": "{\"decision\":\"post-milestone\"}" }
]
```

### 1.6: Create session

Write `.workflow/.maestro/ralph-{YYYYMMDD-HHmmss}/status.json`:
```json
{
  "session_id": "ralph-{YYYYMMDD-HHmmss}",
  "source": "ralph",
  "created_at": "ISO", "updated_at": "ISO",
  "intent": "{user_intent}",
  "status": "running",
  "chain_name": "ralph-lifecycle",
  "task_type": "lifecycle",
  "lifecycle_position": "{position}",
  "target": "milestone-complete",
  "phase": null | N,
  "milestone": null | "{M}",
  "auto_mode": false,
  "quality_mode": "standard",
  "passed_gates": [],
  "context": {
    "issue_id": null, "milestone_num": null, "spec_session_id": null,
    "scratch_dir": null, "plan_dir": null, "analysis_dir": null, "brainstorm_dir": null
  },
  "steps": [...],
  "waves": [],
  "current_step": 0
}
```

### 1.7: Initialize plan + confirm

```
functions.update_plan({
  explanation: "Ralph lifecycle: {position} → milestone-complete",
  plan: steps.map(step => ({ step: stepLabel(step), status: "pending" }))
})
```

Display:
```
============================================================
  RALPH DECISION ENGINE
============================================================
  Position:  {position} (Phase {N}, {milestone})
  Target:    milestone-complete
  Quality:   {quality_mode}
  Steps:     {total} ({decision_count} decision points)

  [ ] 0. maestro-plan {phase}              [barrier]
  [ ] 1. maestro-execute {phase}           [barrier]
  [ ] 2. maestro-verify {phase}            [external]
  [ ] 3. ◆ post-verify                     [decision]
  ...
============================================================
```

- If `-y`: proceed directly
- Else: request_user_input → Proceed / Edit / Cancel / Change quality mode

Fall through to Phase 2.

---

## Phase 2: Wave Execution Loop

### 2.1: Load session + find next step

Read status.json. Rebuild `update_plan` from step statuses.
Find first pending step.

- If decision node → Step 2.2 (Delegate Evaluation)
- If external node → Step 2.3 (Wave Execution)
- If no pending → Phase 3 (Completion)

### 2.2: Delegate Evaluation (decision nodes)

**Route by decision type:**
- Quality-gate decisions (post-verify, post-business-test, post-review, post-test) → delegate analysis
- Structural decisions (post-milestone, post-debug-escalate) → direct evaluation

#### 2.2a: Delegate quality-gate assessment

Read decision metadata: `{ decision, retry_count, max_retries }`

**Result file mapping:**

| Decision | Files to include |
|----------|-----------------|
| post-verify | `{artifact_dir}/verification.json` |
| post-business-test | `{artifact_dir}/.tests/auto-test/report.json` |
| post-review | `{artifact_dir}/review.json` |
| post-test | `{artifact_dir}/uat.md`, `{artifact_dir}/.tests/test-results.json` |

```
exec_command({
  cmd: `maestro delegate "PURPOSE: 评估 ${meta.decision} 质量门结果
TASK: 读取结果文件 | 分析通过/失败 | 评估严重性 | 给出建议
MODE: analysis
CONTEXT: @${result_files}
EXPECTED: 严格按格式输出:
---VERDICT---
STATUS: proceed | fix | escalate
REASON: 一句话解释
GAP_SUMMARY: 问题描述（fix/escalate 时填写）
CONFIDENCE: high | medium | low
CONFIDENCE_SCORE: 0-100（从结果文件中读取置信度分数，无则估算）
WEAKEST_DIMENSION: 最弱维度名称
---END---
CONSTRAINTS: 只评估 | STATUS 三选一 | 置信度 < 60% 倾向 fix | retry ${meta.retry_count}/${meta.max_retries} 达上限必须 escalate" --role analyze --mode analysis`,
  yield_time_ms: 30000,
  max_output_tokens: 6000
})
// ⚠️ If session_id returned → poll write_stdin until completion (see @~/.maestro/workflows/delegate-protocol.codex.md)
// NEVER skip — verdict is required for decision routing
```

**Parse verdict** (on callback):
```
Extract STATUS / REASON / GAP_SUMMARY / CONFIDENCE / CONFIDENCE_SCORE / WEAKEST_DIMENSION from output.
If parse fails → fallback: STATUS = "fix", GAP_SUMMARY = generic

Confidence-based verdict adjustment (after parse, before apply):
  If CONFIDENCE_SCORE < 60 AND STATUS == "proceed":
    → Override to "fix", REASON += " (置信度不足: {score}%，{weakest} 需加强)"
  If CONFIDENCE_SCORE > 95 AND STATUS == "fix" AND retry_count > 0:
    → Suggest "proceed" override, REASON += " (置信度充分: {score}%，建议通过)"
```

**Confidence-aware evaluation**: Before delegating, check if artifact contains confidence section (added by downstream commands). If found, include `已有置信度评估: 整体 {overall}%, 最弱维度: {weakest} ({score}%)` in delegate prompt as additional signal.

**Apply verdict:**

| Mode | Behavior |
|------|----------|
| `-y` (auto_mode) | Follow adjusted verdict directly, no user prompt |
| Interactive + confidence_score >= 80 | Display recommendation with confidence, prompt user |
| Interactive + confidence_score < 80 | Display recommendation **with confidence warning**, prompt user |

Interactive prompt (via `request_user_input`):
```json
{ "questions": [{ "id": "decision_override", "header": "◆ {meta.decision} 评估结果", "question": "STATUS: {verdict.status}\nREASON: {verdict.reason}\n\n选择操作：", "options": [
  { "label": "按建议执行 (Recommended)", "description": "执行 {verdict.status} 操作" },
  { "label": "覆盖 proceed", "description": "忽略问题，强制通过" },
  { "label": "覆盖 fix", "description": "强制进入修复循环" },
  { "label": "取消", "description": "暂停会话，手动处理" }
]}] }
```

**Verdict → action:**

| Verdict | Action |
|---------|--------|
| `proceed` | Add gate to passed_gates, continue |
| `fix` | Clear passed_gates (code will change), insert fix-loop |
| `escalate` | Insert `[quality-debug "{gap_summary}", decision:post-debug-escalate]` |

#### 2.2b: Fix-loop templates

The delegate's `gap_summary` is passed as context to `quality-debug`.

**passed_gates reset**: Every fix-loop inserts `maestro-execute` (code changes), so `passed_gates` is cleared at insertion time (see 2.2a verdict action). Downstream decision nodes restart with `retry: 0` to re-validate against modified code. Only the triggering decision's own `retry_count` increments.

**post-verify fix-loop:**
Reset: `passed_gates = []` (code changed via execute)
```
quality-debug "{gap_summary}"
maestro-plan --gaps {phase}           [barrier]
maestro-execute {phase}               [barrier]
maestro-verify {phase}
decision:post-verify {retry+1}
```

**post-business-test fix-loop (full mode):**
Reset: `passed_gates = []` (code changed via execute); post-verify restarts at retry: 0
```
quality-debug --from-business-test "{gap_summary}"
maestro-plan --gaps {phase}           [barrier]
maestro-execute {phase}               [barrier]
maestro-verify {phase}
decision:post-verify {retry: 0}
quality-auto-test {phase}
decision:post-business-test {retry+1}
```

**post-review fix-loop:**
Reset: `passed_gates = []` (code changed via execute); post-verify restarts at retry: 0
```
quality-debug "{gap_summary}"
maestro-plan --gaps {phase}           [barrier]
maestro-execute {phase}               [barrier]
maestro-verify {phase}
decision:post-verify {retry: 0}
quality-review {phase}
decision:post-review {retry+1}
```

**post-test fix-loop:**
Reset: `passed_gates = []` (code changed via execute); all downstream decisions restart at retry: 0
```
quality-debug --from-uat "{gap_summary}"
maestro-plan --gaps {phase}           [barrier]
maestro-execute {phase}               [barrier]
maestro-verify {phase}
decision:post-verify {retry: 0}
quality-auto-test {phase}                          # full mode only
decision:post-business-test {retry: 0}             # full mode only
quality-review {phase}
decision:post-review {retry: 0}
quality-auto-test {phase}                          # full mode; standard if coverage < 80%
quality-test {phase}
decision:post-test {retry+1}
```

#### 2.2c: Structural decisions (direct evaluation)

**post-milestone:**
```
Read .workflow/state.json — check next milestone (status "pending"/"active")
If found: update session (milestone, phase, reset passed_gates), re-infer quality_mode,
          insert lifecycle via buildSteps() for next milestone
If none: proceed — session completes naturally
```

**post-debug-escalate:**
```
Set session status = "paused"
Display: ◆ 已达最大重试次数，debug 已执行。请人工介入检查结果。
STOP (always, regardless of -y)
```

#### 2.2d: Finalize decision

```
Mark decision step "completed"
Reindex steps if commands inserted
Write status.json
Sync update_plan

Display: ◆ Decision: {type} → {verdict.status} ({verdict.reason})

STOP behavior:
  post-debug-escalate → always STOP
  auto_mode == true   → no STOP, continue to 2.3
  auto_mode == false  → STOP. Display: ⏸ 使用 $maestro-ralph execute 继续
```

### 2.3: Build and Execute Wave

**Loop while pending non-decision steps exist:**

**1. buildNextWave:**
- Conditional step → evaluate condition, skip if not met:
  - `check_coverage`: read `{artifact_dir}/validation.json`, if `coverage >= threshold` → skip test-gen; else → include
  - If validation.json not found → include (assume coverage insufficient)
- Barrier step → solo wave (single row CSV)
- Non-barrier → collect consecutive non-barrier, non-decision steps (multi-row CSV)
- Stop at first decision node

**2. buildSkillCall(step, session)** — assemble fully-resolved command:

Placeholder resolution:
```
{phase} → session.phase
{intent} → session.intent
{scratch_dir} → latest artifact path
{plan_dir} → session.context.plan_dir
{analysis_dir} → session.context.analysis_dir
```

Per-skill enrichment:
| Skill | Enrichment |
|-------|-----------|
| maestro-brainstorm | args empty → `"{intent}"` |
| maestro-roadmap | args empty → `"{intent}"` |
| maestro-analyze | args empty → `{phase}` |
| maestro-plan | resolve latest analyze artifact → `--dir .workflow/scratch/{path}` |
| maestro-execute | resolve latest plan artifact → `--dir .workflow/scratch/{path}` |
| quality-debug | append gap_summary or `--from-uat`/`--from-business-test` |
| quality-* / maestro-verify / milestone-* | args empty → `{phase}` or empty |

Auto flag: append from propagation table if `auto_mode == true`.

Result: `$<skill-name> <enriched-args> [auto-flag]`

**3. Write wave CSV:** `{sessionDir}/wave-{N}.csv`

**4. Update plan** (mark wave steps in_progress)

**5. Spawn:**
```
spawn_agents_on_csv({
  csv_path: "{sessionDir}/wave-{N}.csv",
  id_column: "id",
  instruction: WAVE_INSTRUCTION,
  max_workers: <wave_size>,
  max_runtime_seconds: 3600,
  output_csv_path: "{sessionDir}/wave-{N}-results.csv",
  output_schema: RESULT_SCHEMA
})
```

**6. Read results** — update step statuses from results CSV

**7. Barrier context update:**

| Barrier | Read | Update |
|---------|------|--------|
| maestro-analyze | context.md, state.json | context.analysis_dir |
| maestro-plan | plan.json | context.plan_dir |
| maestro-execute | results | context.exec_status |
| maestro-brainstorm | .brainstorming/ | context.brainstorm_dir |
| maestro-roadmap | specs/ | context.spec_session_id |

**8. Persist** — write status.json + sync update_plan

**9. Failure check:**
- `-y`: retry once, then pause (await manual intervention)
- Non-`-y`: mark remaining skipped → pause → STOP

**10. Next step check:**
- Decision node + auto_mode → loop to 2.2
- Decision node + non-auto → STOP
- External node → loop to step 1

---

## Phase 3: Completion

```
status.status = "completed"
status.updated_at = now
Write status.json

functions.update_plan({
  explanation: "Ralph lifecycle complete",
  plan: steps.map(step => ({ step: stepLabel(step), status: "completed" }))
})
```

Display:
```
============================================================
  RALPH COMPLETE
============================================================
  Session:  {session_id}
  Quality:  {quality_mode}
  Phase:    {phase} → {milestone}
  Waves:    {wave_count} executed
  Steps:    {completed}/{total} ({skipped} skipped)

  [✓] 0. maestro-plan 1            [W1]
  [✓] 1. maestro-execute 1         [W2]
  [✓] 2. maestro-verify 1          [W3]
  [✓] 3. ◆ post-verify → proceed   [decision]
  [~] 4. quality-auto-test 1       [skipped: standard mode]
  [✓] 5. quality-review 1          [W4]
  ...
============================================================
```

</execution>

<csv_schema>
### wave-{N}.csv

Coordinator 已完成 arg 组装 + auto flag 附加：

```csv
id,skill_call,topic
"3","$maestro-verify 1","Ralph step 3/14: verify phase 1"
"4","$quality-review 1 --tier quick","Ralph step 4/14: review phase 1"
```

Rules:
- `skill_call`: complete `$<skill> <args> [auto-flag]` from `buildSkillCall()`
- `topic`: human-readable step description
- Non-barrier external + non-decision → multi-row (parallel)
- Barrier external → single-row (solo)
- Decision nodes NEVER appear in CSV — processed by coordinator directly

### Sub-Agent Instruction

```
你是 CSV job 子 agent。

执行技能调用：{skill_call}
任务说明：{topic}

限制：
- 不要修改 .workflow/.maestro/ 下的 status 文件
- skill 内部有自己的 session 管理，按 skill SKILL.md 执行

完成后调用 `report_agent_job_result`，返回：
{"status":"completed|failed","skill_call":"{skill_call}","summary":"一句话结果","artifacts":"产物路径","error":"失败原因"}
```

### Result Schema

`{ status, skill_call, summary, artifacts, error }` — all string
</csv_schema>

<error_codes>
| Code | Severity | Description | Recovery |
|------|----------|-------------|----------|
| E001 | error | No intent and no running session | Prompt for intent |
| E002 | error | Cannot infer lifecycle position | Show raw state, ask user |
| E003 | error | Artifact dir not found for decision | Show glob results, ask user |
| E004 | error | Delegate verdict parse failed | Fallback: treat as "fix" |
| E005 | error | Delegate execution failed | Fallback: treat as "fix" with generic summary |
| E006 | error | Wave timeout (max_runtime_seconds) | Mark step failed, pause |
| E007 | error | No session found for execute/continue | Suggest $maestro-ralph "intent" |
| W001 | warning | Decision node expanded chain | Auto-handled, log expansion |
| W002 | warning | Max retries reached, escalating | Auto-handled |
| W003 | warning | Multiple running sessions found | Use latest, warn user |
| W004 | warning | Delegate confidence == "low" | Show warning in interactive mode |
</error_codes>

<success_criteria>
- [ ] state.json parsed with actual schema (type, path, scope, milestone, depends_on)
- [ ] Lifecycle position inferred from bootstrap + artifact chain + result files
- [ ] Artifact dir resolved via resolve_artifact_dir() with fallback glob
- [ ] Quality mode (full/standard/quick) correctly inferred and governs step generation
- [ ] Conditional steps evaluated at decision time (coverage threshold)
- [ ] buildSkillCall() completes arg enrichment + auto flag, CSV contains full commands
- [ ] Quality-gate decisions delegate-evaluated via `maestro delegate --role analyze`
- [ ] Delegate verdict parsed: STATUS / REASON / GAP_SUMMARY / CONFIDENCE / CONFIDENCE_SCORE / WEAKEST_DIMENSION
- [ ] Confidence-based verdict adjustment applied (< 60% bias fix, > 95% bias proceed)
- [ ] Artifact confidence sections read when available as additional signal
- [ ] `-y` mode: auto-follow adjusted verdict, no STOP (except post-debug-escalate)
- [ ] Interactive mode: display recommendation with confidence score + request_user_input with override
- [ ] Delegate failure fallback: treat as "fix" verdict
- [ ] passed_gates[] tracks passed quality gates, skips re-runs in retry loops
- [ ] passed_gates cleared when code changes (fix-loop inserts execute step)
- [ ] Fix-loop templates correctly use gap_summary from delegate
- [ ] retry_count tracked per decision, max_retries enforced → escalation
- [ ] ALL external steps via spawn_agents_on_csv — coordinator never executes directly
- [ ] Barrier steps solo wave, non-barriers parallel
- [ ] functions.update_plan() initialized in 1.7, synced per wave, finalized in Phase 3
- [ ] status.json persisted after every wave and decision
- [ ] Command insertion + reindex preserves step integrity
</success_criteria>
