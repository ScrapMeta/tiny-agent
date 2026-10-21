#!/usr/bin/env node
/**
 * install.mjs — connect an AI coding agent to one Tiny Engineer robot.
 *
 * Design rules (these are the contract, see AGENTS.md):
 *   - detect, don't guess: identify the host from env vars / existing config files
 *   - marker-scoped: only entries that point at a Tiny Engineer script are touched,
 *     every foreign hook is preserved byte-for-byte
 *   - idempotent: running twice changes nothing
 *   - reversible: --undo removes exactly what this script added
 *   - machine-readable: progress on stderr, one JSON report on stdout
 *
 *   node scripts/install.mjs                          # auto-detect, install everything found
 *   node scripts/install.mjs --agent cursor --dry-run  # show the plan, touch nothing
 *   node scripts/install.mjs --undo                   # remove TE entries again
 *   node scripts/install.mjs --url http://10.0.0.5 --token s3cret --profile ~/.hermes/profiles/work
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const DEFAULT_URL = "http://192.168.70.196";
const CLI_CMD = (ide) => `npx -y tiny-engineer hook ${ide}`;
const TE_RE = /tiny-engineer hook|te-hook\.sh|bell-robot\.sh|\/anim\?name=/;

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const arg = (name, def = undefined) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
};
const flag = (name) => argv.includes(`--${name}`);

const CFG = {
  agent: String(arg("agent", "auto")),
  url: String(arg("url", DEFAULT_URL)).replace(/\/+$/, ""),
  token: String(arg("token", "") || ""),
  project: path.resolve(String(arg("project", process.cwd()))),
  profile: arg("profile") ? path.resolve(String(arg("profile"))) : null,
  dryRun: flag("dry-run"),
  undo: flag("undo"),
};

const log = (msg) => process.stderr.write(msg + "\n");

// ---------------------------------------------------------------- helpers

const report = { ok: true, agent: [], wrote: [], skipped: [], removed: [], device: {}, errors: [] };

function fail(msg) {
  report.ok = false;
  report.errors.push(msg);
  log(`  ✗ ${msg}`);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const text = JSON.stringify(data, null, 2) + "\n";
  if (CFG.dryRun) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function show(rel) {
  log(`  ${CFG.undo ? "−" : "+"} ${rel}`);
}

function backup(file) {
  if (CFG.dryRun || !fs.existsSync(file)) return;
  const bak = `${file}.bak-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;
  fs.copyFileSync(file, bak);
}

const isTE = (cmd) => typeof cmd === "string" && TE_RE.test(cmd);

/** keep every foreign entry, replace ours: array of plain objects with a `command` field */
function mergeFlat(list = [], entry) {
  const kept = list.filter((e) => !isTE(e?.command));
  return CFG.undo ? kept : [...kept, entry];
}

/** claude-code shape: [{ hooks: [{type,command,async}] }] */
function mergeClaude(list = [], command) {
  const kept = list.filter((g) => !(g?.hooks || []).some((h) => isTE(h?.command)));
  return CFG.undo ? kept : [...kept, { hooks: [{ type: "command", command, async: true }] }];
}

/** antigravity shape: PreInvocation/Stop are flat, PreToolUse/PostToolUse are matcher groups */
function mergeAntigravity(list = [], command, matcher) {
  const kept = list.filter((g) => {
    const inner = g?.hooks ? g.hooks.map((h) => h.command) : [g?.command];
    return !inner.some(isTE);
  });
  if (CFG.undo) return kept;
  return [...kept, matcher ? { matcher, hooks: [{ command, timeout: 30 }] } : { command, timeout: 30 }];
}

// ---------------------------------------------------------------- device probe

async function probeDevice() {
  const j = async (p) => {
    const res = await fetch(`${CFG.url}${p}`, { signal: AbortSignal.timeout(2500) });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { _text: text, _status: res.status };
    }
  };
  try {
    const [auth, health, index] = await Promise.all([j("/auth"), j("/health"), j("/").catch(() => ({ _text: "" }))]);
    const routes = String(index?._text || "").match(/\/(anim|play|settings|test\/[a-z/]+|setup\/[a-z]+|health|auth)/g) || [];
    const missing = [];
    if (!routes.includes("/play")) missing.push("play");
    if (!routes.includes("/settings")) missing.push("settings");
    report.device = {
      reachable: true,
      version: health?.version || "unknown",
      auth_required: auth?.required === true,
      wifi_configured: auth?.wifi_configured === true,
      provisioning: auth?.provisioning === true,
      ip: health?.wifi?.ip || null,
      routes: [...new Set(routes)],
      missing,
    };
    if (report.device.auth_required && !CFG.token) {
      fail("device requires a token (/auth required=true) but --token was not given");
    }
  } catch (err) {
    report.device = { reachable: false, error: String(err?.message || err) };
    fail(`device unreachable at ${CFG.url} — check IP / same LAN / proxy (curl needs --noproxy '*')`);
  }
}

// ---------------------------------------------------------------- user config (CLI reads this)

function writeUserConfig() {
  const base =
    process.platform === "win32"
      ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
      : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  const file = path.join(base, "tiny-engineer", "env");
  if (CFG.undo) return;
  const lines = ["TINY_ENGINEER_TRANSPORT=http", `TINY_ENGINEER_URL=${CFG.url}`];
  if (CFG.token) lines.push(`TINY_ENGINEER_TOKEN=${CFG.token}`);
  if (!CFG.dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, lines.join("\n") + "\n");
  }
  show(file);
}

// ---------------------------------------------------------------- adapters

const CURSOR_EVENTS = [
  "sessionStart", "beforeSubmitPrompt", "afterAgentThought", "preCompact", "preToolUse",
  "beforeReadFile", "beforeShellExecution", "subagentStart", "afterFileEdit", "stop",
];
const CLAUDE_EVENTS = [
  "SessionStart", "SessionEnd", "UserPromptSubmit", "SubagentStart", "PreToolUse", "PostToolBatch",
  "PostToolUseFailure", "PreCompact", "PermissionRequest", "PermissionDenied", "Notification",
  "Stop", "StopFailure",
];
const ANTIGRAVITY_EVENTS = {
  PreInvocation: null,
  PreToolUse: "*",
  PostToolUse: "*",
  Stop: null,
};

const adapters = {
  cursor: {
    id: "cursor",
    detect: () => Boolean(process.env.CURSOR_TRACE_ID) || fs.existsSync(path.join(CFG.project, ".cursor")),
    run() {
      const file = path.join(CFG.project, ".cursor", "hooks.json");
      const cfg = readJson(file, { version: 1, hooks: {} });
      cfg.version = cfg.version ?? 1;
      cfg.hooks = cfg.hooks || {};
      for (const ev of CURSOR_EVENTS) {
        cfg.hooks[ev] = mergeFlat(cfg.hooks[ev], { command: CLI_CMD("cursor"), timeout: 30 });
        if (cfg.hooks[ev].length === 0) delete cfg.hooks[ev];
      }
      backup(file);
      writeJson(file, cfg);
      show(".cursor/hooks.json");
      report.wrote.push(".cursor/hooks.json");
    },
  },

  "claude-code": {
    id: "claude-code",
    detect: () => Boolean(process.env.CLAUDECODE || process.env.CLAUDE_PROJECT_DIR) || fs.existsSync(path.join(CFG.project, ".claude")),
    run() {
      const file = path.join(CFG.project, ".claude", "settings.json");
      const cfg = readJson(file, { hooks: {} });
      cfg.hooks = cfg.hooks || {};
      for (const ev of CLAUDE_EVENTS) {
        cfg.hooks[ev] = mergeClaude(cfg.hooks[ev], CLI_CMD("claude-code"));
        if (cfg.hooks[ev].length === 0) delete cfg.hooks[ev];
      }
      backup(file);
      writeJson(file, cfg);
      show(".claude/settings.json");
      report.wrote.push(".claude/settings.json");
    },
  },

  antigravity: {
    id: "antigravity",
    detect: () => Boolean(process.env.ANTIGRAVITY) || fs.existsSync(path.join(CFG.project, ".agents")),
    run() {
      const file = path.join(CFG.project, ".agents", "hooks.json");
      const cfg = readJson(file, {});
      const key = "tiny-engineer";
      const section = cfg[key] || (CFG.undo ? null : {});
      if (section) {
        for (const [ev, matcher] of Object.entries(ANTIGRAVITY_EVENTS)) {
          section[ev] = mergeAntigravity(section[ev], CLI_CMD("antigravity " + ev), matcher);
          if (section[ev].length === 0) delete section[ev];
        }
        if (Object.keys(section).length) cfg[key] = section;
        else delete cfg[key];
      }
      backup(file);
      writeJson(file, cfg);
      show(".agents/hooks.json");
      report.wrote.push(".agents/hooks.json");
    },
  },

  codex: {
    id: "codex",
    detect: () => Boolean(process.env.CODEX_HOME) || fs.existsSync(path.join(os.homedir(), ".codex", "config.toml")),
    run() {
      const dir = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
      const file = path.join(dir, "config.toml");
      const sh = process.platform === "win32" ? windowsBash() : "sh";
      const cmd = `curl -s -m 2 -X POST '${CFG.url}/anim?name=ring'${CFG.token ? ` -H 'Authorization: Bearer ${CFG.token}'` : ""} >/dev/null 2>&1`;
      const line = `notify = [${JSON.stringify(sh)}, "-c", ${JSON.stringify(cmd)}, "sh"]`;
      const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      const notifyLines = old.split(/\r?\n/).filter((l) => /^\s*notify\s*=/.test(l));
      const foreign = notifyLines.filter((l) => !isTE(l));
      if (foreign.length && !CFG.undo) {
        fail(`codex: ${file} already has a notify entry (${foreign[0].slice(0, 60)}…) — remove or merge it first, TOML forbids two`);
        return;
      }
      const kept = old.split(/\r?\n/).filter((l) => !(/^\s*notify\s*=/.test(l) && isTE(l)));
      const EOL = old.includes("\r\n") ? "\r\n" : "\n";
      const rest = kept.join(EOL).replace(/^(\r?\n)+/, "");
      const text = CFG.undo ? rest : `${line}${EOL}${rest}`;
      backup(file);
      if (!CFG.dryRun) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, /(\r?\n)$/.test(text) ? text : text + EOL);
      }
      show(`${file} (notify, turn-end only)`);
      report.wrote.push("~/.codex/config.toml");
      log("  ! codex has no tool-level hooks: this only rings at turn end");
    },
  },

  gemini: {
    id: "gemini",
    detect: () => Boolean(process.env.GEMINI_CLI) || fs.existsSync(path.join(CFG.project, ".gemini")),
    run() {
      const file = path.join(CFG.project, ".gemini", "settings.json");
      const cfg = readJson(file, {});
      cfg.hooks = cfg.hooks || {};
      const auth = CFG.token ? ` -H 'Authorization: Bearer ${CFG.token}'` : "";
      const cmd = (pose) => `curl -s -m 2 -X POST '${CFG.url}/anim?name=${pose}'${auth} >/dev/null 2>&1`;
      const merge = (list, pose, matcher) => {
        const kept = (list || []).filter((g) => !(g?.hooks || []).some((h) => isTE(h?.command)));
        if (CFG.undo) return kept;
        return [...kept, matcher
          ? { matcher, hooks: [{ type: "command", command: cmd(pose), timeout: 5000 }] }
          : { hooks: [{ type: "command", command: cmd(pose), timeout: 5000 }] }];
      };
      cfg.hooks.BeforeAgent = merge(cfg.hooks.BeforeAgent, "reading");
      cfg.hooks.BeforeTool = merge(cfg.hooks.BeforeTool, "typing", "write_.*|replace|run_shell_command");
      cfg.hooks.AfterAgent = merge(cfg.hooks.AfterAgent, "ring");
      for (const k of Object.keys(cfg.hooks)) if (!cfg.hooks[k]?.length) delete cfg.hooks[k];
      if (CFG.undo && Object.keys(cfg.hooks).length === 0) delete cfg.hooks;
      backup(file);
      writeJson(file, cfg);
      show(".gemini/settings.json");
      report.wrote.push(".gemini/settings.json");
      log("  ! gemini: keep >/dev/null on every command; check /hooks panel after install");
    },
  },

  hermes: {
    id: "hermes",
    detect: () => Boolean(process.env.HERMES_PROFILE) || Boolean(findHermesProfile()),
    run() {
      const profile = CFG.profile || findHermesProfile();
      if (!profile) {
        fail("hermes: no profile found — pass --profile <hermes profile dir>");
        return;
      }
      const hooksDir = path.join(profile, "agent-hooks");
      const cfgFile0 = path.join(profile, "config.yaml");
      const prevText = fs.existsSync(cfgFile0) ? fs.readFileSync(cfgFile0, "utf8") : "";
      // Honour the host's consent state: a script path that is already wired and
      // allowlisted keeps working when its contents change, while a brand-new path
      // stays blocked until the user re-approves. So reuse the wired name if any.
      const wired = ["bell-robot.sh", "te-hook.sh"].find(
        (f) => fs.existsSync(path.join(hooksDir, f)) && new RegExp(f.replace(/\./g, "\\.")).test(prevText),
      );
      const script = path.join(hooksDir, wired || "te-hook.sh");
      if (!CFG.undo) {
        const src = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "hooks", "te-hook.sh");
        if (!CFG.dryRun) {
          fs.mkdirSync(hooksDir, { recursive: true });
          fs.copyFileSync(src, script);
          fs.chmodSync(script, 0o755);
        }
        show(script);
      } else if (fs.existsSync(script) && !CFG.dryRun) {
        fs.rmSync(script);
        report.removed.push(script);
        show(script);
      }
      const cfgFile = path.join(profile, "config.yaml");
      backup(cfgFile);
      const text = fs.existsSync(cfgFile) ? fs.readFileSync(cfgFile, "utf8") : "";
      const next = mergeHermesYaml(text, script.replace(/\\/g, "/"), CFG.undo);
      if (!CFG.dryRun) fs.writeFileSync(cfgFile, next);
      show(`${cfgFile} (hooks: 7 events)`);
      report.wrote.push(`${cfgFile}#hooks`);
      log("  ! hermes: hand-declared hooks; first run needs the shell-hooks allowlist consent");
    },
  },
};

function windowsBash() {
  for (const p of ["C:/Program Files/Git/bin/bash.exe", "C:/Program Files (x86)/Git/bin/bash.exe"]) {
    if (fs.existsSync(p)) return p;
  }
  return "sh";
}

function findHermesProfile() {
  const roots = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "hermes", "profiles"),
    path.join(os.homedir(), ".hermes", "profiles"),
  ].filter(Boolean);
  const hits = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const cfg = path.join(root, name, "config.yaml");
      if (fs.existsSync(cfg)) hits.push(path.join(root, name));
    }
  }
  if (hits.length === 1) return hits[0];
  // prefer the profile named after this repo's user intent, else none
  return hits.find((p) => /tiny-engineer|tiny-agent/i.test(path.basename(p))) || null;
}

/**
 * Surgical, idempotent edit of the `hooks:` section of a Hermes config.yaml.
 * Removes TE-managed command lines, then ensures our 7 events point at `script`.
 * Everything outside the hooks section is preserved byte-for-byte.
 */
function mergeHermesYaml(text, script, undo) {
  const EVENTS = [
    "on_session_start", "pre_llm_call", "pre_tool_call", "pre_approval_request",
    "post_approval_response", "on_session_end", "agent_loop_stopped",
  ];
  const lines = text.split(/\r?\n/);
  const EOL = text.includes("\r\n") ? "\r\n" : "\n";
  const join = (arr) => arr.join(EOL);

  let start = lines.findIndex((l) => /^hooks:\s*$/.test(l));
  if (start < 0) {
    if (undo) return text;
    const block = ["hooks:"];
    for (const ev of EVENTS) {
      block.push(`  ${ev}:`, `    - command: ${script}`, "      timeout: 5");
    }
    return join([...lines, ...(text.trim() ? [""] : []), ...block]);
  }

  // section ends at the next top-level key
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[A-Za-z0-9_.-]+:/.test(lines[i])) { end = i; break; }
  }

  const section = lines.slice(start + 1, end);
  // drop TE-managed entries: our command line plus a following timeout line
  const cleaned = [];
  for (let i = 0; i < section.length; i++) {
    const l = section[i];
    if (/^\s*-\s*command:\s*/.test(l) && isTE(l)) {
      if (/^\s*timeout:\s*/.test(section[i + 1] || "")) i++;
      continue;
    }
    cleaned.push(l);
  }

  if (undo) {
    // drop event keys that are left empty by the removal (only the ones we manage)
    const pruned = [];
    for (let i = 0; i < cleaned.length; i++) {
      const m = cleaned[i].match(/^\s{2}([A-Za-z_]+):\s*$/);
      if (m && EVENTS.includes(m[1])) {
        let j = i + 1;
        let hasChild = false;
        while (j < cleaned.length && !/^\s{0,2}[A-Za-z_]+:/.test(cleaned[j])) {
          if (cleaned[j].trim()) hasChild = true;
          j++;
        }
        if (!hasChild) continue;
      }
      pruned.push(cleaned[i]);
    }
    if (pruned.every((l) => !l.trim())) {
      return join([...lines.slice(0, start), ...lines.slice(end)]);
    }
    return join([...lines.slice(0, start + 1), ...pruned, ...lines.slice(end)]);
  }

  for (const ev of EVENTS) {
    const idx = cleaned.findIndex((l) => new RegExp(`^\\s{2}${ev}:`).test(l));
    const entry = [`    - command: ${script}`, "      timeout: 5"];
    if (idx >= 0) {
      cleaned.splice(idx + 1, 0, ...entry);
    } else {
      cleaned.push(`  ${ev}:`, ...entry);
    }
  }

  return join([...lines.slice(0, start + 1), ...cleaned, ...lines.slice(end)]);
}

// ---------------------------------------------------------------- main

const ONLY = CFG.agent === "all" || CFG.agent === "auto" ? null : [CFG.agent];

log(`tiny-agent install  ${CFG.undo ? "[undo]" : "[install]"}${CFG.dryRun ? " [dry-run]" : ""}`);
log(`  url:     ${CFG.url}`);
log(`  token:   ${CFG.token ? "set" : "none"}`);
log(`  project: ${CFG.project}`);

await probeDevice();

const targets = Object.values(adapters).filter((a) => (ONLY ? ONLY.includes(a.id) : a.detect()));
if (ONLY) {
  const unknown = ONLY.filter((id) => !adapters[id]);
  if (unknown.length) fail(`unknown agent id(s): ${unknown.join(", ")}`);
}
if (!targets.length) {
  fail("no agent detected — pass --agent <cursor|claude-code|antigravity|codex|gemini|hermes>");
}

for (const a of targets) {
  report.agent.push(a.id);
  log(`\n[${a.id}]`);
  try {
    a.run();
  } catch (err) {
    fail(`${a.id}: ${String(err?.message || err)}`);
  }
}

if (!CFG.undo && targets.some((a) => a.id !== "hermes")) writeUserConfig();

log(`\n${report.ok ? "✓ done" : "✗ finished with errors"}`);
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
process.exit(report.ok ? 0 : 1);
