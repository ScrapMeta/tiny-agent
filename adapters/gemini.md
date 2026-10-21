# Gemini CLI

**机制**：`.gemini/settings.json` 的 `hooks`，宿主同步执行命令。没有官方 `tiny-engineer setup`，所以命令直接写 `curl`。

## 安装

```bash
node scripts/install.mjs --agent gemini --url http://192.168.70.196
```

生成的结构（`.gemini/settings.json`，项目级；`~/.gemini/settings.json` 为用户级）：

```json
{
  "hooks": {
    "BeforeAgent": [
      { "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST 'http://192.168.70.196/anim?name=reading' >/dev/null 2>&1", "timeout": 5000 }] }
    ],
    "BeforeTool": [
      { "matcher": "write_.*|replace|run_shell_command",
        "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST 'http://192.168.70.196/anim?name=typing' >/dev/null 2>&1", "timeout": 5000 }] }
    ],
    "AfterAgent": [
      { "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST 'http://192.168.70.196/anim?name=ring' >/dev/null 2>&1", "timeout": 5000 }] }
    ]
  }
}
```

字段规则：`hooks.<事件>` 是数组，元素 `{ matcher, sequential, hooks: [{ type:"command", command, timeout }] }`；`matcher` 在工具事件里是**正则**，工具名是蛇形（`run_shell_command`、`write_file`、`replace`）。

## 两个必须知道的坑

1. **stdout 必须干净**：Gemini 会把非 JSON 输出当成 `systemMessage` 甚至决策。所以每条命令末尾的 `>/dev/null 2>&1` 不能省。
2. **钩子可能默认关闭**：装完进 `/hooks` 面板确认这几条已注册；没生效就在 `settings.json` 顶层加 `"hooksConfig": { "enabled": true }`（不同版本行为不一致，以 `/hooks` 面板为准）。

## 验证

```bash
curl -s -m 2 -X POST 'http://192.168.70.196/anim?name=ring'   # 先确认链路
```

然后启动 Gemini，随便跑一个会写文件的工具，看机器人是否 `typing`。

## 更省事的替代

Gemini CLI 支持 **extensions**（`gemini extensions install <git url>`），可以把 hooks / commands / skills 打包成一个可安装单元。等这套配置稳定了，把它包成 extension 比让每个人改 JSON 更好——见 `docs/roadmap.md`。
