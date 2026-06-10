# Setup: v3.0 — Knowledge System Configuration

v2→v3 迁移后的环境配置。验证并引导用户完成知识系统、CodeGraph、Hook 的安装和配置。

## Step 1: 统一搜索验证

```
1. 运行：maestro search --help 2>&1 | head -1
2. IF 可用 → 显示 "统一搜索：就绪（maestro search）"
3. IF 不可用 → 警告 "运行 maestro install --force 更新 CLI"
```

**迁移提示**：
```
以下命令已废弃，请使用 maestro search 替代：
  - spec search    → maestro search --type spec
  - knowhow search → maestro search --type knowhow
  - wiki search    → maestro search
```

## Step 2: CodeGraph 安装

```
1. 检测：node -e "require('@colbymchenry/codegraph')" 2>&1
2. IF 已安装 → 显示 "CodeGraph：已安装"
3. IF 未安装 → 显示：
     "可选：@colbymchenry/codegraph（tree-sitter 代码分析）"
     "启用函数级 KG，提供 callers/callees 查询。"
     "安装：npm install -g @colbymchenry/codegraph"
   
   AskUserQuestion: "是否安装 CodeGraph？"
   Options: [安装 / 跳过]
   IF 安装：
     Bash: npm install -g @colbymchenry/codegraph

4. IF 已安装 AND 无索引：
     Bash: maestro kg index --sqlite
     显示 "KG 索引已初始化"
```

## Step 3: Hook 升级

```
1. 运行：maestro hooks status 2>&1
2. IF standard 级别已安装 BUT 缺少 kg-sync 或 kg-context-injector：
     AskUserQuestion: "Hooks 需升级以包含 KG hooks，是否重新安装？"
     Options: [重新安装 / 跳过]
     IF 重新安装：
       Bash: maestro hooks install --level standard
       显示 "Hooks 已升级，包含 kg-sync + kg-context-injector"

3. IF 未安装任何 hooks：
     AskUserQuestion: "是否安装 standard 级别 Hooks？（推荐）"
     Options: [安装 / 跳过]
     IF 安装：
       Bash: maestro hooks install --level standard
```

### Hook 变更说明

| Hook | 事件 | 作用 |
|------|------|------|
| `kg-sync` | UserPromptSubmit | 用户输入时静默同步知识图谱（30 秒冷却） |
| `kg-context-injector` | PreToolUse:Agent | Agent 启动时注入代码结构上下文 |

`keyword-spec-injector` 也已升级——现在包含 KG 符号查找，从 prompt 中提取 camelCase/snake_case 符号名，查询 CodeGraph 获取调用关系。

## Step 4: 验证

```
1. 验证统一搜索：maestro search "test" --limit 1
2. 验证 KG（如已安装）：maestro kg stats
3. 验证 Hooks：maestro hooks status
4. 显示最终状态：
     Knowledge System:
       Search:    maestro search（统一，BM25）
       CodeGraph: {已安装 | 未安装（可选）}
       KG Hooks:  {活跃 | 需重新安装}
```
