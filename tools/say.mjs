#!/usr/bin/env node
/**
 * say.mjs — generate speech on this machine and stream it to the robot.
 *
 *   node tools/say.mjs "你好，我是小工程师"
 *   node tools/say.mjs "hello" --url http://192.168.70.196 --voice "Microsoft Zira Desktop"
 *   node tools/say.mjs "hi" --keep        # keep the wav next to the repo for inspection
 *
 * Why a script: POST /play wants exactly 16-bit mono PCM at 22050 Hz, and every
 * desktop TTS produces something else. This converts first, then streams.
 *
 * Backends
 *   Windows  System.Speech (SAPI) — works offline, ships with zh-CN (Huihui) and en-US voices
 *   macOS    `say -o file --data-format=LEI16@22050`
 *   Linux    espeak-ng / espeak with -w
 *
 * Exit codes: 0 played, 1 TTS failed, 2 robot refused/unreachable.
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  if (i < 0) return d;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    if (argv[i + 1] && !argv[i + 1].startsWith("--")) i++; // skip the flag's value
    continue;
  }
  positional.push(a);
}
const text = positional[0];
const URL_ = String(arg("url", process.env.TINY_ENGINEER_URL || "http://192.168.70.196")).replace(/\/+$/, "");
const TOKEN = String(arg("token", process.env.TINY_ENGINEER_TOKEN || ""));
const VOICE = arg("voice", null);
const KEEP = argv.includes("--keep");
const POSE = String(arg("pose", "talking"));

if (!text) {
  console.error('usage: node tools/say.mjs "text to speak" [--url http://ip] [--voice name] [--pose talking|thinking|reading|typing|none] [--keep]');
  process.exit(1);
}

const out = path.join(KEEP ? process.cwd() : os.tmpdir(), "te-say.wav");

function ttsWindows() {
  const script = path.join(os.tmpdir(), "te-say.ps1");
  const txt = path.join(os.tmpdir(), "te-say.txt");
  fs.writeFileSync(txt, String(text), "utf8");
  fs.writeFileSync(
    script,
    `param([string]$TextFile,[string]$Out,[string]$Voice)
Add-Type -AssemblyName System.Speech
$text = [IO.File]::ReadAllText($TextFile, [Text.Encoding]::UTF8)
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($Voice) { try { $s.SelectVoice($Voice) } catch { Write-Warning "voice not found" } }
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, 16, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile($Out, $fmt)
$s.Speak($text)
$s.Dispose()
`,
    "utf8",
  );
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-TextFile", txt, "-Out", out];
  if (VOICE) args.push("-Voice", VOICE);
  execFileSync("powershell.exe", args, { stdio: "inherit" });
}

function ttsMac() {
  execFileSync("say", ["-o", out, "--data-format=LEI16@22050", String(text)], { stdio: "inherit" });
}

function ttsLinux() {
  const bin = spawnSync("which", ["espeak-ng"]).status === 0 ? "espeak-ng" : "espeak";
  execFileSync(bin, ["-w", out, "-s", "150", String(text)], { stdio: "inherit" });
}

try {
  if (process.platform === "win32") ttsWindows();
  else if (process.platform === "darwin") ttsMac();
  else ttsLinux();
} catch (err) {
  console.error(`tts failed: ${err?.message || err}`);
  process.exit(1);
}

// verify the format the firmware demands before wasting a request
const buf = fs.readFileSync(out);
const fmt = buf.readUInt16LE(20);
const channels = buf.readUInt16LE(22);
const rate = buf.readUInt32LE(24);
const bits = buf.readUInt16LE(34);
const ms = Math.round(((buf.length - 44) / (rate * channels * (bits / 8))) * 1000);
if (fmt !== 1 || channels !== 1 || rate !== 22050 || bits !== 16) {
  console.error(`wav is fmt=${fmt} ch=${channels} rate=${rate} bits=${bits}; the robot needs 16-bit mono 22050 Hz`);
  process.exit(1);
}
console.error(`tts ok: ${ms} ms, ${(buf.length / 1024).toFixed(0)} KiB -> ${out}`);

const url = `${URL_}/play${POSE === "talking" ? "" : `/${POSE}`}`;
const t0 = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "audio/wav", ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) },
  body: buf,
  signal: AbortSignal.timeout(Math.max(15000, ms + 15000)),
});
const body = await res.text();
const wall = Date.now() - t0;
console.error(`POST ${url} -> http ${res.status} in ${(wall / 1000).toFixed(2)} s`);
console.log(body);
if (!KEEP) fs.rmSync(out, { force: true });
process.exit(res.ok ? 0 : 2);
