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
| 跳个舞 / 庆祝一下 / 鞠个躬 | `te.mjs dance [--id groove\|celebrate\|bow] [--seconds N]` | 固件自带姿态拼的，默认约 8 s |
| 欢呼 / 挥手 / 点头 / 伸懒腰 / 自编动作 | `choreo.mjs <名字>` | 关节级编排，见下节；`--list` 看全部 |
| 统计用量 / 今天用了多久 | `te.mjs stats [--days 7]` | 命令数、语音秒数、姿态分布、活跃时长 |
| 还在不在 / 状态 | `te.mjs status` | 版本、IP、RSSI、在线时长 |

姿态取值：`none typing reading thinking talking ring welcome attention error abort dead wakeup sleep`。

## 三条硬约束（违反会出问题）

1. **播放期间发不进 HTTP，但机器人自己在动。** 固件只有一个 `WebServer`，`POST /play` 在整个音频流期间占住 `loop()`（`play_handlers.cpp` 每两次写 I2S 之间只泵 `tickRobot()`，不泵 `pollHttpServer()`），所以这期间的 `/anim`、`/test/servo` 全部超时（实测 3 s 超时）。**但这不等于"说话时不动"**：`/play` 默认挂 `talking` 动画，`audioMotionFeed()` 把实时音量喂给它，头、颈、身体会跟着声音动。所以不要边播边发姿态指令；想要音画同步的自编舞蹈，只能进固件写动画（见文末）。
2. **不要调** `/settings`、`/settings/reset`、`/test/*`、`/setup/*`。会改配置、抹 WiFi、让五个舵机全速来回甩。
3. **姿态有时长**：`attention` 保持约 1 分钟，`dead` 一直保持。编舞时避开它们，或明确要用户等。

## 关节级编排：自己设计动作（`tools/choreo.mjs`）

固件里每个姿态都是**写死的 C++ 动画**（`src/animation/*.cpp`），不能上传新动画。但 `/test/servo` 能单独驱动关节，所以动作可以在这边编排：

| # | 关节 | 这台设备的标定范围 | 跨度 |
|---|---|---|---|
| 0 | head 头 | 60–130° | 70° |
| 1 | neck 颈 | 40–130° | 90° |
| 2 | left 左臂 | 45–135° | 90° |
| 3 | right 右臂 | 35–125° | 90° |
| 4 | body 身体 | 40–130° | 90° |

姿态坐标 **−1..+1**：0 = 中位，(min+max)/2 ± span/2。**+1 是抬起还是放下取决于装配方向**；第一次跑发现反了，加 `--flip left,right` 翻符号。

物理上限（固件常量，别想着绕过）：

- 最大角速度 **140 °/s**（`SERVO_MAX_SPEED_DEG_S`）→ 90° 跨度至少 0.65 s
- 每个 HTTP 请求约 **95 ms**（首个约 300 ms），所以**一帧 3 个关节 ≈ 0.3 s、5 个关节 ≈ 0.5 s**
- 角度被 `clampServoAngle` 钳到标定范围，发超了也不会甩出安全区
- 没有手指/腕关节：所谓"拍手"只能让两条手臂靠近，做不到真击掌

编排文件 `choreos/<名字>.json`，`t` 是**最短**间隔（实际会被上面两条限制拉长）：

```json
{ "name": "cheer", "frames": [
  { "t": 0.0, "head": 0, "left": 0, "right": 0 },
  { "t": 0.4, "head": 0.6, "left": 1, "right": 1 },
  { "t": 2.6, "head": 0, "left": 0, "right": 0 } ] }
```

用户要新动作时的流程：

1. 拆成 **3–8 个关键帧**，想清楚每个关节往哪边、到什么程度。用 0.4–0.9 比全 ±1 好看，也不会顶着限位。
2. 写 `choreos/<名字>.json`，`description` 写一句中文，`--list` 会列出来。
3. `node tools/choreo.mjs <名字> --dry-run` 核对角度（`0` 必须落在中位上）。
4. 真跑一次让用户看；方向反了加 `--flip`。
5. 想连动作带说话，先播动作再 `te.mjs say`——不能同时（见硬约束 1）。

已有：`cheer` 欢呼、`wave` 挥手、`bow` 鞠躬、`nod` 点头、`lookaround` 左顾右盼、`stretch` 伸懒腰、`angry` 生气砸键盘。

**反向甩臂的间隔别小于 0.5 秒**：从一端打到另一端（约 67°）在 140°/s 下要 0.48 秒，中途发新目标会把插值重置，动作只剩下小幅抖动。所以"砸键盘"这种来回动作，每一下之间留 0.5–0.55 秒才看得清。

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
