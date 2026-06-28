# maestro-brain 多轮反向评测报告

> 目的：通过**让子代理实跑 `maestro-brain` 命令**并独立评审，反向暴露命令缺陷，多轮迭代修复，
> 产出可落地的命令 + 完整评估留痕。命令文件：`.claude/commands/maestro-brain.md`。
> 评测产物：`maestro-research/brain-eval/`（round1/、round2/、sandbox/）。

日期：2026-06-27 · 命令版本演进：v1 → v2 → v3

---

## 1. 方法

- **沙盒**：`brain-eval/sandbox/` — 一个 3 能力的小 CLI（`taskcli`），需求刻意制造三种触发点：
  能力 1 独立（advance）、能力 2 依赖 1（insert-fix 温床）、能力 3 欠规约（revise-roadmap 温床）。
- **执行代理**：扮演"A 窗口"，逐字按命令的 `<state_machine>` 实跑；实现步**派发自己的 worker 子代理**模拟外部
  CLI（并用**另一个** worker 做评审，落实"评审者≠实现者"），meticulously 记录每个改进/improvise/死结点。
- **评审代理**：不跑命令，静态挑缺陷——分"控制流正确性"与"委派/可执行性"两个视角并行。
- **多轮**：Round 1 实跑+双评审 → 综合缺陷 → 修 v2 → Round 2 实跑+修复验证 → 用户 `/goal` 修正 → 修 v3。

---

## 2. Round 1 — 实跑 v1（5 轮，全模式触发）

执行代理实跑 `/maestro-brain "Build taskcli" --auto -y`，走完 `S_INIT→…→TERMINATE`，**5 个外层轮次**：

| 轮 | 模式 | 结果 |
|---|------|------|
| 1 | ADVANCE M1 核心存储 | L1 评审 → pass(90) |
| 2 | ADVANCE M2 截止/过滤 | **L2 抓到注入的假绿**(98)：`filterOverdue` 漏判 `done`，测试只断言 `Array.isArray` |
| 3 | INSERT-FIX M2 | 修 + 真测试，L2 复验 → pass(98) |
| 4 | REVISE-ROADMAP M3 | README"分组清单"欠规约 → 插 phase-3.1 钉死互斥分组 |
| 5 | ADVANCE M3 导出 | 子会话 `ESCALATED/paused, deferred:1` → **`--auto -y` → 全链路 → 自主 advance，never 停** |

**全部模式均触发**：advance / insert-fix / revise-roadmap / 防假绿捕获 / `--auto -y` 撞硬信号全链路 /
评审者≠实现者全程 / brain 零业务码。taskcli 建成、17/17 测试过、干净终止。

### Round 1 暴露的缺陷（三方独立、强烈收敛）

证据：`brain-eval/round1/{exec-trace.md, critic-controlflow.md, critic-delegation.md}`。去重后的关键缺陷：

| 级别 | 缺陷 | 后果 |
|------|------|------|
| **FATAL-1** | 无 budget/轮次上限；`--auto` 又规定"永不停" | 不可修复阶段 → **活锁永不终止** |
| **FATAL-2** | `S_AWAIT` 把"一次 CLI 退出"当"整条 ralph 跑完" | 在**半成品**上验收 = 结构性假绿 |
| CRIT | `/goal` 当成 maestro 命令；单 blob 内两条 slash 投递 | 终止契约从未真正建立；`/goal` 被吞 |
| HIGH | `maestro` 二进制/`cli-tools.json`/`maestro-init` 全被假设存在；无降级 | 纯环境下整条不可跑 |
| HIGH | A_EMIT_GOAL"让用户粘贴"需人 ↔ `--auto -y` 非交互 | 主模式下死结 |
| HIGH | 插入修复重入 `S_DECIDE` 绕过 `S_LOOP_INPUT` | 输入/游标不重装配 |
| HIGH | A_DECIDE 分支非互斥穷尽；终止检查太晚 | "都完成"落到 advance 空游标 |
| MED | L1 默认信子会话自报绿；终止读可能过期的 state.json | 假绿漏网 / 误判完成 |
| MED | ledger 无自主决策依据/deferred 槽；S_REVISE 单出口(拒则死锁)；S_ANALYZE 无失败边 | 审计缺失 / 死锁 |

---

## 3. v1 → v2 修复（11 项）

见命令 `<changelog_v2>`。要点：max_rounds+PARTIAL 杀活锁；A_AWAIT 重定义为"等子会话到终态"；
投递去掉两 slash + 非 Claude 改 A 窗口内 Skill 托管；统一回 S_LOOP_INPUT；A_DECIDE 优先级互斥穷尽 + 终止最先；
evaluator≠implementer 具体算法；agy 读 enabled 标志；加 preflight + error_handling；L2 设为含码轮下限；ledger 扩展。

---

## 4. Round 2 — 验证 v2 + 猎新缺陷

证据：`brain-eval/round2/critic-v2-verify.md`（修复验证）+ 执行代理 v2 重跑（实证）。

### 修复验证（去重 23 缺陷）
**17 FIXED · 6 PARTIAL · 0 NOT-FIXED**。两个 FATAL 经怀疑式核对**确真修复**：
- FATAL-1：`round++` 只在 A_LOOP_INPUT，所有重入（revise/fix/全链路/ledger）都过 S_LOOP_INPUT，**无 S_DECIDE 旁路**——预算上限每圈都生效。
- FATAL-2：A_AWAIT 改读 status.json 终态，半成品不进评审。
- **实证**：执行代理在"M3 不可修复"场景下，沙盒 `state.json` 收敛为 `status:"partial"` + `blocker:"M3 unfixable"` +
  `deferred:["working export"]`——**PARTIAL 终止而非死循环**，FATAL-1 修复经验证有效。

### v2 引入的新缺陷（critic-v2）
| ID | 新缺陷 | 实质 |
|----|--------|------|
| N2 | revise-roadmap 优先级会**饿死**真实结果问题（revise 反复赢 → 空转到 PARTIAL） | 无限循环 → **有界空转** |
| N1 | max_rounds 把 revise/fix 与 advance **同等计数** | 把"空转"误当"进展"耗预算 |
| N6 | 含码轮强制 L2、auto 撞信号强制 L3 | 活锁时**每轮烧多 CLI 成本** |
| N4 | 非 Claude"A 窗口内跑 ralph"略**擦碰 invariant#1** 隔离精神 | 语义边界不清 |
| N5 | A_AWAIT 的 odyssey 终态字段名是**断言**、未溯源 | 命门字段错则 FATAL-2 修复回归 |

**最大残留风险**：v2 把"无限循环"换成了"**有界空转**"——auto 下可能把 30 轮全耗在无效 revise-thrash 上，
最后才 PARTIAL，且每轮还烧 L2/L3 成本，无提前止损。

---

## 5. 用户修正 + v2 → v3 修复

### 用户修正（`/goal` 是停止控制）
用户指出 v2 错误地把 `/goal` 降级为"可选/非终止依据"。正确模型：**brain 必须产出内容正确的 `/goal` 来
武装并控制 loop 的停止**；`/goal` 就是循环的停止契约；brain 的核心职责是**把停止条件写正确**。
→ v3 恢复 `/goal` 为 load-bearing（invariant#8 + A_EMIT_GOAL 必做 + 补回 goal 模板），max_rounds 降为纯安全兜底。

### v3 修复（见 `<changelog_v3>`）
- [用户修正] `/goal` 恢复主停止控制。
- [N1/N6] 加收敛计数器 `convergence.stuck/revises`，区分进展 vs 空转。
- [N2 饿死] 同一 roadmap 问题连续 revise ≥2 → 降级按结果问题处理。
- [N1] per-unit：同一单元修 ≥3 次仍不过 → auto 标 deferred+blocker **推进过它**（不在死结上耗尽全局预算），非auto 升级。
- [N4] 澄清"A 窗口内跑 ralph"=托管编排、原子写码仍 100% 外派，不破 invariant#1。
- [N5] A_AWAIT 字段防御：缺字段按"未到终态"处理（宁超时不假绿）+ 列入 Phase-0 实测。

---

## 6. 结论

- **命令可落地**：经 3 轮迭代，已从"happy-path 能跑但有 2 个 FATAL + 多个 High"演进到"控制流正确、
  终止有界且区分进展/空转、防假绿分层、评审者≠实现者、环境降级与错误处理齐备"。
- **反向评测有效**：让子代理**实跑** + **独立静态评审**双轨，暴露了纯静态设计看不出的结构缺陷
  （半成品假绿、活锁、饿死空转、`/goal` 语义）。多轮 + 用户在环修正是质量跃迁的关键。
- **仍是设计提案**：v3 未在真实 maestro 运行时跑过；`<validation>` 列的 V1/V2/V4/V5/V7 是 Phase-0 落地前的硬实测项，
  其中 **V5（ralph/odyssey 终态字段真名）是 FATAL-2 修复的命门**，必须最先确认。

### 评测留痕索引
- `brain-eval/sandbox/` — 测试项目（taskcli + 种子 state）
- `brain-eval/round1/exec-trace.md` — v1 实跑 5 轮 + 12 项缺陷日志
- `brain-eval/round1/critic-controlflow.md` — 控制流缺陷（2 FATAL）
- `brain-eval/round1/critic-delegation.md` — 委派/可执行性缺陷
- `brain-eval/round2/critic-v2-verify.md` — v2 修复验证矩阵（17 FIXED）+ 新缺陷 N1–N6
- v2 重跑实证：执行代理改写了 `sandbox/.workflow/state.json` 为 `status:"partial"` + `blocker:"M3 unfixable"`
  （PARTIAL 终止而非死循环，FATAL-1 修复经验证）；该代理未落最终 trace 文件，实证以沙盒状态为准。
- 命令本体：`.claude/commands/maestro-brain.md`（含 changelog_v2/v3 + validation）

> 注：`brain-eval/round1`、`round2` 评审产物为评测留痕（committed）；执行代理实跑可能写入沙盒 `.workflow/`。
