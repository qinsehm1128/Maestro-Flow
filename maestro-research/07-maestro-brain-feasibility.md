# maestro-brain 可行性分析：一个调度型"大脑"循环

> 本文回答一个具体问题：能否新建一个 `maestro-brain` 命令，把用户当前**手工的 A 会话外层循环**
> （分析 → 判复杂度 → grill/头脑风暴 → roadmap → 产 ralph 命令 → 新窗口跑 → 拿回结果分析验证 →
> 决定 {推进 / 修 bug / 建 issue / 改 roadmap / 蜂群分析} → 下一轮）自动化为一个**只分析调度、
> 不亲自实现、实现时委派外部 CLI** 的循环大脑。
>
> 证据基于第 1 轮 5 个并行子代理的源码级检索（findings 见 `_scratch/r1a–r1e`，已 gitignore）。
> 全文区分 **[代码]**（`src/` 强制）与 **[提示词]**（`.md`/`.json` 由 LLM 执行）—— 这是可行性判断的关键。

研究日期：2026-06-27 · 代码版本：`maestro-flow@0.5.42`

---

## 目录

1. [一句话结论](#1-一句话结论)
2. [把"大脑"拆成 7 项能力，逐项对照现状](#2-把大脑拆成-7-项能力逐项对照现状)
3. [关键发现：内层 ralph 与外层 brain 的"缝隙"在哪](#3-关键发现内层-ralph-与外层-brain-的缝隙在哪)
4. [真正的空白 vs 可复用的现成件](#4-真正的空白-vs-可复用的现成件)
5. [maestro-brain 会不会和 maestro / maestro-next / maestro-ralph 重复？](#5-maestro-brain-会不会和-maestro--maestro-next--maestro-ralph-重复)
6. [两种实现策略](#6-两种实现策略)
7. [推荐：分阶段混合方案](#7-推荐分阶段混合方案)
8. [风险与暗坑](#8-风险与暗坑)
9. [给用户问题的直接回答](#9-给用户问题的直接回答)
10. [疑点与未证实项](#10-疑点与未证实项)

---

## 1. 一句话结论

**可行，而且不是从零造。** `maestro-brain` 本质是把 maestro 已有的一堆**内层/单次原语，提升一个高度**
（intra-session → inter-session，single-shot → outer-loop），再补上**一个真正新颖的智能：从 roadmap +
上一轮结果产出下一个目标**（下文称 **H1**）。约 **65–75% 的零件已存在**（命令目录、状态登记表、委派层、
决策原语、循环脚手架、蜂群模式），剩下的是**编排黏合 + H1 + 跨会话状态**。

> 它必须**重度依赖** maestro 的结构化/工程系统（`state.json` 产物登记表、`catalog.json` 命令目录、
> `maestro delegate` 适配器层、ralph 的 `status.json` CLI）—— 大脑的全部价值恰恰在于它是这些之上的
> **编排层**，而非另起炉灶的并行系统。脱离 maestro 的结构，大脑没有任何可调度的东西。

---

## 2. 把"大脑"拆成 7 项能力，逐项对照现状

| # | 大脑需要的能力 | 现状 | 代码/提示词 | 缺口 |
|---|---------------|------|-----------|------|
| C1 | **感知全部可用命令**（知道有哪些命令可选） | ✅ `catalog.json` 存在（63 命令/44 技能/24 代理/21 cli，每条带 `description`+`source`） | [代码-数据]，手工维护 | 命令与技能分两个数组；ACO 蜂群在 `skills[]` 里；无 mode/成本元字段 |
| C2 | **从状态决定下一步命令** | 🟡 三套并存但**断裂**：`_router.json`(图)、`maestro-next`(评分表)、GraphWalker(引擎) | 引擎[代码]，评分[提示词] | `_router.json` 读的状态字段**代码从未计算**，冷启动塌缩成 `to_analyze` |
| C3 | **多轮外层循环 + 跨轮持久化** | 🟡 ralph `status.json` / odyssey `session.json` 都只覆盖**单目标** | ralph[代码]，odyssey[提示词] | 无"会话的会话"、无跨轮台账、无等待子会话原语 |
| C4 | **{推进/修/建issue/改roadmap/蜂群} 分支决策** | 🟡 ralph `{proceed/fix/escalate}` + LLMDecider 存在，但 intra-session、仅 2–4 路 | verdict[提示词]，LLMDecider[代码] | 缺 issue/蜂群/改roadmap 三个一等分支；高度不对 |
| C5 | **委派实现给可配置外部 CLI** | 🟢 `maestro delegate --role implement --mode write` 同步直接回传 transcript | [代码] | 实现委派从未被"分析器"触发过——这是大脑的新职责 |
| C6 | **按情境配置 CLI 优先级**（默认 Claude 写码可改） | 🟢/🟡 `roles.implement.fallbackChain` 配置即可；默认 Claude = 改一个字段 | [代码] | 配置键是 **role**（7 个固定）不是 **situation**；补 situation 约 30 行 |
| C7 | **复杂度判断 → grill/头脑风暴/蜂群 模式选择** | 🟡 命令都在（grill/brainstorm/analyze/swarm），但"何时用蜂群 vs 普通分析"只有散文 | [提示词] | 无 mode 轴枚举、无编码的选择规则 |

**读表方式：** 🟢=可直接用；🟡=有可复用件但需补；没有 🔴。这张表就是可行性的全貌——**没有任何一项是
"完全不存在、必须从零发明"，除了 C2/C3 里的状态派生与跨会话，以及第 3 节讲的 H1。**

---

## 3. 关键发现：内层 ralph 与外层 brain 的"缝隙"在哪

这是整份分析最重要的结论（详见 `_scratch/r1c`）。

**ralph 是内层循环，硬绑定"单个 milestone 内的一组目标"，且引擎对 roadmap 完全无感。**
- [代码] `RalphSession.milestone` 是**标量**不是列表（`status-schema.ts:105`）；`task_decomposition[]` 是
  一组扁平子目标、由一个布尔 `task_decomposition_all_done` 收口（`:131-132`）。schema 结构上装不下 roadmap。
- [代码] 在 `src/ralph/` 里 grep `roadmap|milestone|state.json` 只命中标量字段、打印行、一个 W008 软检查——
  **引擎从不读 `roadmap.md`/`state.json`**（`status-checker.ts:129-132`、`cmd-session.ts:32`）。所有 roadmap
  智能都在 [提示词] 的 build 期定位（`A_RESOLVE_PHASE`）。
- 唯一的多 milestone 动作 `A_ADVANCE_MILESTONE` 只是**重放**一个**预先存在**的 `state.json.milestones[]`
  列表，不能**originate（创作）**目标（`maestro-ralph.md:660-664`）。

**于是缝隙精确地落在用户手工流程的这些步骤上：**

| 步骤（ralph 运行之间，人在做的） | 现成机制？ | 缺口 |
|---|---|---|
| **H1 读 roadmap+上轮结果，决定下一个目标** | **无（任何层都没有）** | 🔴 **唯一真正从零的智能——大脑存在的理由** |
| H2 把目标写成 `maestro-ralph -y "<goal>"` 字符串 | 部分（intent→契约转换在 ralph 内部，但产 intent 串没自动化；invariant 14 禁止 ralph 自推 `-y`） | 字符串作者 |
| H3 开新窗口/起新会话 | 无"会话的会话" | 多会话生命周期 |
| H4 跑到完成 | ✅ **完全存在**（这就是内层 ralph） | 无 |
| H5 拿回结果 | 部分：`buildSessionAnchor` 已聚合 last-5 完成摘要/caveats/deferred（`cmd-next.ts:178-273`），但只喂给**同会话**下一步 | 缺跨会话读取器（trivial） |
| H6 分析验证、判完成度 | 部分：`maestro delegate --role analyze` 验证原语存在，但高度/范围不对 | 复用，调高度 |
| H7 决定 推进/修/escalate | 部分：`S_APPLY_VERDICT` + 置信度护栏 + `A_REGROUND_HALT`（不可跳过的漂移熔断）正是分支形状，但 intra-session | 复用，调到 inter-session |
| H8 把约束带到下一个目标 | 部分：`state.json` 是可行的共享总线 | 无会话→会话契约交接 |

**一句话：缝隙在 H4（内层 ralph 拥有）和 H1（今天人拥有）之间。H1 是唯一零先例的智能；H5–H8 全是
"高度不对的可复用原语"；H2/H3 是作者/编排黏合。大脑 ≈ 高度提升 + 一个 H1 目标作者。**

---

## 4. 真正的空白 vs 可复用的现成件

### 4.1 可直接复用（不必重写）
- **命令目录** `catalog.json` + 每个命令 frontmatter 的 "Use when…" 描述（C1）。
- **委派层** `maestro delegate "<prompt>" --role implement --mode write`：`--mode write` → 各 CLI 的
  bypass 权限（`cli-agent-runner.ts:579`）；**同步模式自动把完整 transcript 追加到 stdout**
  （`delegate.ts:543-556`）——分析→一次 delegate→读 stdout→再分析，零额外管道（C5）。
- **CLI 优先级配置** `roles.implement.fallbackChain`（默认 `["codex","claude","gemini"]`，要默认 Claude
  写码就把 claude 提前一位）；`--to`/`--model`/`--effort` 每任务覆盖（C6）。
- **决策原语** ralph 的 `{proceed/fix/escalate}` + 置信度护栏 + 不可跳过漂移熔断（`maestro-ralph.md:154-174,
  601-614`）；以及 [代码] `LLMDecider`（`coordinate.ts:169` 已接线）用于模糊的"该修还是该推进"（C4/H7）。
- **图引擎** `GraphWalker`（command/decision/gate/fork/join/eval/terminal + delegate 栈 + 重试，
  `graph-walker.ts`）+ `DefaultExprEvaluator`——若走代码路线可直接驱动 brain 图（C2）。
- **循环脚手架** `odyssey-base.md`：session.json、evidence.ndjson、防停滞阶梯、自迭代质量门、知识固化、
  `-c` 续跑——外层长循环需要的反空转机制现成（C3）。
- **结果聚合** ralph `buildSessionAnchor` 的形状（last-5 完成摘要/caveats/deferred）可原样用于跨会话读取（H5）。
- **蜂群模式** `maestro-swarm-workflow`（并行加速器，可作 ralph step）+ `team-swarm`/`team-adversarial-swarm`
  （真 ACO，Python 控制器）（C7）。

### 4.2 真正净新增（按工作量排序）
1. **H1 下一目标作者**（核心智能，零先例）：roadmap + 累积子会话 anchor → 下一个 `maestro-ralph -y "<goal>"`
   或下一个命令。这是大脑唯一不可借用的部分。
2. **跨会话状态**：一个 brain 台账（"会话的会话"）记录"第 N 轮选了 X、结果 Y、故第 N+1 轮该…"；
   `accumulated_context` 存的是决策/blocker 文本而非轮次日志（`r1a` §5.2）。
3. **等待子会话原语**：ralph 的 `active_step_index` 单持有者模型假设步骤**内联完成**；而 brain 的一步=一整个
   ralph 子会话，需要"阻塞等子会话完成再 `ralph complete`"——今天 `src/ralph/` 无此原语（`r1c` §5 阻塞点1）。
   （注：同步 `delegate` 或把子 ralph 当子进程跑可绕过；见第 6 节。）
4. **状态派生层 `deriveBrainState()`**：若走 ChainGraph 路线，必须先把 `_router.json` 假设却没人算的字段
   （`latest_artifact_type`/`has_pending_plans`/`all_phases_executed`/`milestones_total`）从产物登记表派生出来。
   **这同时修了一个现存潜伏 bug**——`_router.json` 今天对真实项目冷启动是塌缩的（`r1a` §4a）。
5. **5 路决策路由**作为一等状态（补 issue/蜂群/改roadmap 三臂）。
6. **per-situation CLI 配置**（约 30 行，镜像 `selectToolByRole`）——或先把情境压到 7 个 role 上（C6）。

---

## 5. maestro-brain 会不会和 maestro / maestro-next / maestro-ralph 重复？

不重复，它们高度不同——这恰好证明 brain 有独立生态位：

| 命令 | 高度 | 循环? | 持久化? | 它做什么 |
|---|---|---|---|---|
| `maestro-next` | 单次 | ❌ | ❌（invariant 1 明确不建 session/不写 status.json） | intent+state → **一个**原子命令推荐 |
| `maestro`（路由器） | 单次构建 | ❌ | 建一次 status.json | intent → chain → 建 ralph 会话并派发 |
| `maestro-ralph` | **内层**循环 | ✅ | status.json（单目标） | 一个目标 → 分解 → 驱动 step 到 milestone-complete |
| **`maestro-brain`** | **外层**循环 | ✅✅ | brain 台账（多会话） | 跨**多个** ralph 运行调度：分析→验证→5 路分支→产下一目标，实现全部委派外部 CLI |

`maestro-brain` = "**roadmap 高度的 ralph，其 step 本身是整个 ralph/grill/头脑风暴/蜂群运行**"。
`maestro-next` 可作为 brain **每一轮内的一次**决策子程序复用（`Skill("maestro-next")`），但它供不了外层
循环和持久化（`r1a` §4b）。

---

## 6. 两种实现策略

### 策略 A — 纯提示词大脑（odyssey/maestro-next 风格，零 TS，最快落地）
一个 `maestro-brain.md` FSM：
- **加载** `catalog.json`（C1）+ `state.json` 产物登记表 + 子 ralph 会话的 `status.json` anchor（H5）。
- **决策** 在上下文内用 LLM 跑（复用 `maestro-next` 的生命周期/评分表作为**规范**，复用 ralph verdict 形状作 H7）。
- **派发** `maestro delegate --role implement --mode write`（C5）/ `Skill(...)` / 把 `maestro-ralph -y "<goal>"`
  当**子进程**或子 Skill 起（H3/H4）。
- **持久化** 一个 brain-session.json（借 odyssey-base 脚手架：防停滞/续跑/知识固化，C3）。
- 所有缺口（H1/H2/5路路由）都写在提示词里。

✅ 立刻可建（≈1 个命令文件 + 改 1 个配置字段把默认写码 CLI 设成 claude）。和 maestro **整个上层就是提示词**
的现实一致（odyssey 100% 提示词、maestro-next/maestro 决策全是提示词）。
⚠️ 脆弱：循环/状态/H1 无代码强制，靠 LLM 遵从；跨会话靠 `state.json` 当总线。

### 策略 B — 代码后端大脑（ChainGraph + GraphWalker）
- 加 `deriveBrainState()` 喂 `ctx.project.*`（修 `_router.json` 潜伏 bug）。
- 把 `_router.json` 扩成 `maestro-brain` ChainGraph，用 `GraphWalker` + `LLMDecider` 跑分支。
- 加等待子会话原语 + 跨轮台账 + per-situation 配置。

✅ 健壮、可强制、可测试、状态闭环。
⚠️ 工作量大；且在 H1（产下一目标）这种**本质模糊**的智能上，代码强制收益有限——它终究要调 LLM。

---

## 7. 推荐：分阶段混合方案

**先 A 验证价值，再把被证明有价值且脆弱的部分硬化进代码（B）。** 这样不必在循环被证明有用前就承诺写代码。

- **Phase 0（现在，1–2 天）— 提示词大脑**：建 `maestro-brain.md`，复用 catalog.json + delegate + maestro-next 表
  + ralph 派发 + odyssey 脚手架。把默认写码 CLI 配成 claude（改 `roles.implement.fallbackChain`）。
  端到端验证"分析→委派→拿回→5路分支→下一轮"。**H1 先用 LLM 在提示词里做。**
- **Phase 1（硬化脆弱件）**：把三样东西落进代码——`deriveBrainState()`（顺手修 `_router.json` bug）、
  跨轮台账、等待子会话原语（或确定用同步 delegate / 子进程 ralph 规避）。
- **Phase 2（提升健壮性）**：把决策路由提升为 `maestro-brain` ChainGraph，由 GraphWalker + LLMDecider 驱动；
  若"压到 7 role"不够再补 `situations` 配置。

**为什么这个顺序**：Phase 0 几乎全用现成件、风险最低、最快拿到反馈；H1 这种模糊智能本来就更适合留在
LLM 层，不急着代码化；`deriveBrainState()` 有独立价值（修现存 bug），值得最先硬化。

---

## 8. 风险与暗坑

1. **`_router.json` 是"愿景数据"不是能用的路由**：它读的决策字段在 TS 里**零命中**，冷启动塌缩成 `to_analyze`
   （`r1a` §4a）。任何走 ChainGraph 的方案必须先建状态派生层，否则继承一个坏地基。
2. **等待子会话**：ralph 单持有者模型假设步骤内联完成；brain step=整个子会话需要"阻塞等待"。最稳妥的
   Phase 0 规避：**用同步 `delegate`**（阻塞直接回 transcript，`delegate.ts:501` 默认同步），或把子 ralph
   当子进程同步跑——避开异步回调对 in-process MCP server 的依赖（`r1d` 未证实项）。
3. **命令目录手工维护、已在漂移**（SKILL 说 64 实际 63；无生成器）。brain 信任它可能枚举到过时命令；
   富选择应当**实时读候选命令的 frontmatter**，catalog 只作索引（`r1e` §4.5）。
4. **蜂群在 `skills[]` 不在 `commands[]`**：枚举"swarm"必须 union 两个数组，且要知道 `maestro-swarm-workflow`
   （并行加速器）≠ `team-swarm`（真 ACO）（`r1e` §4.4）。
5. **两套路由真相源**：`catalog.json.workflows`（数据）与 `maestro-next` 路由表（提示词）重叠却不联动，会漂移。
   brain 应择一或显式调和（`r1e` §4.2）。
6. **per-situation 配置不存在**：今天只有 role→tool（7 个固定 role），无 situation/scenario/profile 概念
   （`r1d` §2）。Phase 0 先把情境映射到 role；真要按情境再补 30 行。
7. **"实现委派从未被分析器触发过"**：ralph 的 delegate 全是 `--role analyze` 只读评估；从分析器发出
   `--mode write` 实现委派是 brain 的净新职责（`r1d` §3）——也是它和现有一切的根本区别，要小心权限/边界。
8. **大脑别自己写码**：用户要的是"只分析调度"。odyssey 的默认是"宿主 agent 自己实现"，planex 才把外部委派做成
   可配置但非强制。brain 必须**反转默认**为"实现一律外发"，这是策略问题不是机制问题（`r1b` §4c）。

---

## 9. 给用户问题的直接回答

> "是不是可以直接使用里面的命令组合？还需要依赖 maestro 本身的结构化和工程系统吗？"

- **能大量复用命令组合，但"命令组合"本身不够。** `chains/` 里已有 `full-lifecycle.json`/`quality-loop.json`/
  `issue-lifecycle.json` 等预建链，`_router.json` 已是"状态→下一图"的雏形——但它们是**固定图**或**断裂的路由**，
  缺的正是你手工在做的那层：**每轮拿子会话结果重新决策、产出下一个目标（H1）、在 5 个分支间选**。
- **必须重度依赖 maestro 的结构化/工程系统。** 大脑的价值=站在 `state.json` 产物登记表、`catalog.json` 目录、
  `delegate` 适配器、ralph CLI 之上做编排。这些是它的"传感器与执行器"。脱离它们，大脑无物可调度。
- **所以最佳形态不是"另写一个系统"，而是"一个薄的外层编排命令 + 一个 H1 目标作者 + 跨会话台账"**，其余
  全部委托给已有命令/引擎。这正是分阶段方案 Phase 0 的样子。

**结论：方案可行、方向正确、且比你预期的更"组装"而非"发明"。** 唯一真正要发明的是 H1（从 roadmap+结果产
下一目标），其余是高度提升 + 黏合 + 一处 bug 修复。建议先做 Phase 0 提示词版验证价值。

---

## 10. 疑点与未证实项

| 疑点 | 来源 | 影响 |
|------|------|------|
| `_router.json` 标 v2.0.0 但对真实 state.json 冷启动非功能（字段 undefined）；未找到端到端测试 | `r1a` §4a/§skeptic | 走 ChainGraph 必先补派生层 |
| 异步 delegate 回调依赖 in-process maestro MCP server；缺失时只剩 JSONL/hook 回退 | `r1d` 未证实 | 无头大脑优先同步 delegate |
| `team-roadmap-dev` skill 已用 Team/Task agent 实现"讨论 roadmap→分阶段 plan→execute→verify"——是同一问题的**另一种**编排答案（非 ralph 基底） | `r1c` §5 caveat | brain 该走 ralph-at-altitude 还是 team-coordinator 是个设计岔路，需用户定夺 |
| 蜂群 pheromone/收敛公式在未读的 `specs/*.md` | `r1e` §4.6 | 大脑无法从机器可读元数据内省 ACO 行为 |
| "~45–55% odyssey 覆盖"、"65–75% 零件已存在"是判断估计非度量 | `r1b`/本文 | 量级参考，非精确 |
| 状态 schema 版本漂移（模板 v3.1 vs 代码 2.0） | `r1a` §skeptic | 派生代码按字段存在性工作，大概率容忍 |

---

## 附：第 1 轮子代理 findings 索引（中间产物，已 gitignore）

- `_scratch/r1a-decide-next-machinery.md` — 决策机制（`_router.json`/maestro-next/GraphWalker）
- `_scratch/r1b-odyssey-family.md` — odyssey 家族 vs 外层循环（~45–55% 覆盖）
- `_scratch/r1c-ralph-outer-seam.md` — 内/外层缝隙、H1–H8 逐步缺口分析
- `_scratch/r1d-delegation-cli-config.md` — 委派 + CLI 优先级配置（实现半边绿灯）
- `_scratch/r1e-swarm-and-catalog.md` — 蜂群三态 + `catalog.json` 命令目录
