#!/usr/bin/env node
/**
 * te.mjs — one command for the intents a human actually asks for.
 *
 *   te anim thinking            单个姿态
 *   te say "你好"                本地 TTS -> POST /play
 *   te story [--id 2]           讲个短故事（TTS）
 *   te dance [--id celebrate]   跳一段（姿态编排；固件单线程，所以不带音乐）
 *   te stats [--days 7]         用量统计：命令数、语音秒数、姿态分布、活跃时长
 *   te status                   设备 + 本机接线
 *
 * 为什么 dance 不带音乐：固件只有一个 WebServer，POST /play 会占住连接直到音频
 * 播完，这期间的 /anim 请求全部排队/超时。所以"边放音乐边跳舞"做不到——要么跳舞，
 * 要么说话。
 *
 * 用法：node tools/te.mjs <cmd> [...] [--url http://ip] [--token t] [--json]
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const REPO = path.dirname(HERE);
const argv = process.argv.slice(2);
const cmd = argv[0];

function arg(name, def) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}
const positional = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    if (argv[i + 1] && !argv[i + 1].startsWith("--")) i++;
    continue;
  }
  positional.push(a);
}

const URL_ = String(arg("url", process.env.TINY_ENGINEER_URL || "http://192.168.70.196")).replace(/\/+$/, "");
const TOKEN = String(arg("token", process.env.TINY_ENGINEER_TOKEN || ""));
const JSON_OUT = argv.includes("--json");
const H = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};

const stateDir =
  process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "tiny-agent")
    : path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "tiny-agent");
const USAGE = path.join(stateDir, "usage.jsonl");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s) => (!JSON_OUT ? process.stdout.write(s + "\n") : null);

function record(entry) {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.appendFileSync(USAGE, JSON.stringify({ ts: Date.now(), iso: new Date().toISOString(), host: URL_, ...entry }) + "\n");
  } catch {
    /* stats are best effort, never break the action */
  }
}

async function post(pose, timeoutMs = 3000) {
  const res = await fetch(`${URL_}/anim?name=${encodeURIComponent(pose)}`, {
    method: "POST",
    headers: H,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();
  return { status: res.status, body };
}

async function health() {
  const res = await fetch(`${URL_}/health`, { headers: H, signal: AbortSignal.timeout(3000) });
  return res.json();
}

// ---------------------------------------------------------------- dance

const DANCES = {
  // 8 s 左右，用固件自带的姿态拼出来；避开 attention（保持 1 分钟）和 dead（永久保持）
  groove: [
    ["welcome", 2800],
    ["typing", 1600],
    ["reading", 1500],
    ["thinking", 1500],
    ["welcome", 2600],
    ["none", 800],
  ],
  celebrate: [
    ["welcome", 2700],
    ["typing", 1500],
    ["ring", 2400],
    ["none", 600],
  ],
  bow: [
    ["welcome", 2700],
    ["sleep", 2200],
    ["none", 600],
  ],
};

async function dance() {
  const id = String(arg("id", "groove"));
  const steps = DANCES[id];
  if (!steps) {
    console.error(`unknown dance "${id}" — pick one of: ${Object.keys(DANCES).join(", ")}`);
    process.exit(1);
  }
  const budget = Number(arg("seconds", 0)) || steps.reduce((a, [, ms]) => a + ms, 0) / 1000;
  let elapsed = 0;
  const done = [];
  for (const [pose, ms] of steps) {
    if (elapsed / 1000 >= budget) break;
    const t0 = Date.now();
    const r = await post(pose).catch((e) => ({ status: 0, body: String(e?.message || e) }));
    done.push({ pose, ms, status: r.status });
    say(`  ${(elapsed / 1000).toFixed(1).padStart(4)}s  ${pose.padEnd(9)} http=${r.status}`);
    const wait = Math.max(0, ms - (Date.now() - t0));
    await sleep(wait);
    elapsed += ms;
  }
  record({ cmd: "dance", dance: id, steps: done.map((d) => d.pose), seconds: elapsed / 1000 });
  return { ok: done.every((d) => d.status === 200), dance: id, seconds: elapsed / 1000, steps: done };
}

// ---------------------------------------------------------------- speech

const STORIES = {
  1: "从前有一台小机器人，它住在一张很大的桌子上。白天它帮人敲代码，晚上它数天花板上的灯。有一天它问：我算不算工程师？人想了想说：你算，因为你也会改 bug。",
  2: "有一个程序员，写了一天代码，最后还是报错。他把电脑合上，泡了杯茶，回来重新读了一遍日志，发现少了一个分号。他没有生气，只是对机器人说：今天也算有进展。",
  3: "小工程师第一次走到窗边，看见外面在下雨。它问：雨是 bug 吗？人说不是，雨是天气。它又问：那什么是 bug？人说：是你以为它会停，结果它一直下。",
};

function speakArgs(text, pose, voice, keep) {
  const a = [path.join(HERE, "say.mjs"), text, "--url", URL_];
  if (pose) a.push("--pose", pose);
  if (voice) a.push("--voice", voice);
  if (TOKEN) a.push("--token", TOKEN);
  if (keep) a.push("--keep");
  return a;
}

function runSay(text, pose, voice) {
  const r = spawnSync(process.execPath, speakArgs(text, pose, voice), { encoding: "utf8" });
  const out = (r.stdout || "").trim();
  const err = (r.stderr || "").trim();
  if (err) say(err.split("\n").map((l) => "  " + l).join("\n"));
  if (out) say("  " + out);
  let played = 0;
  try {
    played = JSON.parse(out).played_ms || 0;
  } catch {}
  record({ cmd: pose === "talking" ? "say" : `say:${pose}`, audio_ms: played, ok: r.status === 0, chars: String(text).length });
  return { ok: r.status === 0, played_ms: played, chars: String(text).length };
}

// ---------------------------------------------------------------- stats

function stats() {
  const days = Number(arg("days", 7));
  const since = Date.now() - days * 86400000;
  const rows = fs.existsSync(USAGE)
    ? fs
        .readFileSync(USAGE, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter((r) => r && r.ts >= since)
    : [];

  const byDay = {};
  const poses = {};
  let audioMs = 0;
  let chars = 0;
  for (const r of rows) {
    const day = new Date(r.ts).toISOString().slice(0, 10);
    byDay[day] = byDay[day] || { cmds: 0, audio_ms: 0, first: r.ts, last: r.ts };
    byDay[day].cmds++;
    byDay[day].last = r.ts;
    if (r.audio_ms) {
      audioMs += r.audio_ms;
      byDay[day].audio_ms += r.audio_ms;
    }
    if (r.chars) chars += r.chars;
    for (const p of r.steps || []) poses[p] = (poses[p] || 0) + 1;
    if (r.cmd === "anim" && r.pose) poses[r.pose] = (poses[r.pose] || 0) + 1;
  }
  const activeMin = Object.values(byDay).reduce((a, d) => a + (d.last - d.first) / 60000, 0);
  return {
    ok: true,
    window_days: days,
    commands: rows.length,
    audio_seconds: Math.round(audioMs / 100) / 10,
    story_chars: chars,
    active_minutes: Math.round(activeMin),
    poses,
    days: Object.entries(byDay).map(([d, v]) => ({ day: d, cmds: v.cmds, audio_s: Math.round(v.audio_ms / 100) / 10 })),
  };
}

// ---------------------------------------------------------------- main

const t0 = Date.now();
let result;

try {
  switch (cmd) {
    case "anim": {
      const pose = positional[0];
      if (!pose) throw new Error("usage: te anim <pose>");
      const r = await post(pose);
      record({ cmd: "anim", pose, ok: r.status === 200 });
      result = { ok: r.status === 200, pose, status: r.status, body: r.body };
      if (!JSON_OUT) say(`  ${pose} -> http ${r.status} ${r.body}`);
      break;
    }
    case "say": {
      const text = positional.join(" ").trim();
      if (!text) throw new Error('usage: te say "text" [--pose talking] [--voice name]');
      const pose = String(arg("pose", "talking"));
      result = await runSay(text, pose, arg("voice", null));
      break;
    }
    case "story": {
      const id = Number(arg("id", 1));
      const text = STORIES[id] || STORIES[1];
      if (!JSON_OUT) say(`  故事 ${id}（${text.length} 字）`);
      result = await runSay(text, "talking", arg("voice", null));
      result.story = id;
      break;
    }
    case "dance":
      result = await dance();
      break;
    case "stats": {
      result = stats();
      if (!JSON_OUT) {
        const s = result;
        say(`最近 ${s.window_days} 天：${s.commands} 次命令 · 语音 ${s.audio_seconds}s · 活跃约 ${s.active_minutes} 分钟`);
        say(`  故事字数 ${s.story_chars} · 姿态分布 ${Object.entries(s.poses).map(([k, v]) => `${k}×${v}`).join(" ")}`);
        for (const d of s.days) say(`  ${d.day}  ${String(d.cmds).padStart(3)} 次  语音 ${d.audio_s}s`);
      }
      break;
    }
    case "status": {
      const h = await health();
      result = { ok: h.ok !== false, device: { version: h.version, ip: h.wifi?.ip, rssi: h.wifi?.rssi, uptime_min: Math.round(h.uptime_ms / 60000) } };
      if (!JSON_OUT) say(`  ${h.version} · ${h.wifi?.ip} · RSSI ${h.wifi?.rssi} · 在线 ${Math.round(h.uptime_ms / 60000)} 分钟`);
      break;
    }
    default:
      console.error(`usage: te <anim|say|story|dance|stats|status> [...]`);
      process.exit(1);
  }
} catch (err) {
  result = { ok: false, error: String(err?.message || err) };
  console.error(`failed: ${result.error}`);
}

if (JSON_OUT) process.stdout.write(JSON.stringify({ ...result, elapsed_ms: Date.now() - t0 }, null, 2) + "\n");
process.exit(result?.ok ? 0 : 1);
