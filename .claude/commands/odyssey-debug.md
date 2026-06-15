---
name: odyssey-debug
description: Long-running debug cycle — archaeology, diagnosis, fix, confirmation, generalization, discovery, and knowledge persistence
argument-hint: "<issue> [--skip-fix] [--skip-generalize] [--auto] [-y] [-c]"
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
<purpose>
Closed-loop deep debugging: understand what changed (archaeology) → diagnose why (hypothesis-driven) → fix and confirm → generalize the pattern (举一反三) → discover similar issues → persist decisions and learnings.

Unlike `quality-debug` (fast bug fix in execution pipeline), this command treats every bug as a learning signal. It digs into git history before forming hypotheses, confirms fixes with CLI-assisted review, and scans the codebase for siblings of the root cause.

Core philosophy:
- **Archaeology before hypothesis** — look at what changed before guessing why
- **Fix one, find many** — a single bug reveals a class of bugs
- **Decision journal** — things needing human judgment get recorded, not lost
- **CLI-assisted review** — delegate to external tools for second-opinion analysis

Entry points:
- **`/odyssey-debug "issue"`** — New session: full 9-phase cycle
- **`/odyssey-debug -c`** — Resume last interrupted session
- **`/odyssey-debug "issue" --skip-fix`** — Analysis-only mode (archaeology + diagnosis + generalize, no code changes)
</purpose>

<context>
$ARGUMENTS — issue description and optional flags.

**Flags:**
- `--skip-fix`: Analysis-only mode — run archaeology, diagnosis, and generalization but do not modify code
- `--skip-generalize`: Skip the generalization and discovery phases (quick fix without learning)
- `--auto`: CLI delegate calls run without per-step confirmation
- `-y`: Auto-confirm mode — all decision points auto-select defaults; undecidable items recorded as `status: "deferred"` and skipped
- `-c`: Resume the most recent interrupted session

**Session directory:**
`SESSION_DIR = .workflow/scratch/{YYYYMMDD}-debug-odyssey-{slug}/`

**Output — 4 files:**
```
SESSION_DIR/
  ├── session.json       # session state + confirmation result + extracted pattern
  ├── evidence.ndjson    # ALL evidence trail (phase field distinguishes origin)
  ├── explore.json       # structured CLI exploration snapshot (call chains, error gaps, patterns)
  └── understanding.md   # evolving narrative across all 9 sections
```

**session.json schema:**
```json
{
  "session_id": "debug-odyssey-{YYYYMMDD-HHmmss}",
  "issue": "",
 
  "flags": { "skip_fix": false, "skip_generalize": false, "auto": false, "auto_confirm": false },
  "current_state": "S_INTAKE",
  "diagnosis_retries": 0,
  "root_cause": null,
  "pattern": null,
  "confirmation": null,
  "phase_goals": [],
  "phase_goals_all_done": false,
  "created_at": "",
  "updated_at": ""
}
```

**phase_goals[] — 自动从 flags 派生的可验证子目标：**
```json
[
  { "id": "G1", "goal": "Root cause identified",
    "done_when": "evidence.ndjson contains phase=diagnosis entry with result=confirmed",
    "evidence": "understanding.md §5", "phase": "S_DIAGNOSE",
    "status": "pending", "completion_confirmed": false, "completed_at": null },
  { "id": "G2", "goal": "Explore context gathered",
    "done_when": "explore.json written with ≥1 category populated",
    "evidence": "explore.json", "phase": "S_EXPLORE",
    "status": "pending", "completion_confirmed": false, "completed_at": null },
  { "id": "G3", "goal": "Fix applied and confirmed",
    "done_when": "session.json.confirmation.overall == confirmed",
    "evidence": "session.json.confirmation", "phase": "S_CONFIRM",
    "skip_when": "skip_fix", "status": "pending", "completion_confirmed": false, "completed_at": null },
  { "id": "G4", "goal": "Pattern generalized",
    "done_when": "session.json.pattern populated with signature",
    "evidence": "understanding.md §7", "phase": "S_GENERALIZE",
    "skip_when": "skip_generalize", "status": "pending", "completion_confirmed": false, "completed_at": null },
  { "id": "G5", "goal": "Discoveries triaged",
    "done_when": "all scan hits classified in evidence.ndjson phase=discovery",
    "evidence": "evidence.ndjson phase=discovery", "phase": "S_DISCOVER",
    "skip_when": "skip_generalize", "status": "pending", "completion_confirmed": false, "completed_at": null },
  { "id": "G6", "goal": "Learnings persisted",
    "done_when": "spec entries created OR no actionable learnings",
    "evidence": "understanding.md §9", "phase": "S_RECORD",
    "status": "pending", "completion_confirmed": false, "completed_at": null }
]
```
`skip_when` 字段引用 `flags` 中的布尔值；为 true 时该 goal 自动标 `status: "skipped", completion_confirmed: true`。
```

**evidence.ndjson — unified trail with phase discrimination:**
```json
{"ts": "", "phase": "archaeology|explore|diagnosis|discovery|decision", "type": "", "source": "", "content": "", "note": "", ...}
```
Phase-specific fields:
- `archaeology`: `sha`, `author`, `date`, `message`, `relevance` (high|medium|low)
- `explore`: `category` (call_chain|recent_change|error_gap|similar_pattern), `detail`
- `diagnosis`: `hypothesis`, `result` (confirmed|disproved|inconclusive)
- `discovery`: `file`, `line`, `classification` (safe|risk|bug), `action` (fix|issue|decision|skip)
- `decision`: `question`, `options`, `context`, `status` (pending|resolved|deferred), `resolution`

**explore.json — structured CLI exploration snapshot:**
```json
{
  "call_chains": [{ "entry": "", "chain": ["file:line"] }],
  "recent_changes": [{ "file": "", "commits": [{ "sha": "", "message": "", "date": "" }] }],
  "error_gaps": [{ "file": "", "line": 0, "description": "" }],
  "similar_patterns": [{ "file": "", "line": 0, "description": "" }],
  "cli_tool": "",
  "timestamp": ""
}
```

**understanding.md — progressive sections (written by the phase that owns them):**
1. Issue & Scope ← S_INTAKE
2. Archaeology Summary ← S_ARCHAEOLOGY
3. Exploration — Call Chains & Error Gaps ← S_EXPLORE
4. Hypotheses & Testing ← S_DIAGNOSE
5. Root Cause ← S_DIAGNOSE (confirmed)
6. Fix & Confirmation ← S_FIX + S_CONFIRM
7. Generalization — Pattern & Scan Results ← S_GENERALIZE
8. Discoveries & Decisions ← S_DISCOVER
9. Learnings ← S_RECORD

**Pre-load (optional, proceed without):**
- Prior sessions: `Glob(".workflow/scratch/*-debug-odyssey-*")` → related sessions
- Codebase docs: `.workflow/codebase/ARCHITECTURE.md` → module boundaries
- Wiki: `maestro search "<issue keywords>" --json` → prior investigations
- Specs: `maestro spec load --category debug --keyword "<symptom>"` → known issues
</context>

<state_machine>

<states>
S_INTAKE       — 解析问题、加载上下文、检查/恢复已有 session     PERSIST: session.json + understanding.md §1
S_ARCHAEOLOGY  — 考古：git history + CLI 分析过去修改            PERSIST: evidence.ndjson (phase=archaeology) + understanding.md §2
S_EXPLORE      — CLI 辅助探索：调用链、错误间隙、相似模式         PERSIST: explore.json + evidence.ndjson (phase=explore) + understanding.md §3
S_DIAGNOSE     — 假设驱动的根因分析                             PERSIST: evidence.ndjson (phase=diagnosis|decision) + understanding.md §4-5
S_FIX          — 实现修复（--skip-fix 时跳过）                   PERSIST: code changes + evidence.ndjson (phase=decision)
S_CONFIRM      — 测试 + CLI review 双重确认（--skip-fix 时跳过） PERSIST: session.json.confirmation + understanding.md §6
S_GENERALIZE   — 举一反三：提取 pattern，扫描相似代码            PERSIST: session.json.pattern + understanding.md §7
S_DISCOVER     — 评估发现的相似问题，创建 issue / 记录决策        PERSIST: evidence.ndjson (phase=discovery|decision) + understanding.md §8
S_RECORD       — 知识沉淀：spec-entry + understanding.md §9      PERSIST: understanding.md §9 + spec entries
</states>

<transitions>

S_INTAKE:
  → S_INTAKE       WHEN: -c flag + session found               DO: A_RESUME_SESSION (restore current_state, jump)
  → S_ARCHAEOLOGY  WHEN: issue parsed                          DO: A_INTAKE
  → S_INTAKE       WHEN: no issue AND no session               DO: AskUserQuestion "描述要调试的问题"

S_ARCHAEOLOGY:
  → S_EXPLORE      DO: A_ARCHAEOLOGY

S_EXPLORE:
  → S_DIAGNOSE     DO: A_EXPLORE

S_DIAGNOSE:
  → S_FIX          WHEN: root cause confirmed AND not skip_fix           DO: A_DIAGNOSE
  → S_GENERALIZE   WHEN: root cause confirmed AND skip_fix AND not skip_generalize  DO: A_DIAGNOSE
  → S_RECORD       WHEN: root cause confirmed AND skip_fix AND skip_generalize      DO: A_DIAGNOSE
  → S_DIAGNOSE     WHEN: all hypotheses failed, retries < 3     DO: A_ESCALATE_DIAGNOSIS
  → S_RECORD       WHEN: all hypotheses failed, retries >= 3    DO: mark INCONCLUSIVE

S_FIX:
  → S_CONFIRM      DO: A_FIX

S_CONFIRM:
  → S_GENERALIZE   WHEN: confirmed AND not skip_generalize      DO: A_CONFIRM
  → S_RECORD       WHEN: confirmed AND skip_generalize           DO: A_CONFIRM
  → S_FIX          WHEN: confirmation failed                     DO: A_CONFIRM (回到修复)

S_GENERALIZE:
  → S_DISCOVER     WHEN: similar code found                     DO: A_GENERALIZE
  → S_RECORD       WHEN: no similar code found                  DO: A_GENERALIZE

S_DISCOVER:
  → S_RECORD       DO: A_DISCOVER

S_RECORD:
  → END            DO: A_RECORD

</transitions>

<actions>

### A_INTAKE

1. Parse arguments: extract issue description, flags
2. Generate slug from issue, create `SESSION_DIR`
3. Search prior knowledge:
   - `maestro search "<issue keywords>"` → related specs/knowhow
   - `Glob(".workflow/scratch/*-debug-odyssey-*")` → prior odyssey sessions
   - Read `.workflow/codebase/ARCHITECTURE.md` if exists → module map
4. Identify relevant files: Grep issue keywords → candidate file list
5. Derive `phase_goals[]` from flags:
   - Start with full G1-G6 template
   - For each goal with `skip_when`: if `flags[skip_when] == true` → set `status: "skipped"`, `completion_confirmed: true`, `completed_at: now()`
   - Remaining goals stay `status: "pending"`
6. Write initial `session.json` (with phase_goals) + `understanding.md` §1 (issue statement, prior knowledge summary)
7. Emit Goal Prompt (see Appendix: Goal Prompt Template)

### A_RESUME_SESSION

1. Find latest session: `Glob(".workflow/scratch/*-debug-odyssey-*/session.json")` → most recent
2. Read `session.json` → restore `current_state`
3. Display session summary: issue, current phase, progress
4. Jump to saved `current_state` and continue

### A_ARCHAEOLOGY

Git history analysis + CLI-assisted review of past modifications.

**Step 1 — Git archaeology (parallel agents):**

Spawn 2 Agents in single message:

| Agent | Task |
|-------|------|
| Timeline | `git log --oneline -20 -- {relevant_files}` → change timeline with authors, dates, messages |
| Blame | Top 3 suspicious files: `git blame -L {region}` → who last touched critical paths |

Each finding → append `evidence.ndjson`:
```json
{"ts": "", "phase": "archaeology", "type": "git-log|git-blame", "source": "file:line", "sha": "", "author": "", "date": "", "message": "", "relevance": "high|medium|low", "note": ""}
```

**Step 2 — CLI-assisted change review:**
```bash
maestro delegate "PURPOSE: Review recent modifications to files related to: {issue}
TASK: Analyze intent behind recent changes | Identify risky modifications | Flag changes that could have introduced the bug
MODE: analysis
CONTEXT: @{relevant_files} | Git log: {top_10_commits_summary}
EXPECTED: JSON [{commit_sha, risk_level, analysis, could_cause_issue, explanation}]
CONSTRAINTS: Focus on behavioral changes, not formatting
" --role analyze --mode analysis
```
Run_in_background, STOP, wait for callback. Append results to `evidence.ndjson` (`phase: "archaeology"`).

**Step 3 — Synthesis:**
Update `understanding.md` §2: timeline, suspicious modifications, hypotheses from change history.
Save `current_state = "S_EXPLORE"`.

### A_EXPLORE

CLI-assisted codebase exploration — gather structured context (call chains, error gaps, similar patterns) to enrich subsequent diagnosis. Analogous to quality-debug Step 5.5.

**Skip if** no enabled CLI tools (`cli-tools.json` all disabled).

**Step 1 — CLI exploration delegate:**
```bash
maestro delegate "PURPOSE: Gather codebase evidence for bug investigation: {issue}
TASK: Trace call chains for affected functions | Find recent changes to related files | Identify error handling gaps | Check for similar patterns elsewhere
MODE: analysis
CONTEXT: @{relevant_files_or_scope}/**/*
EXPECTED: JSON { call_chains: [{entry, chain: [file:line...]}], recent_changes: [{file, commits: [{sha, message, date}]}], error_gaps: [{file, line, description}], similar_patterns: [{file, line, description}] }
CONSTRAINTS: Focus on code paths related to symptoms | Max 20 entries per category

Symptoms: {issue_description}
Archaeology hints: {top_suspicious_commits_from_archaeology}
" --role explore --mode analysis
```
Run_in_background, STOP, wait for callback.

**Step 2 — Write explore.json:**
Parse CLI output → write `SESSION_DIR/explore.json`:
```json
{
  "call_chains": [...],
  "recent_changes": [...],
  "error_gaps": [...],
  "similar_patterns": [...],
  "cli_tool": "{tool_used}",
  "timestamp": "{ISO}"
}
```

**Step 3 — Append to evidence.ndjson:**
For each category in explore.json, append summary entries:
```json
{"ts": "", "phase": "explore", "type": "cli-exploration", "category": "call_chain|recent_change|error_gap|similar_pattern", "source": "file:line", "detail": "", "note": ""}
```

**Step 4 — Update understanding.md §3:**
Exploration Summary: key call chains, notable error gaps, similar patterns worth investigating.
Pass `explore.json` as supplementary context to diagnosis agents.

Mark `phase_goals[G2].status = "done"`, `completion_confirmed = true`, `completed_at = now()`.
Save `current_state = "S_DIAGNOSE"`.

### A_DIAGNOSE

Hypothesis-driven root cause analysis informed by archaeology + exploration.

**Step 1 — Form hypotheses:**
Filter `evidence.ndjson` for `phase ∈ ["archaeology", "explore"]`, generate ranked list:
- `[HIGH]` — supported by archaeology evidence
- `[MEDIUM]` — plausible but less evidence
- `[LOW]` — worth checking

Write to `understanding.md` §4.

**Step 2 — Test each hypothesis (rank order):**
For each: design test → execute (Read, Grep, trace) → append `evidence.ndjson`:
```json
{"ts": "", "phase": "diagnosis", "type": "hypothesis-test", "hypothesis": "", "result": "confirmed|disproved|inconclusive", "source": "file:line", "content": "", "note": ""}
```
Update `understanding.md` §4.

**Step 3 — Record decisions needed:**
If ambiguity requires human judgment → append `evidence.ndjson`:
```json
{"ts": "", "phase": "decision", "type": "diagnosis-decision", "question": "", "options": [], "context": "", "status": "pending", "resolution": null}
```
- **Normal**: `AskUserQuestion` for blocking items.
- **`-y` mode**: set `status: "deferred"`, skip — do not block; continue with best-effort hypothesis.

**Step 4 — Root cause declaration:**
Confirmed hypothesis → update `session.json.root_cause`, write `understanding.md` §5.
Mark `phase_goals[G1].status = "done"`, `completion_confirmed = true`, `completed_at = now()`.
Save next state.

### A_ESCALATE_DIAGNOSIS

1. Increment `session.json.diagnosis_retries`
2. If < 3: broaden scope + CLI deep analysis:
   ```bash
   maestro delegate "PURPOSE: Deep analysis — all previous hypotheses failed
   TASK: Find alternative root causes | Consider module interactions | Check dependency updates
   MODE: analysis
   CONTEXT: @{expanded_scope} | Failed hypotheses: {list}
   EXPECTED: New hypothesis candidates with evidence
   " --role analyze --mode analysis
   ```
   Append to `evidence.ndjson` (`phase: "diagnosis"`), form new hypotheses, return to S_DIAGNOSE.
3. If >= 3:
   - **Normal**: `AskUserQuestion` — broaden / new hypothesis / mark INCONCLUSIVE
   - **`-y` mode**: auto mark INCONCLUSIVE, record `{"phase": "decision", "type": "escalation-decision", "status": "deferred", "resolution": "auto-inconclusive"}`, proceed to S_RECORD

### A_FIX

1. Present root cause and proposed fix to user
2. **Normal**: `AskUserQuestion`: "确认修复方向？" → proceed / modify / skip to generalization
   **`-y` mode**: auto proceed with suggested fix, record `{"phase": "decision", "type": "fix-direction", "status": "deferred", "resolution": "auto-proceed"}`
3. Implement fix
4. Append `evidence.ndjson`:
   ```json
   {"ts": "", "phase": "decision", "type": "fix-decision", "question": "Fix approach", "resolution": "what was changed", "files_modified": [], "status": "resolved"}
   ```
5. Save `current_state = "S_CONFIRM"`

### A_CONFIRM

**Step 1 — Test verification:** Auto-detect framework, run tests covering modified files.

**Step 2 — CLI-assisted fix review:**
```bash
maestro delegate "PURPOSE: Review fix for: {issue}
TASK: Verify correctness | Check regressions | Assess completeness | Review edge cases
MODE: analysis
CONTEXT: @{modified_files} | Root cause: {summary} | Diff: {git_diff_summary}
EXPECTED: JSON {verdict, findings [{severity, description, suggestion}], regression_risk}
CONSTRAINTS: Focus on correctness, not style
" --role review --mode analysis
```
Run_in_background, STOP, wait for callback.

**Step 3 — Write to session.json.confirmation:**
```json
{
  "test_result": { "passed": true, "test_count": 0, "failures": [] },
  "cli_review": { "verdict": "", "findings": [], "regression_risk": "" },
  "overall": "confirmed|needs_rework",
  "timestamp": ""
}
```
Update `understanding.md` §6.

If `needs_rework`: return to S_FIX.
If `confirmed`: mark `phase_goals[G3].status = "done"`, `completion_confirmed = true`, `completed_at = now()`. Advance.

### A_GENERALIZE

举一反三: extract pattern from root cause, scan for siblings.

**Step 1 — Pattern extraction:**
Write to `session.json.pattern`:
```json
{
  "pattern_name": "",
  "description": "The class of bug this represents",
  "signature": "Regex or structural pattern to grep for",
  "risk": "Why this pattern is dangerous",
  "fix_template": "How to fix instances"
}
```

**Step 2 — Codebase scan (parallel agents):**

| Agent | Strategy | Scope |
|-------|----------|-------|
| Pattern grep | `Grep` with signature regex | full project |
| Structural | Read similar files, check for same anti-pattern | Related modules |

**Step 3 — Write understanding.md §7:**
Pattern description, original instance, scan results (file:line + risk), recommended action per hit.

Mark `phase_goals[G4].status = "done"`, `completion_confirmed = true`, `completed_at = now()`.
Save next state (S_DISCOVER if hits, S_RECORD if none).

### A_DISCOVER

Evaluate generalization hits and route.

**Step 1 — Triage:**
For each hit: read context (±10 lines), classify as `safe` / `risk` / `bug`.

**Step 2 — Route:**

| Classification | Normal | `-y` mode |
|---------------|--------|-----------|
| `bug` | `AskUserQuestion`: fix now / create issue / record decision | auto create issue, record `status: "deferred"` |
| `risk` | Record + optionally create issue | Record only, skip issue creation |
| `safe` | Skip | Skip |

Append `evidence.ndjson` per actionable discovery:
```json
{"ts": "", "phase": "discovery", "type": "scan-hit", "file": "", "line": 0, "classification": "", "description": "", "action": "", "issue_id": null}
```

**Step 3 — Decision journal for ambiguous items:**
```json
{"ts": "", "phase": "decision", "type": "discovery-decision", "question": "", "options": ["fix now", "create issue", "accept risk"], "status": "pending", "resolution": null}
```
- **Normal**: `AskUserQuestion` for pending decisions (batch if multiple).
- **`-y` mode**: all discovery decisions set `status: "deferred"`, skip — displayed in completion summary as "待决策" items.

Update `understanding.md` §8.
Mark `phase_goals[G5].status = "done"`, `completion_confirmed = true`, `completed_at = now()`.
Save `current_state = "S_RECORD"`.

### A_RECORD

**Step 1 — Finalize understanding.md §9:** Learnings summary.

**Step 2 — Persist learnings:**

| Condition | Action |
|-----------|--------|
| Recurring root cause pattern | `Skill("spec-add", "debug ...")` |
| Non-obvious workaround | `Skill("spec-add", "learning ...")` |
| Architectural boundary violation | `Skill("spec-add", "arch ...")` |

**Step 3 — Mark G6 and pending decisions:**
Mark `phase_goals[G6].status = "done"`, `completion_confirmed = true`, `completed_at = now()`.
Filter `evidence.ndjson` for `phase == "decision" AND status ∈ ["pending", "deferred"]`:
- **Normal**: display checklist, `AskUserQuestion` to resolve each.
- **`-y` mode**: skip — display count of deferred decisions in completion summary only.

**Step 4 — Goal audit:**
Check `phase_goals[*].completion_confirmed`:
- All true (including skipped) → set `phase_goals_all_done = true`
- Any false:
  - **Normal**: display unmet goals table, `AskUserQuestion`: 回退补完 / 标记跳过 / 接受现状
    - 回退补完 → set `current_state` to the unmet goal's `phase`, return
    - 标记跳过 → set unmet goals `status: "skipped"`, `completion_confirmed: true`
    - 接受现状 → set `phase_goals_all_done = false`, proceed to completion
  - **`-y` mode**: auto accept current state, set `phase_goals_all_done = false`, proceed

**Step 5 — Session completion:**
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

</actions>

<appendix>

### Goal Prompt Template

A_INTAKE 完成后显示（session 创建后、开始考古前）：

```
📋 Debug Odyssey 会话已创建。可随时复制以下 /goal 设定终止条件：

/goal 直到 {SESSION_DIR}/session.json 的 phase_goals[*] 全部 completion_confirmed=true 且 phase_goals_all_done=true 才停。每轮以 session.json 为唯一行动手册，按状态机推进阶段。禁止跳过未完成的 phase_goal（除非 flags 指定 skip）。遇到 phase=decision 的 pending 条目必须 AskUserQuestion，不得自行 resolve。
```

`/goal` 由用户输入；odyssey 输出提示词后继续执行，不阻塞。

### `-y` Auto-Confirm Behavior

`-y` 模式下所有 `AskUserQuestion` 决策点自动处理：

| 决策点 | Normal | `-y` mode |
|--------|--------|-----------|
| A_DIAGNOSE 歧义决策 | AskUserQuestion 阻塞 | record `deferred`, skip, best-effort 继续 |
| A_ESCALATE 3 次失败 | AskUserQuestion 三选一 | auto INCONCLUSIVE |
| A_FIX 修复方向 | AskUserQuestion 确认 | auto proceed with suggested fix |
| A_DISCOVER bug 分类 | AskUserQuestion 路由 | auto create issue |
| A_DISCOVER 模糊项 | AskUserQuestion 批量 | all `deferred` |
| A_RECORD 决策清单 | AskUserQuestion 逐项 | skip, 仅显示 deferred 计数 |
| A_RECORD 目标审计 | AskUserQuestion 三选一 | auto accept current state |

`deferred` 状态的条目在完成摘要中显示为"待决策"，后续可通过 `-c` 恢复会话手动处理。

### Phase Goal Lifecycle

```
pending → done (completion_confirmed=true)     ← 正常完成
pending → skipped (completion_confirmed=true)   ← flags 跳过 或 用户手动跳过
pending → failed (completion_confirmed=false)   ← INCONCLUSIVE 等失败路径
```

Goal audit 在 A_RECORD Step 4 执行。`phase_goals_all_done` 仅当所有 goal 的 `completion_confirmed == true` 时为 true。

</appendix>

</state_machine>

<error_codes>
| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E001 | error | No issue description and no session to resume | Provide issue or use -c |
| E003 | error | Resume requested but no session found | Start new session |
| E004 | error | Delegate execution failed | Retry or proceed without CLI |
| W001 | warning | No relevant git history found | Proceed with limited context |
| W006 | warning | CLI exploration skipped (no enabled tools) | Proceed to diagnosis without explore.json |
| W002 | warning | All hypotheses inconclusive after 3 retries | INCONCLUSIVE |
| W003 | warning | Generalization scan returned 0 hits | Skip discovery |
| W004 | warning | Delegate parse failed | Use raw output |
| W005 | warning | Pending decisions remain unresolved | Filter evidence.ndjson phase=decision |
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
- [ ] phase_goals[] derived from flags at intake, skip_when goals auto-marked
- [ ] Each phase marks its corresponding phase_goal on completion
- [ ] Goal audit executed in A_RECORD Step 4 — unmet goals surfaced
- [ ] phase_goals_all_done set correctly based on all completion_confirmed
- [ ] Goal Prompt Template displayed after session creation
- [ ] `-y` mode: all AskUserQuestion points auto-resolve or defer, no blocking prompts
- [ ] `-y` mode: deferred decisions counted in completion summary
- [ ] Session state saved at each phase transition (resumable via -c)
- [ ] Completion summary displayed with goal stats
</success_criteria>

<next_step_routing>
| Condition | Next step |
|-----------|-----------|
| Issues created from discoveries | `/manage-issue list --source debug-odyssey` |
| Pattern worth documenting deeper | `/learn-decompose <affected-module>` |
| Fix needs formal review | `/quality-review <phase>` |
| Want second opinion on root cause | `/learn-second-opinion <understanding.md>` |
| Related question to investigate | `/learn-investigate "<question>"` |
| Decisions still pending | Filter `evidence.ndjson` for `phase=decision, status=pending` |
</next_step_routing>
