# 接上 Tiny Engineer —— 给 coding agent 的操作契约

你在一个有 shell 权限的环境里。目标：**让本机的 agent 事件驱动我桌上那台 Tiny Engineer 机器人**，并在完成后向我汇报。机器人端不需要你安装任何东西。

这是一份**可执行**的契约，不是教程。按顺序做，不要跳步，不要即兴发挥。

## 0. 先拿到两个输入

| 输入 | 怎么拿 | 默认 |
|---|---|---|
| `TE_URL` | 问我；或读本仓库 `README.md` 的“现状”表 | `http://192.168.70.196` |
| `TE_TOKEN` | 若机器人设了口令，问我 | 空（当前设备未设） |

**必须用 IP，禁止用 `tiny-engineer.local`**：TUN 代理（Clash 等）会把 `*.local` 解析成 `198.18.x.x`，公司网/访客网也常禁组播。不确定就用 IP。

## 1. 探测设备（30 秒，只读）

```bash
curl -s -m 3 --noproxy '*' "$TE_URL/auth"      # required / wifi_configured / provisioning
curl -s -m 3 --noproxy '*' "$TE_URL/health"    # version / ip / hostname
curl -s -m 3 --noproxy '*' "$TE_URL/" | grep -oE '/(anim|play|settings|test/[a-z/]+)' | sort -u
```

判定：

- `health.ok != true` 或超时 → **停**。告诉我是网络问题（不同网段 / 代理 / 机器人离线），不要重试超过两次。
- 第三条里没有 `/play` → 这台固件**不支持说话**。后面不要承诺“让机器人说话”。
- `auth.required == true` 而你没有 token → **停**，向我要。

## 2. 安装（一条命令）

```bash
node scripts/install.mjs --agent auto --url "$TE_URL"
# 有口令时追加： --token "$TE_TOKEN"
# 先看计划不落盘： --dry-run
```

`install.mjs` 的行为是契约的一部分：

- **探测，不猜**：按环境变量 / 已有配置文件判断你是谁，识别不了就报 `unknown` 而不是乱写。
- **只碰自己的条目**：写入的每个条目都带 Tiny Engineer 标记，别人的 hook 一个不动。
- **幂等**：重复执行结果一致；`--undo` 精确回滚。
- **可读报告**：退出码 0/1，stdout 是 JSON（`{agent, wrote[], skipped[], device:{version, missing[]}, ok}`）。

如果 `install.mjs` 报 `unknown`，按场景手动走：[`adapters/`](adapters/) 里选对应的一份，别自创格式。

## 3. 自验（必须做完再回话）

```bash
node scripts/doctor.mjs --url "$TE_URL"     # 设备能力 + 本机配置状态
```

然后做一次真实触发。**注意：会响铃**（约 2 秒）。

| 你是谁 | 触发命令 |
|---|---|
| Hermes | `bash <profile>/agent-hooks/te-hook.sh --test` |
| Cursor / Claude Code / Antigravity | `echo '{"hook_event_name":"stop","status":"completed","conversation_id":"t","generation_id":"g"}' \| npx -y tiny-engineer hook cursor` |
| Codex | `sh -c "curl -s -m 2 -X POST '$TE_URL/anim?name=ring' >/dev/null 2>&1"` |
| Gemini / 其它 | `curl -s -m 2 -X POST "$TE_URL/anim?name=ring"` |

再读一次状态确认：

```bash
curl -s --noproxy '*' "$TE_URL/anim"    # 应该是 ring，几秒后回到 none
```

## 4. 回报格式（就这四行）

```
agent:      <你识别出的 id>
config:     <改了哪些文件；或“未改动，原因…”>
device:     <version> · play=<yes/no> · auth=<on/off>
verify:     ring http=200 · /anim 已回 none
```

## 禁止（硬约束）

1. **不要** `POST /settings`、`/settings/wifi`、`/settings/reset`、`/test/*`、`/setup/*`。这些会改配置、抹 WiFi、让五个舵机全速来回甩。当前设备**没有 token**，一次误调用就能把它弄下线，只能物理重配。
2. **不要**为了让结果好看而关掉别人的 hook、改 `PATH`、装常驻服务或开机自启。
3. **不要**把 token 写进仓库文件、日志、截图；需要持久化就写用户级配置（`%APPDATA%\tiny-engineer\env` 或 `~/.config/tiny-engineer/env`）。
4. **不要**猜测机器人 IP 或用 mDNS 名字兜底。
5. **不要**在没跑第 3 步的情况下说“已配置完成”。

## 失败了怎么报

| 现象 | 结论 | 你要做的 |
|---|---|---|
| `curl` 超时 / 连不上 | 网络层不通 | 报 IP + 错误码，停 |
| `curl` 200 但你的 hook 不触发 | 钩子没装到“当前项目” | 确认 `install.mjs` 是在项目根目录跑的 |
| 钩子 `exit 127` | hook runner 的 `PATH` 里没有 node | 改用绝对路径的解释器，或项目内的 wrapper 脚本 |
| 401 | 设备有 token，你没带 | 向我要 token |
| `503 wifi not configured` | 机器人没联网 | 报 OLED 上的 IP / setup AP，停 |
