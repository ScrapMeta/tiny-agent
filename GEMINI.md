@AGENTS.md

# Gemini CLI

本仓库的接入契约在 `AGENTS.md`（上面已导入）。Gemini CLI 专用说明见 [`adapters/gemini.md`](adapters/gemini.md)。

要点：Gemini CLI 的钩子写在 `.gemini/settings.json` 的 `hooks` 里，命令行**必须吞掉 stdout**（`>/dev/null 2>&1`），否则 Gemini 会把输出当成决策 JSON 解析；部分版本默认关闭钩子，装完进 `/hooks` 面板确认。
