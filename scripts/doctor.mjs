#!/usr/bin/env node
/**
 * doctor.mjs — one command that answers "is this machine actually wired to the robot?"
 *
 *   node scripts/doctor.mjs [--url URL] [--token T] [--project DIR] [--json]
 *
 * Exits 0 when the device answers AND at least one agent adapter is installed,
 * 1 otherwise. Human table on stdout; --json for agents.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i < 0 ? d : argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true;
};
const URL_ = String(arg("url", process.env.TINY_ENGINEER_URL || "http://192.168.70.196")).replace(/\/+$/, "");
const TOKEN = String(arg("token", process.env.TINY_ENGINEER_TOKEN || ""));
const PROJECT = path.resolve(String(arg("project", process.cwd())));
const JSON_OUT = argv.includes("--json");

const H = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};
const out = { ok: true, url: URL_, device: {}, agents: {}, problems: [] };
const bad = (m) => {
  out.ok = false;
  out.problems.push(m);
};

async function get(p) {
  const res = await fetch(`${URL_}${p}`, { headers: H, signal: AbortSignal.timeout(3000) });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, text };
  }
}

// ---------------------------------------------------------------- device

try {
  const auth = await get("/auth");
  const health = await get("/health");
  const index = await get("/");
  const routes = [...new Set(String(index.text || "").match(/\/(anim|play|settings|test\/[a-z/]+|setup\/[a-z]+|health|auth)/g) || [])];

  out.device = {
    reachable: true,
    version: health.json?.version || "unknown",
    ip: health.json?.wifi?.ip || null,
    rssi: health.json?.wifi?.rssi ?? null,
    hostname: health.json?.wifi?.hostname || null,
    uptime_min: health.json?.uptime_ms ? Math.round(health.json.uptime_ms / 60000) : null,
    auth_required: auth.json?.required === true,
    wifi_configured: auth.json?.wifi_configured === true,
    provisioning: auth.json?.provisioning === true,
    oled: health.json?.oled !== false,
    routes,
    play: routes.includes("/play"),
    settings: routes.includes("/settings"),
  };

  if (out.device.auth_required && !TOKEN) bad("device requires a token; pass --token or set TINY_ENGINEER_TOKEN");
  if (!out.device.wifi_configured) bad("robot has no WiFi saved (provisioning AP: 192.168.4.1)");
  if (!out.device.play) out.problems.push("firmware has no POST /play: speech is unavailable until you flash a newer build");
} catch (err) {
  out.device = { reachable: false, error: String(err?.message || err) };
  bad(`unreachable ${URL_} — wrong IP, different VLAN, or a proxy eating the request`);
}

// ---------------------------------------------------------------- local agents

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
};
const TE_RE = /tiny-engineer hook|te-hook\.sh|bell-robot\.sh|\/anim\?name=/;

function countTE(obj) {
  return (JSON.stringify(obj || "").match(new RegExp(TE_RE.source, "g")) || []).length;
}

const cursorFile = path.join(PROJECT, ".cursor", "hooks.json");
if (fs.existsSync(cursorFile)) {
  const c = readJson(cursorFile);
  out.agents.cursor = { file: ".cursor/hooks.json", entries: countTE(c), events: Object.keys(c?.hooks || {}).length };
}

const claudeFile = path.join(PROJECT, ".claude", "settings.json");
if (fs.existsSync(claudeFile)) {
  const c = readJson(claudeFile);
  out.agents["claude-code"] = { file: ".claude/settings.json", entries: countTE(c), events: Object.keys(c?.hooks || {}).length };
}

const antFile = path.join(PROJECT, ".agents", "hooks.json");
if (fs.existsSync(antFile)) {
  const c = readJson(antFile);
  out.agents.antigravity = { file: ".agents/hooks.json", entries: countTE(c), events: Object.keys(c?.["tiny-engineer"] || {}).length };
}

const gemFile = path.join(PROJECT, ".gemini", "settings.json");
if (fs.existsSync(gemFile)) {
  const c = readJson(gemFile);
  out.agents.gemini = { file: ".gemini/settings.json", entries: countTE(c), events: Object.keys(c?.hooks || {}).length };
}

const codexFile = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "config.toml");
if (fs.existsSync(codexFile)) {
  const t = fs.readFileSync(codexFile, "utf8");
  out.agents.codex = { file: codexFile, entries: countTE(t), events: t.split(/\r?\n/).some((l) => /^\s*notify\s*=/.test(l)) ? 1 : 0 };
}

const profileRoots = [
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "hermes", "profiles"),
  path.join(os.homedir(), ".hermes", "profiles"),
].filter(Boolean);
for (const root of profileRoots) {
  if (!fs.existsSync(root)) continue;
  for (const name of fs.readdirSync(root)) {
    const cfg = path.join(root, name, "config.yaml");
    if (!fs.existsSync(cfg)) continue;
    const t = fs.readFileSync(cfg, "utf8");
    const n = countTE(t);
    if (n) out.agents[`hermes:${name}`] = { file: cfg, entries: n, events: (t.match(/^\s{2}(on_session_start|pre_llm_call|pre_tool_call|pre_approval_request|post_approval_response|on_session_end|agent_loop_stopped):/gm) || []).length };
  }
}

const installed = Object.keys(out.agents).filter((k) => out.agents[k].entries > 0);
if (!installed.length) bad(`no agent adapter installed for ${PROJECT} — run: node scripts/install.mjs --url ${URL_}`);

// ---------------------------------------------------------------- print

if (JSON_OUT) {
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  process.exit(out.ok ? 0 : 1);
}

const d = out.device;
console.log(`device  ${URL_}`);
if (d.reachable) {
  console.log(`  version      ${d.version}`);
  console.log(`  ip / rssi    ${d.ip} / ${d.rssi} dBm`);
  console.log(`  uptime       ${d.uptime_min} min`);
  console.log(`  auth         ${d.auth_required ? "required (send Bearer)" : "open — anyone on the LAN can drive it"}`);
  console.log(`  wifi         ${d.wifi_configured ? "configured" : "NOT configured"}`);
  console.log(`  /play        ${d.play ? "available" : "missing (firmware too old)"}`);
  console.log(`  routes       ${d.routes.join(" ")}`);
} else {
  console.log(`  unreachable: ${d.error}`);
}

console.log(`\nlocal   ${PROJECT}`);
if (Object.keys(out.agents).length) {
  for (const [k, v] of Object.entries(out.agents)) {
    console.log(`  ${k.padEnd(22)} ${v.entries} TE entr${v.entries === 1 ? "y" : "ies"} · ${v.events} events · ${v.file}`);
  }
} else {
  console.log("  (no agent config found)");
}

if (out.problems.length) {
  console.log("\nproblems");
  for (const p of out.problems) console.log(`  - ${p}`);
}
console.log(`\n${out.ok ? "✓ wired" : "✗ not wired"}`);
process.exit(out.ok ? 0 : 1);
