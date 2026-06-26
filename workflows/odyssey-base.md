# Odyssey 共享基座

所有 Odyssey 命令（debug, improve, planex, review-test-fix, ui）共享此基座。

<execution_discipline>
**四条铁律：**

1. **Phase auto-commit** — 每个阶段完成后自动 `git commit`，无需用户确认
   - 代码变更 + understanding.md → `git add` → `git commit -m "{command}({slug}): {phase} — {摘要}"`
   - session.json / evidence.ndjson 为运行时状态，不纳入 commit

2. **Confident edits only, but must attempt** — 有把握才改代码；仅在真正需要人类判断时记录 decision
   - Confident → edit + commit
   - Needs decision → `evidence.ndjson {"phase":"decision","status":"pending"}`，不动代码
   - ⚠️ **Decision gate** — 仅以下情形算 decision：跨模块架构权衡需人类方向 | 业务语义歧义修复可能改变意图 | 需引入新依赖或 breaking API
   - ❌ "不确定怎么修"、"范围太大"、"历史遗留" 不是合法 decision 理由

3. **多 CLI 辅助** — `maestro delegate` 多角度交叉验证
   - 不同阶段用不同 `--role`（analyze / review / explore）
   - 所有 delegate 调用 `run_in_background: true`，等回调继续

4. **禁止以上下文消耗为由中断** — harness 自动 context compression；以"上下文不足"或"已执行 N 阶段"为由中断属纪律违反，必须完整走到 S_RECORD → END

**Zero-residual:** 每个发现必须有 action（fix / issue / decision）。"仅报告"和"历史遗留跳过"均禁止。
</execution_discipline>

<shared_schemas>

### session.json 标准字段（所有命令共有）

```json
{
  "session_id": "{type}-odyssey-{YYYYMMDD-HHmmss}",
  "current_state": "S_INTAKE",
  "flags": { "skip_fix": false, "skip_generalize": false, "auto": false, "auto_confirm": false },
  "phase_goals": [], "phase_goals_all_done": false,
  "self_iteration_log": [],
  "cross_phase_loops": 0, "max_loops": 5,
  "created_at": "", "updated_at": ""
}
```

各命令在此基础上添加特有字段（如 `issue`, `target`, `requirement` 等）。

### evidence.ndjson 基础 schema（每行共有字段）

```json
{"ts":"","phase":"","type":"","source":"","content":"","note":""}
```

各命令定义 phase-specific 扩展字段（如 `hypothesis`, `severity`, `dimension` 等）。

### generalization_stats schema

```json
{
  "patterns_extracted": 0, "total_hits": 0,
  "cross_layer_confirmed": 0, "regression_risks": 0,
  "by_layer": {"syntax": 0, "semantic": 0, "structural": 0},
  "deepening_triggered": false
}
```

</shared_schemas>

<anti_stall>
**防停滞机制**

### session.json 新增字段

```json
{
  "progress_metrics": {
    "phase_stats": {},
    "stale_count": 0,
    "last_productive_phase": "",
    "convergence_trend": "unknown"
  },
  "directions_tried": []
}
```

### Progress Tracking

每个分析阶段结束时：
1. 统计 `new_findings`（去重后新发现）和 `repeated`（与已有 evidence 重复）
2. 写入 `progress_metrics.phase_stats[state_name]`
3. `new == 0` → `stale_count++`，`convergence_trend = "stalling"`
4. `new > 0` → `stale_count = 0`，更新 `last_productive_phase`
5. 连续 2 阶段 new 递减 → `convergence_trend = "diminishing"`

### Direction Diversity

```json
{
  "phase": "S_DIAGNOSE", "round": 1,
  "strategy_type": "scope_widen|perspective_shift|tool_switch|structural_pivot",
  "strategy_desc": "扩展搜索到 utils/", "result": "2 new findings"
}
```

**去重规则:** 自迭代前检查同 phase 历史 → 新策略必须在 `strategy_type` 或 `strategy_desc` 上不同 → 4 种 type 均已尝试 → 强制升级 stale_count

### Stall Escalation Ladder

| stale_count | 策略 |
|-------------|------|
| 0 | 正常推进 |
| 1 | **换视角** — 不同 CLI 工具、反向追踪、手动阅读。方向必须与 directions_tried 不同 |
| 2 | **结构性转向** — 重定义搜索维度、换分析框架、拆解子问题。不是参数调优 |
| 3 | **人工升级** — AskUserQuestion / `-y` 自动 INCONCLUSIVE 并推进 |

### /loop Heartbeat（可选，`--heartbeat` 启用）

建议用户 `/loop 270s`。每阶段更新 `session.json.updated_at`。超 15 分钟未更新 → 告警 + stale_count。连续 2 次无更新 → 建议 `-c` resume。
</anti_stall>

<self_iteration>
**Quality Gate（进度感知版）**

| 维度 | sufficient | insufficient |
|------|-----------|-------------|
| Coverage | 已知相关文件/模块均已分析 | 遗漏 grep/git log 可发现的目标 |
| Depth | ≥80% 发现有 file:line 级证据 | 多数仅泛泛描述 |
| Actionability | 每条结论有具体后续动作 | 仅"建议关注"类无操作结论 |

**进度感知迭代（替代固定 3 轮）:**
- phase complete → evaluate 3 dims + check `progress_metrics`
- any insufficient AND `stale_count < 3` → re-enter，expansion strategy 必须经 directions_tried 去重
- 按 Stall Escalation Ladder 选择策略类型

**Expansion strategies:**
- `scope_widen`: 更多目录、git log 深度 ×2、额外 delegate 角度
- `perspective_shift`: 不同 CLI 工具、反向追踪、手动阅读
- `tool_switch`: 切换到未使用的分析工具
- `structural_pivot`: 重定义问题框架、拆解子问题

**Exit:** all sufficient → advance | `stale_count >= 3` → log gaps, advance

**Log:** `evidence.ndjson {"phase":"self-iteration"}` + `session.json.self_iteration_log[]` + `directions_tried[]`
</self_iteration>

<shared_actions>

### A_GENERALIZE

3 层 pattern extraction → 4-agent 并发 scan → cross-layer dedup → iterative deepening。

**Pattern 来源:** 由各命令指定（root cause / audit findings / implementation patterns 等）。

**3 层提取:**

| Layer | Method | Example |
|-------|--------|---------|
| Syntax | Regex → Grep | `eval(`, missing `await`, inline styles |
| Semantic | Agent 理解反模式 → scan | 未处理异步错误、缺少校验 |
| Structural | 文件/模块结构相似性 | 同类导入结构、缺少 override |

Write `session.json.patterns[]`: `[{id, source, layer, signature, description, risk, fix_template, confidence}]`

**4-agent 并发 scan（单条消息）:**

| Agent | Strategy | Scope |
|-------|----------|-------|
| Syntax grep | Grep regex | Full project |
| Semantic scan | 反模式检查 | Related modules |
| Structural match | 结构相似文件 | Full project |
| Historical grep | `git log -S` | Git history |

**Cross-layer dedup:** 多层命中 → boost | 单层 → `needs_review` | 历史已修 → `regression_risk`

**Iterative deepening:** module ≥3 hits → 定向深扫（max 1 round）

**Persist:** understanding.md 泛化 section + `session.json.generalization_stats`（schema 见 shared_schemas）

📌 Auto-commit: `"...({slug}): GENERALIZE — 泛化扫描完成"`

### A_DISCOVER

1. **Triage** 每个 hit ±10 行上下文 → 分类 `bug` / `risk` / `safe`
2. **Route:**
   - bug + 可直接修 → **立即修复** → back to S_FIX
   - bug + 需跨模块决策 → 创建 issue（含 fix 建议 + 影响分析）
   - risk → 评估能否直接加 guard；能 → 修
   - safe → skip
   Normal: AskUserQuestion | `-y`: auto-fix 可修的，其余 create issue
3. **Cross-phase loops:** `cross_phase_loops++`。`loops >= max_loops` → 必须逐项记录原因（禁止笼统"历史遗留"）
4. Append evidence + update understanding.md

📌 Auto-commit: `"...({slug}): DISCOVER — 发现分类完成"`

### A_RECORD

1. Finalize understanding.md 最后一节 — learnings 按各命令指定的分类表结构化
   - **两步模式:** 执行中写产出文件（临时）→ 完成后用户通过 next_step_routing 沉淀永久知识
2. Mark record goal done。Pending decisions: Normal → AskUserQuestion | `-y` → skip (show deferred count)
3. **Goal audit:** all `completion_confirmed` → `phase_goals_all_done = true`。未完成: Normal → AskUserQuestion | `-y` → auto accept
4. `current_state = "COMPLETED"`，emit completion summary（格式由各命令定义）

📌 Auto-commit: `"...({slug}): RECORD — 会话总结与知识沉淀"`

</shared_actions>

<shared_appendix>

### Goal Prompt 机制

**⚠️ 时机守卫：仅 INTAKE 完成后显示一次。RECORD 完成时禁止重显。**

```
📋 {Command} Odyssey 会话已创建。可随时复制以下 /goal 设定终止条件：

/goal 完成以下目标：
{for each G in phase_goals where status != "skipped":}
- {G.id}: {G.goal} — 完成条件: {G.done_when}
{end for}
{command-specific convergence rules}
遇到 phase=decision 的 pending 必须 AskUserQuestion，不得自行 resolve。
```

输出后继续执行不阻塞。

### `-y` 通用规则

- Decision pending → best-effort continue, record `deferred`
- 3-strike escalation → auto INCONCLUSIVE
- Discovery routing → auto create issue
- Record pending → skip, show deferred count
- Record goal audit → auto accept

`deferred` items 在 completion summary 显示为"待决策"；可通过 `-c` 恢复。各命令在自身文件中列出特有 decision points。

### Phase Goal Lifecycle

`pending → done (confirmed=true)` | `pending → skipped (confirmed=true)` | `pending → failed (confirmed=false)`

`phase_goals_all_done = true` 仅当 ALL goals 有 `completion_confirmed == true`。

### Pre-load（可选，缺失不阻塞）

| 层级 | 命令 |
|------|------|
| Codebase docs | Read `.workflow/codebase/ARCHITECTURE.md` |
| Wiki search | `maestro search "<keywords>" --json`（top 5） |
| Specs | `maestro load --type spec --category <cat>` |
| Role knowledge | `maestro search --category <cat>` → `maestro load --type knowhow --id <id>` |
| Prior sessions | `Glob(".workflow/scratch/*-{type}-odyssey-*")` |

### Common Error Codes

| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E003 | error | Resume but no session found | Start new |
| E004 | error | Delegate failed | Retry or proceed without |
| W003 | warning | Generalization 0 hits | Skip discovery |
| W004 | warning | Delegate parse failed | Use raw output |

</shared_appendix>
