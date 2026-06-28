# maestro-brain 代码工程化 + `_router.json` 修复（v8 提示词 → v9 两层）

> 目标（用户）：借助 maestro 自身代码工程优势，**学习 ralph/odyssey 的两层架构**（提示词 FSM + TypeScript 引擎），
> 把 maestro-brain 先前**纯提示词**的核心逻辑**代码化**、**修 bug**，再**测试驱动多轮迭代**，输出每轮任务与修改结果。

日期：2026-06-28 · 命令版本：v8（提示词）→ **v9（两层：`src/brain/` 引擎 + 提示词 FSM）**

---

## 1. 学到的蓝本（ralph/odyssey）

- **两层分工**：ralph 的 `.md` 是 FSM 剧本；`src/ralph/` 的 TS 是确定性引擎（`status-store` 原子写、`status-schema` 类型、
  `status-checker` 校验、`cmd-*` 子命令、`__tests__/`）。odyssey 则是纯提示词（无引擎）——对照证明"代码强制"才有不变量保证。
- **原子持久化**：`status-store.ts` 的 `.tmp`+rename。**状态派生**：`state-schema.ts` 的 `deriveCurrentPhase`/`derivePhasesSummary`/`nextArtifactId`。
- **CLI 注册**：`cli.ts` 懒加载注册表 + commander 子命令（`registerRalphCommand`）。

brain 据此镜像出 `src/brain/`。

## 2. 新增代码（`src/brain/`，~7 模块 + CLI + 5 测试文件）

| 模块 | 职责 | 代码强制了原先的哪条提示词逻辑 |
|------|------|------|
| `brain-schema.ts` | 类型 + 阈值常量（REVISES_CAP=2 / STUCK_CAP=3 / CRASH_RETRIES_CAP=2 / DEFAULT_MAX_ROUNDS=30） | ledger schema、收敛阈值 |
| `brain-store.ts` | 原子 ledger 读写（.tmp+rename）、会话解析、`newLedger` 工厂 | invariant#6 落盘/可续跑 |
| `stop-predicate.ts` | `evaluateStopPredicate`：mandatory 全 completed + optional 全 resolved(completed‖ack-deferred) + 无 open defect | v7/v8 R12-HIGH 终止表达力 |
| `brain-decide.ts` | `decide`：A_DECIDE 优先级互斥穷尽 + 收敛 caps（revise demote / stuck give-up / unfixable 快路）+ 计数器 mutators | v3..v8 决策与防空转/饿死 |
| `router-signals.ts` | `deriveRouterSignals`：算 `_router.json` 读取却从未被算的 4 字段 | **修潜伏 bug** |
| `brain-derive.ts` | `deriveCursor` + `deriveBrainState`：每轮决策输入快照 | A_LOOP_INPUT 输入装配 |
| `cmd-brain.ts` + `commands/brain.ts` | `maestro brain init/derive/decide/status` CLI | 两层接线 |

## 3. 修复 `_router.json` 潜伏 bug（研究中发现的真实缺陷）

- **病灶**：`chains/_router.json` 的决策边读 `ctx.project.latest_artifact_type/has_pending_plans/all_phases_executed/milestones_total`，
  但 `graph-walker.buildInitialContext` **从不计算它们** → `DefaultExprEvaluator` 返回 undefined → 路由对真实项目冷启动**塌缩成 `to_analyze`**。
- **修法**：`deriveRouterSignals(state)` 从产物登记表算出这 4 个信号，additive 接进 `buildInitialContext`（6 行，try-catch best-effort，不改既有派生）。
- **验证**：契约测试 `router-contract.test.ts` 读真实 `_router.json`、断言它引用的每个 router 信号字段现在都被产出且非 undefined；
  coordinator 176 例回归**零破坏**。

## 4. 测试驱动逐轮记录（每轮：传入任务 → 修改结果）

| 轮 | 传入任务（要验证什么） | 跑什么 | 结果 / 修改 |
|---|----------------------|--------|-----------|
| TDD-1 | stop-predicate + decide + router/cursor 行为正确 | `vitest run src/brain/`（28 例：mandatory/optional 终止、优先级、caps、router 派生、cursor） | **28/28 PASS**（首跑全绿，逻辑设计正确）|
| TDD-2 | 代码类型正确（项目 tsc 构建，vitest 不查类型） | `tsc --noEmit`（仅看 brain 错误） | **0 错误** |
| TDD-3 | `_router.json` 接线不破坏 coordinator | `tsc` + `vitest src/brain + graph-walker.test` | **0 错误、52 PASS**（28 brain + 24 graph-walker 回归）|
| TDD-4 | `_router.json` 字段契约（防漂移） | 新增 `router-contract.test.ts`，`vitest src/brain` | **31 PASS**（+3 契约：真实 _router.json 字段全被产出）|
| TDD-5 | CLI 子命令 + cli.ts 注册类型正确 | `tsc`（brain/commands/cli） + `vitest src/brain` | **0 错误、31 PASS** |
| TDD-6 | CLI 引擎端到端（init→derive→decide→record） | 新增 `cmd-brain.test.ts`（temp 工作流目录 + chdir） | **37 PASS**（+6 端到端：空 intent 拒绝、ledger 默认值、cursor、terminate/advance、record 持久化、parseSignal）|
| 回归 | 整个 coordinator 不被 graph-walker 改动破坏 | `vitest run src/coordinator/` | **176/176 PASS（10 文件）** |
| 类型门 | 我方所有新文件 + 改动文件类型干净 | `tsc --noEmit` grep 我方文件 | **0 错误** |

**测试总计：37 brain 单测 + 176 coordinator 回归 = 全过；新增代码 0 类型错误。**

## 5. 代码化把"提示词口号"变成"代码不变量"

| 先前（提示词，靠遵从） | 现在（代码，强制） |
|------------------------|--------------------|
| stop_predicate 写对 mandatory/optional（R12 靠手动覆写才过） | `evaluateStopPredicate` 纯函数 + 8 单测，机器评估 |
| A_DECIDE 优先级、终止检查最先 | `decide` 纯函数，顺序在代码里 |
| 防空转/饿死阈值（revises≥2/stuck≥3） | `brain-schema` 常量 + `decide` 分支 + 单测 |
| stop_predicate 不依赖解析 /goal prose | `maestro brain decide` 直接算 |
| `_router.json` 决策（曾塌缩） | `deriveRouterSignals` 接进 walker |

## 6. 结论

- **代码化完成**：maestro-brain 从纯提示词升级为 **ralph 式两层**——`src/brain/` 用 TS 强制了终止谓词、决策优先级、收敛护栏、
  原子台账与 cursor 派生；提示词 FSM 在 `maestro` CLI 可用时调用引擎，skill-only 回退到上下文推理。
- **真实 bug 已修**：`_router.json` 的状态派生层补齐，路由不再冷启动塌缩——这是研究阶段（doc 07 r1a §4a）发现、本轮真正修掉的缺陷。
- **测试驱动验证**：6 轮 TDD + coordinator 回归，37 brain 单测 + 176 回归全过，新代码 0 类型错误。
- **诚实边界**：未跑 `npm run build`（dashboard 全量构建很重，且与本引擎无关）；引擎已通过 `tsc --noEmit` 类型门 + vitest；
  CLI 端到端经 temp-dir 集成测试验证（非真实 `node bin/maestro.js`，因无 dist；逻辑等价）。

### 留痕
`src/brain/`（引擎 + `__tests__/`）、`src/commands/brain.ts`、`src/cli.ts`（注册）、`src/coordinator/graph-walker.ts`（_router 接线）、
命令 `.claude/commands/maestro-brain.md`（v9，`<engine>` 段 + changelog_v9）。
