# Claude Code

**机制**：`.claude/settings.json` 里的 hooks（项目级），宿主执行 `npx -y tiny-engineer hook claude-code`。

## 安装

```bash
node scripts/install.mjs --agent claude-code --url http://192.168.70.196
# 等价于官方：
npx -y tiny-engineer setup claude-code --yes --url http://192.168.70.196
```

## 覆盖的事件（13 个）

`SessionStart` · `SessionEnd` · `UserPromptSubmit` · `SubagentStart` · `PreToolUse` · `PostToolBatch` · `PostToolUseFailure` · `PreCompact` · `PermissionRequest` · `PermissionDenied` · `Notification` · `Stop` · `StopFailure`

映射与 Cursor 同构：读/搜 → `reading`，写/跑 → `typing`，思考块 → `thinking`，`Stop`+completed → `ring`，perm 请求 → `attention`，denied/failed → `error`/`abort`。

## 效果

| 时刻 | 机器人 |
|---|---|
| 会话开始 | `welcome`（抬手） |
| 提交提示 / 下工具调用 | `reading` / `typing` |
| 回合结束 | `ring`（响铃） |
| 权限被拒 / 失败 | `abort` / `error` |

## 坑

- **项目级**：在哪个目录装就只在哪个目录生效，换目录要再跑一次。
- 钩子里的 `PATH` 可能没有 node（nvm/fnm）→ `exit 127`。用绝对路径或项目内 wrapper。
- 冷 `npx` 慢：钩子 `timeout` 保持 ≥30。
- 想全局开关，用 `npx -y tiny-engineer uninstall claude-code --yes`（只删 TE 条目）。

## 想让它"会说话"

`POST /play` 是模型主动调用的能力，适合做成 **skill**（不是 hook）。见 `skills/tiny-agent/SKILL.md`。
**注意**：当前设备固件 v0.2.0 **没有 `/play`**，装了也只会 404。
