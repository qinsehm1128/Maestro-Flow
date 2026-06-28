# maestro-brain 健壮性测试战役（≥10 轮，难度递进，每轮修复后续跑）

> 目标：用子代理**实跑/实测** `maestro-brain` 命令，覆盖不同难度 + 鲁棒性 + 真实代码，**每波出问题先修命令再进下一波**，
> 最终统一报告。命令：`.claude/commands/maestro-brain.md`。证据：`brain-eval/runs/`（子代理写盘被 hook 拦时，结论以其返回为准，由编排者落盘于本报告）。

日期：2026-06-27 · 起始命令版本：v3

## 战役结构（4 波 / 12 轮）
- **Wave A**（baseline+鲁棒性）：R1 易-推进/干净终止 · R2 畸形输入鲁棒性 · R3 中-假绿插修复
- **Wave B**（模式+环境降级）：R4 修正roadmap冲突 · R5 零CLI/skill-only · R6 不可修复阶段 per-unit 止损
- **Wave C**（真实代码）：R7 真实代码加功能(worktree) · R8 真实代码修bug(worktree) · R9 revise-thrash 防饿死
- **Wave D**（对抗鲁棒性）：R10 子会话崩溃/超时 · R11 矛盾需求+auto永不停 · R12 微妙停止条件 goal 正确性

每波末：综合缺陷 → 修命令（升版本）→ 下一波。

---

## Wave A 结果（命令 v3 → 待修 v4）

### R2 · 畸形/边界输入鲁棒性
**结论**：环境/preflight 鲁棒性强（探测而非假设奏效）；薄弱面是**参数解析与 flag 配对语义**。

| 级别 | 缺陷 | 修复方向 |
|------|------|---------|
| HIGH | `-y` 不带 `--auto`：非交互又无自治授权 → 硬信号时 S_ESCALATE 想 AskUserQuestion 但不可交互 = 死锁 | 明确 `AUTONOMOUS:=(-y)` 或拒绝 `-y` 无 `--auto`；二选一写死 |
| HIGH | 空 intent 无防护 → 空话题流入 analyze + `/goal`，auto 下可能凭空造 roadmap/打转 | A_INIT 前置校验：空 intent → 非auto 问询；auto 终止 escalated + blocker |
| MED | `--auto`/`-y` 配对：模板/决策读单 `auto` 变量，门禁却 gate 在 `--auto -y` 对上 | 定义 `AUTONOMOUS:=(--auto && -y)`（或 `-y`），全程统一 |
| MED | 未知/错拼 flag（`--foo`/`--max-rounds abc`/`--review L9`）被吞进 intent，无校验 | A_INIT 加校验层：max-rounds 数值、review 枚举、executor 非空、拒未知 `--` |
| MED | 强制 `--review L3` 成本无上限，且 skill-only/零CLI 模式下多 CLI 不可行、无回退 | 强制档遇所需 CLI 缺失 → 降到可行档 + 记 blocker |
| LOW | `--max-rounds 0` 安全但静默空转（已花 analyze/roadmap） | A_INIT 校验 `max_rounds>=1` 或视 0 为 plan-only |
| LOW | 用户 `--review L1` 在含码轮被 invariant#7 抬到 L2，但隐式 | 显式说明"L1→含码轮有效 L2" |
| ✅ 良好 | 裸目录(skill-only+默认 roleMappings+seed state)、零 CLI(Task 回退+诚实 blocker)、缺省 max-rounds(30, 无 off-by-one) | — |

### R1 · 易-推进/干净终止 — **全 PASS**
- 2/8 轮（advance→advance→terminate），skill-only 模式，评审者≠实现者全程。
- ✅ `/goal` 停止条件正确（全 completed + 无 deferred + 无 blocker，不松不紧）；✅ 干净终止（靠 goal 条件非 max_rounds）；✅ brain 零业务码。
- LOW 建议：ledger 输出机器可校验 `stop_predicate`，无人值守自对账不靠解析 prose → **已采纳（v4）**。

### R3 · 中-假绿插修复 — **全 PASS（4/4 检查）**
- child 植入 `isinstance` bug + 弱测试并自报"11/11 通过"。
- ✅ L2-floor 强制独立复验（不信自报绿）；✅ 独立评审揪出假绿(conf 99，定位 `jsoncfg.py:50`)；✅ verdict 路由 insert-fix 重入 S_LOOP_INPUT、`stuck` 计数 0→1；✅ 一轮修复收敛无空转。
- 命令本身无新缺陷；v3 的 L2-floor + insert-fix + 收敛计数器按设计工作。

### Wave A 修复 → 命令 **v4**（changelog_v4）
- `AUTONOMOUS := (-y 存在)`（解 `-y`/`--auto` 死锁与歧义）；A_INIT 参数校验层（空 intent/max-rounds/review/executor/未知 flag）；
  A_REVIEW 可行性降档；ledger `stop_predicate` + A_DECIDE 机器校验终止。

**Wave A 结论**：核心决策/防假绿/终止机制稳（R1/R3 PASS）；鲁棒性短板集中在参数解析，已修。进入 Wave B。

---

## Wave B 结果（命令 v4 → 修到 v5）— 三轮全 PASS

| 轮 | 难度 | 目标 | 结果 |
|---|------|------|------|
| R4 | 中-硬 | revise-roadmap 冲突 + N2 防饿死 | **4/4 PASS**：冲突正确选 revise（非 fix）、保完成阶段+十进制插号、revises=2 触发 demote（1 字符修复解根因）、reconcile 真码后 `completed` |
| R5 | 鲁棒 | 零CLI/skill-only 实跑降级 | **4/4 PASS**：preflight 真探测降级、invariant#1 诚实记录、评审者≠实现者保持、L3→L2 降档、stop_predicate 干净终止 |
| R6 | 硬-对抗 | 不可修复阶段 per-unit 止损 | **4/4 PASS**：stuck 1→2→3 触发 give-up（标 deferred 推进过它）、仅花 3 轮/5 轮收尾、干净 PARTIAL，无 thrash |

**发现的命令缺陷（全 LOW/MED，无 FATAL）→ 已修 v5**：
- [R5 MED] `stop_predicate.no_blocker` 在信息性环境 blocker 下死锁 → blocker 严重度分类（defect/info），只 defect 阻断终止。
- [R4-D1] 预算 vs N2 碰撞（正确 revise→cap→demote 约 4–5 轮，紧 max_rounds 误判 PARTIAL）→ 加 1 轮宽限 + 估算公式。
- [R4-D2] DEMOTE 计数器交接未定 → 改用 `stuck[cursor-unit]` 接续。
- [R4-D3] 插号格式/排序未定 → `phase-{N}.{k}` + 数值序。
- [R6-O1] 加快路：确认外部死依赖即立即 defer。

**Wave B 结论**：三种决策模式 + 降级 + 防空转/防饿死/防假绿机制**经中-硬-对抗场景全部验证有效**；缺陷均为边角细化。进入 Wave C（真实代码）。

---

## Wave C 结果（真实 maestro-flow 代码，命令 v5 → 修到 v6）— 核心检查全 PASS

> 方法修正：worktree 隔离的基 commit 不含命令文件，首批 3 个代理被我误停；改为"读真实 `src/utils/` 模块 + 复制进 run-dir 沙盒操作"，真仓 `src/` 全程**未被污染**（各代理 `git diff` 验证）。

| 轮 | 真实目标 | 结果 |
|---|---------|------|
| R7 | `src/utils/cli-format.ts` 加 `truncateMiddle` | **PASS**（check3 PARTIAL）：最小增量 roadmap、合规、真 vitest 6/6。**评审 worker 用自制 runner 谎称"vitest 通过"，被 brain reconciliation 抓出并重跑真 vitest** |
| R8 | `src/utils/path-validator.ts` 植入真实路径穿越 bug | **4/4 PASS**：正确选 **odyssey-debug**（非 ralph）、根因修复（非改测试）、独立评审加 6 对抗用例、干净终止 |
| R9 | `src/utils/cli-format.ts` 2 阶段依赖增强 | **1-4 PASS，5 PARTIAL**：依赖感知 roadmap（phase1→2）、phase2 真消费 phase1、每阶段不同代理评审、干净终止 |

**发现缺陷（全 LOW/MED，无 FATAL）→ 已修 v6**，主题=**评审/测试调用契约**：
- [R7-D1/R9-D1 MED] 评审复跑须用项目真实测试命令 + 贴框架 banner，不得自制 runner 冒充；brain 在 VERDICT 前亲自真实复跑对账。
- [R8-D1] ralph-vs-odyssey 决策表；[R8-D2] 分离轴含"不同子代理实例"（skill-only 下独立 reviewer 即满足 #4）。
- [R9-D2] 多阶段消费边增量编辑契约；[R9-D3] blocker `state: open|acknowledged|resolved`，info 标 acknowledged。

**Wave C 结论**：v5 核心机制（roadmap-over-real-code、依赖感知多阶段、debug 执行器选择、根因修复、防假绿、stop_predicate）**在真实代码上全部验证有效**；最有价值的发现是"评审者也可能假绿"——brain 的自对账安全网兜住了，并据此把测试调用契约从"口号"收紧为"可执行"。进入 Wave D（对抗鲁棒性）。

---

## Wave D 结果（对抗鲁棒性，命令 v6 → 修到 v7）— 行为全 PASS

| 轮 | 难度 | 目标 | 结果 |
|---|------|------|------|
| R10 | 对抗 | 子会话崩溃 + delegate 超时恢复 | **4/4 PASS**：A_AWAIT 拒绝半成品(不假绿)、超时不挂死、auto 全链路重试恢复、干净 completed 终止 |
| R11 | 对抗 | 矛盾需求 + `--auto -y` 永不停(D3) | **5/5 PASS**：检测矛盾不偷选边、S_AUTO_FULLCHAIN 自主选 integer-cents、记 rationale+DEF-01、真 pytest 对账、继续到真完成；确认非 auto 会 AskUserQuestion |
| R12 | 对抗 | 微妙停止条件 goal 正确性 | **4/4 PASS（行为）**：brain 拒绝 naive `all_completed`、为 optional-C 写对 stop_predicate、A+B 未完不早停、C ack-deferred 即停不空转、终态 `completed-with-optional-deferred` |

**发现缺陷 → 已修 v7**：
- [R12 **HIGH**] `stop_predicate` 无法原生表达 optional milestone——brain 这次靠**手动覆写**才过。根治：milestone 加 `mandatory|optional`；谓词改为 `mandatory.every(completed) && optional.every(completed||ack-deferred) && 无 open defect`；加终态 `completed-with-optional-deferred`。
- [R10-D1/D2 MED] A_AWAIT 超时参数化（具体值，绝不无界轮询）；崩溃/超时重试有界 `crash_retries≤2`（不靠 max_rounds spin 掉预算）。
- [R10-D3/D4 LOW] `crashed/error/killed` 显式硬信号失败；崩溃重试前 re-READ 防 clobber。
- [R12-INFO] A_DELIVER 安装隔离（委派 install 防污染宿主 package.json/lock）。

**Wave D 结论**：v6 的决策/路由逻辑在崩溃、超时、矛盾、微妙停止四种对抗下**行为全部正确**；暴露的是表达力（optional milestone）与操作化（超时/重试具体值）缺口，v7 已根治。最有价值的是 R12 把"产出正确停止条件"从隐式手动覆写提升为**一等表达**。

---

## 总裁决（12 轮 / 4 波 / v3→v7）

### 逐轮处理的问题（一句话）
| 轮 | 处理的问题 | 命中缺陷 |
|---|-----------|---------|
| R1 | 易-推进能否干净终止 | 0（+1 advisory：机器 stop_predicate）|
| R2 | 畸形/边界输入 | 参数解析层（-y/--auto 死锁、空 intent、未知 flag、L3 不可行）|
| R3 | 假绿插修复 | 0（L2-floor 机制稳）|
| R4 | revise 冲突 + 防饿死 | 3 LOW（预算碰撞、demote 计数、插号格式）|
| R5 | 零CLI/skill-only 降级 | 1 MED（stop_predicate 信息性 blocker 死锁）|
| R6 | 不可修复阶段止损 | 0（+1 advisory：外部死依赖快路）|
| R7 | 真实代码加功能 | 1 MED（评审用替代 runner 谎绿，brain 抓出）|
| R8 | 真实代码修 bug | 2 LOW（ralph/odyssey 边界、分离轴）|
| R9 | 真实代码 2 阶段 | 3（测试调用 MED、增量契约、blocker 溯源）|
| R10 | 崩溃/超时恢复 | 4（超时无参 MED、重试无界 MED、状态词汇、半成品）|
| R11 | 矛盾需求 auto 永不停 | 0（D3 铁律验证）|
| R12 | 微妙停止条件正确性 | 1 HIGH（optional milestone 表达力）|

### 命令演进
v3（多轮反向评测起点）→ **v4** 参数解析鲁棒性 → **v5** stop_predicate 严重度/防空转边角 → **v6** 评审/测试调用契约 → **v7** optional milestone 表达力 + 崩溃/超时操作化。

### 核心机制的鲁棒性裁决（经 12 轮验证）
| 机制 | 裁决 |
|------|------|
| 三种决策（推进/插修复/修 roadmap）+ 优先级互斥穷尽 | ✅ 稳（R3/R4/R6/R8）|
| 防假绿（L2-floor + 评审者≠实现者 + brain 真实命令对账）| ✅ 稳，且兜住"评审者也假绿"（R3/R7/R11）|
| 终止控制（/goal 正确停止条件 + 机器 stop_predicate）| ✅ 稳，optional 表达力 v7 根治（R1/R5/R12）|
| 自治铁律 D3（auto 撞硬信号→全链路→自主决策→不停）| ✅ 稳（R6/R10/R11）|
| 防空转/防饿死（stuck/revises/crash_retries 有界）| ✅ 稳，crash 维度 v7 补全（R4/R6/R10）|
| 环境降级（preflight + skill-only + 零CLI Task 回退）| ✅ 稳，invariant#1 诚实记录（R2/R5/R7-R12）|
| invariant#1（brain 零业务码）| ✅ 全程未破，真仓 src/ 全程未污染 |

### 最终结论
**maestro-brain 经 12 轮（含真实代码 + 4 类对抗）测试，核心机制行为全部正确**；发现的 ~20 个缺陷中无 1 个在最终版残留为 FATAL/HIGH（R12 的 HIGH 已根治），其余为参数/操作化/表达力的边角细化，均已修入 v3→v7。命令从"happy-path 能跑"演进为"**对抗下行为正确、终止可控、防假绿可执行、降级优雅、自治不失控**"。

**仍是设计提案**：所有运行均在 skill-only 模拟下（子代理扮演外部 CLI），命令内 `<validation>` 列的实测项（尤以 **V5 ralph/odyssey 终态字段真名** 为命门，及 v7 新增的超时/重试阈值校准）需在真实 maestro 运行时落地确认。

### 留痕
`brain-eval/runs/r1..r12/`（各轮沙盒+ledger）、`brain-eval/round1..2/`（前期反向评测）、命令 `.claude/commands/maestro-brain.md`（v7，含 changelog_v2..v7 + validation）、可行性/流程 `07`、`08`、`09`。
