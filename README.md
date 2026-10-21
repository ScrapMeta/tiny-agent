# tiny-agent

我的一台 Tiny Engineer 桌面机器人：硬件、固件、以及**让各种 AI agent 接上来**的配置。

机器人是一个只认 HTTP 的 ESP32-C3：`POST /anim?name=typing` 就动一下。所有"接入"都是把各 agent 的生命周期事件翻译成这一个请求——所以**机器人端不用装任何东西**。

```
agent 事件 ──(hook)──▶ scripts/hooks/te-hook.sh ──curl──▶ POST http://<机器人IP>/anim
```

## 一句话接入（推荐）

设备先按上游流程配好网（开机 → 连 `TinyEngineer-XXXX` 热点 → 打开 `192.168.4.1` 的向导 → 选 WiFi），然后知道它的 IP 或名字。接着在任意 agent 里说：

> 按照 https://github.com/ScrapMeta/tiny-agent 的说明，在本 agent 安装配置设备：`192.168.70.196`

要它写全局（所有项目/所有 profile 生效）就把"本 agent"换成"全局"：

> ……在全局安装配置设备：`tiny-engineer`

agent 会：取包 → 探测设备 → 按自己的宿主写配置 → 自验（响一次铃）→ 回报改了哪些文件和使用说明。完整契约见 [`AGENTS.md`](AGENTS.md)。

### 名字约定（一句话里怎么说）

| 你要表达 | 说法 |
|---|---|
| 这套东西的名字 | **`tiny-agent`**（也可说 Tiny Engineer / TE / 桌面机器人） |
| 设备地址 | **IP**（`192.168.70.196`）或 **hostname**（`tiny-engineer`、`te-01`）——名字不是地址 |
| 装 | 按 …tiny-agent 的说明，在**本 agent** 安装配置 **tiny-agent 设备**：`192.168.70.196` |
| 全局装 | 把"本 agent"换成"**全局**" |
| 卸 | 按 …tiny-agent 的说明，在**本 agent 卸载清除** tiny-agent 设备：`192.168.70.196` |
| 连文件一起清 | 把"卸载清除"说成"**彻底删除**"（对应 `--undo --purge`） |
| 看状态 | 按 …tiny-agent 的说明，**检查** tiny-agent 设备：`192.168.70.196` |

一句能被正确执行的话里必须同时有**动作**和**地址**；只说"我的机器人"不算地址。

## 现状（实测）

| 项 | 值 |
|---|---|
| 机器人 | `192.168.70.196` · 固件 **`v0.2.0-28-g261adc2-dirty`**（已刷 main） · WiFi `WX-newst` |
| `/anim` `/health` `/settings` `/test/*` | 可用 |
| `POST /play`（念任意音频） | **可用**：16-bit mono 22050 Hz，实测 1.2 s 片段 1.21 s 播完 |
| `access_token` | **未设置** —— 同网段任何人都能用，且能 `POST /settings/reset` 把 WiFi 抹掉 |
| 已保存 WiFi | 5 个槽位，当前 1 个（`wifi_networks: ["WX-newst"]`，从旧单网络自动迁移） |

> **已刷机**：设备现在跑 `main-261adc2`（`v0.2.0-28-g261adc2-dirty`）。舵机标定、token、WiFi 都在（NVS 未动）。复现与回退见 [`docs/firmware/BUILD.md`](docs/firmware/BUILD.md)。

## 三十秒接入

```bash
git clone https://github.com/ScrapMeta/tiny-agent.git && cd tiny-agent
node scripts/install.mjs --agent auto --url http://192.168.70.196
node scripts/doctor.mjs --url http://192.168.70.196
```

`install.mjs` 会探测你装的是哪个 agent，只写它自己的配置，别的条目一个不碰；`--dry-run` 先看计划，`--undo` 精确回滚。

各 agent 的细节（写哪个文件、覆盖哪些事件、有什么坑）：[`adapters/`](adapters/)。

## 目录

| 路径 | 内容 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | **给 agent 的统一入口**：探测 → 安装 → 自验 → 回报 |
| [`adapters/`](adapters/) | 每个 agent 一份安装说明（Hermes / Cursor / Claude Code / Antigravity / Codex / Gemini / 通用） |
| `scripts/` | `install.mjs`（幂等安装/回滚）、`doctor.mjs`（探设备能力）、`hooks/te-hook.sh`（Hermes 钩子） |
| [`tools/`](tools/) | `te-gateway.mjs`：一台机器人给多人用时加租约/抢占/说话锁；`test-gateway.mjs`：21 项断言 |
| [`docs/hardware/`](docs/hardware/) | 组装手册、BOM、走线、舵机选型测试件 |
| [`docs/firmware/`](docs/firmware/) | 离线刷机用的 v0.2.0 固件 bin |
| [`docs/onboarding/`](docs/onboarding/) | 单人可双击打开的中文接入手册（含命令生成器） |
| [`docs/network.md`](docs/network.md) | IP / mDNS / 代理 / token 的坑 |
| [`mods/`](mods/) | 灯罩等改装件 |

## 该记住的三条

1. **用 IP，不要用 `tiny-engineer.local`。** 任何 TUN 模式代理（Clash 等）会把 `*.local` 答成 `198.18.x.x`；公司网/访客网也常禁组播。
2. **多人共用一台会互相抢。** 固件单线程、无队列、`/anim` 最新者胜。一人一台，或者上 `tools/te-gateway.mjs`。
3. **先设 `access_token`。** 否则同网段任何人能改配置、能 reset 掉 WiFi（之后只能物理重配）。

## 许可证

硬件/MIT 相关的上游说明见 `tiny-engineer/`（未提交，clone 自 [jamro/tiny-engineer](https://github.com/jamro/tiny-engineer)）。本仓库里我方产出的文档与脚本：MIT。
