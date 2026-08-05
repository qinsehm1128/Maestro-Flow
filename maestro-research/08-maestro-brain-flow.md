# maestro-brain 任务流程（收敛版 / canonical）

> 这是经过多轮用户修正 + 第 1–3 轮子代理源码检索后**收敛的完整任务流程**，作为后续写 `maestro-brain.md`
> 骨架的依据。它取代之前在对话里逐版迭代的流程草稿。
>
> 执行主体标记：**【A窗口】**=运行 maestro-brain 的宿主 agent（只分析调度、不亲自写码）｜
> **【外部CLI/子会话】**=被派发出去真正干活的（外部 CLI / ralph / odyssey 子会话）｜**◇**=A窗口上下文内自决点。
> 证据标记：**[代码]**=`src/` 强制；**[提示词]**=`.md`/`.json` 由 agent 执行。引用见文末 §9 与 `_scratch/r3*`。

研究日期：2026-06-27 · 代码版本：`maestro-flow@0.5.42`

---

## 0. 设计立场（三条不变量）

1. **A 窗口只分析与调度，从不亲自写代码**；一切实现都派发给外部 CLI（默认 Claude，可配优先级）。
2. **决策由 A 窗口宿主 agent 在上下文内自决**（非另起一个 LLM 判官），形状是**默认按 roadmap 推进 + 两异常分支**。
3. **`--auto -y` 模式下永不因"需人确认"而终止**：把本该升级给人的情形转成"全链路分析 → 自主决策 → 继续推进"。

---

## 1. 既定事实（来自 r3 源码检索，会改变流程形状）

| # | 事实 | 证据 |
|---|------|------|
| F1 | **`/goal`、`/loop` 是 Claude Code 宿主命令，不是 maestro 的**；仓库无定义文件 | `r3a`（find/grep 验证） |
| F2 | ralph/odyssey **自己从短 intent 内部编写目标**，并**发一段 `/goal <text>` 纯文本让用户粘贴一次**（非阻塞）；`/loop` 只是可选心跳看门狗，非迭代驱动器 | `r3a`：`maestro-ralph.md:836-850`、`odyssey-base.md:204-219` |
| F3 | 真正"持续推进"的引擎：ralph=`Skill("maestro-ralph-execute")` 自调用链 [代码锚定 status.json]；odyssey=纯提示词 FSM 自走 | `r3a` |
| F4 | **外部 CLI 无"发两条命令"通道**，全是单次 blob；`--resume` 是把旧对话当文本粘进新进程，非实时续话 | `r3b`：各 adapter |
| F5 | **maestro 从不展开 `/cmd`**，原样当文本发；**只有 Claude Code headless 自己展开自定义 slash 命令**（v2.1.181+），Codex exec/gemini/qwen/agy 一律字面文本 | `r3b`：`prompt-assembler.ts:142` |
| F6 | **`-y` 下 odyssey 零硬停**（人类点降级为 defer+继续，记 `ESCALATED/PARTIAL` 结束）；唯一非跳过硬停是 **ralph 漂移熔断 `A_REGROUND_HALT`**（且是 [提示词] 强制非引擎强制） | `r3c`：`maestro-ralph.md:558-614`、odyssey `<execution_discipline>#4` |
| F7 | 蚁群分析**今天 100% 在进程内**，无外部 CLI 路径；agy 可用性=`isCliAvailable("agy")`/`tools.agy.enabled` | `r3d`：`cli-tools-config.ts:400-407` |
| F8 | `maestro config` 管三库；role→CLI 优先级在 `cli-tools.json` 的 7 个固定 role；手写 `brain` 段会被 save 白名单**剥掉** | `r3e`：`cli-tools-config.ts:67-74,131-136,249-254` |
| F9 | 防假绿原语齐全：`insight-challenge`(对抗反驳)、`verify`(Goal-Backward,"agent 报告是声明非证据")、`quality-review`、planex 严格验、`collab` 多 CLI 共识；且支持"评审者≠实现者" | `r3f` |

---

## 2. 已定决策（用户拍板）

- **D1 执行器位置 = 跑在外部**。brain 生成的投递物 = **两段拼成一个 blob**：
  `（第一段）/maestro-ralph -y <intent>` ＋ `（第二段）/goal <goal>`，一次性发给外部 CLI。
  > ⚠️ 受 F4/F5 约束：此形状**对 Claude 实现 CLI 成立**（它会展开 slash）；对非 Claude 需预展开为纯文本。
  > 且"一个 blob 内两条 slash 命令是否都触发"需 Phase 0 实测（见 §8 V1）。
- **D2 评审强度 = 自适应**（按任务难度 + 返回结果）：普通内容只做**验假绿 + 结果分析**；困难/有问题才升级全量。
- **D3 自治铁律**（`--auto -y`）：遇到"本该反馈给用户"的问题 → **启动全链路分析 → 自主决策 → 继续推进，不终止**。

---

## 3. 完整流程

### 阶段 0 · 用户输入 & 初始化
1. **【用户】** 输入需求，调 `/maestro-brain "<需求>" [--auto -y]`。
2. **【A窗口】** 建 brain 会话 + 跨轮台账；读 `state.json`（是否 init / 有无 roadmap / 历史产物）。
3. **【A窗口】** **写出一段 `/goal` Goal Prompt 让用户粘贴一次**（仿 ralph/odyssey，F2）：内容 = 驱动器(brain 自循环)
   + 停止条件(roadmap 全完成 或 §4 残留硬停)。之后 brain 靠 **Skill() 自调用链**自驱（仿 maestro-ralph-execute，F3）。

### 阶段 1 · 理解 & 复杂度判定
4. **【A窗口/可派发】** `maestro-analyze`。
5. **◇复杂度**：复杂 → `maestro-grill` → `maestro-brainstorm`；简单 → 阶段 2。
6. **◇分析模式（普通 vs 蚁群）**：若需在"多候选方案空间"搜索最优 → 蚁群；
   **有 agy 则蚁群 ant 委派 `maestro delegate --to agy --mode analysis`，否则回退 A 窗口自有子代理/Workflow**（F7，净新增小逻辑，约几行）。

### 阶段 2 · Roadmap 构建
7. **【A窗口/可派发】** `maestro-roadmap` → `roadmap.md` + `state.json.milestones[]`。

### 阶段 3 · 外层循环（每 roadmap 单元一轮，brain 核心）
8. **【A窗口】装配输入**：roadmap 游标(`deriveCurrentPhase`) + 上轮子会话 anchor(`buildSessionAnchor`) + 裁决信号 + 台账。
9. **◇决策（默认推进 + 两异常）**：
   - 默认 → **推进**：取下一 roadmap 单元
   - 结果有问题 → **插入修复**（roadmap 不动）
   - roadmap 本身有问题 → **修正 roadmap**（走 `maestro-roadmap --revise` 的人确认护栏；`--auto -y` 时见 §4）
10. **◇选执行器**：A 窗口**评估**用 **ralph**（多命令里程碑生命周期、最优序列不明）还是 **odyssey-\***
    （单一目标单元：debug/planex/review-test-fix/ui/improve 按域选）。
11. **【A窗口】产投递 blob（D1）**：拼 `/maestro-ralph -y <短intent>   /goal <goal>`（或对应 odyssey 命令）。
    - **只给短 intent**，目标由子命令内部自分解（F2，不替它写）。
    - **auto 传播**（F6）：ralph 子→`-y`；odyssey 子→`--auto -y`(codex)/`-y`(非codex)。
    - **防 ralph 构建期硬停**：把 phase 写明确、intent 收窄并预设边界（化解 r3c 的 G-B/G-C 构建期门）。
12. **【外部CLI/子会话】执行 + 写码**：外部 CLI 跑 ralph/odyssey 到完成；写码默认 Claude，按 `cli-tools.json` `roles.implement` 优先级可配。
13. **【A窗口】等待 + 拿回结果**：同步 delegate 回传 transcript / 读子 `status.json`（完成摘要/caveats/deferred/子目标达成）。
14. **◇防假绿评审（自适应 D2，详见 §5）**：实现回来后不可盲信；**评审 CLI ≠ 实现 CLI**。
    - 普通 → 轻量：Goal-Backward verify + 结果分析。
    - 困难/有问题 → 升级：多维 `quality-review` + `insight-challenge` 对抗反驳 +（critical）`collab` 多 CLI 共识。
    - 裁决路由复用现成 ralph 机制：gaps→插入修复；BLOCK→`plan --gaps`；confidence<60→fix；解析失败→fail-closed 当 fix；意图漂移→处理见 §4。
15. **【A窗口】记台账** → 回到 8。
16. **◇推进/终止判定**：见 §4（auto 与非 auto 行为不同）。

### 阶段 4 · 终止
17. roadmap 全单元完成 → 总结 + 固化知识（spec/knowhow）。
18. 终止条件见 §4。

---

## 4. 自治模式行为（D3，核心铁律）

每轮末与子会话返回时，可能出现"本该反馈给用户"的硬信号（F6）：
- **ralph 子会话 `status:"paused"`**（漂移熔断 `A_REGROUND_HALT` 或补救耗尽 `G-E`）
- **odyssey 子会话 `ESCALATED / PARTIAL / INCONCLUSIVE` 或 `deferred>0`**
- **模式③想改 roadmap 但撞 `E005`**（有完成阶段，`maestro-roadmap.md:147`）

| 模式 | 遇到上述硬信号时 |
|---|---|
| **非 `--auto -y`** | 暂停，升级给用户（经典 step 18）|
| **`--auto -y`（D3）** | **不终止**：① 启动**全链路分析**（full `quality-review` + `insight-challenge` + `collab` 多 CLI 交叉 + 重读漂移/未达成证据）→ ② A 窗口据此**自主决策**（推进 / 插入修复 / 修正 roadmap）→ ③ **继续推进**下一轮。仅当 roadmap 全完成或预算耗尽才停。|

> 注意 F6 警告：ralph 漂移熔断是 [提示词] 强制而非引擎强制，子会话不一定可靠自停。故 **brain 自身也要在第 8 步做
> 一次跨会话漂移自检**（对照子会话 completion_evidence vs roadmap intent），不完全依赖子会话上报。

---

## 5. 评审强度自适应（D2）

分三档，由 A 窗口按"任务难度 × 返回结果信号"选择：

| 档 | 触发 | 内容 | 谁来评（评审者≠实现者，F9） |
|---|------|------|------|
| **L1 轻量**（默认） | 简单任务 + 结果无异常 | Goal-Backward verify（存在性/实质/git-diff 对照声明）+ 结果摘要分析 | A 窗口自身只读分析，或 `--role review` 换一个 CLI |
| **L2 标准** | 任务较难 或 verify 报 gap | + 多维 `quality-review`（换 CLI/model）+ `insight-challenge` 对每条"绿"对抗反驳 | 独立 `workflow-reviewer`/`--role review`，CLI≠实现 CLI |
| **L3 全链路** | critical / 低置信度 / `--auto -y` 撞硬信号（§4） | + `maestro-collab` 多 CLI 共识（唯一逃离单模型自评的方式，F9）+ 重读漂移/未达成证据 | `collab` 默认 3 个 CLI 扇出，证据权重投票 |

裁决统一回流到第 14 步的现成 ralph 修复机制。**核心反假绿原则：实现的 CLI 不得给自己批改**（用不同 role/CLI/model；collab 的多后端是最强保证）。

---

## 6. 外部投递契约（D1 细节 + 约束）

```
单 blob = "/maestro-ralph -y <短intent>" + 分隔 + "/goal <goal文本>"
```
- **Claude 实现 CLI**：F5 — Claude headless 会展开 `/maestro-ralph`；命令文件须在 `--cd` 工作区内、Claude ≥2.1.181。
- **非 Claude（codex/gemini/qwen/agy）**：F5 — slash 当字面文本，**不会执行**。故二选一：
  (a) 实现 CLI 强制用 Claude（最省事，符合"默认 Claude 写码"）；
  (b) 或 brain **预展开**：读 `maestro-ralph.md`/odyssey 命令体内联成纯文本再发（跨 CLI 唯一稳妥）。
- **`/goal` 段**：F1 — `/goal` 是宿主命令，非 maestro 命令。发给外部 headless CLI 是否被尊重 = 待实测（§8 V2）；
  保守做法是把目标直接写进第一段 intent，第二段 `/goal` 作为给"支持它的宿主"的附加终止契约。

---

## 7. config 注入（brain 内各部分的 CLI 优先级）

- 复用现成 role（**0 代码**，F8）：analysis→`analyze`、implement→`implement`、review→`review`、brainstorm→`brainstorm`，
  delegate 时带 `--role`，用户已可在 `cli-tools.json` 配优先级。
- **缺口**：swarm、roadmap-revise **无对应 role**；按情境分优先级也无 `situation` 轴。
- 注入路径（按成本）：
  1. **最小**：上述部分压到现有 role + `--to <cli>` 显式覆盖（提示词层，今天可用）。
  2. **加 role**：`DELEGATE_ROLES` 追加 `swarm`/`roadmap_revise`（~6 行，命名空间略脏）。
  3. **干净**：加 typed `brain: Record<part, RoleMapping>` 段 + `selectToolByBrainPart`（~30–50 行），
     **并须同时补两处 merge 白名单**（`cli-tools-config.ts:131-136` 与 `:249-254`），否则该段被 save 静默剥掉（F8）。

---

## 8. 残留验证项 & 风险（Phase 0 必须实测）

| ID | 待验证 | 为什么重要 |
|----|--------|-----------|
| **V1** | 一个 blob 内**两条 slash 命令**（`/maestro-ralph … /goal …`）在 Claude headless 是否**都触发** | D1 投递契约成立的前提；r3b 只确认单条展开 |
| **V2** | `/goal`（宿主命令）发给**外部 headless** CLI 是否被尊重 | F1 不确定；不成立则目标须并进 intent 段 |
| **V3** | 非 Claude 实现 CLI → 必须走预展开(6b)，需验证内联命令体后子流程仍正确 | F5 |
| **V4** | 等待子会话完成的原语：同步 delegate 阻塞 vs 子进程 ralph | 外层循环靠它闭环；`src/ralph/` 无 await-sibling 原语（r1c）|
| **V5** | brain 自身跨会话漂移自检 | F6：子会话漂移熔断是提示词强制、不可靠，brain 不能全信 |
| **V6** | `brain` config 段被 save 剥掉 | F8：走干净路径须先补白名单 |

风险排序：**V1/V2（投递能否工作）> V4（循环能否闭环）> V5（防跑偏）> V6（配置持久）**。

---

## 9. 证据索引（第 3 轮子代理工作笔记）

- `_scratch/r3a-goal-loop-lifecycle.md` — `/goal`·`/loop` 本质、ralph/odyssey 自写目标+发 Goal Prompt、ralph vs odyssey 选择
- `_scratch/r3b-external-cli-command-delivery.md` — 单 blob、无两命令通道、仅 Claude 展开 slash、预展开方案
- `_scratch/r3c-autonomous-mode-gates.md` — `-y/--auto` 抑制点、唯一非跳过硬停、auto 传播、两观测停止条件
- `_scratch/r3d-swarm-self-vs-agy.md` — 蚁群在进程内、agy 探测、agy-else-self 小逻辑、swarm vs normal 判据
- `_scratch/r3e-config-injection.md` — maestro config 三库、role 复用、schema 白名单剥离、注入三路径
- `_scratch/r3f-review-anti-false-green.md` — 防假绿原语清单、对抗反驳、实现者≠评审者、verify→review→challenge 三明治
- 上游依赖：`07-maestro-brain-feasibility.md`（可行性 + 7 能力 + 内外层缝隙）、`01`–`06`（现状分析）
