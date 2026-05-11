# 知识沉淀管理系统

## 设计理念

知识分两种：**约束**和**积累**。约束是编码规范、架构决策、质量规则——规定"不能做什么"。积累是操作步骤、设计资产、调试经验——记录"怎么做过"。前者需要强制加载，后者需要按需检索。

系统建立在三个原则上：

1. **Index-Detail 分离** —— 索引层（Spec）短小精悍、自动注入到 agent 上下文；详情层（Knowhow）完整独立、按需加载。避免上下文膨胀又不丢失细节。
2. **Category-Based 分发** —— 知识按 category（coding、arch、review、test、debug、learning）标记和分发。arch agent 只看架构约束，coding agent 只看编码规范。各取所需，零噪声。
3. **闭环流转** —— 执行产生知识碎片 → harvest 提取 → 路由到 spec/wiki/issue → 下游命令消费 → 反哺执行。知识不停留在会话里消亡。

---

## 产物结构

```
.workflow/
├── specs/                          # 约束层：基于 category 的规则索引
│   ├── coding-conventions.md       # category: coding
│   ├── architecture-constraints.md # category: arch
│   ├── review-standards.md         # category: review
│   ├── debug-notes.md              # category: debug
│   ├── test-conventions.md         # category: test
│   └── learnings.md                # category: learning（经验教训）
├── knowhow/                        # 积累层：完整知识文档
│   ├── KNW-*.md                    # 会话压缩记录
│   ├── RCP-*.md                    # 操作配方（步骤指南，可标记 tool: true）
│   ├── TPL-*.md                    # 代码/配置模板
│   ├── REF-*.md                    # 外部文档摘要
│   ├── DCS-*.md                    # 架构决策记录
│   ├── TIP-*.md                    # 快速提示
│   ├── AST-*.md                    # 代码资产（API 契约、数据模型）
│   ├── BLP-*.md                    # 架构蓝图
│   └── DOC-*.md                    # 长文档（通用兜底）
└── wiki-index.json                 # 统一索引（WikiIndexer 自动生成）
```

每个 spec 文件对应一个 category。`spec load --category` 加载主文件全文 + 跨文件 keyword 匹配条目 + 自动发现 knowhow 工具。

Knowhow 按文件名前缀区分类型，所有类型共享统一的 YAML frontmatter 格式和 WikiEntry 索引体系。

---

## Spec 与 Knowhow 的关系

**Spec 是索引和规则，Knowhow 是详情和过程。** 二者通过 `ref` 属性桥接。

```
Spec（短条目，自动加载）              Knowhow（完整文档，按需加载）
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ <spec-entry ref="...">       │───→│ RCP-oauth-pkce-flow.md       │
│   ### OAuth PKCE Flow        │    │ (20+ steps, code examples)   │
│   Use when implementing      │    └──────────────────────────────┘
│   OAuth for SPA clients.     │
└──────────────────────────────┘
```

### 分工原则

| 层 | 定位 | 内容特征 | 加载方式 |
|---|---|---|---|
| Spec (`specs/`) | 索引 + 规则 | 短条目，<200 字摘要 | 自动注入（hook） |
| Knowhow (`knowhow/`) | 详情文档 | 完整步骤、代码示例 | 按需加载（`wiki load`） |
| ref | 桥接 | spec-entry 指向 knowhow 文件 | spec 展示摘要 + 加载命令 |

### 条目格式

所有 spec 条目使用 `<spec-entry>` 闭合标签，`category` 为必需单值属性：

```markdown
<spec-entry category="coding" keywords="auth,token,rotation" date="2026-04-21">

### Token rotation needs email carried through refresh flow

Revoked column must be set rather than deleting tokens.

</spec-entry>
```

所有 knowhow 文档使用 YAML frontmatter + 可选 `<knowhow-entry>` 容器：

```markdown
---
title: OAuth PKCE Authorization Flow
type: recipe
category: coding
keywords: [oauth, pkce, auth]
tool: true
summary: "Use when implementing OAuth 2.0 login for public clients."
---

## Steps
1. Generate code_verifier ...
```

**两个维度，职责清晰**：
- `category` = **谁负责**（决定文件路由和 agent 注入）
- `keywords` = **关于什么**（跨 category 发现）

### 统一索引

WikiIndexer 将 `<spec-entry>` 和 `<knowhow-entry>` 都解析为独立的 WikiEntry 节点，共享 BM25 搜索、backlink 图分析和健康度评分。Sub-entry 继承容器的 category，entry 级 category 可覆盖。

---

## 相关命令

### 写入类

| 命令 | 职责 |
|------|------|
| `/spec-add` | 向 specs 文件追加 `<spec-entry>` 条目，支持 inline 和 ref 两种模式 |
| `/manage-knowhow-capture` | 捕获 6 种类型知识文档到 knowhow/（compact、template、recipe、reference、decision、tip） |
| `/maestro-tools-register` | 将可复用业务流程注册为 knowhow 工具文档（YAML 头 `tool: true` + `category`） |
| `/manage-learn` | 捕获原子洞察到 `learnings.md`（pattern、gotcha、technique、tip） |
| `/manage-harvest` | 从工作流产物中提取知识碎片，路由到 wiki/spec/issue 三个存储 |

### 读取类

| 命令 | 职责 |
|------|------|
| `/spec-load` | 按 category 加载主文档 + 跨文件 keyword 匹配条目 + 自动发现 knowhow 工具 |
| `/maestro-tools-execute` | 从 knowhow 加载工具文档并逐步执行 |
| `/manage-knowhow` | 跨 workflow knowhow 和 system memory 两个存储做 list/search/view/edit/delete |
| `/manage-wiki` | Wiki 图健康度、搜索、清理、统计 |

### 分析类

| 命令 | 职责 |
|------|------|
| `/wiki-digest` | 语义主题聚类 + 知识覆盖热力图 + gap 分析 |
| `/wiki-connect` | 发现孤立节点和缺失连接，修复图联通性 |
| `/learn-decompose` | 从代码中提取设计模式，写入 spec 和 wiki |
| `/learn-follow` | 引导式阅读代码/wiki，提取 pattern 并构建理解 |

### 初始化

| 命令 | 职责 |
|------|------|
| `/spec-setup` | 扫描项目结构，初始化 specs 骨架文件（6 个种子文件） |

---

## Tool — 可执行知识

Tool 是标记了 `tool: true` 的 knowhow 文档，存储在 `.workflow/knowhow/` 中，定义**可执行的业务流程**。与普通 spec 条目（被动约束）不同，Tool 是主动执行的步骤序列。

**简单来说：Tool 可以理解为轻量化的 workflow（针对业务需求，沉淀在项目目录下，具有自发现自使用特性）**

任何 knowhow 文档都可以成为 Tool，只需在 YAML 头中加入 `tool: true` 和 `category`：

```yaml
---
title: Payment Gateway Idempotency Verification
type: recipe
category: test
keywords: [payment, gateway, idempotency]
tool: true
summary: "Use when testing payment endpoints for retry safety."
---

## Steps
1. Generate idempotency key (UUID v4)
2. Submit charge request with key
3. Retry same request — assert identical response
4. Submit different amount with same key — assert 409
5. Verify webhook delivers exactly once
```

`spec load --category test` 会自动扫描 knowhow/ 中 `category=test` 且 `tool=true` 的文档，将工具摘要与 spec 一起注入 agent 上下文。

### 注册时机

通过 `/maestro-tools-register` 注册：

| 阶段 | 场景示例 |
|------|------|
| 规划期间 | 标准化业务流程（支付对账流程、OAuth 集成步骤） |
| 执行之后 | 捕获经过验证的操作步骤（数据库迁移回滚、部署流程） |
| 测试之前 | 注册验证方法给 test agent（E2E 结算流程、API 幂等性验证） |
| 复盘/收割时 | 从产物中提取可复用的流程知识 |

三种注册模式：
- **Extract** —— 从已有代码/文档中提取流程定义
- **Generate** —— 根据描述生成新的流程定义
- **Optimize** —— 改进已存在的 tool 定义

### 使用时机

通过 `/maestro-tools-execute` 执行：

- 按名称直接执行：`/maestro-tools-execute integration-test`
- 按 category 发现：`/maestro-tools-execute --category test`
- Agent 自动发现：`spec load --category coding` 输出中包含工具摘要

---

## Tool 在业务测试中的策略

Tool 在测试流程中扮演**验证方法的知识载体**角色。它将业务验证逻辑从测试代码中抽离为可复用的流程定义，使 test agent 无需理解完整业务背景就能执行正确的验证步骤。

### 核心策略

```
业务需求 ──→ 规划阶段注册 tool ──→ test agent 自动发现 ──→ 执行验证
                   ↑                                       │
                   └──── 执行后优化 ←── 发现新 edge case ←──┘
```

**1. 规划阶段预注册验证方法**

在 `/maestro-plan` 阶段，将关键业务流程注册为 tool 并标记 `category: test`：

```bash
/maestro-tools-register generate E2E checkout flow with payment gateway mock setup
/maestro-tools-register generate User registration email verification
```

这使 test agent 在后续 `/quality-auto-test` 执行时，通过 `spec load --category test` 自动获得验证步骤，无需从零推导业务逻辑。

**2. 分层验证覆盖**

不同 category 标记的 tool 在测试金字塔的不同层级被消费：

| Tool Category | 测试层级 | 消费场景 |
|---|---|---|
| `category: test` | L2 集成测试 | `/quality-auto-test` 自动发现并生成测试场景 |
| `category: coding` | L1 单元 + L2 集成 | 实现时参照、测试时验证 |
| `category: review` | L3 验收 | review agent 检查覆盖度、UAT 验证 |

**3. 从测试失败中反哺 Tool**

测试执行发现新的边界条件或失败模式时，通过 optimize 模式补充：

```bash
/maestro-tools-register optimize payment-idempotency
# → 追加新发现的 edge case 步骤（如：网络超时后的重试行为）
```

或通过 `/manage-harvest` 从测试会话产物中自动提取。

**4. UAT 场景驱动**

`/quality-test`（会话式 UAT）执行时，tool 提供业务验证的 checklist 骨架：

- Agent 加载 `spec load --category test --keyword <feature>`
- 获取已注册的验证步骤
- 按步骤执行 UAT，逐项确认
- 发现 gap 时追加新条目

**5. Tool 与自动化测试的协作**

```
┌─────────────────────────────────────────────────────────────────┐
│                    /quality-auto-test                            │
│                                                                 │
│  spec load --category test ──→  发现 tool 文档                   │
│          │                         │                            │
│          ▼                         ▼                            │
│  scenarios.csv 生成    ←──  tool 步骤映射为测试场景              │
│          │                                                      │
│          ▼                                                      │
│  并行写测试 (spawn_agents_on_csv)                               │
│          │                                                      │
│          ▼                                                      │
│  执行 → 失败诊断 → 迭代修复                                     │
│          │                                                      │
│          ▼                                                      │
│  新发现 → /maestro-tools-register optimize                      │
└─────────────────────────────────────────────────────────────────┘
```

关键点：tool 不是测试代码本身，而是**验证方法的知识表达**。它告诉 agent "验证什么"和"按什么顺序验证"，agent 据此生成具体的测试实现。

---

## 自动注入机制

知识不需要手动加载。两个 hook 在执行前自动注入相关知识：

### spec-injector（PreToolUse:Agent 触发）

检测 agent 类型 → 映射到 category → 加载对应 spec 主文档 + 跨文件 keyword 条目 + knowhow 工具 + wiki 摘要。

| Agent 类型 | 映射 Category | 加载内容 |
|---|---|---|
| code-developer, tdd-developer | coding, learning | coding-conventions 全文 + 跨文件 keyword 条目 + coding 工具 |
| workflow-planner | arch | architecture-constraints 全文 + 跨文件 keyword 条目 + arch 工具 |
| workflow-reviewer | review | review-standards 全文 + 跨文件 keyword 条目 |
| debug-explore-agent | debug | debug-notes 全文 + 跨文件 keyword 条目 |
| test-fix-agent | coding, test | coding + test 全文 + test 工具 |

同时加载 category 对应的 wiki 知识摘要（title + summary），受 context budget 控制（full/reduced/minimal/skip）。

### keyword-spec-injector（UserPromptSubmit 触发）

从用户 prompt 提取关键词 → 匹配 `<spec-entry>` 的 keywords 属性 → 注入匹配条目（最多 5 条/次）。

Session 级去重：通过临时 bridge 文件 `{tmpdir}/maestro-spec-kw-{sessionId}.json` 记录已注入内容，三个注入点（用户输入、Agent 启动、Coordinator 分发）共享，同一条目不会重复注入。

---

## 知识流转全景

```
执行产物                    提取                      存储                    消费
─────────                  ─────                    ─────                  ─────
分析会话 ─────┐                              ┌─→ specs/     ─→ spec-injector → agent
调试记录 ─────┼──→ /manage-harvest ──────────┼─→ knowhow/   ─→ wiki load → 按需
规划文档 ─────┤    /quality-retrospective    ├─→ issues/    ─→ manage-issue → 追踪
代码变更 ─────┘    /learn-decompose          └─→ learnings  ─→ keyword-injector → 上下文
                                                    ↑
                                     /manage-learn ─┘  (原子洞察直写)
```

知识从执行中产生，经提取路由到对应存储，再通过自动注入或主动查询反哺后续执行。

### Progressive Fill（渐进充实）

Spec 内容由流水线各阶段逐步丰富：

```
maestro-init       → spec-setup（骨架 + 扫描）
maestro-analyze    → 锁定决策 → arch，代码模式 → coding
maestro-plan       → 设计约定 → coding/arch，测试策略 → test
maestro-execute    → 经验教训 → learning，根因 → debug
maestro-verify     → 质量发现 → review
```

每个阶段执行完毕，产生的知识自动沉淀到对应 category 的 spec 文件中，下一阶段的 agent 即可通过 category 加载获取前序阶段的积累。`spec load` 同时扫描 knowhow/ 中匹配 category 的工具文档，将可执行流程一并注入。
