#!/usr/bin/env node
/**
 * choreo.mjs — 关节级编排：用 5 个舵机拼出固件里没有的动作。
 *
 *   node tools/choreo.mjs --list
 *   node tools/choreo.mjs cheer              # 执行
 *   node tools/choreo.mjs cheer --dry-run    # 只打印每帧要发的角度，不动硬件
 *   node tools/choreo.mjs cheer --flip left,right   # 关节方向反了就翻符号
 *
 * 编排文件在 choreos/<name>.json：
 *   { "name": "cheer", "frames": [ { "t": 0.0, "head": 0, "left": 1, ... } ] }
 *   t   = 秒，从 0 开始
 *   head/neck/left/right/body = -1..+1 的姿态坐标（0 = 中位，±1 = 标定的 min/max）
 *
 * 为什么是"帧"而不是"每步都发"：固件自己按 140°/s 做插值（SERVO_MAX_SPEED_DEG_S），
 * 所以只发关键帧，让舵机自己补中间。20 帧/秒的 HTTP 会被 ESP32 的 WebServer 挤爆。
 *
 * 硬件事实（来自固件源码）：
 *   关节顺序 [head, neck, left, right, body]，index 0..4
 *   POST /test/servo {"index":i,"angle":deg} → moveTo()，角度被钳到标定的 [min,max]
 *   最大角速度 140°/s，所以 90° 跨度至少 0.64 秒，编排不能比这更快
 *   没有手腕/手指关节：所谓"拍手"只能让两条手臂互相靠近，做不到真的击掌
 */

import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const REPO = path.dirname(HERE);
const CHOREOS = path.join(REPO, "choreos");
const JOINTS = ["head", "neck", "left", "right", "body"];

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    if (argv[i + 1] && !argv[i + 1].startsWith("--")) i++;
    continue;
  }
  positional.push(a);
}
const name = positional[0];
const URL_ = String(arg("url", process.env.TINY_ENGINEER_URL || "http://192.168.70.196")).replace(/\/+$/, "");
const TOKEN = String(arg("token", process.env.TINY_ENGINEER_TOKEN || ""));
const H = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};
const DRY = argv.includes("--dry-run");
const FLIP = new Set(String(arg("flip", "")).split(",").filter(Boolean));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (argv.includes("--list") || !name) {
  const files = fs.existsSync(CHOREOS) ? fs.readdirSync(CHOREOS).filter((f) => f.endsWith(".json")) : [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(CHOREOS, f), "utf8"));
    const dur = j.frames.at(-1)?.t ?? 0;
    console.log(`  ${j.name.padEnd(12)} ${String(dur).padStart(4)}s  ${j.description || ""}`);
  }
  process.exit(name ? 0 : 1);
}

const file = path.join(CHOREOS, `${name}.json`);
if (!fs.existsSync(file)) {
  console.error(`no choreo "${name}" in ${CHOREOS}`);
  process.exit(2);
}
const spec = JSON.parse(fs.readFileSync(file, "utf8"));

async function getRanges() {
  const res = await fetch(`${URL_}/settings`, { headers: H, signal: AbortSignal.timeout(4000) });
  const j = await res.json();
  if (!Array.isArray(j.servo_mins) || !Array.isArray(j.servo_maxs)) throw new Error("settings has no servo ranges");
  return j.servo_mins.map((min, i) => ({ min, max: j.servo_maxs[i] }));
}
const deg = (range, n) => {
  const v = (range.min + range.max) / 2 + (Math.max(-1, Math.min(1, n)) * (range.max - range.min)) / 2;
  return Math.round(v * 10) / 10;
};

async function post(i, angle) {
  const res = await fetch(`${URL_}/test/servo`, {
    method: "POST",
    headers: { ...H, "content-type": "application/json" },
    body: JSON.stringify({ index: i, angle }),
    signal: AbortSignal.timeout(1500),
  });
  return res.status;
}

const ranges = await getRanges();
if (!DRY) {
  await fetch(`${URL_}/anim?name=none`, { method: "POST", headers: H, signal: AbortSignal.timeout(2000) }).catch(() => {});
}

const last = {};
const t0 = Date.now();
let sent = 0;
let failed = 0;
for (const [k, frame] of spec.frames.entries()) {
  const target = Math.max(0, (frame.t ?? 0) * 1000 - (Date.now() - t0));
  await sleep(target);
  const moved = [];
  for (const [i, joint] of JOINTS.entries()) {
    if (frame[joint] === undefined) continue;
    const n = FLIP.has(joint) ? -frame[joint] : frame[joint];
    const a = deg(ranges[i], n);
    if (last[joint] !== undefined && Math.abs(a - last[joint]) < 1.5) continue;
    last[joint] = a;
    moved.push(`${joint}=${a}°`);
    if (DRY) continue;
    const st = await post(i, a).catch(() => 0);
    sent++;
    if (st !== 200) failed++;
  }
  console.log(`  ${String(((Date.now() - t0) / 1000).toFixed(2)).padStart(5)}s  #${k}  ${moved.join(" ") || "(hold)"}`);
}

console.log(
  DRY
    ? `dry-run: ${spec.frames.length} 帧，未发送。坐标范围 ${JSON.stringify(ranges)}`
    : `${spec.name}: ${spec.frames.length} 帧 / ${sent} 请求 / ${failed} 失败 / ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);
process.exit(failed ? 1 : 0);
