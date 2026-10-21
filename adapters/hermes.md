# Hermes

**机制**：Hermes 的 agent hooks —— 在 profile 的 `config.yaml` 里声明"事件 → 命令"，宿主执行，确定性触发。
**注意**：Hermes 没有 `hooks add` 命令（只有 `list / test / doctor / revoke / remove`），所以只能写配置；第一启用要过 `shell-hooks-allowlist` 的同意。

## 写在哪

| 位置 | 作用域 |
|---|---|
| `%LOCALAPPDATA%\hermes\profiles\<profile>\config.yaml`（macOS/Linux：`~/.hermes/profiles/<profile>/config.yaml`） | **仅该 profile** |
| `<profile>\agent-hooks\te-hook.sh` | 钩子脚本本体 |

想在所有 profile 生效，得把 `hooks:` 段挪到全局 `hermes/config.yaml`——不建议，机器人是"这个 profile 的桌面"。

## 安装

```bash
node scripts/install.mjs --agent hermes \
  --url http://192.168.70.196 \
  --profile "$LOCALAPPDATA/hermes/profiles/tiny-engineer"
```

安装器会：复制 `scripts/hooks/te-hook.sh` 到 `<profile>/agent-hooks/`、备份 `config.yaml`、在 `hooks:` 下补齐 7 个事件（已存在且指向 TE 脚本的条目**替换**而不是追加），其它 hook 一个不动。

**作用域**：`--scope profile`（默认）= 当前 profile，靠 `hermes config path` 判断"我在哪个 profile"；`--scope global` = `~/.hermes/config.yaml`，脚本落在 `~/.hermes/agent-hooks/`，对所有 profile 生效。两者可叠加（标记去重）。

**关于授权（重要）**：Hermes 的 `shell-hooks-allowlist` 是**按脚本路径**认的。
- 新路径（如 `te-hook.sh`）第一次装完是 `not allowlisted`，**运行时不会触发**，需要重启 Hermes 时点一次同意（或启动加 `--accept-hooks`）。
- 已经授权过的路径（比如旧脚本 `bell-robot.sh`）**改内容不会阻断**，只会提示 `script modified since approval`。
- 所以 `install.mjs` 会优先复用**已经接线、且文件存在**的那个脚本名（`bell-robot.sh` 优先），把新内容写进去，避免为了改个名字就要重新授权一次。新机器上没有旧脚本时才会创建 `te-hook.sh`。

生成的结构：

```yaml
hooks:
  on_session_start:    [{ command: <profile>/agent-hooks/te-hook.sh, timeout: 5 }]
  pre_llm_call:        [{ command: <profile>/agent-hooks/te-hook.sh, timeout: 5 }]
  pre_tool_call:       [{ command: <profile>/agent-hooks/te-hook.sh, timeout: 5 }]
  pre_approval_request:[{ command: <profile>/agent-hooks/te-hook.sh, timeout: 5 }]
  post_approval_response:[{ command: <profile>/agent-hooks/te-hook.sh, timeout: 5 }]
  on_session_end:      [{ command: <profile>/agent-hooks/te-hook.sh, timeout: 5 }]
  agent_loop_stopped:  [{ command: <profile>/agent-hooks/te-hook.sh, timeout: 5 }]
```

## 事件 → 姿态

| Hermes 事件 | 姿态 |
|---|---|
| `on_session_start` | `welcome` |
| `pre_llm_call` | `thinking` |
| `pre_tool_call` + 读/搜类工具 | `reading` |
| `pre_tool_call` + 其它工具 | `typing` |
| `pre_approval_request` | `attention` |
| `post_approval_response` + deny | `abort` |
| `on_session_end` + completed | `ring` |
| `on_session_end` + failed | `error` |
| `on_session_end` + interrupted / `agent_loop_stopped` | `abort` |

## 开关与状态（不用改 config.yaml）

```bash
te-hook.sh --status   # URL / token / 开关 / 铃多久前 / 日志
te-hook.sh --off      # 静音
te-hook.sh --on       # 恢复
te-hook.sh --test     # 打一声铃
```

## 三个已解决的坑

1. **铃响完还在动**：Hermes 回合结束后仍会跑后台整理（`skills_list` / `skill_view` / `skill_manage` / `memory`），它们走同一个 `pre_tool_call`。实测铃后 8–26 秒会"自己动"。
   → `te-hook.sh` 在 `ring` 后置一个**静默窗口**（`TE_QUIET_SECS`，默认 **20 秒**），窗口内连续姿态一律丢弃；`on_session_end` **永远放行**（铃声不会被自己的静默吃掉）。
   ⚠️ 不要做成"静默到下一轮"：这个 Hermes 会话里 `pre_llm_call` 从 18:54 起就**不再触发**了，标志会一直挂着，机器人整段任务都不动、结束也不响。固定窗口能自愈。
2. **延迟**：早期版本每个事件 ~820 ms（`date/sed/cat/wc` 各 fork 一次），现在只用 bash 内建 + 一次 `curl`，实测 **250–370 ms**。
3. **脚本改动后 Hermes 会要你重新同意**（`script modified since approval`）。这是供应链保护，正常；重启时点同意，或启动带 `--accept-hooks`。

## 如果你还在用旧脚本

若 profile 里已有 `agent-hooks/bell-robot.sh`，安装器会把 `hooks:` 里指向它的条目替换成 `te-hook.sh`；旧文件保留不删，确认无误后可自行移除。

```bash
hermes hooks list      # 7 条应全部 allowed
hermes hooks doctor    # exec bit / allowlist / 定时 / 空 stdout
```
