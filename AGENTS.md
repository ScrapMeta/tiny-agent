# 接上 Tiny Engineer —— 给 coding agent 的操作契约

你在一个有 shell 权限的宿主里运行。用户会丢给你一句类似的话：

> 按照 https://github.com/ScrapMeta/tiny-agent 的说明，在本 agent（或全局）安装配置设备：`192.168.70.196`

设备也可能写成名字：`tiny-engineer`。你要做的是**照这份文件从头做到底**，最后回一段简短结果 + 使用说明。机器人只认 HTTP；宿主端只装"钩子"，机器人端不需要你碰任何东西。

---

## 0. 先解析两个输入

| 输入 | 从用户的话里取 | 缺省 |
|---|---|---|
| `DEVICE` | IP 或主机名（`192.168.70.196` / `tiny-engineer`） | `192.168.70.196` |
| `SCOPE` | "本 agent / 这个项目" → `profile`；"全局 / 所有项目" → `global` | `profile` |

- **优先用 IP。** 用户给的是裸名字时，脚本会自动再试 `<名字>.local`；但 `.local` 依赖组播——TUN 代理（Clash 等）会把它答成 `198.18.x.x`，公司网/访客网直接没有。命中 `.local` 时要在回报里提醒用户换 IP。
- 用户没说 scope 就按 `profile` 做，并在回报里写明"只对当前 agent 生效；要全局再加 `--scope global`"。

## 1. 取包（你只有 URL 时）

```bash
D="$HOME/.cache/tiny-agent"
git clone --depth 1 https://github.com/ScrapMeta/tiny-agent.git "$D" 2>/dev/null || git -C "$D" pull --ff-only
```

Windows 的 git-bash 同理，`$HOME` 就是 `C:\Users\<you>`。网络受限就一次性走代理，不要反复重试超过两次。

## 2. 探测设备（只读，30 秒）

```bash
curl -s -m 3 --noproxy '*' "http://$DEVICE/auth"     # required / wifi_configured / provisioning
curl -s -m 3 --noproxy '*' "http://$DEVICE/health"   # version / ip / hostname
curl -s -m 3 --noproxy '*' "http://$DEVICE/" | grep -oE '/(anim|play|settings|test/[a-z/]+)' | sort -u
```

| 结果 | 判定 |
|---|---|
| 连不上 / `health.ok` 不是 true | **停**。报"网络层不通（不同网段 / AP 隔离 / 代理吞请求 / 机器人离线）"，别继续装 |
| `auth.required == true` 且没有口令 | **停**，向用户要 token |
| 路由里没有 `/play` | 这台固件**不支持说话**，后面不要承诺"让它说话" |
| `provisioning == true` | 机器人还在配网热点模式，先让用户完成配网 |

## 3. 安装

```bash
node "$D/scripts/install.mjs" --agent auto --url "$DEVICE" --scope "$SCOPE"
# 有口令：   --token <token>
# 先看计划： --dry-run
# 卸载：     --undo
```

`install.mjs` 的保证（契约的一部分）：

- **探测，不猜**：按环境变量 / 已有配置判断宿主；认不出来就报 `unknown`，别自创格式。
- **只碰自己的条目**：写入项都带 Tiny Engineer 标记，别人的 hook 原样保留。
- **幂等**：重复执行结果一致；`--undo` 精确回滚（Hermes 另外留 `config.yaml.bak-*`）。
- **可读报告**：stdout 是 JSON（`{ok, agent[], wrote[], scope, target, device{}, errors[]}`），进度走 stderr。

## 4. 各宿主的 scope 落点

| 宿主 | `--scope profile`（本 agent） | `--scope global`（全局） |
|---|---|---|
| **Hermes** | 当前 profile 的 `config.yaml` + `<profile>/agent-hooks/` | `~/.hermes/config.yaml`（所有 profile 生效） |
| **Cursor** | 项目 `.cursor/hooks.json` | 不支持（无用户级 hooks） |
| **Claude Code** | 项目 `.claude/settings.json` | `~/.claude/settings.json` |
| **Gemini CLI** | 项目 `.gemini/settings.json` | `~/.gemini/settings.json` |
| **Antigravity** | 项目 `.agents/hooks.json` | 不支持 |
| **Codex** | 只有用户级 `~/.codex/config.toml`（`notify`，仅回合结束） | 同左 |

**Hermes 的授权是硬门槛**：`shell-hooks-allowlist` 按**脚本路径**认。

- 新路径装完是 `not allowlisted`，**运行时不触发**，必须重启 Hermes 时点一次同意（或启动加 `--accept-hooks`）。
- 该 profile 若已有授权过的 TE 脚本路径（如 `bell-robot.sh`），安装器会**复用那个文件名**写新内容，避免为改名重新授权。

## 5. 自验（不做完不要回话）

```bash
node "$D/scripts/doctor.mjs" --url "$DEVICE"
```

再做一次真实触发——**会响铃，约 2 秒**：

| 宿主 | 命令 |
|---|---|
| Hermes | `<config 同目录>/agent-hooks/<安装器报告里的脚本名> --test` |
| Cursor / Claude Code / Antigravity | `echo '{"hook_event_name":"stop","status":"completed","conversation_id":"t","generation_id":"g"}' \| npx -y tiny-engineer hook cursor` |
| Codex | `sh -c "curl -s -m 2 -X POST 'http://$DEVICE/anim?name=ring' >/dev/null 2>&1"` |
| Gemini / 其它 | `curl -s -m 2 -X POST "http://$DEVICE/anim?name=ring"` |

```bash
curl -s --noproxy '*' "http://$DEVICE/anim"    # 应是 ring，几秒后回 none
```

## 6. 回报格式（照这个来，别写长文）

```
agent:    <识别出的宿主>
scope:    <profile|global> → <改了哪个文件>
device:   <version> · play=<yes|no> · auth=<on|off> · 目标=<最终用的 URL>
verify:   ring http=200 · /anim 已回 none
使用:     读文件→reading，写/跑→typing，思考→thinking，回合结束→ring
开关:     <脚本路径> --status / --off / --on / --test
```

再补一句用户必须知道的：**装完之后事件会自动驱动机器人；`ring` 之后脚本会静默到下一轮开始，所以"铃声 = 这一轮结束"。**

## 禁止（硬约束）

1. **不要** `POST /settings`、`/settings/wifi`、`/settings/reset`、`/test/*`、`/setup/*`：会改配置、抹 WiFi、让五个舵机全速来回甩。当前设备没有口令，一次误调用就得物理重配。
2. **不要**改用户 `PATH`、装常驻服务/开机自启、删别人的 hook。
3. **不要**把 token 写进仓库文件、日志或截图；持久化只写用户级配置（`%APPDATA%\tiny-engineer\env` / `~/.config/tiny-engineer/env`）。
4. **不要**猜 IP，也不要拿 `.local` 当唯一方案。
5. **不要**跳过第 5 步就说"已配置完成"。

## 失败对照

| 现象 | 结论 |
|---|---|
| `curl` 超时 | 网络层不通，报 IP + 错误码，停 |
| `curl` 200 但钩子不触发（Hermes） | 新脚本路径没被 allowlist 授权 —— 让用户重启 Hermes 点同意 |
| 钩子 `exit 127` | hook runner 的 `PATH` 里没有 node，改用绝对路径解释器 |
| `401` | 设备有口令，补 `--token` |
| `503 wifi not configured` | 机器人没联网，让它先进配网 |
| `--scope global` 在 Cursor/Antigravity 报错 | 设计如此：这两个宿主没有用户级 hooks |
