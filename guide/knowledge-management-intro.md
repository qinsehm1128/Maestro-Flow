# Maestro-Flow 的知识管理系统详解

Maestro-Flow 经过多个版本的迭代，现已经完善定型，向大家分享设计及使用说明。

Maestro-Flow 中的知识沉淀主要分两种：**约束** 和 **积累**。约束是编码规范、架构决策、质量规则——规定"不能做什么"。积累是操作步骤、设计资产、调试经验——记录"怎么做过"。前者需要强制加载，后者需要按需检索，典型产物结构如下:

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

## 相关命令

### 写入类

| 命令 | 职责 |
|----|----|
| `/spec-add` | 向 specs 文件追加 `<spec-entry>` 条目，支持 inline 和 ref 两种模式 |
| `/manage-knowhow-capture` | 捕获 6 种类型知识文档到 knowhow/（compact、template、recipe、reference、decision、tip） |
| `/maestro-tools-register` | 将可复用业务流程注册为 knowhow 工具文档（YAML 头 `tool: true` + `category`） |
| `/manage-learn` | 捕获原子洞察到 `learnings.md`（pattern、gotcha、technique、tip） |
| `/manage-harvest` | 从工作流产物中提取知识碎片，路由到 wiki/spec/issue 三个存储 |

### 读取类

| 命令 | 职责 |
|---|---|
| `/spec-load` | 按 category 加载主文档 + 跨文件 keyword 匹配条目 + 自动发现 knowhow 工具 |
| `/maestro-tools-execute` | 从 knowhow 加载工具文档并逐步执行 |
| `/manage-knowhow` | 跨 workflow knowhow 和 system memory 两个存储做 list/search/view/edit/delete |
| `/manage-wiki` | Wiki 图健康度、搜索、清理、统计 |

### 分析类

| 命令 | 职责 |
|---|---|
| `/wiki-digest` | 语义主题聚类 + 知识覆盖热力图 + gap 分析 |
| `/wiki-connect` | 发现孤立节点和缺失连接，修复图联通性 |
| `/learn-decompose` | 从代码中提取设计模式，写入 spec 和 wiki |
| `/learn-follow` | 引导式阅读代码/wiki，提取 pattern 并构建理解 |

### 初始化

| 命令 | 职责 |
|---|---|
| `/spec-setup` | 扫描项目结构，初始化 specs 骨架文件（6 个种子文件） |

## Tool — 可执行知识

Tool 是标记了 `tool: true` 的 knowhow 文档，存储在 `.workflow/knowhow/` 中，定义**可执行的业务流程**。

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
|----|----|
| 规划期间 | 标准化业务流程（支付对账流程、OAuth 集成步骤） |
| 执行之后 | 捕获经过验证的操作步骤（数据库迁移回滚、部署流程） |
| 测试之前 | 注册验证方法给 test agent（E2E 结算流程、API 幂等性验证） |

### 示例：
```
业务需求 ──→ 规划阶段注册 tool ──→ test agent 自动发现 ──→ 执行验证
                   ↑                                       │
                   └──── 执行后优化 ←── 发现新 edge case ←──┘
```

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

### Progressive Fill

Spec 内容由流水线各阶段逐步丰富：

```
maestro-init       → spec-setup（骨架 + 扫描）
maestro-analyze    → 锁定决策 → arch，代码模式 → coding
maestro-plan       → 设计约定 → coding/arch，测试策略 → test
maestro-execute    → 经验教训 → learning，根因 → debug
maestro-verify     → 质量发现 → review
```

每个阶段执行完毕，产生的知识自动沉淀到对应 category 的 spec 文件中，下一阶段的 agent 即可通过 category 加载获取前序阶段的积累。`spec load` 同时扫描 knowhow/ 中匹配 category 的工具文档，将可执行流程一并注入。
