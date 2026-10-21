---
name: tiny-agent
description: "Use when the user says /tiny-agent or asks the desk robot to dance, speak, tell a story, or report usage."
---

# tiny-agent：让桌上的机器人做具体的事

用户说 `/tiny-agent 跳个舞`、`说句话`、`讲个故事`、`统计一下用量`，就是这份 skill。
所有动作都落到一个命令上：`node tools/te.mjs <子命令>`（在 tiny-agent 仓库根目录跑）。

机器人只认 HTTP；**它本身没有"跳舞""讲故事"这种能力**，都是这里拼出来的：舞蹈 = 姿态编排，说话 = 本地 TTS 转 22050 Hz WAV 推到 `POST /play`。

## 命令表

| 用户说的 | 你执行 | 说明 |
|---|---|---|
| 动一下 / 看我一眼 / 开始干活 | `te.mjs anim thinking` | 单个姿态，取值见下 |
| 说句话 / 念一下 | `te.mjs say "文本" [--pose talking] [--voice 名字]` | 本地 TTS → `/play`，约 1 s 出 1 s 音频 |
| 讲个故事 | `te.mjs story [--id 1\|2\|3]` | 三个内置短故事，75–90 字 |
| 跳个舞 / 庆祝一下 / 鞠个躬 | `te.mjs dance [--id groove\|celebrate\|bow] [--seconds N]` | 姿态序列，默认约 8 s |
| 统计用量 / 今天用了多久 | `te.mjs stats [--days 7]` | 命令数、语音秒数、姿态分布、活跃时长 |
| 还在不在 / 状态 | `te.mjs status` | 版本、IP、RSSI、在线时长 |

姿态取值：`none typing reading thinking talking ring welcome attention error abort dead wakeup sleep`。

## 三条硬约束（违反会出问题）

1. **不要边放音边跳舞。** 固件只有一个 `WebServer`，`POST /play` 会占住连接直到音频播完，这期间的 `/anim` 全部排队或超时。要么跳舞（姿态序列），要么说话。
2. **不要调** `/settings`、`/settings/reset`、`/test/*`、`/setup/*`。会改配置、抹 WiFi、让五个舵机全速来回甩。
3. **姿态有时长**：`attention` 保持约 1 分钟，`dead` 一直保持。编舞时避开它们，或明确要用户等。

## 用量统计的口径

设备的 HTTP API **没有计数器**。`te.mjs stats` 统计的是"这台机器发出过的命令"：每次 `anim/say/story/dance` 都会追加一行到

```
Windows:    %LOCALAPPDATA%\tiny-agent\usage.jsonl
mac/Linux:  ~/.local/state/tiny-agent/usage.jsonl
```

所以它反映的是**我们从本机驱动它的量**，不是设备自己记的账；换台电脑就从零开始。这是设计选择，不要当成设备遥测。

## 失败怎么办

| 现象 | 处理 |
|---|---|
| `http 000` / 超时 | 机器人忙（正在放音频）或弱信号。等 2 秒重试**一次**，别连打 |
| `http 503` | 机器人没联网（`wifi not configured`），停下来告诉用户 |
| `http 401` | 设备设了口令，加 `--token` 或 `TINY_ENGINEER_TOKEN` |
| `/play` 返回 `404` | 固件太老（v0.2.0 release 没有这个路由），指向 `docs/firmware/BUILD.md` |

## 典型对话

> 用户：/tiny-agent 讲个故事
> 你：`node tools/te.mjs story --id 3` → 约 20 秒音频，机器人用 `talking` 姿态说完 → 回报"讲完了，约 20 秒"。

> 用户：/tiny-agent 庆祝一下
> 你：`node tools/te.mjs dance --id celebrate` → welcome → typing → ring（响铃）→ 归位，约 7 秒。

> 用户：/tiny-agent 今天用了多久
> 你：`node tools/te.mjs stats --days 1` → 报命令数、语音秒数、活跃分钟数，并说明口径。
