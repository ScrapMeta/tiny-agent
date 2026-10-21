# 网络与访问

## 用 IP，不要用 `.local`

| 现象 | 原因 |
|---|---|
| `ping tiny-engineer.local` 回 `198.18.x.x` | Clash 等 TUN 模式的代理开了 fake-ip，抢答所有 `*.local` |
| macOS 打开要卡 2–3 秒 | 先等 AAAA 记录超时（固件已回 AAAA，但仍受网络影响） |
| 同事的机器完全解析不了 | 公司网/访客网禁组播，Windows 也没装 Bonjour |

结论：**所有命令和配置里都写 IP**。`.local` 只适合"我这台机器已经配好 hosts"的临时场景。

## 固定 IP

DHCP 换地址会让所有人的配置一起失效。在路由器里把机器人的 MAC 绑一个静态租约（示例：`192.168.70.196`）。

OLED 第二行显示当前 IP；`GET /health` 的 `wifi.ip` 也是。

## 代理

| 客户端 | 行为 |
|---|---|
| `curl` | 读 `http_proxy`/`https_proxy`，会把内网请求塞进代理 → 加 `--noproxy '*'` |
| Node `fetch` | 默认不走系统代理 → 钩子（npx CLI）通常不用处理 |
| 浏览器 | 按系统代理设置；面板打不开时先关代理 |

**同一个 URL，curl 通但 node 不通（或反之），先查这个不对称。**

## 子网

机器人是 2.4 GHz ESP32-C3，只能加入一个 2.4G 网络（当前固件只存 1 个 SSID；新固件支持 5 个）。所以：

- 同事的电脑必须和它在同一个二层网络，或路由可达（不能是"开了 AP isolation 的访客网"）。
- 公司常见拦法：VLAN 隔离、mDNS 禁用、客户端互访禁止。判断方法只有一条——`curl -m 3 http://<ip>/health` 有没有 JSON。

## 访问口令

当前设备 `GET /auth` → `{"required":false}`：**同网段任何人都能驱动它，也能 `POST /settings/reset` 把它从 WiFi 上抹掉**（之后只能进 setup AP 物理重配）。

```bash
curl --noproxy '*' -X POST http://192.168.70.196/settings \
  -H 'Content-Type: application/json' -d '{"access_token":"<secret>"}'
```

设了之后：所有 JSON 接口要 `Authorization: Bearer <token>`；CLI 用 `TINY_ENGINEER_TOKEN`，本仓库的 `install.mjs --token` 会写进用户级配置。

限制要讲清楚：**只有一个共享口令**，没有按人区分、没有速率限制、没有审计；换口令 = 所有人重配。

## 多人共用一台

固件单线程、无会话、无队列：

- `/anim` 最新者胜，每个姿态至少保持 1 秒；
- 连续姿态 5 分钟（`continuous_timeout`）后转 `attention`，再约 1 分钟回 `none`；
- `POST /play` 会占住唯一的连接直到音频播完（且当前固件没有这个路由）。

所以多人共用不会崩，但会**退化成噪音**：两个 agent 每秒互相顶掉、铃声被打断、一个人说话全体卡住。要么一人一台，要么用 `tools/te-gateway.mjs`（租约 / 抢占后接回 / 说话锁 / admin 护栏）。
