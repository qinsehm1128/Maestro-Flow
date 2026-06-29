---
title: "🔧 工具与环境配置指南"
icon: "🔧"
---

Maestro 工具与环境配置参考，包含角色路由、Statusline、搜索系统、工作空间和 Worktree 配置。

---

## 角色路由配置

### 概览

基于角色的 CLI 工具路由配置，将工作类型（分析、审查、实现等）与具体 CLI 工具解耦。

```
命令 --role analyze → cli-tools.json → fallbackChain: [codex, gemini, claude] → 第一个 enabled 工具
```

### 配置文件

#### 路径优先级

| 优先级 | 路径 | 说明 |
|--------|------|------|
| 1（最高） | `{project}/.maestro/cli-tools.json` | 项目级覆盖 |
| 2 | `~/.maestro/cli-tools.json` | 全局配置 |
| 3 | 内置默认值 | `DEFAULT_ROLE_MAPPINGS` |

#### 配置结构

```json
{
  "version": "1.1.0",
  "tools": {
    "gemini": {
      "enabled": true,
      "primaryModel": "gemini-2.5-pro",
      "tags": ["fullstack", "frontend"],
      "type": "builtin"
    },
    "claude": {
      "enabled": true,
      "primaryModel": "claude-sonnet-4-20250514",
      "tags": ["fullstack"],
      "type": "builtin",
      "settingsFile": "~/.maestro/profiles/claude-review.json"
    },
    "codex": {
      "enabled": true,
      "primaryModel": "o3",
      "tags": ["fullstack", "backend"],
      "type": "builtin"
    }
  },
  "roles": {
    "analyze": {
      "fallbackChain": ["codex", "gemini", "claude"],
      "description": "Code analysis and understanding"
    },
    "review": {
      "fallbackChain": ["claude", "gemini", "codex"],
      "description": "Code review and quality assurance"
    },
    "implement": {
      "fallbackChain": ["codex", "claude", "gemini"],
      "description": "Feature implementation"
    }
  },
  "proxy": {
    "enabled": true,
    "httpProxy": "http://127.0.0.1:7890",
    "noProxy": "127.0.0.1,localhost"
  }
}
```

### CLI 命令

```bash
# 查看当前配置
maestro config get cli-tools

# 设置工具
maestro config set tools.gemini.enabled true
maestro config set tools.gemini.primaryModel "gemini-2.5-pro"

# 设置角色路由
maestro config set roles.analyze.fallbackChain '["codex", "gemini", "claude"]'

# 测试路由
maestro delegate "test" --role analyze --dry-run
```

---

## Statusline 配置

### 概览

Maestro Statusline 是 Claude Code 的自定义状态栏，提供多行实时信息显示：模型、Token 用量、Git 状态、上下文消耗，以及工作流里程碑和 Session 依赖链。

### 安装

Statusline 通过 Claude Code 的 `settings.json` 配置：

```json
{
  "statusLine": {
    "type": "command",
    "command": "maestro-statusline"
  }
}
```

或通过 `maestro install` 一键安装（含主题选择）。

### 工作原理

```
Claude Code → stdin JSON → maestro-statusline → stdout ANSI → 状态栏渲染
```

Claude Code 在每次交互后将会话数据（JSON）通过 stdin 传给 `maestro-statusline`，脚本解析后输出 ANSI 格式文本，Claude Code 将其渲染为状态栏。

### 多行布局

Statusline 支持智能多行显示，根据工作流状态和 session 链数量自动决定行数：

**无工作流（单行）：**
```
⚡ Opus 4.6 | 📁 maestro2 ⎇ master | ↑12k ↓3k Σ15k +342 -87 | 📈 ███░░░ 28%
```

**有工作流，≤2 条链（双行）：**
```
⚡ Opus 4.6 | 📁 maestro2 ⎇ master △↑1 | ↑12k ↓3k Σ15k +342 -87 | 📈 ███░░░ 28%
🏁 MVP 1/2 ◆P2 | auth A→P→E→V ✓ · user-mgmt A→P ●
```

**有工作流，3+ 条链（多行展开）：**
```
⚡ Opus 4.6 | 📁 maestro2 ⎇ master | ↑12k ↓3k Σ15k | 📈 ███░░░ 28%
🏁 MVP 1/2 ◆P2
  auth A→P→E→R→D→T→V ✓
  user-mgmt A→P→E ●
  settings A ○
```

### 图标系统

| 图标 | 含义 |
|------|------|
| ⚡ | 模型类型 |
| 📁 | 项目名称 |
| ⎇ | Git 分支 |
| △↑ | Worktree 层级 |
| ↑↓Σ | Token 用量（输入/输出/总计） |
| +-* | Git 变更（新增/修改/删除） |
| 📈 | 上下文使用率 |
| 🏁 | 里程碑进度 |
| ◆ | 当前阶段 |
| ✓●○ | 任务状态（完成/进行中/待定） |

### 配色主题

```bash
# 查看可用主题
maestro statusline themes

# 设置主题
maestro statusline set-theme <name>

# 自定义颜色
maestro statusline set-color <element> <color>
```

### CLI 命令

```bash
# 安装 statusline
maestro statusline install

# 测试输出
maestro statusline test

# 查看配置
maestro statusline config
```

---

## 搜索系统配置

### 概览

Maestro 搜索系统基于 BM25F 算法，提供统一的知识搜索能力，支持 spec、knowhow、issue、domain 等多种数据源。

### 基本用法

```bash
# 关键词搜索
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

### BM25F 算法配置

搜索系统使用 BM25F（Best Match 25 with Field weighting）算法，对不同字段赋予不同权重：

**Default（spec/knowhow/issue 等标准文档）**

| 字段 | boost | b | 说明 |
|------|-------|---|------|
| `title` | 3 | 0.3 | 标题匹配权重最高 |
| `tags` | 2 | 0 | 标签匹配，无长度归一化 |
| `summary` | 1.5 | 0.75 | 摘要匹配 |
| `body` | 1 | 0.75 | 正文匹配（基准） |

### 配置选项

```json
{
  "search": {
    "enabled": true,
    "maxResults": 20,
    "minScore": 0.1,
    "boostFactors": {
      "title": 3,
      "tags": 2,
      "summary": 1.5,
      "body": 1
    },
    "sources": ["spec", "knowhow", "issue", "domain"],
    "enableCodeSearch": true
  }
}
```

### CLI 命令

```bash
# 基础搜索
maestro search "<query>" [--type <type>] [--category <cat>] [--limit N]

# 代码搜索
maestro search "<symbol>" --code

# 全局搜索
maestro search "<query>" --all

# JSON 输出
maestro search "<query>" --json

# 搜索统计
maestro search stats
```

---

## 工作空间配置

### 概览

Maestro 支持将多个项目的知识（Spec、Knowhow、Domain、Codebase）关联到当前工作空间，实现跨项目的知识检索、Spec 注入和 Wiki 聚合。所有共享为**只读**——当前工作空间仅读取关联项目的内容，不会写入。

### 配置文件

工作空间配置存储在 `.workflow/workspace.json`：

```json
{
  "version": "1.0.0",
  "linkedProjects": [
    {
      "name": "shared-lib",
      "path": "../shared-lib",
      "enabled": true,
      "scopes": ["specs", "knowhow", "domain"]
    },
    {
      "name": "api-service",
      "path": "../api-service",
      "enabled": true,
      "scopes": ["specs"]
    }
  ],
  "globalWorkspace": "~/.maestro/workspace"
}
```

### 链接项目

```bash
# 链接项目
maestro workspace link <path> [--name <name>] [--scopes specs,knowhow,domain]

# 取消链接
maestro workspace unlink <name>

# 列出链接
maestro workspace list

# 同步链接项目知识
maestro workspace sync
```

### 作用域

| 作用域 | 说明 |
|--------|------|
| `specs` | 共享 Spec 文件 |
| `knowhow` | 共享 Knowhow 文档 |
| `domain` | 共享 Domain 知识 |
| `codebase` | 共享代码库文档 |

---

## Worktree 配置

### 概览

Maestro-Flow 支持基于 git worktree 的**里程碑级并行开发**。当一个里程碑完成（即使有遗留 bug），可以 fork 出下一个里程碑的 worktree，在独立分支上推进开发，完成后 merge 回主分支。

### 配置

```json
{
  "worktree": {
    "enabled": true,
    "baseDir": ".workflow/worktrees",
    "autoCleanup": true,
    "mergeStrategy": "squash"
  }
}
```

### CLI 命令

```bash
# 创建 worktree
maestro worktree create <name> [--base <branch>]

# 列出 worktree
maestro worktree list

# 切换 worktree
maestro worktree switch <name>

# 合并 worktree
maestro worktree merge <name> [--strategy squash|merge]

# 删除 worktree
maestro worktree delete <name>
```

### 工作流程

```
1. 完成里程碑 M1
   ↓
2. maestro worktree create M2 --base main
   ↓
3. 在 M2 worktree 中开发
   ↓
4. maestro worktree merge M2
   ↓
5. 继续下一个里程碑
```

---

## CLI 参考

```bash
# 角色路由
maestro config get cli-tools
maestro config set tools.<tool>.enabled <true|false>
maestro config set roles.<role>.fallbackChain '[...]'

# Statusline
maestro statusline install
maestro statusline test
maestro statusline set-theme <name>

# 搜索
maestro search "<query>" [--type <type>] [--category <cat>] [--code] [--all] [--json]
maestro search stats

# 工作空间
maestro workspace link <path> [--name <name>] [--scopes <scopes>]
maestro workspace unlink <name>
maestro workspace list
maestro workspace sync

# Worktree
maestro worktree create <name> [--base <branch>]
maestro worktree list
maestro worktree switch <name>
maestro worktree merge <name> [--strategy <strategy>]
maestro worktree delete <name>
```
