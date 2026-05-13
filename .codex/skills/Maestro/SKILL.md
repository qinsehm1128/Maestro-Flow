---
name: maestro
description: Auto-route intent to optimal command chain
argument-hint: "\"intent text\" [-y] [-c|--continue] [--dry-run] [--super]"
allowed-tools: spawn_agents_on_csv, Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

<purpose>
Wave-based pipeline coordinator. Classify intent → resolve chain → wave-by-wave spawn → report.
All skill execution via `spawn_agents_on_csv` — coordinator never executes skills directly.

Entry points:
- **`$maestro "intent"`** — Classify → chain → execute
- **`$maestro --continue`** — Resume from last incomplete wave
- **`$maestro --dry-run "intent"`** — Show chain, no execution
- **`$maestro --super "intent"`** — Production-ready mode (read maestro-super.md)
</purpose>

<required_reading>
@~/.maestro/workflows/maestro.codex.md — authoritative `detectTaskType`, `detectNextAction`, `chainMap` (35+ intent patterns, 40+ chain types). Read before executing any step.
</required_reading>

<deferred_reading>
- [maestro-super.md](~/.maestro/workflows/maestro-super.md) — read when `--super` flag is active
</deferred_reading>

<context>
$ARGUMENTS — user intent text, or special flags.

**Flags:**
- `-y, --yes` — Auto mode: skip all prompts; propagate `-y` to each skill
- `--continue` — Resume latest paused session from last incomplete wave
- `--dry-run` — Display planned chain without executing
- `--super` — Read and follow `maestro-super.md` completely

**Session state**: `.workflow/.maestro/{session-id}/`
</context>

<invariants>
1. **ALL skills via spawn_agents_on_csv** — coordinator NEVER directly executes any skill logic
2. **Coordinator = prompt assembler** — classify → build CSV → spawn → read results → assemble next
3. **Barrier = solo wave** — barrier skills always execute alone (wave size = 1)
4. **Non-barriers can parallel** — consecutive non-barrier skills grouped into one wave
5. **Wave-by-wave** — never start wave N+1 before wave N results are read
6. **Coordinator owns context** — sub-agents never read prior results; coordinator assembles full `skill_call`
7. **Abort on failure** — failed step → mark remaining skipped → report
</invariants>

<state_machine>

<states>
S_PARSE         — 解析参数、检测 flags              PERSIST: —
S_CONTINUE      — 加载已有 session，定位 resume 点   PERSIST: session (loaded)
S_CLASSIFY      — 意图分类、解析 chain               PERSIST: —
S_CREATE        — 创建 session + status.json         PERSIST: session.status, session.steps[]
S_DRY_RUN       — 显示 chain 后结束                  PERSIST: —
S_CONFIRM       — 用户确认（auto_mode 跳过）          PERSIST: —
S_WAVE_LOOP     — 构建 wave → spawn → 读结果 → 循环  PERSIST: session.waves[], session.current_step, session.context
S_COMPLETE      — 标记完成、释放目标                  PERSIST: session.status = "completed"
S_ABORTED       — 失败中止、标记剩余 skipped          PERSIST: session.status = "aborted"
S_FALLBACK      — 意图无法分类，请求输入              PERSIST: —
</states>

<transitions>

S_PARSE:
  → S_CONTINUE    WHEN: --continue flag
  → S_CLASSIFY    WHEN: intent text present
  → S_FALLBACK    WHEN: no intent AND no flags

S_CONTINUE:
  → S_WAVE_LOOP   WHEN: session found, has pending steps     DO: A_RESUME_SESSION
  → S_FALLBACK    WHEN: no session found

S_CLASSIFY:
  → S_CREATE      WHEN: chain resolved (keyword match or maestro.codex.md lookup)
  → S_FALLBACK    WHEN: no match AND auto_mode
  → S_CLASSIFY    WHEN: no match AND not auto_mode          DO: A_CLARIFY_INTENT
                   GUARD: max 1 clarification attempt → S_FALLBACK

S_CREATE:
  → S_DRY_RUN     WHEN: --dry-run flag                      DO: A_CREATE_SESSION
  → S_CONFIRM     WHEN: not auto_mode                       DO: A_CREATE_SESSION
  → S_WAVE_LOOP   WHEN: auto_mode                           DO: A_CREATE_SESSION

S_DRY_RUN:
  → END           DO: display chain with [BARRIER] markers

S_CONFIRM:
  → S_WAVE_LOOP   WHEN: user confirms
  → S_ABORTED     WHEN: user cancels

S_WAVE_LOOP:
  → S_WAVE_LOOP   WHEN: pending steps remain                DO: A_BUILD_AND_SPAWN_WAVE
  → S_COMPLETE    WHEN: no pending steps
  → S_ABORTED     WHEN: step failed
                   GUARD: wave order is sacred — never skip ahead

S_COMPLETE:
  → END           DO: A_FINALIZE

S_ABORTED:
  → END           DO: A_ABORT_REPORT

S_FALLBACK:
  → S_CLASSIFY    WHEN: user provides new intent            DO: AskUserQuestion
  → END           WHEN: user cancels

</transitions>

<actions>

### A_CREATE_SESSION

1. Read `.workflow/state.json` for project context (current phase, milestone, workflow_name)
2. Resolve chain's skill list from chain_map or maestro.codex.md
3. Create `.workflow/.maestro/maestro-{YYYYMMDD-HHMMSS}/status.json`:
   ```json
   { "session_id", "source": "maestro", "intent", "task_type", "chain_name",
     "phase", "milestone", "auto_mode", "context": { "issue_id", "scratch_dir",
     "plan_dir", "analysis_dir", "brainstorm_dir" },
     "steps": [{ "index", "skill", "args", "status": "pending", "wave_n": null }],
     "waves": [], "current_step": 0, "status": "running" }
   ```
4. Initialize tracking:
   - `create_goal({ objective: "Maestro {chain}: {N} steps [{skill list}]" })`
   - `update_plan({ plan: steps.map(step => { step, status: "pending" }) })`

### A_RESUME_SESSION

1. Glob `.workflow/.maestro/maestro-*/status.json` sorted desc, load most recent
2. Find first pending step → set as resume point
3. Rebuild `update_plan` from status.json (completed→"completed", current→"in_progress", rest→"open")

### A_CLARIFY_INTENT

1. `AskUserQuestion` with available chain types
2. Re-classify with user response

### A_BUILD_AND_SPAWN_WAVE

1. **buildNextWave**: first pending step; barrier → solo wave; non-barrier → collect consecutive non-barriers
2. **buildSkillCall** per step:
   - Replace placeholders: `{phase}`, `{plan_dir}`, `{analysis_dir}`, `{brainstorm_dir}`, `{spec_session_id}`
   - Append auto-yes flag if `auto_mode` (see Appendix: Auto-Yes Flag Map)
3. Write `{sessionDir}/wave-{N}.csv` (columns: id, skill_call, topic)
4. `spawn_agents_on_csv({ csv_path, id_column: "id", instruction: WAVE_INSTRUCTION, max_workers, max_runtime_seconds: 3600, output_csv_path, output_schema: RESULT_SCHEMA })`
5. Read results → update step statuses in status.json
6. **Barrier analysis** (if barrier skill): read artifacts, update `session.context`
   | Barrier Skill | Read | Context Updates |
   |---------------|------|-----------------|
   | maestro-analyze | context.md, state.json | analysis_dir, gaps, phase |
   | maestro-plan | plan.json, .task/TASK-*.json | plan_dir, task_count, wave_count |
   | maestro-brainstorm | .brainstorming/ | brainstorm_dir, features |
   | maestro-roadmap | specs/ | spec_session_id |
   | maestro-execute | results.csv | exec_completed, exec_failed |
7. Persist: write status.json + sync update_plan

### A_FINALIZE

1. Set `session.status = "completed"`, write status.json
2. Sync update_plan: all steps → "completed"
3. `update_goal({ status: "complete" })` — release goal constraint
4. Generate completion report (see Appendix: Report Format)

### A_ABORT_REPORT

1. Mark remaining steps as `skipped` in status.json
2. Set `session.status = "aborted"`, write status.json
3. Sync update_plan (skipped steps marked)
4. Do NOT call update_goal — goal stays for `--continue` resume
5. Display abort report with failure details

</actions>

</state_machine>

<appendix>

### Chain Map (Quick Reference)

| Intent keywords | Chain | Steps |
|----------------|-------|-------|
| fix, bug, error, broken | `quality-fix` | analyze --gaps → plan --gaps → execute → verify |
| test, spec, coverage | `quality-test` | quality-test |
| refactor, cleanup, debt | `quality-refactor` | quality-refactor |
| feature, implement, add | `feature` | plan → execute → verify |
| review, check, audit | `quality-review` | quality-review |
| deploy, release, ship | `deploy` | verify → milestone-release |
| brainstorm, explore, ideate | `brainstorm-driven` | brainstorm → plan → execute → verify |
| plan, design, architect | `plan` | plan |
| debug, diagnose | `debug` | quality-debug |
| continue, next | `state_continue` | (from project state) |
| status, dashboard | `status` | manage-status |

Full chain map (40+ chains): `@~/.maestro/workflows/maestro.codex.md` §3c

### Auto-Yes Flag Map

| Skill | Flag |
|-------|------|
| maestro-init, maestro-analyze, maestro-brainstorm, maestro-ui-design, maestro-roadmap | `-y` |
| maestro-plan, maestro-execute, maestro-milestone-complete | `-y` |
| quality-auto-test, quality-retrospective | `-y` |
| quality-test | `-y --auto-fix` |

### Barrier Skills

`maestro-analyze`, `maestro-plan`, `maestro-brainstorm`, `maestro-roadmap`, `maestro-execute`

Non-barrier (groupable): `maestro-verify`, `quality-review`, `quality-test`, `quality-debug`, `quality-refactor`, `quality-sync`, `manage-*`

### Worker Contract

**Instruction template:**
```
你是 CSV job 子 agent。
先原样执行这一段技能调用：{skill_call}
然后基于结果完成这一行任务说明：{topic}
限制：不要修改 .workflow/.maestro/ 下的 status 文件
最后必须调用 `report_agent_job_result`，返回 JSON：
{"status":"completed|failed","skill_call":"{skill_call}","summary":"一句话结果","artifacts":"产物路径","error":"失败原因"}
```

**Result schema:** `{ status, skill_call, summary, artifacts, error }` — all string, all required

### CSV Schema

**wave-{N}.csv:**
```csv
id,skill_call,topic
"1","$maestro-analyze --gaps \"fix auth\" -y","Chain \"quality-fix\" step 1/4"
```

**Session status.json:** see A_CREATE_SESSION for full schema

### Error Codes

| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E001 | error | Intent unclassifiable after clarification | Default to `feature` chain |
| E002 | error | Intent unresolvable after retry | List chains, abort |
| E003 | error | Wave timeout | Mark step failed, abort chain |
| E004 | error | Barrier artifact not found | Retry wave once, then abort |
| E005 | error | --continue: no session found | List sessions, prompt |
| W001 | warning | Barrier artifact partial | Continue with available context |

### Success Criteria

- [ ] Intent classified and chain resolved
- [ ] Session dir initialized with status.json before first wave
- [ ] Every skill goes through spawn_agents_on_csv
- [ ] Barrier skills solo wave; non-barriers grouped parallel
- [ ] Each wave: CSV → spawn → results → state updated
- [ ] Barrier artifacts read before assembling next wave args
- [ ] Failed step → remaining skipped → abort reported
- [ ] --dry-run shows chain with [BARRIER], no execution
- [ ] --continue resumes from last incomplete wave

### Report Format

```
=== COORDINATE COMPLETE ===
Session:  {sessionId}
Chain:    {chain}
Waves:    {N} executed
Steps:    {completed}/{total}

WAVE RESULTS:
  [W1] $maestro-analyze --gaps  →  ✓  found 3 gaps
  [W2] $maestro-plan --gaps     →  ✓  12 tasks in 3 waves
  ...

State:    .workflow/.maestro/{sessionId}/status.json
Resume:   $maestro --continue
```

</appendix>
