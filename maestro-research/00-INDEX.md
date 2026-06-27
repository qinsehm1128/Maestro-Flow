# Maestro-Flow 深度研究索引

> 本目录是对 Maestro-Flow（v0.5.42，已合并上游 `catlog22/maestro-flow`）核心子系统的源码级研究。
> 四份文档由并行子代理产出，**以核心源码 / 命令文件为第一证据，`guide/`、`docs-site/` 文档为佐证**。
> 每份文档内的非平凡论断均带 `file:line` 引用，并显式标注了无法证实的疑点。

研究日期：2026-06-27 · 代码版本：`maestro-flow@0.5.42` · 分支：`claude/merge-code-version-output-vxg493`

---

## 一句话总览

Maestro-Flow 是一个**意图驱动的多智能体编排引擎**。它的设计可以拆成三个正交维度：

1. **作者层（一次编写）** —— 命令 / 技能 / 代理 / 规格，遵循 GSD 内容分离规范，规范地写在 `.claude/`。
2. **投影层（多 harness 渲染）** —— 同一套作者文件被**代码生成**投影到 Agy（Antigravity）、Agent-Skills 标准（`.agents/`），并**手工维护**到 Codex（`.codex/`）。
3. **运行层（多 CLI 编排）** —— 通过 `maestro delegate` / `maestro coordinate` 把任务派发给外部 CLI（Claude / Codex / Gemini / Qwen / Agy），由适配器层归一化各自的原生协议与权限模型。

而 **ralph** 与**规划链（grill → brainstorm → roadmap → blueprint → plan → execute）**是跑在这套基座之上的两类高层工作流：前者是状态机驱动的自治循环，后者是带门禁的「需求→规格」生成流水线。其中 **brainstorm（头脑风暴）**是规划链早期的多视角发散/收敛环节，与后期收敛成正式文档的 blueprint 互补。

---

## 文档清单

| # | 文档 | 主题 | 核心证据锚点 |
|---|------|------|------------|
| 01 | [`01-ralph.md`](./01-ralph.md) | **maestro-ralph 自治循环** —— 状态驱动地从命令池中挑选下一步直至目标达成 | `src/ralph/`、`.claude/commands/maestro-ralph{,-execute}.md`、`status.json` |
| 02 | [`02-planning-grill-roadmap-blueprint.md`](./02-planning-grill-roadmap-blueprint.md) | **规划与规格链** —— grill 压测 / roadmap 里程碑 / blueprint 6 阶段文档链 | `.claude/commands/maestro-{grill,roadmap,blueprint}.md`、`workflows/`、`state.json` |
| 05 | [`05-brainstorm.md`](./05-brainstorm.md) | **maestro-brainstorm 头脑风暴** —— 多角色人格扇出 + 跨角色收敛（Decision Digest），规划链早期发散环节，含可视化子系统 | `.claude/commands/maestro-brainstorm.md`、`.claude/agents/{role-design-author,cross-role-reviewer}.md`、`src/brainstorm-visualize/` |
| 03 | [`03-external-cli-orchestration.md`](./03-external-cli-orchestration.md) | **外部 CLI 编排** —— delegate / coordinate、适配器层、tools 注册、Agy 集成 | `src/coordinator/cli-executor.ts`、`src/agents/`、`src/commands/delegate.ts` |
| 06 | [`06-collab.md`](./06-collab.md) | **maestro-collab 跨 CLI 交叉验证** —— 同一问题扇出给多个 CLI、综合 共识/冲突/独有；纠正"两套实现"误解（`collab.ts` 实为人类团队协作，**同名碰撞**） | `.claude/commands/maestro-collab.md`、`.codex/skills/maestro-collab/SKILL.md`、`src/commands/delegate.ts`、`src/commands/collab.ts` |
| 04 | [`04-engineering-files-cli-design-philosophy.md`](./04-engineering-files-cli-design-philosophy.md) | **工程文件 × CLI 联动设计哲学** —— `.claude`/`.codex`/`.agy` 的投影机制、hooks、`--role` 路由 | `src/core/skill-converter.ts`、`scripts/convert-claude-to-agy.mjs`、`.codex/`、settings |
| 07 | [`07-maestro-brain-feasibility.md`](./07-maestro-brain-feasibility.md) | **maestro-brain 可行性分析（设计提案）** —— 调度型外层"大脑"循环：7 能力对照、内/外层缝隙(H1–H8)、**决策模型(§3.5：A 窗口自决 + 默认推进 + 结果问题插修复 / roadmap 问题动态修正)**、两策略、分阶段方案 | `chains/_router.json`、`src/coordinator/graph-walker.ts`、`src/ralph/`、`src/commands/delegate.ts`、`state-schema.ts`、`catalog.json` |

---

## 推荐阅读路径

- **想先建立全局心智模型** → 先读本索引的「四大支柱」，再读 **04**（设计哲学）→ **03**（运行基座）→ **01/02**（高层工作流）。
- **想理解"它怎么自动干活"** → **01-ralph**（循环引擎）→ **03**（每一步如何落到外部 CLI）。
- **想理解"它怎么把需求变成规格"** → **05-brainstorm**（多视角发散）→ **02-planning**（grill→roadmap→blueprint 收敛）。
- **想理解"多个 CLI 怎么交叉验证同一问题"** → **06-collab**（扇出 + 共识/冲突/独有综合）→ **03 §2/§3**（共享的 delegate/适配器层）。
- **想给项目加一个新 CLI 或新 harness** → **04 §6/§7**（投影与 `--role` 路由）+ **03 §3**（适配器层）。
- **想做一个"调度大脑"自动跑整个循环** → **07-maestro-brain-feasibility**（前瞻设计提案，区别于 01–06 的"现状分析"）。

> 注：文档 01–06 是**现状（as-built）源码分析**；文档 **07 是前瞻设计提案**（评估新建 `maestro-brain` 的可行性），结论建立在 01–06 之上。

---

## 四大支柱（跨文档综合）

### 支柱一：两层架构 —— 作者提示词 vs 确定性引擎
贯穿全项目的最重要事实：**绝大多数"命令"是纯提示词编排器，没有对应的 `src/commands/*.ts` 处理器**。
- ralph 的命令文件（`maestro-ralph.md`）是有限状态机的「剧本」，而 `src/ralph/` 的 TypeScript 才是确定性地加载步骤、内联必读、强制 `status.json` 一致性的「引擎」（详见 **01 §2**）。
- grill / brainstorm / roadmap / blueprint 四个命令**几乎完全是提示词**，其「MANDATORY / BLOCKING」门禁是提示词断言而非代码强制（brainstorm 的 Phase Gate 1/2/2.5/3 同样只是建议性，无代码阻断转移，详见 **05 §3**）；唯一有代码背书的状态面是 `state.json`、brainstorm 产物枚举（`state-schema.ts`）、独立的可视化服务，以及 `maestro spec/wiki/ralph/delegate` 这些真实 CLI（详见 **02 §1/§8**、**05 §3**）。
- 含义：阅读时务必区分**作者意图**（.md 写了什么）与**引擎保证**（TS 代码强制了什么）。每份文档都贯彻了这一区分。

### 支柱二：状态即真相 —— `status.json` 与 `state.json`
- ralph 用 `status.json` 作为唯一真相源，原子写入（`.tmp`+rename），「下一条命令」就是第一个 `pending && !decision` 的步骤，`active_step_index` 取代锁实现单活跃步（**01 §3/§4**）。
- 规划链用 `.workflow/state.json` 的 `milestones[]` 作为里程碑/产物登记表；roadmap 在此阶段**不创建** phase 目录，延迟到 plan/execute（**02 §3/§7**）。
- 二者共同构成「文件系统即数据库」的协调底座；`src/coordinator/graph-walker.ts` 也消费 `state.json.milestones[]`。

### 支柱三：一次编写，多 harness 投影
- `.claude/` 是**规范作者**；Agy（`.agy/`→`~/.gemini/antigravity-cli/`）与 Agent-Skills 标准（`.agents/`）由 `src/core/skill-converter.ts` + `scripts/convert-claude-to-agy.mjs` **代码生成**（**04 §1/§6**）。
- **Codex 是例外**：`.codex/`（TOML 代理 + Markdown 技能）没有 `buildCodex*` 转换器，靠 `copyRecursive` + 人工维护（`team-worker.toml` 与 `.md` 已实质性分叉）——「写一次」对 agy/agents-standard 是机械强制，对 Codex 是人工纪律。
- 之所以能投影，是因为 **GSD 内容分离**：命令/技能管编排与派发，代理管领域知识，规格/模板管契约。可移植的角色散文跨 harness 逐字相同（`workflow-collab-planner` 在 `.md`/`.toml` 间字节一致），只有编排原语（`Agent`→`invoke_subagent`→`spawn_agent`）被投影器改写。

### 支柱四：CLI 解耦 —— 适配器层 + `--role` 回退链
- 运行层有两叠编排：`maestro delegate`（驱动单个外部 CLI 到完成）与 `maestro coordinate`（走 `ChainGraph`，每个 command 节点派生一个 delegate）（**03 §1/§2**）。
- **适配器工厂**（`adapter-factory.ts`）把各 CLI 的原生协议/权限归一化：Claude `--print --output-format=stream-json`、Codex `exec --dangerously-bypass... --json -`、Gemini/Qwen `-o stream-json --approval-mode yolo`、**Agy** 因非 TTY 不输出而需回放 `transcript.jsonl`（**03 §3/§9**）。
- 命令只声明能力（`--role analyze`）而非具体 CLI，`cli-tools.json` 解析回退链（codex→gemini→claude）（**04 §7**）——**加一个 CLI 不需改命令，加一个 harness 不需改代理体**，与支柱三同构的解耦哲学。
- **多 CLI 交叉验证 = maestro-collab**（**06**）：把同一问题扇出给前 3 个启用的 CLI（典型 gemini+claude+codex），按「2+ 工具一致→共识(Locked)／分歧→冲突(Deferred，按证据权重投票)／单一→独有(Free)」综合。它是 delegate 层的**纯消费者**（复用 `03 §2/§3` 的 spawn/适配器链），但综合算法**仅为提示词、无代码强制**。注意与 brainstorm 的区别：collab 是**多 CLI**，brainstorm 是**多角色单 CLI**。

---

## 关键依赖关系图（概念）

```
            ┌─────────────────────────────────────────────┐
            │  作者层 .claude/ (commands · skills · agents) │  ← 规范源
            └───────────────┬─────────────────────────────┘
                            │ 投影 (skill-converter / convert-to-agy)
              ┌─────────────┼──────────────┐
              ▼             ▼              ▼
          .agy (生成)   .agents (生成)   .codex (人工)        ← 多 harness
              └─────────────┴──────────────┘
                            │ 运行时
                            ▼
       ┌────────────────────────────────────────────────┐
       │  maestro delegate / coordinate  +  适配器工厂    │  ← 多 CLI 编排 (03)
       │  Claude · Codex · Gemini · Qwen · Agy           │
       └───────────────┬────────────────────────────────┘
            ┌──────────┴───────────┐
            ▼                      ▼
   ┌─────────────────┐   ┌─────────────────────────────────────────┐
   │ ralph 自治循环   │   │ 规划链                                   │  ← 高层工作流 (01 / 02 / 05)
   │ status.json (01)│   │ grill→brainstorm→roadmap→blueprint→plan  │
   │                 │   │ state.json · context-package/1.0         │
   └─────────────────┘   └─────────────────────────────────────────┘
        二者都以 .workflow/ 的状态文件为真相源，都通过 delegate 落到外部 CLI
        brainstorm(05) 多角色扇出+收敛，产物经 context-package 传给 roadmap/blueprint
```

---

## 跨文档疑点汇总（各代理独立标注，需后续核实）

| 疑点 | 来源 | 影响 |
|------|------|------|
| `workflows/roadmap.md:46` 派生 `cli-roadmap-plan-agent`，仓库中**不存在**；实际代理是 `workflow-roadmapper`，且两者 roadmap 格式分叉 | 02 §8 | 悬空引用，roadmap 编排可能与文档不符 |
| `bin/maestro-context-monitor.js` 导入的 `context-monitor.js` 在 `src/` 与 `dist/` 均缺失 | 03 §12 / 04 §9 | 仅编译产物存在，无法从源码证实 |
| ~~`maestro collab`（CLI，`collab.ts`）与 `/maestro-collab`（提示词）是两套实现~~ → **已由 06 纠正**：二者是**同名碰撞**，`collab.ts` 实为人类团队协作（`join/whoami/report/sync`），与跨 CLI 验证无关 | 03 §7 → 06 §1/§9 | 误解已澄清 |
| 跨 CLI 验证的 `maestro-collab` **无任何 TS 代码背书**，共识/冲突分类算法纯靠提示词执行；`.claude` 变体（容忍 1 幸存者/W003/异步）与 `.codex` 变体（要求 2 幸存者/W004/阻塞）行为分叉 | 06 §2/§9 | 综合质量依赖提示词遵从；两 harness 不一致 |
| odyssey ↔ ralph 是**概念并行**而非代码集成（不同状态文件 `session.json` vs `status.json`） | 01 §10/§12 | 勿误认为同一引擎 |
| 两套 hook-runner 层、两个转换器实现可能漂移；guide 标注的 hook 事件名与代码不符 | 04 §9 | 文档漂移，以代码为准 |
| brainstorm 产物前缀代码用 `BST`、guide 用 `BRN-001`；`--review-only` 功能存在但未列入 Flags 表；`--to` 交接方向未实现（仅 `--from`） | 05 | 文档与代码不一致 |
| brainstorm 是**多角色人格**而非多 CLI：不做 collab 式跨 CLI 扇出，仅 Step 1.7 调一次 Exa 外部检索 | 05 | 常见误解，多 CLI 交叉验证是 `maestro-collab` 的职责 |

---

## 证据等级约定

各文档统一遵循：
- **第一证据**：`src/**`、`bin/**`、`.claude/**`、`.codex/**`、`workflows/**`、`scripts/**`、`templates/**` 的实际内容，带 `file:line`。
- **佐证**：`guide/**`、`docs-site/**` —— 用于加速理解与交叉验证，但**不单独作为结论依据**；凡与代码冲突处以代码为准。
- 凡无法证实者，文档内显式以「Ambiguities / 疑点」小节标注，并在上表汇总。
