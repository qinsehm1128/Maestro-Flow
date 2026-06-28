# maestro-brain 统一设计（对齐 maestro 设计哲学，去过度设计）

> 目标（用户）：完善前先分析 maestro **自身**设计哲学（**不要过度设计**），并发子代理对比"当前 brain 设计 vs maestro 设计"，**统一设计**。
> 本文是综合裁决 + 落地结果。先修了构建（dashboard 自引用），再据两份并发分析做去过度设计 + 两层对齐。

日期：2026-06-28 · 命令 v10 → **v11** · 引擎模块 10 → **8**

---

## 0. 先修的代码错误（构建）

`npm run build` 在 dashboard 步即失败：`dashboard/src/server/routes/install-utils.ts` 用**裸包 `'maestro-flow'`** 导入 root（包未自链接 node_modules），
与所有兄弟文件（用相对路径 `'../../../../src/...'`）**不一致**。改为相对路径 `'../../../../src/index.js'` + 修一处 implicit-any。
→ **`npm run build` 现 exit 0 全绿**。（这是预存问题，非 brain 引入；与 brain 无关但阻塞构建。）

## 1. maestro 的设计哲学（分析所得，作为统一基准）

来自 docs 01–08 + 本轮对 `src/ralph`/`src/coordinator`/`.claude/commands` 的复核：
1. **两层分工**：`.md` FSM 是「剧本」（编排、派生子工作）；`src/` TS 是「引擎」（确定性、可测、强制不变量）。
   ralph 的提示词**委派** `maestro ralph next/complete`，**不**在散文里重新实现门禁逻辑。
2. **代码只在"必须强制"处**：ralph 引擎极小（~7 文件）。确定性/不可靠-if-prompt 的逻辑入代码；LLM 编排留提示词。
3. **派生器聚合**：`state-schema.ts` 把 `deriveCurrentPhase`+`derivePhasesSummary` 放**一个文件**。
4. **命令文件不含 changelog/进度块**：ralph/next/odyssey 全无；版本理由在 git/research。
5. **评审=作者化 agent**：maestro 用 authored 的 review agent（quality-review/insight-challenge/collab）编排评审，**不**建 TS stage-planner。

## 2. 并发分析裁决（两子代理，高度收敛）

| 发现 | 代理 | 裁决 |
|------|------|------|
| `brain-review.ts`（151 行）**死代码**：从未被 cmd/prompt 调用；评审规则已在 A_REVIEW；ReviewStage 模型比 maestro 任何处都重 | code | **删**（评审本是 LLM 编排=提示词所有，符合哲学#5） |
| 派生层 3 文件过散（`router-signals`+`stop-predicate`+`brain-derive` 中 `brain-derive` 是 55 行 re-export bundler） | code | **合并** `router-signals`→`brain-derive`（对齐哲学#3） |
| 多 CLI/`different-model`/agy 死分支（Claude-only 决策） | code | 随 brain-review **删** |
| 投机字段 `poll_interval_s`/`max_polls`（事件驱动 await 不用轮询计数，残留） | code | **删** |
| **`runRecord` 真实 bug**：未注册为子命令 + 从不 `applyBump` → 收敛计数器跨轮**永不持久化** → caps 经 CLI **永不触发** | code | **修**（见 §3） |
| 命令 486 行 / 9 个 changelog 块(102 行) + validation 块 + 4 处散文重新实现引擎逻辑(decide/stop/await/review) | prompt | **删 changelog/validation→research；action 体改"调引擎"指针** |
| A_AWAIT 散文写"轮询"但代码已是事件驱动 `fs.watch`——**已漂移** | prompt | **修措辞 + 指针** |
| ledger_schema 重复 `convergence` 键；含已删的 poll 字段 | prompt | **修** |
| 核心 `stop-predicate`/`brain-decide`(3 个收敛计数器)/`router-signals`/`brain-await`/`store` | both | **保留**——确定性、各守一个真实失败模式，非镀金 |

## 3. 统一设计原则（落地后）

> **代码（`src/brain/`, 8 模块）= 确定性逻辑**：`brain-schema`(类型/阈值) · `brain-store`(原子 ledger) ·
> `brain-derive`(cursor + mandatory/optional 视图 + `deriveRouterSignals` 修 `_router.json` bug) · `stop-predicate`(终止谓词) ·
> `brain-decide`(决策 + 收敛 caps) · `brain-await`(事件驱动挂起) · `cmd-brain`(CLI) ·（`commands/brain.ts` 注册）。
> **提示词（`maestro-brain.md`, 342 行）= LLM 编排**：选执行器、评审 agent 派生、投递、改 roadmap、auto-fullchain；
> **委派**确定性部分给 `maestro brain init/derive/decide/await/status`（仿 ralph 委派 `maestro ralph next`）。
> **不重复、不死代码、命令无 changelog。**

**修掉的 runRecord bug**：删 `runRecord`，改为 **`maestro brain decide --commit`**——一次调用即决策 + 应用收敛 bump + 追加 round 落盘。
故 `STUCK_CAP/REVISES_CAP` 现在**真正跨轮触发**。真实二进制验证：2 次 `decide --signal result-problem --commit` 后 `stuck={"M1/phase-1":2}`、rounds=2。

## 4. 落地结果

| 维度 | 前 | 后 |
|------|----|----|
| 引擎模块数 | 10 | **8**（对齐 ralph ~7） |
| 命令行数 | 486 | **342**（删 changelog/validation 115 行 + action 体收敛 + 散文重复） |
| 死代码 | brain-review 151 行 | **0** |
| 两层漂移 | 评审规则散文+TS 双源；A_AWAIT 措辞错 | **消除**（提示词委派引擎/明确提示词所有） |
| 真实 bug | runRecord caps 不持久化 | **修**（decide --commit） |
| `npm run build` | 失败(dashboard) | **exit 0 全绿** |
| brain 单测 | 63 | **49 全过**（删 brain-review 14 例）；tsc 我方文件 0 错误 |

## 5. 刻意保留 / 未做（避免反向过度设计）

- **3 个收敛计数器全保留**（stuck/revises/crash_retries 各守 N1/N2/R10 一个失败模式，删任一即丢真实安全）。
- **评审编排留提示词**（LLM 工作）——这是对上一轮"代码化 brain-review"的**有意回退**，符合 maestro 哲学；
  从 Claude Workflow 学到的 sandwich 模式仍体现在 A_REVIEW 散文，只是不再有 dead TS 模块。
- **未追求把命令压到 ~270 行极限**：再压需重写本质 action 散文，风险高、收益小——本身即过度优化。停在 342 行（与 ralph-execute 300 同量级）。

## 结论

brain 现与 maestro **两层架构、模块粒度、命令简洁度、评审=作者化 agent** 统一；去掉了 ~250 行死/重复/投机内容；
顺手修了一个真实收敛-持久化 bug 和仓库构建。`npm run build` 全绿、49 单测过、真实二进制冒烟通过。

### 留痕
代码：`src/brain/`(8 模块 + `__tests__/` 49 例)、`src/commands/brain.ts`、`src/coordinator/graph-walker.ts`(_router 接线)、
`dashboard/src/server/routes/install-utils.ts`(构建修复)。命令：`.claude/commands/maestro-brain.md`(v11)。分析依据：本轮两并发子代理报告（见 git/本文 §2）。
