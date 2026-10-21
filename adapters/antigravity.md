# Antigravity

**机制**：`.agents/hooks.json`（项目级），宿主执行 `npx -y tiny-engineer hook antigravity <event>`。

## 安装

```bash
node scripts/install.mjs --agent antigravity --url http://192.168.70.196
# 等价于官方：
npx -y tiny-engineer setup antigravity --yes --url http://192.168.70.196
```

## 文件与事件（4 个）

`.agents/hooks.json`，键名 `tiny-engineer`：

| 事件 | 姿态 |
|---|---|
| `PreInvocation` | `thinking` |
| `PreToolUse` | 读类 `reading` / 其它 `typing` |
| `PostToolUse` | `typing` |
| `Stop` | `ring`（中断/失败 → `abort`/`error`） |

## 与其它 IDE 的区别

Antigravity 的钩子要求**往 stdout 输出 decision JSON**，CLI 已经处理好（总是打印合法 JSON）。所以：

- 不要手动改那条 `command` 去加 `echo` 之类的东西，会污染 stdout。
- 如果你的 wrapper 脚本要自己写，务必保证 stdout 只有那一个 JSON。

## 坑

- 项目级，换目录要重装。
- `PATH` 缺 node → `exit 127`。
- 卸载：`npx -y tiny-engineer uninstall antigravity --yes`。
