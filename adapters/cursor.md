# Cursor

**机制**：Cursor 的项目级 hooks（`.cursor/hooks.json`），宿主执行 `npx -y tiny-engineer hook cursor`，由官方 CLI 把事件映射成姿态。

## 安装

```bash
node scripts/install.mjs --agent cursor --url http://192.168.70.196
# 或手写：
npx -y tiny-engineer setup cursor --yes --url http://192.168.70.196
```

两者等价（安装器直接写 JSON，不依赖 npx 冷启动；官方 CLI 同时会把 URL/token 写进用户级配置）。

## 文件

`.cursor/hooks.json`（**项目级**：在哪个目录装，就只在哪个目录生效）

```json
{
  "version": 1,
  "hooks": {
    "sessionStart":         [{ "command": "npx -y tiny-engineer hook cursor", "timeout": 30 }],
    "beforeSubmitPrompt":   [{ "command": "npx -y tiny-engineer hook cursor", "timeout": 30 }],
    "afterAgentThought":    [{ "command": "npx -y tiny-engineer hook cursor", "timeout": 30 }],
    "preCompact":           [{ "command": "npx -y tiny-engineer hook cursor", "timeout": 30 }],
    "preToolUse":           [{ "command": "npx -y tiny-engineer hook cursor", "timeout": 30 }],
    "beforeReadFile":       [{ "command": "npx -y tiny-engineer hook cursor", "timeout": 30 }],
    "beforeShellExecution": [{ "command": "npx -y tiny-engineer hook cursor", "timeout": 30 }],
    "subagentStart":        [{ "command": "npx -y tiny-engineer hook cursor", "timeout": 30 }],
    "afterFileEdit":        [{ "command": "npx -y tiny-engineer hook cursor", "timeout": 30 }],
    "stop":                 [{ "command": "npx -y tiny-engineer hook cursor", "timeout": 30 }]
  }
}
```

## 事件 → 姿态

| Cursor 事件 | 姿态 |
|---|---|
| `sessionStart`、`beforeSubmitPrompt`、`beforeReadFile`、`preToolUse(Read)` | `reading` |
| `afterAgentThought`、`preCompact` | `thinking` |
| `preToolUse(edit/search/shell)`、`afterFileEdit`、`beforeShellExecution`、`subagentStart` | `typing` |
| `stop` + completed | `ring` |
| `stop` + aborted | `abort` |
| `stop` + error | `error` |

## 必做的两件事

1. **在 Cursor 设置里打开 Hooks**（默认是关的）。没开 → 文件写了也不触发。
2. **重开会话**让 `hooks.json` 生效（保存后 Cursor 会重载，但保险起见重开）。

## 坑

| 现象 | 原因 | 处置 |
|---|---|---|
| 钩子静默失败 `exit 127` | hook runner 的 `PATH` 没有 node（nvm/fnm/Volta） | 用绝对路径的 node，或项目内包一个 wrapper 脚本 |
| 第一次特别慢、偶发超时 | 冷 `npx` 要下包 | `timeout` 给 ≥30（上面已写）；或 `npm i -g tiny-engineer` |
| 用 `npx github:jamro/...` 报 `exit 128` | npm 走 SSH 拉取，钩子里没有 SSH agent | 只用 npm 包名 `tiny-engineer` |
| 换了项目目录就不动 | 钩子是**项目级**的 | 在新目录再跑一次安装 |

## 卸载

```bash
npx -y tiny-engineer uninstall cursor --yes     # 只删 Tiny Engineer 条目
```
