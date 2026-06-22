---
title: "搜索系统指南"
---

Maestro 搜索系统基于 BM25F 算法，提供统一的知识搜索能力，支持 spec、knowhow、issue、domain 等多种数据源。

---

## 概述

`maestro search` 是知识系统的统一搜索入口，整合了：
- **WikiIndexer** — BM25F 加权全文检索
- **MaestroGraph** — AST 级代码符号搜索（可选）
- **类型过滤** — 按 spec/knowhow/issue/domain 等类型筛选

---

## 基本用法

```bash
# 关键词搜索（1-3 个核心词最佳）
maestro search "authentication"

# 带类型过滤
maestro search "jwt token" --type spec

# 按 category 过滤
maestro search --category coding

# 组合查询
maestro search "oauth pkce" --type spec --category arch --limit 10

# 代码搜索（需启用 MaestroGraph）
maestro search "UserService" --code

# 搜索所有来源（wiki + code），统一归一化排名
maestro search "UserService" --all

# JSON 输出（适合脚本消费）
maestro search "jwt token" --json
```

### 查询最佳实践

**1-3 个核心词**是最优查询长度。超过 4 个词时，BM25 评分会被不相关词稀释：

```bash
# ❌ 堆砌多个不相关关键词
maestro search "topology display frontend DetailedTopologySVG elk"

# ✅ 拆分为针对性查询
maestro search "topology layout"
maestro search "DetailedTopologySVG" --code
maestro search "elk layout" --type knowhow
```

**CamelCase 标识符**自动拆分：搜索 `DetailedTopologySVG` 会同时匹配 `detailed`、`topology`、`svg` 和完整标识符。

**IDF 自适应加权**：超过 3 个词时，系统自动为高特异性词（如符号名）加权、为通用词降权。

---

## BM25F 算法

### 字段权重

搜索系统使用 BM25F（Best Match 25 with Field weighting）算法，对不同字段赋予不同权重。系统针对三类文档维护独立配置：

**Default（spec/knowhow/issue 等标准文档）**

| 字段 | boost | b | 说明 |
|------|-------|---|------|
| `title` | 3 | 0.3 | 标题匹配权重最高 |
| `tags` | 2 | 0 | 标签匹配，无长度归一化 |
| `summary` | 1.5 | 0.75 | 摘要匹配 |
| `body` | 1 | 0.75 | 正文匹配（基准） |

**KG（知识图谱虚拟节点）**

| 字段 | boost | b | 说明 |
|------|-------|---|------|
| `title` | 2 | 0.3 | 仅标题参与评分 |
| `tags` | 1 | 0 | 标签匹配 |
| `summary` | 0 | 0 | 不参与评分 |
| `body` | 0 | 0 | 不参与评分 |

**Scratch（scratch 文档）**

| 字段 | boost | b | 说明 |
|------|-------|---|------|
| `title` | 1 | 0.3 | 标题匹配（权重较低） |
| `summary` | 0.5 | 0.75 | 摘要匹配 |
| `tags` | 0.5 | 0 | 标签匹配，无长度归一化 |
| `body` | 0.3 | 0.75 | 正文匹配 |

### 评分公式

```
score = Σ_idf(tf~ × (k1 + 1)) / (tf~ + k1)
```

其中 `tf~` 为跨字段加权词频：

```
tf~ = Σ(boost_f × tf_f / (1 - b + b × dl_f / avgdl_f))
```

- `tf_f` — 字段 f 内的词频
- `dl_f` — 字段 f 的文档长度
- `avgdl_f` — 字段 f 的平均文档长度
- `k1 = 1.5` — 饱和参数
- `boost` / `b` — 按上表各配置独立设定

### 除零保护

当某字段的 `avgFieldLength = 0` 时，该字段自动跳过计算，避免除零错误。

---

## 中文支持

### CJK 分词

中文字符自动按 bigram + trigram 分词（`cjkNgrams`，n=2..3），单字不单独输出：
- 输入 `"认证"` → tokens: `["认证"]`
- 输入 `"用户认证"` → tokens: `["用户", "户认", "认证", "用户认", "户认证"]`
- 输入 `"JWT认证"` → tokens: `["jwt", "认证"]`

### 双语索引

doc-site 搜索支持双语元数据：
- `name` / `name_zh` — 英文/中文命令名
- `description` / `description_zh` — 英文/中文描述
- `workflow_zh` — 中文工作流说明

---

## 去重机制

### 源级去重

同一 `source.path` 下的多个条目（如 `spec-entry` 和 `knowhow-entry`）**不会被去重合并**，而是独立展示。

### 查询词去重

重复的查询词自动合并，防止分数膨胀：
```bash
# "token token jwt" 等价于 "token jwt"
maestro search "token token jwt"
```

---

## 索引来源

WikiIndexer 会自动索引以下数据源：

| 来源 | 路径 | 说明 |
|------|------|------|
| Spec | `.workflow/spec/` | 规范文档 |
| Knowhow | `.workflow/knowhow/` | 知识条目 |
| Scratch | `.workflow/scratch/` | 临时文档，使用独立 BM25F 配置（权重较低） |
| Session Archive | `.workflow/session/` | 归档会话记录 |

索引构建时，WikiIndexer 根据条目类型自动选择对应的 BM25F 配置（default/kg/scratch）。

---

## 可信度与搜索热度

搜索命中会异步更新节点的 `search_hits` 计数（通过 `CredibilityStore`），用于后续可信度评分。该操作为 best-effort，不阻塞搜索返回。

---

## 性能特性

| 优化项 | 改进 | 说明 |
|--------|------|------|
| Backlinks 构建 | O(n²) → O(1) | 使用 Set 替代 Array.includes |
| 倒排索引 | 预构建 | 首次加载时构建，后续复用 |
| 候选集裁剪 | 3x limit | 搜索候选集为 limit 的 3 倍，过滤后返回 |
| 工作区过滤 | limit 前应用 | 在截断结果前过滤，避免丢失有效条目 |

---

## 搜索结果结构

```typescript
interface SearchResult {
  id: string;           // 唯一标识
  type: WikiNodeType;   // spec/knowhow/issue/domain/...
  title: string;        // 标题
  category: string;     // coding/arch/review/...
  summary: string;      // 摘要
  score: number;        // BM25F 评分
  snippet: string;      // 上下文片段（高亮关键词）
  source: { path: string };  // 来源文件路径
}
```

---

## 过滤语法

### 按类型过滤

```bash
maestro search "query" --type spec       # 仅搜索 spec
maestro search "query" --type knowhow    # 仅搜索 knowhow
maestro search "query" --type issue      # 仅搜索 issue
maestro search "query" --type domain     # 仅搜索 domain
```

有效类型：`project`, `roadmap`, `spec`, `issue`, `knowhow`, `note`, `domain`

### 按 category 过滤

```bash
maestro search "query" --category coding   # 编码规范
maestro search "query" --category arch     # 架构约束
maestro search "query" --category review   # 审查标准
maestro search "query" --category debug    # 调试笔记
maestro search "query" --category test     # 测试规范
maestro search "query" --category learning # 经验教训
```

### 按工作区过滤

```bash
maestro search "query" --workspace shared  # 搜索共享工作区
```

---

## 代码搜索

启用 `--code` 标志后，搜索会同时查询 MaestroGraph AST 索引：

```bash
maestro search "UserService" --code
```

代码搜索结果独立展示，包含：
- 符号名称和类型（function/class/interface/...）
- 文件路径和行号
- 函数签名（如有）

---

## 常见问题

### 搜索结果为空

1. 确认 `.workflow/wiki-index.json` 存在
2. 运行 `maestro wiki health` 检查索引状态
3. 尝试更宽泛的关键词

### 中文搜索不准确

CJK 分词为 bigram + trigram 级别，短查询（2 字以下）可能匹配不足。建议：
- 使用 3 字以上关键词以触发 trigram 匹配
- 结合 `--category` 过滤缩小范围

### 评分异常

如果某条目评分异常高，可能是：
- 标题字段命中（default 配置下 3x 权重）
- 标签字段命中（2x 权重，无长度归一化）
- 关键词大量重复（已优化，但仍可能影响）

---

## 相关命令

```bash
# Wiki 系统搜索
maestro wiki search <query> [--json]
maestro wiki list [--type <type>] [--category <cat>] [--keyword <kw>]

# 知识图谱搜索
maestro kg search <symbol>
maestro kg context <node>

# 索引健康检查
maestro wiki health
```
