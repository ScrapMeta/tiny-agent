# Codex (OpenAI Codex CLI)

**机制**：`notify` —— Codex 的**根级配置键**，在回合结束时把一段 JSON 作为参数调用外部命令。
**限制（无法绕过）**：Codex 目前只发 `agent-turn-complete` 一个事件，所以**只能做到"回合结束响铃"**，没有 typing/reading/thinking 的中间过程。

## 安装

```bash
node scripts/install.mjs --agent codex --url http://192.168.70.196
```

或手写 `~/.codex/config.toml`（`$CODEX_HOME/config.toml`）：

```toml
# 必须是根级键，写在任何 [table] 之前
notify = ["sh", "-c", "curl -s -m 2 -X POST 'http://192.168.70.196/anim?name=ring' >/dev/null 2>&1", "sh"]
```

Windows（推荐用 Git Bash，路径按你机器改）：

```toml
notify = ["C:/Program Files/Git/bin/bash.exe", "-c", "curl -s -m 2 -X POST 'http://192.168.70.196/anim?name=ring' >/dev/null 2>&1", "sh"]
```

需要 token 时在 curl 里加 `-H 'Authorization: Bearer <token>'`。

## 为什么是 `sh -c` 加一个多余参数

Codex 会把通知 JSON 作为**一个额外参数**追加在你的命令后面。

- 直接写 `notify = ["curl", "...", "-X", "POST", "..."]` → 那段 JSON 会被 curl 当成第二个 URL，报错。
- `sh -c "<脚本>" sh` → JSON 变成 `$1`，脚本里的 `$0` 是那个 `sh`，直接被忽略。

## 验证

```bash
sh -c "curl -s -m 2 -X POST 'http://192.168.70.196/anim?name=ring' >/dev/null 2>&1" '{"type":"agent-turn-complete"}'
curl -s --noproxy '*' http://192.168.70.196/anim    # 应是 ring
```

## 坑

| 现象 | 原因 |
|---|---|
| 配置被忽略 | `notify` 写在了某个 `[table]` 之后 → TOML 里它就成了那张表的键 |
| 不响 | Codex 的 `tui.notifications` 关闭只影响桌面通知，不影响 `notify`；先确认命令能单独跑通 |
| 只在结束响一次 | 设计如此，没有工具级钩子 |

## 想要更多事件

Codex 没有工具级 hook。要么接受"只有铃声"，要么换一个支持 hooks 的宿主（Cursor / Claude Code / Antigravity / Gemini CLI）来跑同一份工作。
