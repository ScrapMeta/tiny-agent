---
name: tiny-agent
description: "Use when driving the Tiny Engineer desk robot by intent (speak, nod, ring, go to sleep) rather than by lifecycle events."
---

# Tiny Engineer：按意图驱动

**钩子负责被动反应**（读文件就动、回合结束响铃），这个 skill 负责**主动表达**——你判断"这里该说话/该点头"的时候才用。

机器人只认 HTTP：`POST http://<ip>/anim?name=<pose>`，2 秒超时，失败就算了，不要重试、不要因此卡住任务。

## 什么时候用

| 场景 | 动作 |
|---|---|
| 要念一段话给用户听 | `POST /play`（**当前固件 v0.2.0 没有这个路由，会 404**；先 `curl /` 确认） |
| 想强调"我在这儿" | `anim attention`（约 1 分钟的举手提示） |
| 用户离开了 | `anim sleep`（闭眼 + 熄屏） |
| 任务做完、想引人注意 | `anim ring`（一声铃） |
| 需要用户拍板 | `anim attention` + 在聊天里提问 |
| 出错、卡住 | `anim error` |

**不要**用它做常规进度反馈——那是钩子的活，你每调一次就多一次 HTTP 和 1 秒的最小保持。

## 怎么调

```bash
# 姿态
curl -s --noproxy '*' -m 2 -X POST "http://192.168.70.196/anim?name=thinking" || true

# 说一句话（需要新固件 + 16-bit mono 22050 Hz WAV）
curl -s --noproxy '*' -m 30 -X POST http://192.168.70.196/play \
  -H 'Content-Type: audio/wav' --data-binary @clip.wav
```

设了口令就加 `-H "Authorization: Bearer $TINY_ENGINEER_TOKEN"`。

## 姿态取值

`none` `typing` `reading` `thinking` `talking` `ring` `welcome` `attention` `error` `abort` `dead` `wakeup` `sleep`

- `typing/reading/thinking/talking` 是**连续**的：不替换就一直跑；
- `ring/welcome/attention/error/abort/dead/wakeup/sleep` 是一次性或保持型；
- `none` 归位，2 秒后舵机断电（头会轻微下垂）。

## 硬约束

1. 用 IP，不要 `*.local`。
2. 不要 `POST /settings`、`/settings/reset`、`/test/*`、`/setup/*`。
3. 一台机器人只有一条"正在工作"的姿态：你设了连续姿态，别人会被拒（网关）或互相顶掉（直连）。
4. 机器人不在线不是错误：`|| true`，继续干活。
