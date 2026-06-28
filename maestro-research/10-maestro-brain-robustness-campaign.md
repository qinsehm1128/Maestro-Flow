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

## Wave C 结果（命令 v5 → 待修）……（运行中）

*（Wave D 与最终裁决待续）*
