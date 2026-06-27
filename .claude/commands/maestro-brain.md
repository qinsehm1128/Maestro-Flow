---
name: maestro-brain
description: Use when you want an autonomous scheduling "brain" that drives a whole roadmap to completion — it only analyzes & decides each round (advance / insert-fix / revise-roadmap), delegates all implementation to external CLIs or child ralph/odyssey sessions, and never writes business code itself.
argument-hint: "<需求/intent> [--auto] [-y] [--executor <cli>] [--review L1|L2|L3] [--max-rounds N]"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Skill
  - Task
  - AskUserQuestion
---

<!-- v2 — patched after round-1 reverse-evaluation (see maestro-research/brain-eval). Changelog at bottom. -->

<purpose>
maestro-brain 是 maestro 的**外层调度大脑**：站在 roadmap 之上，每轮只做"分析 + 决策 + 派发 + 验收"，
把一整条 roadmap 自治地推到完成。它**自己不写业务代码**——所有实现都派发给外部 CLI 或 ralph/odyssey 子会话
（默认 Claude，可配优先级）。它复用 maestro 已有的 analyze/grill/brainstorm/roadmap/ralph/odyssey/collab/quality-* 命令。
</purpose>

<invariants>
1. **A 窗口只分析与调度，从不亲自写/改业务代码。** 一切实现派发给外部 CLI 或 ralph/odyssey 子会话。
2. **决策由本 agent 在上下文内自决**（不另起 LLM 判官），形状 = 默认按 roadmap 推进 + 两异常分支
   （结果有问题→插入修复；roadmap 有问题→修正 roadmap）。
3. **`--auto -y` 下永不因"需人确认"而中途停**：把本应升级给人的情形转成"全链路分析 → 自主决策 → 继续推进"，
   **唯一例外**是 §budget 的硬上限（轮次/预算耗尽 → 记 PARTIAL 后正常终止，非死循环）。
4. **评审者 ≠ 实现者**：验收用的 CLI/role/model 必须显式不同于刚写码的 CLI（防自批自绿，见 A_REVIEW 选择算法）。
5. **目标由子命令自写**：派 ralph/odyssey 时只给"短 intent + done_when"，不替它预写完整目标。
6. **状态落盘**：每轮写 brain 台账（`<workflow>/.brain/brain-{ts}/ledger.json`），可续跑、可审计。
7. **不盲信子会话自报**：凡子会话**自报成功且改了代码**，独立评审下限为 **L2**；终止前以**子会话 status.json/实际代码**
   为准重对账，不信可能过期的 state.json。
8. **brain 必须产出正确的 `/goal` 来设置并控制 loop 的停止。** `/goal` 是宿主的持久化终止条件机制——它**就是**
   循环的停止契约。brain 的核心职责之一是把**停止条件写正确**：太松→永不停，太紧→提前停。loop 跑到该 `/goal`
   的完成条件满足时即**完成并停止**。`--auto -y` 只管 loop **内**每轮不停顿，**不**取消/降级 `/goal`。
</invariants>

<environment_preflight>
进入状态机前先做一次环境探测（A_PREFLIGHT），所有外部依赖**探测而非假设**：
- `maestro` CLI 是否在 PATH（`bash: command -v maestro`）。**不在** → 进入"纯 Skill 模式"：用 `Skill()` 调
  maestro 命令、用 `Task` 子代理替代 `maestro delegate`，不调任何 `maestro xxx` 子命令。
- `<workflow>/cli-tools.json` 是否存在。**不存在** → 用内置默认 roleMappings
  （analyze/implement/review/brainstorm = `[codex,claude,gemini]` 序，按可用性回退），并记一条 blocker。
- `<workflow>/state.json` 是否存在 / 是否 initialized。**否** → 先 `Skill("maestro-init")` 或就地建种子 state.json。
- 列出**实际可用**的实现 CLI（读 `cli-tools.json` 的 `tools.<cli>.enabled` 标志，**不要**跑 `maestro tools list`——它是 TUI 会卡住 auto）。**零个可用** → 退化为 A 窗口自身 `Task` 子代理实现（并记 blocker：违反 invariant#1 的降级，需用户知情）。
- `<workflow>` = 探测到的工作流根（`.workflow/` 或项目约定）。
</environment_preflight>

<context>
$ARGUMENTS 解析：
- `--auto` / `-y`：自治模式（invariants#3）。`-y` 非交互必需；`--auto` 仅 codex 子会话额外带。
- `--executor <cli>`：本次实现默认 CLI（覆盖 config）。
- `--review L1|L2|L3`：强制评审档（缺省自适应 + invariant#7 的 L2 下限）。
- `--max-rounds N`：外层循环硬上限（缺省 30）。
- 其余 → `<需求/intent>`。
读取（只读）：`state.json`(游标)、`roadmap.md`、子会话 `status.json`/`session.json`(结果)、`cli-tools.json`(CLI 优先级)。
</context>

<state_machine>
S_PREFLIGHT → S_INIT → S_ANALYZE → S_COMPLEXITY → {S_DIVERGE | S_ROADMAP}
S_DIVERGE → S_ROADMAP
S_ROADMAP → S_LOOP_INPUT
# 外层循环（每轮都从 S_LOOP_INPUT 进，保证三类输入与游标重装配）
S_LOOP_INPUT → S_DECIDE
S_DECIDE → {S_TERMINATE(roadmap 完成或撞上限) | S_REVISE_ROADMAP(修正) | S_SELECT_EXECUTOR(推进/插入修复)}
S_REVISE_ROADMAP → S_LOOP_INPUT
S_SELECT_EXECUTOR → S_DELIVER → S_AWAIT → S_REVIEW → S_VERDICT
S_VERDICT → {S_LEDGER(通过) | S_LOOP_INPUT(插入修复→重装配) | S_AUTO_FULLCHAIN(撞硬信号且 --auto -y) | S_ESCALATE(撞硬信号且非auto)}
S_AUTO_FULLCHAIN → S_LOOP_INPUT
S_LEDGER → {S_LOOP_INPUT(未完且未撞上限) | S_TERMINATE(完成或撞上限)}
S_ESCALATE → {S_LOOP_INPUT(用户给了指示) | END(用户中止)}
S_TERMINATE → END
</state_machine>

<transitions>
S_PREFLIGHT → S_INIT          : 环境探测完成（模式/默认/可用CLI 已定）
S_INIT → S_ANALYZE            : 台账建好 + (auto 跳过人工 /goal 粘贴)
S_ANALYZE → S_COMPLEXITY      : analyze 成功
S_ANALYZE → S_ESCALATE/继续   : analyze 失败 → auto 则重试1次后带缺信息继续；非auto 升级
S_COMPLEXITY → S_DIVERGE      : 复杂度=高
S_COMPLEXITY → S_ROADMAP      : 复杂度=低
S_DIVERGE → S_ROADMAP         : grill+brainstorm(可选蚁群) 完成
S_ROADMAP → S_LOOP_INPUT      : roadmap.md + milestones[] 写出；空 roadmap → S_ESCALATE/重做
S_LOOP_INPUT → S_DECIDE       : 三类输入装配完成（首轮：结果/裁决为空，仅游标）
S_DECIDE → S_TERMINATE        : roadmap 全完成 或 round ≥ max_rounds
S_DECIDE → S_REVISE_ROADMAP   : roadmap 本身有问题（优先级高于插入修复）
S_DECIDE → S_SELECT_EXECUTOR  : 推进(默认) 或 插入修复
S_REVISE_ROADMAP → S_LOOP_INPUT : 改成功(applied) 或 改被拒→回退方案(declined-fallback)，均重算游标
S_SELECT_EXECUTOR → S_DELIVER : 选定 ralph|odyssey-* + 实现 CLI + 评审 CLI(≠实现)
S_DELIVER → S_AWAIT           : 已派发
S_AWAIT → S_REVIEW            : 子会话到**终态**(completed/paused/criteria 满足) + 结果取回
S_REVIEW → S_VERDICT          : 自适应评审完成
S_VERDICT → S_LEDGER          : 通过(无 gap、非假绿、子会话 completed)
S_VERDICT → S_LOOP_INPUT      : gap/假绿/confidence<60/解析失败 → 决策插入修复(重装配输入)
S_VERDICT → S_AUTO_FULLCHAIN  : 撞硬信号 且 --auto -y
S_VERDICT → S_ESCALATE        : 撞硬信号 且 非 auto
S_AUTO_FULLCHAIN → S_LOOP_INPUT : 全链路分析+自主决策完 → 继续(重装配)
S_LEDGER → S_LOOP_INPUT       : 还有未完成单元 且 round < max_rounds
S_LEDGER → S_TERMINATE        : 全完成 或 round ≥ max_rounds(记 PARTIAL)
S_ESCALATE → S_LOOP_INPUT     : 用户给指示
S_ESCALATE → END              : 用户中止
</transitions>

<actions>

## A_PREFLIGHT (S_PREFLIGHT)
执行 <environment_preflight> 全部探测，确定：运行模式(maestro-CLI / 纯 Skill)、默认 roleMappings、可用实现 CLI 列表、`<workflow>` 根。任何缺失记入 ledger.blockers，不中断。

## A_INIT (S_INIT)
1. 解析 $ARGUMENTS（auto/-y/executor/review/max_rounds/intent）。`max_rounds` 缺省 30（仅安全兜底，**非**正常停止依据）。
2. 建 `<workflow>/.brain/brain-{ts}/ledger.json`（{ts}=`YYYYMMDD-HHMMSS`；schema 见 <ledger_schema>）。
3. **A_EMIT_GOAL（必做、load-bearing，invariant#8）**：产出一段**内容正确的 `/goal`** 供用户在会话开始**粘贴一次**
   来**武装这个 loop**。这是循环的**主停止控制**（宿主持久化终止条件）。模板见 <goal_prompt_template>。
   - **停止条件必须写正确**：完成 = `state.json` 全 milestone `completed` 且无未决 deferred/blocker；
     不能太松（永不停）也不能太紧（漏阶段早停）。把该条件**同时**镜像进 `ledger.stop_condition` 供 brain 自检对账。
   - **`--auto -y` 不跳过本步**：`/goal` 是会话开始的一次性"武装 loop"，由用户粘贴；`--auto -y` 只管 loop **内**
     每轮不停顿。若确为全无人值守（无人可粘贴）→ 退化为 brain 靠 `Skill` 自调用链 + `ledger.stop_condition` 自驱，
     但**仍按相同的正确停止条件**控制终止。

## A_ANALYZE (S_ANALYZE)
- `Skill("maestro-analyze", "<intent>")` 或 `maestro delegate --role analyze`（视模式）。失败 → 见 transitions。

## A_COMPLEXITY (S_COMPLEXITY) — ◇自决
高（任一）：跨多子系统 / 含未知技术选型 / 触数据模型或迁移 / 估 >1 milestone → S_DIVERGE；否则 S_ROADMAP。

## A_DIVERGE (S_DIVERGE)
1. grill → brainstorm（`Skill` 或 delegate）。
2. **◇是否蚁群分析**：仅当"需在多候选方案空间搜索最优"才用；否则跳过（小任务不强制）。
   - 蚁群默认**在进程内**（`Task`/`team-swarm`，符合现状）。
   - **opt-in 外部**：若 `cli-tools.json` `tools.agy.enabled==true`，可把 ant 委派 `maestro delegate --to agy --mode analysis`；否则回退进程内。

## A_ROADMAP (S_ROADMAP)
- roadmap 生成 → `roadmap.md` + `state.json.milestones[]`。空/失败 → S_ESCALATE 或重做一次。

## A_LOOP_INPUT (S_LOOP_INPUT) — 每轮装配（插入修复/全链路/修正后**都回到这里**重装配）
1. **游标**：从 `state.json` 求 next-incomplete phase/milestone。
2. **上轮结果**：读上一子会话 `status.json`（完成态/摘要/caveats/deferred/子目标）。首轮空。
3. **裁决信号**：上轮 S_VERDICT 结论。首轮空。
4. 读 ledger（历轮决策/blocker/deferred）。
5. **轮次自增并检查**：`round++`；若 `round > max_rounds` 标记 budget_exhausted。

## A_DECIDE (S_DECIDE) — ◇核心自决（**按优先级，互斥穷尽**）
按以下顺序，命中即定：
1. **终止检查（最先）**：roadmap 全单元 completed（以对账后的真值，invariant#7）→ S_TERMINATE；
   或 budget_exhausted → S_TERMINATE(PARTIAL)。
2. **roadmap 有问题**（需求漏映射/阶段错/依赖环）→ **修正 roadmap** → S_REVISE_ROADMAP。
   （注：roadmap 问题优先于结果问题——先校正蓝图再谈修补。若同时存在，先修 roadmap，结果问题下一轮再处理。）
3. **上轮结果有问题**（gap/假绿/未达成）→ **插入修复**（roadmap 不动）→ S_SELECT_EXECUTOR。
4. **默认 → 推进**：取游标下一单元 → S_SELECT_EXECUTOR。

## A_REVISE_ROADMAP (S_REVISE_ROADMAP)
- `maestro-roadmap --revise`（或纯 Skill 模式就地改）；保留已完成阶段、十进制插号。
- **非 auto 且撞 E005**（改动废已完成阶段）→ AskUserQuestion 确认；**用户拒** → 回退：改为"加补充阶段"
  的最小增量方案（不动已完成），仍前进（**declined-fallback**，避免死锁）。
- **auto 且撞 E005** → S_AUTO_FULLCHAIN 的逻辑（全链路分析后自主定增量改法），不停。
- 重算游标 → S_LOOP_INPUT。

## A_SELECT_EXECUTOR (S_SELECT_EXECUTOR) — ◇
- **选子命令**：ralph（多命令里程碑/最优序列不明/跨阶段）｜odyssey-*（单目标单元：debug/planex/review-test-fix/ui/improve 按域）。
- **选实现 CLI**：`--executor` > `roles.implement` 链中**首个可用** > 默认 claude。记为 `impl_cli`。
- **选评审 CLI（invariant#4 具体算法）**：`review_cli` = `roles.review` 链中**首个可用且 ≠ impl_cli**；
  若可用 CLI 仅 1 个 → 评审改用**不同 model**（`--model`）或升级到 `maestro-collab` 多 CLI；仍无法区分 → 记 blocker 并标"自评风险"。

## A_DELIVER (S_DELIVER) — 投递（区分能否解释 slash）
**目标 done_when 直接并入 intent 串**（不发独立 `/goal`——它不是命令、单 blob 内两条 slash 不保证都触发）。
- **impl_cli = Claude**（headless 会展开自定义 slash，≥2.1.181，命令文件在 `--cd` 内）：
  `maestro delegate "/maestro-ralph -y <短intent；done_when=…>" --to claude --mode write`（同步）。
- **impl_cli ≠ Claude**（codex/gemini/qwen/agy：slash 当字面文本，**不展开**）：**不要发 `/maestro-ralph`**。
  改为 **A 窗口内 `Skill("maestro-ralph")` 起子会话**（ralph 的 Skill 自调用引擎只能在能跑 Skill 的宿主内运行），
  其 execute 步把**原子写码**逐个 `maestro delegate --to <cli> --mode write` 给该 CLI。
  （即：非 Claude 不能"整条 ralph 丢过去跑"，因 ralph 引擎是 Skill 链，预展开纯文本无法复现——round-1 D2/D3 结论。）
- 纯 Skill 模式（无 maestro CLI）：直接 `Skill("maestro-ralph")` / `Task` 子代理实现。

## A_AWAIT (S_AWAIT) — **等子会话到终态，而非一次 CLI 退出**
- 子会话 = 一整条 ralph/odyssey 运行，不是单次 delegate 调用。
- **判定完成**：轮询/读子会话 `status.json`（ralph：`status ∈ {completed, paused}` 且 `task_decomposition_all_done`）
  或 `session.json`（odyssey：`phase_goals_all_done` 或 `status ∈ {ESCALATED,PARTIAL,INCONCLUSIVE}`）。
  **未到终态不得进 S_REVIEW**（否则在半成品上验收=结构性假绿，round-1 CRIT）。
- 取回：完成态、completion_summary、caveats、deferred、子目标达成、是否 paused/ESCALATED。

## A_REVIEW (S_REVIEW) — 自适应防假绿（评审者≠实现者）
档位（`--review` 可强制；**invariant#7：子会话自报成功且改了代码 → 下限 L2**）：
- **L1 轻量**：仅"无代码改动/纯文档"轮。Goal-Backward verify + 结果分析。
- **L2 标准（含代码的默认下限）**：`quality-review`（用 `review_cli`）+ `insight-challenge` 对每条"绿"对抗反驳
  （把"测试通过/已完成"当**待证声明**，独立复跑、边界用例、git diff 对照声明，不看子会话自带测试）。
- **L3 全链路**：critical/低置信度/auto 撞硬信号 → + `maestro-collab` 多 CLI 共识 + 重读漂移/未达成证据。
- 全程用 `review_cli`（A_SELECT_EXECUTOR 已保证 ≠ impl_cli）。

## A_VERDICT (S_VERDICT) — ◇
- 子会话 completed 且无 gap、非假绿 → S_LEDGER。
- gap/假绿/`confidence<60`/评审解析失败(fail-closed) → 决策插入修复 → **S_LOOP_INPUT**（重装配）。
- **撞硬信号**（ralph 子 `paused` | odyssey 子 `ESCALATED/PARTIAL/INCONCLUSIVE`/`deferred>0` | revise 撞 E005）：
  非 auto → S_ESCALATE；**--auto -y → S_AUTO_FULLCHAIN**。

## A_AUTO_FULLCHAIN (S_AUTO_FULLCHAIN) — D3 自治铁律
1. **全链路分析**：full `quality-review` + `insight-challenge` + `maestro-collab` 多 CLI 交叉 +
   **brain 自身跨会话漂移自检**（对照子会话 completion_evidence vs roadmap intent，不全信子会话自停）。
2. ◇**自主决策**：推进 / 插入修复 / 修正 roadmap。
3. 记台账（`auto_resolved:true` + rationale + evidence_refs）→ **S_LOOP_INPUT** 继续，**不终止**（除非撞 max_rounds）。

## A_LEDGER (S_LEDGER)
- 追加本轮记录（见 <ledger_schema>）。**对账**：以子会话实际产物/status.json 更新 brain 视图，不信可能过期的 state.json。
- 全单元 completed → S_TERMINATE；`round ≥ max_rounds` → S_TERMINATE(PARTIAL)；否则 → S_LOOP_INPUT。

## A_ESCALATE (S_ESCALATE) — 仅非 auto
- `AskUserQuestion` 给出硬信号上下文 + 建议。用户给指示 → S_LOOP_INPUT；中止 → END。

## A_TERMINATE (S_TERMINATE)
- 输出总结（含 PARTIAL 时未完成项与原因）+ 固化知识（`spec-add`/`manage-knowhow-capture`）。结束自调用链。
</actions>

<error_handling>
- **子会话崩溃 / delegate 超时**：当作"撞硬信号"走 S_VERDICT 硬信号分支（auto→全链路重试或换 CLI；非auto→升级）。
- **零可用实现 CLI**：A_PREFLIGHT 已降级为 `Task` 子代理（记 blocker）；若也不可行 → S_ESCALATE。
- **analyze/roadmap 失败**：auto 重试 1 次→带缺失信息继续并记 blocker；非auto 升级。
- **空 roadmap**：S_ROADMAP 不产单元 → 重做一次→仍空则 S_ESCALATE。
- **max_rounds 兜底**：任何路径下 `round ≥ max_rounds` 都强制 S_TERMINATE(PARTIAL)，杜绝活锁。
</error_handling>

<ledger_schema>
`<workflow>/.brain/brain-{ts}/ledger.json`：
```json
{
  "session_id": "brain-{ts}", "intent": "<原始需求>",
  "auto": true, "yes": true, "max_rounds": 30,
  "mode": "maestro-cli | skill-only", "executor_default": "claude",
  "available_clis": ["claude","codex"], "stop_condition": "all milestones completed",
  "key_decisions": [], "blockers": [], "deferred": [],
  "rounds": [
    { "round": 1, "cursor": "M1/phase-1", "decision": "advance|insert-fix|revise-roadmap",
      "executor": "ralph|odyssey-*", "impl_cli": "claude", "review_cli": "codex",
      "review_tier": "L1|L2|L3", "verdict": "pass|gap|false-green|hard-signal",
      "child_session": "ralph-...", "child_status": "completed|paused|ESCALATED",
      "auto_resolved": false, "rationale": "", "evidence_refs": [],
      "artifacts": ["EXC-001"], "caveats": [], "deferred": [] }
  ],
  "status": "running|completed|partial|escalated"
}
```
</ledger_schema>

<goal_prompt_template>
A_EMIT_GOAL 产出（用户会话开始粘贴一次，武装并控制 loop 的停止）。**停止条件务必写正确**：
```
/goal
[maestro-brain · {session_id}] 自治调度大脑 loop
需求：{intent}
循环：每轮 装配输入 → 自决(推进/插入修复/修正roadmap) → 派外部CLI实现 → 防假绿验收 → 记台账
继续条件：state.json 仍有 milestone.status != "completed"
**停止条件（达成即完成并停止）**：state.json 全部 milestone.status == "completed"
  且 无未决 deferred、无阻断 blocker（以子会话 status.json/实际代码对账为准，不信过期 state.json）
自治：{auto ? "--auto -y：loop 内撞硬信号转全链路分析+自主决策、永不中途停；仅 max_rounds 安全兜底" : "每轮可人确认"}
安全兜底：round 超过 {max_rounds} 强制以 PARTIAL 收尾（非正常停止依据）
```
要点：正常停止 = 上面的"停止条件"满足；`max_rounds` 只是防活锁兜底，不是正常终止线。
</goal_prompt_template>

<config_injection>
brain 各部分 CLI 优先级复用 `cli-tools.json` 的 role（`maestro config delegate roles`）：
analysis→`analyze`、implement→`implement`、review→`review`、brainstorm→`brainstorm`。
swarm/roadmap-revise **无对应 role** → 用 `--to <cli>` 显式（手写 `brain` config 段会被 save 白名单剥掉，勿依赖）。
</config_injection>

<changelog_v2>
针对 round-1 反向评测（maestro-research/brain-eval）修复：
- [CRIT] 加 max_rounds/budget 硬上限 + S_TERMINATE(PARTIAL)，auto 永不停的唯一例外（杀活锁）。
- [CRIT] A_AWAIT 重定义为"等子会话到终态"（读 status.json），非"一次 CLI 退出"（杀半成品假绿）。
- [CRIT] 投递去掉 `/goal` 第二段 slash（非命令/两 slash 不保证触发）；done_when 并入 intent；
  非 Claude 改为 A 窗口内 `Skill("maestro-ralph")` + 原子写码外派（预展开无法复现 ralph 引擎）。
- [HIGH] auto 跳过人工 /goal 粘贴；终止依据改为 ledger.stop_condition + Skill 自调用链。
- [HIGH] 插入修复/全链路/修正后统一回 S_LOOP_INPUT 重装配输入。
- [HIGH] A_DECIDE 改为优先级互斥穷尽 + 终止检查最先 + roadmap优先于结果问题。
- [HIGH] evaluator≠implementer 给出具体选择算法（review_cli 首个可用且≠impl_cli，否则换 model/collab）。
- [HIGH] agy 探测改读 `tools.agy.enabled` 标志（不跑会卡住的 `tools list`）。
- [HIGH] 加 <environment_preflight> + <error_handling>：探测 maestro/cli-tools/state，处理崩溃/超时/空roadmap/零CLI。
- [MED] L2 设为含代码轮的评审下限（invariant#7）；终止前以子会话真值对账（不信过期 state.json）。
- [MED] ledger 扩展 rationale/evidence/caveats/deferred；S_REVISE_ROADMAP 加 declined-fallback 出口；S_ANALYZE 加失败边。
</changelog_v2>
