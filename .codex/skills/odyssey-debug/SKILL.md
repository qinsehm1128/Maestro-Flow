---
name: odyssey-debug
description: Long-running debug cycle — archaeology, diagnosis, fix, confirmation, generalization, discovery, and knowledge persistence
argument-hint: "<issue> [--skip-fix] [--skip-generalize] [--auto] [-y] [-c]"
allowed-tools: spawn_agents_on_csv, Read, Write, Edit, Bash, Glob, Grep, request_user_input
---

<purpose>
Closed-loop deep debugging: understand what changed (archaeology) → CLI-assisted exploration
(call chains, error gaps) → diagnose why (hypothesis-driven) → fix and confirm → generalize
the pattern (举一反三) → discover similar issues → persist decisions and learnings.

Unlike `quality-debug` (fast bug fix in execution pipeline), this treats every bug as a
learning signal. It digs into git history before forming hypotheses, confirms fixes with
CLI-assisted review, and scans the codebase for siblings of the root cause.

Core philosophy:
- **Archaeology before hypothesis** — look at what changed before guessing why
- **Fix one, find many** — a single bug reveals a class of bugs
- **Decision journal** — things needing human judgment get recorded, not lost
- **CLI-assisted review** — delegate to external tools for second-opinion analysis
</purpose>

<context>
$ARGUMENTS — issue description and optional flags.

**Flags:**
- `--skip-fix`: Analysis-only — archaeology + diagnosis + generalize, no code changes
- `--skip-generalize`: Skip generalization and discovery (quick fix without learning)
- `--auto`: CLI delegate calls run without per-step confirmation
- `-y`: Auto-confirm — all decision points auto-select defaults; undecidable items
  recorded as `status: "deferred"` and skipped
- `-c`: Resume the most recent interrupted session

**Session**: `SESSION_DIR = .workflow/scratch/{YYYYMMDD}-debug-odyssey-{slug}/`

**Output — 4 files:**
```
SESSION_DIR/
  ├── session.json       # session state + confirmation + pattern + phase_goals
  ├── evidence.ndjson    # ALL evidence trail (phase field distinguishes origin)
  ├── explore.json       # structured CLI exploration snapshot
  └── understanding.md   # evolving narrative across all 9 sections
```

**evidence.ndjson entry schema:**
```json
{"ts":"","phase":"archaeology|explore|diagnosis|discovery|decision","type":"","source":"","content":"","note":""}
```
Phase-specific fields:
- `archaeology`: `sha`, `author`, `date`, `message`, `relevance`
- `explore`: `category` (call_chain|recent_change|error_gap|similar_pattern), `detail`
- `diagnosis`: `hypothesis`, `result` (confirmed|disproved|inconclusive)
- `discovery`: `file`, `line`, `classification` (safe|risk|bug), `action`
- `decision`: `question`, `options`, `context`, `status` (pending|resolved|deferred), `resolution`

**explore.json schema:**
```json
{
  "call_chains": [{"entry":"","chain":["file:line"]}],
  "recent_changes": [{"file":"","commits":[{"sha":"","message":"","date":""}]}],
  "error_gaps": [{"file":"","line":0,"description":""}],
  "similar_patterns": [{"file":"","line":0,"description":""}],
  "cli_tool": "", "timestamp": ""
}
```

**session.json schema:**
```json
{
  "session_id": "debug-odyssey-{YYYYMMDD-HHmmss}",
  "issue": "",
  "flags": { "skip_fix": false, "skip_generalize": false, "auto": false, "auto_confirm": false },
  "current_state": "S_INTAKE", "diagnosis_retries": 0,
  "root_cause": null, "pattern": null, "confirmation": null,
  "phase_goals": [], "phase_goals_all_done": false,
  "created_at": "", "updated_at": ""
}
```

**phase_goals[] — auto-derived from flags:**
```json
[
  {"id":"G1","goal":"Root cause identified","done_when":"evidence.ndjson has phase=diagnosis result=confirmed","evidence":"understanding.md §5","phase":"S_DIAGNOSE","status":"pending","completion_confirmed":false},
  {"id":"G2","goal":"Explore context gathered","done_when":"explore.json with ≥1 category populated","evidence":"explore.json","phase":"S_EXPLORE","status":"pending","completion_confirmed":false},
  {"id":"G3","goal":"Fix applied and confirmed","done_when":"session.json.confirmation.overall == confirmed","evidence":"session.json.confirmation","phase":"S_CONFIRM","skip_when":"skip_fix","status":"pending","completion_confirmed":false},
  {"id":"G4","goal":"Pattern generalized","done_when":"session.json.pattern populated","evidence":"understanding.md §7","phase":"S_GENERALIZE","skip_when":"skip_generalize","status":"pending","completion_confirmed":false},
  {"id":"G5","goal":"Discoveries triaged","done_when":"all scan hits classified in evidence.ndjson","evidence":"evidence.ndjson phase=discovery","phase":"S_DISCOVER","skip_when":"skip_generalize","status":"pending","completion_confirmed":false},
  {"id":"G6","goal":"Learnings persisted","done_when":"spec entries created OR no actionable learnings","evidence":"understanding.md §9","phase":"S_RECORD","status":"pending","completion_confirmed":false}
]
```
`skip_when` references `flags`; when true → auto set `status: "skipped"`, `completion_confirmed: true`.

**understanding.md — 9 progressive sections:**
1. Issue & Scope ← S_INTAKE
2. Archaeology Summary ← S_ARCHAEOLOGY
3. Exploration — Call Chains & Error Gaps ← S_EXPLORE
4. Hypotheses & Testing ← S_DIAGNOSE
5. Root Cause ← S_DIAGNOSE (confirmed)
6. Fix & Confirmation ← S_FIX + S_CONFIRM
7. Generalization — Pattern & Scan Results ← S_GENERALIZE
8. Discoveries & Decisions ← S_DISCOVER
9. Learnings ← S_RECORD
</context>

<csv_schema>

### Shared Output Schema (all waves)

```json
{
  "type": "object",
  "properties": {
    "id":            { "type": "string" },
    "result_status": { "type": "string", "enum": ["completed", "failed"] },
    "findings":      { "type": "string", "maxLength": 500 },
    "evidence":      { "type": "string", "description": "JSON array of file:line refs" },
    "error":         { "type": "string" }
  },
  "required": ["id", "result_status", "findings"]
}
```

**Shared Termination Contract** (embed in every instruction):
```
You MUST call report_agent_job_result EXACTLY ONCE before exiting.
- Success → result_status=completed
- Failure → result_status=failed with error message
- Timeout → near max_runtime_seconds → result_status=completed with partial findings
- NEVER continue indefinitely. NEVER exit silently. NEVER omit the call.
- Read-only. Do NOT modify source files.
Do NOT write to tasks.csv, wave-*.csv, results.csv. Do NOT call spawn_agents_on_csv (no recursion).
```

### tasks.csv

```csv
id,title,description,task_type,deps,wave,status,findings,evidence,error
```

**Wave allocation:**
- Wave 1: Archaeology agents (git-timeline, git-blame) — parallel
- Wave 2: Generalization agents (pattern-grep, structural-search) — parallel, depends on root cause
- Single-agent stages (explore, diagnose, fix, confirm) remain inline — not CSV-spawned

**Column semantics:**
- Input: id, title, description (detailed instruction), task_type (archaeology|generalization), deps (semicolon-sep), wave
- Output: status (pending→completed|failed), findings (max 500), evidence (file:line JSON), error
</csv_schema>

<invariants>
1. **Iron Law**: NO FIX PROPOSALS WITHOUT ROOT CAUSE EVIDENCE — even "obvious" fixes
2. **Archaeology first**: Git history MUST be analyzed before forming any hypothesis
3. **Evidence append-only**: evidence.ndjson is append-only; never modify/delete entries
4. **Session is source of truth**: session.json holds all state; no side-channel state files
5. **Phase goal tracking**: each phase MUST mark its corresponding goal on completion
6. **Decision journal integrity**: all human-judgment items MUST be recorded in evidence.ndjson phase=decision
7. **`-y` defers, never drops**: auto-confirm records decisions as "deferred", never silently skips
8. **CLI delegate is background**: all `maestro delegate` calls use run_in_background — STOP and wait for callback
9. **Resumable state**: `current_state` saved to session.json at every phase transition
10. **Goal is outcome-oriented**: phase_goals 为可观测交付条件，禁止 lifecycle 复刻；`/goal` 用户绑定，odyssey 输出提示词后继续执行，用户可在任意时刻输入 `/goal`
11. **Invariant violation = BLOCK**: violating any above blocks the current operation
</invariants>

<execution>

### Stage 1: Intake (S_INTAKE)

1. Parse arguments: issue description, flags
2. Generate slug, create `SESSION_DIR`
3. Search prior knowledge:
   - `maestro search "<issue keywords>"` → related specs/knowhow
   - `Glob(".workflow/scratch/*-debug-odyssey-*")` → prior odyssey sessions
   - Read `.workflow/codebase/ARCHITECTURE.md` if exists
4. Identify relevant files: Grep issue keywords
5. Derive `phase_goals[]`: start with G1-G6 template, apply `skip_when` from flags
6. Write `session.json` + `understanding.md` §1
7. Display **Goal Prompt block** (Appendix: Goal Prompt Template)，不阻塞流程，继续执行

**Resume (`-c`):** Find latest session via Glob → read `session.json` → restore `current_state` → jump.

### Stage 2: Archaeology (S_ARCHAEOLOGY)

Git history analysis + CLI-assisted review of past modifications.

**Step 1 — Git archaeology (spawn_agents_on_csv, Wave 1):**

Write `tasks.csv` with Wave 1 archaeology rows:
```csv
id,title,description,task_type,deps,wave,status,findings,evidence,error
"arch-timeline","Git Timeline","Run git log --oneline -20 -- {relevant_files}. Extract [{sha, date, author, message, files_changed}]. Return JSON array in findings field.","archaeology","","1","pending","","",""
"arch-blame","Git Blame","For top 3 suspicious files: run git blame -L {region}. Extract [{file, line_range, sha, author, date, content}]. Return JSON array in findings field.","archaeology","","1","pending","","",""
```

```javascript
spawn_agents_on_csv({
  csv_path: "tasks.csv",
  id_column: "id",
  instruction: ARCHAEOLOGY_INSTRUCTION + SHARED_TERMINATION_CONTRACT,
  max_concurrency: 2,
  max_runtime_seconds: 300,
  output_csv_path: "wave-1-results.csv",
  output_schema: SHARED_OUTPUT_SCHEMA
})
```

Merge: `result_status` → master `status`; copy `findings`, `evidence`, `error`.
Each finding → append `evidence.ndjson` (phase: "archaeology").

**Step 2 — CLI-assisted change review:**
```bash
maestro delegate "PURPOSE: Review recent modifications to files related to: {issue}
TASK: Analyze intent behind changes | Identify risky modifications | Flag potential bug sources
MODE: analysis
CONTEXT: @{relevant_files} | Git log: {top_10_commits}
EXPECTED: JSON [{commit_sha, risk_level, analysis, could_cause_issue, explanation}]
CONSTRAINTS: Focus on behavioral changes, not formatting
" --role analyze --mode analysis
```
Run_in_background, STOP, wait for callback. Append results (phase: "archaeology").

**Step 3:** Update `understanding.md` §2. Save `current_state = "S_EXPLORE"`.

### Stage 3: Exploration (S_EXPLORE)

CLI-assisted codebase exploration — structured context for diagnosis. Skip if no enabled CLI tools.

```bash
maestro delegate "PURPOSE: Gather codebase evidence for: {issue}
TASK: Trace call chains | Find recent changes | Identify error handling gaps | Check similar patterns
MODE: analysis
CONTEXT: @{scope}/**/*
EXPECTED: JSON {call_chains:[...], recent_changes:[...], error_gaps:[...], similar_patterns:[...]}
CONSTRAINTS: Max 20 entries per category | Focus on symptom-related code paths

Symptoms: {issue_description}
Archaeology hints: {suspicious_commits}
" --role explore --mode analysis
```
Run_in_background, STOP, wait for callback.

Parse output → write `explore.json`. Append summary entries to `evidence.ndjson` (phase: "explore").
Update `understanding.md` §3. Mark `phase_goals[G2]` done. Save `current_state = "S_DIAGNOSE"`.

### Stage 4: Diagnosis (S_DIAGNOSE)

Hypothesis-driven root cause analysis informed by archaeology + exploration.

**Step 1 — Form hypotheses:**
Filter `evidence.ndjson` for `phase ∈ ["archaeology", "explore"]`, generate ranked list:
- `[HIGH]` — supported by archaeology evidence
- `[MEDIUM]` — plausible but less evidence
- `[LOW]` — worth checking

Write to `understanding.md` §4.

**Step 2 — Test each hypothesis (rank order):**
Design test → execute (Read, Grep, trace) → append `evidence.ndjson` (phase: "diagnosis"):
```json
{"ts":"","phase":"diagnosis","type":"hypothesis-test","hypothesis":"","result":"confirmed|disproved|inconclusive","source":"file:line","content":"","note":""}
```
Update `understanding.md` §4.

**Step 3 — Decision journal:**
If ambiguity requires human judgment → append `evidence.ndjson` (phase: "decision"):
```json
{"ts":"","phase":"decision","type":"diagnosis-decision","question":"","options":[],"context":"","status":"pending","resolution":null}
```
- **Normal**: `request_user_input` for blocking items.
- **`-y`**: set `status: "deferred"`, skip; continue with best-effort hypothesis.

**Step 4 — Root cause declaration:**
Confirmed → update `session.json.root_cause`, write `understanding.md` §5.
Mark `phase_goals[G1]` done. Save next state.

**Escalation (3-strike):**
All hypotheses fail → increment `diagnosis_retries`.
- < 3: broaden scope + CLI deep analysis via `maestro delegate --role analyze`, form new hypotheses.
- >= 3:
  - **Normal**: `request_user_input` — broaden / new hypothesis / INCONCLUSIVE
  - **`-y`**: auto INCONCLUSIVE, record `{"phase":"decision","type":"escalation-decision","status":"deferred","resolution":"auto-inconclusive"}`, proceed to S_RECORD

### Stage 5: Fix (S_FIX)

Skip if `--skip-fix`.

1. Present root cause and proposed fix
2. **Normal**: `request_user_input` "确认修复方向？" → proceed / modify / skip
   **`-y`**: auto proceed, record `{"phase":"decision","type":"fix-direction","status":"deferred","resolution":"auto-proceed"}`
3. Implement fix
4. Record fix decision in `evidence.ndjson` (phase: "decision")
5. Save `current_state = "S_CONFIRM"`

### Stage 6: Confirmation (S_CONFIRM)

Skip if `--skip-fix`.

**Step 1 — Tests:** Auto-detect framework, run tests covering modified files.

**Step 2 — CLI fix review:**
```bash
maestro delegate "PURPOSE: Review fix for: {issue}
TASK: Verify correctness | Check regressions | Assess completeness | Review edge cases
MODE: analysis
CONTEXT: @{modified_files} | Root cause: {summary} | Diff: {git_diff}
EXPECTED: JSON {verdict, findings [{severity, description, suggestion}], regression_risk}
CONSTRAINTS: Focus on correctness, not style
" --role review --mode analysis
```
Run_in_background, STOP, wait for callback.

**Step 3 — Write `session.json.confirmation`:**
```json
{"test_result":{"passed":true,"test_count":0,"failures":[]},"cli_review":{"verdict":"","findings":[],"regression_risk":""},"overall":"confirmed|needs_rework","timestamp":""}
```
Update `understanding.md` §6.

`needs_rework` → return to Stage 5.
`confirmed` → mark `phase_goals[G3]` done. Advance.

### Stage 7: Generalization (S_GENERALIZE)

Skip if `--skip-generalize`. 举一反三: extract pattern, scan for siblings.

**Step 1 — Pattern extraction:**
Write to `session.json.pattern`:
```json
{"pattern_name":"","description":"Class of bug","signature":"Grep regex","risk":"Why dangerous","fix_template":"How to fix"}
```

**Step 2 — Codebase scan (spawn_agents_on_csv, Wave 2):**

Append Wave 2 generalization rows to `tasks.csv`:
```csv
"gen-pattern","Pattern Grep","Grep for pattern '${signature}' across project. Return [{file, line, context, risk_level}] in findings.","generalization","","2","pending","","",""
"gen-structural","Structural Search","Read files with similar imports/structure to ${buggy_files}. Check for same anti-pattern. Return [{file, line, description, risk}] in findings.","generalization","","2","pending","","",""
```

```javascript
spawn_agents_on_csv({
  csv_path: "tasks.csv",
  id_column: "id",
  instruction: GENERALIZATION_INSTRUCTION + SHARED_TERMINATION_CONTRACT,
  max_concurrency: 2,
  max_runtime_seconds: 300,
  output_csv_path: "wave-2-results.csv",
  output_schema: SHARED_OUTPUT_SCHEMA
})
```

Merge results → master `tasks.csv`.

**Step 3:** Write `understanding.md` §7 (pattern + hits + recommended actions).
Mark `phase_goals[G4]` done. Save next state (S_DISCOVER if hits, S_RECORD if none).

### Stage 8: Discovery (S_DISCOVER)

Skip if no generalization hits.

**Step 1 — Triage:**
For each hit: read context (±10 lines), classify as `safe` / `risk` / `bug`.

**Step 2 — Route:**

| Classification | Normal | `-y` mode |
|---------------|--------|-----------|
| `bug` | `request_user_input`: fix now / create issue / record decision | auto create issue, record `deferred` |
| `risk` | Record + optionally create issue | Record only |
| `safe` | Skip | Skip |

Append `evidence.ndjson` per discovery (phase: "discovery").

**Step 3 — Decision journal:**
Ambiguous items → append `evidence.ndjson` (phase: "decision"):
- **Normal**: `request_user_input` for pending decisions (batch).
- **`-y`**: all set `status: "deferred"`, skip.

Update `understanding.md` §8. Mark `phase_goals[G5]` done. Save `current_state = "S_RECORD"`.

### Stage 9: Record (S_RECORD)

**Step 1 — Finalize `understanding.md` §9:** Learnings summary.

**Step 2 — Persist learnings:**

| Condition | Action |
|-----------|--------|
| Recurring root cause | `$spec-add debug "..." --description "..."` |
| Non-obvious workaround | `$spec-add learning "..."` |
| Architectural violation | `$spec-add arch "..."` |

**Step 3 — Mark G6 + pending decisions:**
Mark `phase_goals[G6]` done. Filter `evidence.ndjson` for `phase == "decision" AND status ∈ ["pending", "deferred"]`:
- **Normal**: display checklist, `request_user_input` to resolve each.
- **`-y`**: skip — display deferred count in summary only.

**Step 4 — Goal audit:**
Check `phase_goals[*].completion_confirmed`:
- All true (including skipped) → `phase_goals_all_done = true`
- Any false:
  - **Normal**: `request_user_input` — 回退补完 / 标记跳过 / 接受现状
  - **`-y`**: auto accept current state, `phase_goals_all_done = false`

**Step 5 — Completion:**
Update `session.json`: `current_state = "COMPLETED"`, `updated_at = now()`

```
--- DEBUG ODYSSEY COMPLETE ---
Issue:      {issue}
Root cause: {root_cause.hypothesis}
Fix:        {applied|skipped|inconclusive}
Pattern:    {pattern_name} ({N} similar hits)
Issues:     {N} created
Decisions:  {N} resolved, {M} pending, {K} deferred
Learnings:  {N} spec entries persisted
Goals:      {done}/{total} confirmed ({skipped} skipped)
---
```

**Next steps:** `$manage-issue list --source debug-odyssey`, `$learn-decompose <module>`,
`$quality-review <phase>`, `$learn-second-opinion <understanding.md>`, `$learn-investigate "<question>"`
</execution>

<appendix>

### Goal Prompt Template

Stage 1 完成后逐字显示（session 创建后、开始考古前）：

```
📋 Debug Odyssey 会话已创建。可随时复制以下 /goal 设定终止条件（执行过程中输入即可）：

/goal 直到 {SESSION_DIR}/session.json 的 phase_goals[*] 全部 completion_confirmed=true
且 phase_goals_all_done=true 才停。每轮以 session.json 为唯一行动手册，按状态机推进阶段。
禁止跳过未完成的 phase_goal（除非 flags 指定 skip）。
遇到 phase=decision 的 pending 条目必须 request_user_input，不得自行 resolve。
```

`/goal` 由用户输入；odyssey 输出提示词后继续执行，不阻塞。

### `-y` Auto-Confirm Behavior

`-y` 模式下所有 `request_user_input` 决策点自动处理：

| 决策点 | Normal | `-y` mode |
|--------|--------|-----------|
| Stage 4 诊断歧义决策 | request_user_input 阻塞 | record `deferred`, skip, best-effort 继续 |
| Stage 4 3-strike 升级 | request_user_input 三选一 | auto INCONCLUSIVE |
| Stage 5 修复方向确认 | request_user_input 确认 | auto proceed with suggested fix |
| Stage 8 bug 分类路由 | request_user_input 路由 | auto create issue |
| Stage 8 模糊项决策 | request_user_input 批量 | all `deferred` |
| Stage 9 决策清单 | request_user_input 逐项 | skip, 仅显示 deferred 计数 |
| Stage 9 目标审计 | request_user_input 三选一 | auto accept current state |

`deferred` 条目不丢失——记录在 `evidence.ndjson` 中，后续用 `-c` 恢复可手动处理。

### Phase Goal Lifecycle

```
pending → done (completion_confirmed=true)     ← 正常完成
pending → skipped (completion_confirmed=true)   ← flags 跳过 或 用户手动跳过
pending → failed (completion_confirmed=false)   ← INCONCLUSIVE 等失败路径
```

Goal audit 在 Stage 9 Step 4 执行。`phase_goals_all_done` 仅当所有 goal 的
`completion_confirmed == true` 时为 true。

### Goal Ref Propagation

每个 Stage 对应一个 `phase_goals` 条目：

| Stage | Goal | done_when | skip_when |
|-------|------|-----------|-----------|
| 3 S_EXPLORE | G2 | explore.json ≥1 category | no CLI tools |
| 4 S_DIAGNOSE | G1 | evidence.ndjson diagnosis confirmed | — |
| 6 S_CONFIRM | G3 | confirmation.overall == confirmed | skip_fix |
| 7 S_GENERALIZE | G4 | pattern populated | skip_generalize |
| 8 S_DISCOVER | G5 | all hits classified | skip_generalize |
| 9 S_RECORD | G6 | spec entries or no learnings | — |

Stage 完成时 MUST 标记对应 goal。未标记 = invariant 5 violation = BLOCK。

</appendix>

<error_codes>
| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E001 | error | No issue description and no session to resume | Provide issue or use -c |
| E003 | error | Resume requested but no session found | Start new session |
| E004 | error | Delegate execution failed | Retry or proceed without CLI |
| W001 | warning | No relevant git history found | Proceed with limited context |
| W002 | warning | All hypotheses inconclusive after 3 retries | INCONCLUSIVE |
| W003 | warning | Generalization scan returned 0 hits | Skip discovery |
| W004 | warning | Delegate parse failed | Use raw output |
| W005 | warning | Pending decisions remain unresolved | Filter evidence.ndjson phase=decision |
| W006 | warning | CLI exploration skipped (no enabled tools) | Proceed without explore.json |
</error_codes>

<success_criteria>
- [ ] Session directory created with session.json + understanding.md
- [ ] Prior knowledge searched (maestro search + existing sessions)
- [ ] Git archaeology completed (log + blame), entries in evidence.ndjson phase=archaeology
- [ ] CLI-assisted change review executed (delegate --role analyze)
- [ ] CLI exploration executed (delegate --role explore), explore.json written
- [ ] Explore evidence appended to evidence.ndjson phase=explore
- [ ] Hypotheses formed from archaeology + explore, evidence logged phase=diagnosis
- [ ] Root cause declared with confidence and evidence refs
- [ ] understanding.md tracks all 9 sections progressively
- [ ] Fix implemented and confirmed (unless --skip-fix)
- [ ] session.json.confirmation written with test + review results (unless --skip-fix)
- [ ] Pattern extracted with grep-able signature (unless --skip-generalize)
- [ ] Codebase scanned, hits logged phase=discovery (unless --skip-generalize)
- [ ] Discoveries classified and routed (fix/issue/decision/skip)
- [ ] Decision entries captured phase=decision for items needing human judgment
- [ ] Spec entries persisted for reusable learnings
- [ ] phase_goals[] derived from flags; skip_when goals auto-marked
- [ ] Each phase marks its corresponding phase_goal on completion
- [ ] Goal Prompt Template displayed after session creation (Appendix)
- [ ] Goal audit executed in Stage 9 Step 4 — unmet goals surfaced
- [ ] phase_goals_all_done set correctly based on all completion_confirmed
- [ ] `-y` mode: all decision points auto-resolve or defer, no blocking prompts
- [ ] `-y` mode: deferred decisions counted in completion summary
- [ ] Session state saved at each phase transition (resumable via -c)
- [ ] Completion summary displayed with goal stats
</success_criteria>
