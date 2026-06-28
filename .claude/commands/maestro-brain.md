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

<!-- v11 — unified with maestro conventions: slimmed (changelogs/validation -> research docs), action bodies delegate to `maestro brain` engine (no prose/code duplication), review is prompt-owned (no dead brain-review module). Lineage in maestro-research/12. -->

<purpose>
maestro-brain 是 maestro 的**外层调度大脑**：站在 roadmap 之上，每轮只做"分析 + 决策 + 派发 + 验收"，
把一整条 roadmap 自治地推到完成。它**自己不写业务代码**——所有实现都派发给外部 CLI 或 ralph/odyssey 子会话
（默认 Claude，可配优先级）。它复用 maestro 已有的 analyze/grill/brainstorm/roadmap/ralph/odyssey/collab/quality-* 命令。
</purpose>

<invariants>
1. **A 窗口只分析与调度，从不亲自写/改业务代码。** 一切实现派发给外部 CLI 或 ralph/odyssey 子会话。
2. **决策由本 agent 在上下文内自决**（不另起 LLM 判官），形状 = 默认按 roadmap 推进 + 两异常分支
   （结果有问题→插入修复；roadmap 有问题→修正 roadmap）。
3. **自治模式（`AUTONOMOUS`，即 `-y` 存在；下文"`--auto -y`/auto 模式"均指此）下永不因"需人确认"而中途停**：
   把本应升级给人的情形转成"全链路分析 → 自主决策 → 继续推进"，**唯一例外**是 §budget 的硬上限
   （轮次/预算耗尽 → 记 PARTIAL 后正常终止，非死循环）。**非自治**（无 `-y`）时保留 AskUserQuestion 升级路径。
4. **评审者 ≠ 实现者**：验收用的 CLI/role/model 必须显式不同于刚写码的 CLI（防自批自绿，见 A_REVIEW 选择算法）。
5. **目标由子命令自写**：派 ralph/odyssey 时只给"短 intent + done_when"，不替它预写完整目标。
6. **状态落盘**：每轮写 brain 台账（`<workflow>/.brain/brain-{ts}/ledger.json`），可续跑、可审计。
7. **不盲信子会话自报**：凡子会话**自报成功且改了代码**，独立评审下限为 **L2**；终止前以**子会话 status.json/实际代码**
   为准重对账，不信可能过期的 state.json。
8. **brain 必须产出正确的 `/goal` 来设置并控制 loop 的停止。** `/goal` 是宿主的持久化终止条件机制——它**就是**
   循环的停止契约。brain 的核心职责之一是把**停止条件写正确**：太松→永不停，太紧→提前停。loop 跑到该 `/goal`
   的完成条件满足时即**完成并停止**。`--auto -y` 只管 loop **内**每轮不停顿，**不**取消/降级 `/goal`。
</invariants>

<engine>
**两层架构（仿 ralph/odyssey）：本提示词是 FSM「剧本」；`src/brain/` 的 TypeScript 是确定性「引擎」。**
当 `maestro` CLI 可用时，决策/派生/终止**用代码强制**（非纯提示词自由发挥）：
- `maestro brain init "<intent>" [-y] [--max-rounds N]` → 建 `.workflow/.brain/brain-{ts}/ledger.json`（拒空 intent、校验参数）。
- `maestro brain derive [--json]` → 输出本轮决策输入：`cursor`（next-incomplete，跳过已 resolved 的 optional）、
  `stop`（机器评估的 mandatory/optional stop_predicate）、`router`（latest_artifact_type 等信号）。
- `maestro brain decide --signal ok|result-problem|roadmap-problem:<issue>|unfixable-external [--commit] [--json]` →
  跑 A_DECIDE 引擎（优先级互斥穷尽 + 收敛 caps），返回 decision/giveUp/demote/escalate。**`--commit`** 持久化本轮：
  应用收敛计数器 bump（caps 才会跨轮触发）+ 追加 round 到 ledger。每轮决策**带 `--commit`**。
- `maestro brain await <child-status.json> --kind ralph|odyssey [--timeout-min N]` → **挂起**（事件驱动 `fs.watch`，非忙轮询）
  直到子会话到终态；exit 0=completed，1=硬信号（paused/failed/timeout/missing）。
- `maestro brain status` → 会话摘要。
引擎模块（确定性逻辑，~8 个，对齐 ralph 粒度）：`brain-schema`（类型/阈值）、`brain-store`（原子 ledger）、
`brain-derive`（cursor + mandatory/optional 视图 + `deriveRouterSignals` 修 `_router.json` bug）、`stop-predicate`（终止谓词）、
`brain-decide`（决策 + 收敛 caps）、`brain-await`（事件驱动挂起，仅 Claude）、`cmd-brain`（CLI）。单测 `src/brain/__tests__/`（49 例）。
**评审编排是提示词所有**（LLM 工作，非纯计算）：见 A_REVIEW，由本 FSM 派生 quality-review/insight-challenge/collab 等 agent——
与 maestro"评审=作者化 agent 而非 TS planner"一致（故无 brain-review 模块）。
**skill-only 模式**（无 maestro CLI）按本文档在上下文内推理这些确定性逻辑（引擎是规范，提示词是回退）。
</engine>

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
- **`AUTONOMOUS` 语义（v4 定死，修 R2 #6a/#6b）**：`AUTONOMOUS := (-y 存在)`。`-y`=非交互自治（硬信号转
  S_AUTO_FULLCHAIN、不向人升级）。`--auto` 仅作**传给 codex 子会话**的附加 flag，**不**单独决定自治；
  `--auto` 无 `-y` ⇒ 非自治（交互、门禁生效），并提示"无 -y 时 --auto 对外层无效"。
- `--executor <cli>`：本次实现默认 CLI（覆盖 config）。
- `--review L1|L2|L3`：强制评审档（缺省自适应 + invariant#7 的 L2 下限）。
- `--max-rounds N`：外层循环硬上限（缺省 30）。
- 其余非 `--` 文本 → `<需求/intent>`。
读取（只读）：`state.json`(游标)、`roadmap.md`、子会话 `status.json`/`session.json`(结果)、`cli-tools.json`(CLI 优先级)。

**A_INIT 参数校验层（v4，修 R2 #1/#4/#6/#7）——解析后立即校验，不合法即处理：**
- **空 intent**（`trim==""`）：非自治 → AskUserQuestion 索取需求；自治 → 直接终止 `escalated` + blocker `empty-intent`，**不进 S_ANALYZE**（禁止凭空造 roadmap）。
- `--max-rounds`：必须整数 ≥1，否则报错并取缺省 30（`0`/`abc` 不静默吞）。
- `--review`：必须 ∈ {L1,L2,L3}，否则报错并回缺省自适应。
- `--executor`：必须非空且 ∈ 可用 CLI，否则忽略并回 config。
- **未知 `--xxx` token**：报错列出，**不得**吞进 intent。
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
4. 读 ledger（历轮决策/blocker/deferred + 收敛计数器）。
5. **轮次自增并检查**：`round++`；若 `round > max_rounds` 标记 budget_exhausted（安全兜底）。
6. **收敛计数器**（防空转，区分"进展" vs "原地打转"）：
   - `stuck[unit]`：当前游标单元被**连续插入修复**的次数（推进成功或换单元则清零）。
   - `revises[issue]`：同一 roadmap 问题被**连续修正**的次数（推进/换问题则清零）。

## A_DECIDE (S_DECIDE) — ◇核心自决（**按优先级，互斥穷尽 + 收敛护栏**）
按以下顺序，命中即定：
1. **终止检查（最先）**：按 `ledger.stop_predicate` **机器校验**（修 R12-HIGH，**区分 mandatory/optional milestone**）：
   `mandatory.every(status=="completed") && optional.every(completed || (deferred && defer_reason)) && 无 open defect blocker && 无 open mandatory deferred`
   （以对账后真值，invariant#7；不依赖解析 `/goal` prose）。
   - **milestone 需带 `mandatory|optional` 属性**（roadmap 生成时按需求标"必做/可选/stretch/best-effort"）；缺省 mandatory。
   - **optional 单元被 acknowledged-deferred（带 defer_reason）即算 resolved，不得因其未实现而 loop 不停**；
     反之 mandatory 未完成绝不停。终止态：全 completed → `completed`；有 optional 被 ack-deferred → `completed-with-optional-deferred`（**非 PARTIAL/失败**）。
   **blocker 严重度**：blocker 分 `defect`（未解的代码/功能缺陷，阻断 `completed`）与 `info`
   （环境降级/评审降档等信息性，**不**阻断终止）。终止只看**未解的 `defect` 级 blocker 与 open deferred**；
   信息性 blocker（skill-only/`review-tier-capped` 等）应标 `state:"acknowledged"`（非 `open`），终止时不计入；
   这样审计看到的是"completed + 若干 acknowledged info"，而非"completed 却有 open blocker"。
   满足 → S_TERMINATE；budget_exhausted → S_TERMINATE(PARTIAL)。
2. **roadmap 有问题** 且 `revises[issue] < 2`（**防饿死/防 revise-thrash**）→ **修正 roadmap** → S_REVISE_ROADMAP。
   - `revises[issue] ≥ 2`（同一问题反复改仍未解）→ **降级(DEMOTE)**：不再改 roadmap，记 `defect` blocker，转按"结果问题"（下条）处理，
     让真实结果问题不被 revise 持续抢占。**DEMOTE 后该单元改用 `stuck[cursor-unit]` 计数（接续不清零、不另起），
     避免双计数**。
   - 同时存在 roadmap 问题与结果问题：先 roadmap（仅一次），下一轮处理结果问题。
3. **上轮结果有问题** 且 `stuck[unit] < 3`（**per-unit 提前收敛**）→ **插入修复** → S_SELECT_EXECUTOR。
   - **快路**：若上轮 L2/L3 裁决为 `UNFIXABLE-EXTERNAL`（外部死依赖，conf≥95）→ **立即 defer**，不必凑满 3 次空转。
   - `stuck[unit] ≥ 3`（同一单元修 3 次仍不过）→ **提前给结论**，不再空转：
     **auto** → 把该单元标 `deferred` + `defect` blocker，**推进过它**（不耗尽全局预算在一个死结上，修复 N1/N6）；
     **非 auto** → S_ESCALATE。
4. **默认 → 推进**：取游标下一单元 → S_SELECT_EXECUTOR。

## A_REVISE_ROADMAP (S_REVISE_ROADMAP)
- `maestro-roadmap --revise`（或纯 Skill 模式就地改）；保留已完成阶段、十进制插号。
- **插号格式**：插入阶段统一用 `phase-{N}.{k}`（如 `phase-2.5`、`phase-2.6`），**数值排序**（不是字典序，
  避免 `phase-10` 排到 `phase-2.5` 前）；游标按 `(major, minor)` 数值序求 next-incomplete。
- **非 auto 且撞 E005**（改动废已完成阶段）→ AskUserQuestion 确认；**用户拒** → 回退：改为"加补充阶段"
  的最小增量方案（不动已完成），仍前进（**declined-fallback**，避免死锁）。
- **auto 且撞 E005** → S_AUTO_FULLCHAIN 的逻辑（全链路分析后自主定增量改法），不停。
- 重算游标 → S_LOOP_INPUT。

## A_SELECT_EXECUTOR (S_SELECT_EXECUTOR) — ◇
- **选子命令（决策表，修 R8-D1）** —— 按 task-shape 而非仅"域"，cardinality 优先：
  | task-shape | 选 |
  |---|---|
  | 单个失败测试 / 回归 / 已知症状未知根因 | **odyssey-debug** |
  | 单需求、有验收标准、要 plan→execute→verify | **odyssey-planex** |
  | 单元的审查/测试/修复闭环 / UI / 改进 | odyssey-review-test-fix / -ui / -improve（按域） |
  | ≥2 命令 / 最优序列不明 / 跨阶段里程碑 | **ralph** |
- **选实现 CLI**：`--executor` > `roles.implement` 链中**首个可用** > 默认 claude。记为 `impl_cli`。
- **选评审 CLI（invariant#4 具体算法）**：`review_cli` = `roles.review` 链中**首个可用且 ≠ impl_cli**；
  若可用 CLI 仅 1 个 → 评审改用**不同 model**（`--model`）或升级到 `maestro-collab` 多 CLI。
  - **分离轴**：评审者≠实现者的有效分离轴 = {不同 CLI｜不同 model｜**不同子代理实例/角色（fresh context、无实现者推理）**}。
    skill-only/零CLI 模式下，**一个独立的 reviewer 子代理实例即满足 #4**，不必记"自评风险" blocker；仅当评审与实现是**同一实例**时才记。

## A_DELIVER (S_DELIVER) — 投递（区分能否解释 slash）
**目标 done_when 直接并入 intent 串**（不发独立 `/goal`——它不是命令、单 blob 内两条 slash 不保证都触发）。
- **impl_cli = Claude**（headless 会展开自定义 slash，≥2.1.181，命令文件在 `--cd` 内）：
  `maestro delegate "/maestro-ralph -y <短intent；done_when=…>" --to claude --mode write`（同步）。
- **impl_cli ≠ Claude**（codex/gemini/qwen/agy：slash 当字面文本，**不展开**）：**不要发 `/maestro-ralph`**。
  改为 **A 窗口内 `Skill("maestro-ralph")` 起子会话**（ralph 的 Skill 自调用引擎只能在能跑 Skill 的宿主内运行），
  其 execute 步把**原子写码**逐个 `maestro delegate --to <cli> --mode write` 给该 CLI。
  （即：非 Claude 不能"整条 ralph 丢过去跑"，因 ralph 引擎是 Skill 链，预展开纯文本无法复现——round-1 D2/D3 结论。）
  > **与 invariant#1 的边界**：此处"A 窗口内跑 ralph"指 A 窗口**托管 ralph 的编排链**（决定步骤、
  > 派发、推进），**所有原子写码仍 100% 外派给 impl_cli**——A 窗口绝不自己 Edit 业务代码。托管编排 ≠ 写代码，
  > invariant#1 不破。若想连编排也隔离出去，则只能用 Claude impl_cli（上一条）。
- 纯 Skill 模式（无 maestro CLI）：直接 `Skill("maestro-ralph")` 托管编排 / `Task` 子代理写码（同样不自写业务码）。
  编排 Skill 本身不可用时，**裸 `Task` 子代理实现可接受**（记 info blocker）。
- **增量编辑契约**：多阶段消费边（phase-N 依赖 phase-(N-1) 产物）时，done_when **必须含**：
  "先 READ 现有文件 + 上一阶段交付符号；**消费**之而非重声明/重复实现；**仅追加/最小改**，不 clobber 既有导出"。
- **安装隔离**：委派的 `npm/pip install` 等**依赖操作**会顺父目录污染宿主 `package.json`/lock。
  done_when 须要求子任务**自包含**（沙盒内独立工程或隔离安装）；A_VERDICT 前 brain 检查宿主清单/lock 未被改动，被改则**还原**。

## A_AWAIT (S_AWAIT) — 挂起等子会话到终态（代码强制）
- 调 **`maestro brain await <child-status.json> --kind ralph|odyssey [--timeout-min N]`**：引擎（`brain-await.ts`）
  **事件驱动挂起**（`fs.watch`，非忙轮询）直到子会话到终态，用 v8 核实的真实字段
  （ralph `status∈{completed(+task_decomposition_all_done),paused,failed}`；odyssey `current_state=="COMPLETED"`/`phase_goals_all_done`）。
  exit 0=completed；exit 1=硬信号（paused/failed/timeout/missing）。
- **fail-closed**：缺字段/读不到/超时一律按"未到终态/硬信号"，**绝不**把读不到完成标志误判成已完成（宁超时不假绿）。
- **未到终态不得进 S_REVIEW**。失败/超时 → S_VERDICT 硬信号分支（auto→全链路重试/换执行器；非auto→升级）；
  重试前 re-READ 现有文件，半成品当**未受信**（防 clobber）。
- 取回：终态、completion_summary、caveats、deferred、子目标达成、是否 paused/failed。

## A_REVIEW (S_REVIEW) — 自适应防假绿（评审者≠实现者）
档位（`--review` 可强制；**invariant#7：子会话自报成功且改了代码 → 下限 L2**）：
- **L1 轻量**：仅"无代码改动/纯文档"轮。Goal-Backward verify + 结果分析。
- **L2 标准（含代码的默认下限）**：`quality-review`（用 `review_cli`）+ `insight-challenge` 对每条"绿"对抗反驳
  （把"测试通过/已完成"当**待证声明**，独立复跑、边界用例、git diff 对照声明，不看子会话自带测试）。
  - **测试调用契约（修 R7-D1/R9-D1，让 invariant#7 可执行而非口号）**：评审复跑**必须用项目真实测试命令**（vitest/bun/pytest…），
    并**粘贴框架自带的 pass/fail banner**（如 `Tests 6 passed (6)`），**不得**用自制 runner 冒充框架结果。
    若真实 runner 不可用（无 `node_modules`/out-of-tree 副本）→ 评审**显式声明**改用自包含 runner（如 `node --experimental-strip-types`）
    并标注"非项目框架"；**A_VERDICT 前 brain 亲自再用真实命令复跑一次对账**（R7 正是靠这步抓出评审用替代 runner 谎报绿）。
- **L3 全链路**：critical/低置信度/auto 撞硬信号 → + `maestro-collab` 多 CLI 共识 + 重读漂移/未达成证据。
- 全程用 `review_cli`（A_SELECT_EXECUTOR 已保证 ≠ impl_cli）。
- **可行性降档（v4，修 R2 #5）**：`--review L3`（或 L2）所需的多 CLI/独立 CLI 在 **skill-only/零CLI** 模式下不可行时
  → **降到可行档**（如 L3→用不同 model 的 L2，或 L2→Task 子代理独立复验），并记 blocker `review-tier-capped`；
  **绝不**因不可行而跳过评审（含码轮评审下限仍是 invariant#7 的 L2 等价物）。

## A_VERDICT (S_VERDICT) — ◇
- 子会话 completed 且无 gap、非假绿 → S_LEDGER。
- gap/假绿/`confidence<60`/评审解析失败(fail-closed) → 决策插入修复 → **S_LOOP_INPUT**（重装配）。
- **撞硬信号**（ralph 子 `status=="paused"` 或 `"failed"` | odyssey 子 `current_state≠"COMPLETED"` 且摘要 INCONCLUSIVE/PARTIAL 或 `deferred>0` | revise 撞 E005 | await 超时）：
  非 auto → S_ESCALATE；**--auto -y → S_AUTO_FULLCHAIN**。

## A_AUTO_FULLCHAIN (S_AUTO_FULLCHAIN) — D3 自治铁律
1. **全链路分析**：full `quality-review` + `insight-challenge` + `maestro-collab` 多 CLI 交叉 +
   **brain 自身跨会话漂移自检**（对照子会话 completion_evidence vs roadmap intent，不全信子会话自停）。
2. ◇**自主决策**：推进 / 插入修复 / 修正 roadmap。
   - **崩溃/超时重试有界**：崩溃/超时恢复用 `convergence.crash_retries[unit]` 计数（**独立于 stuck**），
     **上限 2**；超限 → 把该单元标 `deferred` + `defect` blocker、推进过它（auto）/升级（非auto），
     **绝不**让一个反复崩溃的单元只靠 max_rounds 兜底地 spin 掉全部预算。
3. 记台账（`auto_resolved:true` + rationale + evidence_refs）→ **S_LOOP_INPUT** 继续，**不终止**（除非撞 max_rounds）。

## A_LEDGER (S_LEDGER)
- 追加本轮记录（见 <ledger_schema>）。**对账**：以子会话实际产物/status.json 更新 brain 视图，不信可能过期的 state.json。
- stop_predicate 满足（mandatory 全 completed + optional 全 resolved，见 A_DECIDE#1）→ S_TERMINATE
  （全 completed=`completed`；有 optional ack-deferred=`completed-with-optional-deferred`）；
  `round ≥ max_rounds` → S_TERMINATE(PARTIAL)；否则 → S_LOOP_INPUT。

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
- **max_rounds 兜底 + 宽限**：`round ≥ max_rounds` 强制 S_TERMINATE(PARTIAL) 杜绝活锁；但若**收敛计数器仍在推进**
  （上一轮某 `stuck`/`revises` 刚因成功而清零、即仍在产出进展）则给**1 轮宽限**，避免正确的 revise→cap→demote 序列（单硬单元约 4–5 轮）
  在紧 max_rounds 下被误判 PARTIAL。**默认 max_rounds 估算**：`≳ Σphases + (revises_cap+stuck_cap)·预估硬单元数`（缺省 30 适配中小项目）。
</error_handling>

<ledger_schema>
`<workflow>/.brain/brain-{ts}/ledger.json` —— **完整 schema 由 `src/brain/brain-schema.ts` 定义**（单一真相源）。要点：
- `stop_predicate`：`{mandatory_all_completed, optional_all_resolved, no_open_defect_blocker, no_open_mandatory_deferred}`（机器评估）。
- `blockers[]`：`{id, severity: defect|info, state: open|acknowledged|resolved, note}`（仅 open defect 阻断终止）。
- `convergence`：`{stuck, revises, crash_retries}`（per-unit/issue 计数；`decide --commit` 持久化以触发 caps）。
- `rounds[]`：`{round, cursor, decision, executor, impl_cli, review_cli, review_tier, verdict, child_status, auto_resolved, rationale, ...}`。
- `status`：`running | completed | completed-with-optional-deferred | partial | escalated`。
</ledger_schema>

<goal_prompt_template>
A_EMIT_GOAL 产出（用户会话开始粘贴一次，武装并控制 loop 的停止）。**停止条件务必写正确**：
```
/goal
[maestro-brain · {session_id}] 自治调度大脑 loop
需求：{intent}
循环：每轮 装配输入 → 自决(推进/插入修复/修正roadmap) → 派外部CLI实现 → 防假绿验收 → 记台账
继续条件：仍有 MANDATORY milestone 未 completed，或 optional 既未 completed 也未 acknowledged-deferred
**停止条件（达成即完成并停止）**：全部 **MANDATORY** milestone == "completed"，且每个 **OPTIONAL** milestone
  == "completed" 或 (deferred 且 defer_reason 非空=acknowledged)，且无未决 defect blocker
  （以子会话 status.json/实际代码对账为准，不信过期 state.json）
  —— 不得因 optional 未实现而 loop 不停；也不得在 mandatory 未完成时停。
终止态：全 completed → completed；optional 被 ack-deferred → completed-with-optional-deferred（非失败）
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

<lineage>
设计沿革（v2→v11）与逐版修复理由：见 `maestro-research/09`(初评)、`10`(12 轮健壮性战役)、`11`(代码化)、`12`(统一设计)。
落地实测项（V1 Claude headless slash 展开 / V2 `/goal` host 语义 / V7 阈值校准）见 doc 11/12。
</lineage>
