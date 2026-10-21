# Roadmap

按价值排序，不是按工作量。

## 现在（v0.1）能用

- `install.mjs`：Hermes / Cursor / Claude Code / Antigravity / Codex / Gemini 六种接入，幂等、可回滚、保留别人的 hook。
- `doctor.mjs`：设备能力 + 本机接线状态一屏看完。
- `te-hook.sh`：Hermes 侧的实现（开关、铃后静默、1 秒门、日志轮转）。
- `tools/te-gateway.mjs`：一台机器人多人用时的租约层（21 项断言）。
- 硬件 / 固件 / 网络文档。

## 下一步

| 项 | 为什么 | 难度 |
|---|---|---|
| **Gemini extension 打包** | `gemini extensions install <url>` 一条命令替代手改 JSON | 中 |
| **Claude Code plugin/marketplace** | 让 skill + hooks 一起分发，而不是两条路 | 中 |
| **`te` 薄命令** | `te anim typing` / `te say clip.wav`，把 REST 细节收进一处 | 低 |
| **Cua / 无终端宿主** | 只有聊天窗口的 agent 目前完全接不了 | 高 |
| **固件升级到有 `/play` 的版本** | 说话能力是本项目最想要但当前缺的功能 | 低（刷机） |
| **每台唯一 hostname 的烧录脚本** | 5 台批量时 `tiny-engineer.local` 会撞名 | 低 |
| **CI：对 mock 设备跑 install/undo** | 防止改坏别人的配置 | 中 |

## 不做

- **MCP server**：机器人只暴露 HTTP，包一层只是多一个常驻进程。
- **常驻 daemon / 开机自启**：钩子已经够用，多一个后台进程就多一处故障。
- **把 token 写进仓库**：永远走用户级配置或环境变量。
