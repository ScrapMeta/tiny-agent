/**
 * Test harness for te-gateway.mjs — spawns the gateway, drives it over HTTP,
 * asserts the coordination rules, then kills it.
 *
 *   node out/test-gateway.mjs [--target http://192.168.70.196] [--port 8789]
 *
 * Hits the real robot for /anim (poses change on the desk). Skips /play unless --play.
 */

import { spawn } from "node:child_process";
import process from "node:process";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};

const TARGET = arg("target", "http://192.168.70.196");
const PORT = Number(arg("port", 8789));
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = "testkey";
const DO_PLAY = process.argv.includes("--play");

let pass = 0;
let fail = 0;
const check = (label, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m ${label}`);
  } else {
    fail++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const call = async (path, { method = "GET", team, admin, body, headers = {} } = {}) => {
  const h = { ...headers };
  if (team) h["x-team-id"] = team;
  if (admin) h["x-admin-key"] = admin;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body,
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, text, headers: res.headers };
};

const gw = spawn(process.execPath, ["out/te-gateway.mjs", "--target", TARGET, "--port", String(PORT), "--admin-key", ADMIN, "--lease-ttl", "6"], {
  stdio: ["ignore", "pipe", "pipe"],
});
gw.stdout.on("data", (d) => process.stdout.write(`    \x1b[90m[gw]\x1b[0m ${d.toString().trimEnd()}\n`));
gw.stderr.on("data", (d) => process.stdout.write(`    \x1b[90m[gw:err]\x1b[0m ${d.toString().trimEnd()}\n`));

const waitUp = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/status`, { signal: AbortSignal.timeout(500) });
      if (r.ok) return true;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

const cleanup = async () => {
  try {
    await call("/anim?name=none", { method: "POST", team: "alice" });
  } catch {
    /* ignore */
  }
  gw.kill();
};

try {
  console.log(`gateway → ${TARGET} on :${PORT}`);
  if (!(await waitUp())) throw new Error("gateway did not start");

  console.log("\n1. read paths");
  let r = await call("/status");
  check("GET /status returns json", r.status === 200 && r.json?.ok === true, `status ${r.status}`);
  check("status reports target", r.json?.target === TARGET);
  r = await call("/health");
  check("GET /health proxied", r.status === 200 && r.json?.ok === true);
  r = await call("/");
  check("GET / serves dashboard html", r.status === 200 && r.text.includes("Tiny Engineer <span>gateway</span>"));

  console.log("\n2. lease: one driver at a time");
  r = await call("/anim?name=typing", { method: "POST", team: "alice" });
  check("alice takes the work pose", r.status === 200 && r.json?.animation === "typing", JSON.stringify(r.json));
  r = await call("/anim?name=reading", { method: "POST", team: "bob" });
  check("bob is blocked with 409", r.status === 409 && r.json?.error === "busy", `status ${r.status}`);
  check("409 names the holder", r.json?.holder === "alice", r.json?.holder);
  r = await call("/status");
  check("status shows alice driving", r.json?.lease?.team === "alice");

  console.log("\n3. dedupe inside the firmware hold window");
  r = await call("/anim?name=typing", { method: "POST", team: "alice" });
  check("repeat within 1.2s is collapsed", r.json?.deduped === true, JSON.stringify(r.json));

  console.log("\n4. preemption + give-back");
  r = await call("/anim?name=ring", { method: "POST", team: "bob" });
  check("bob's ring gets through", r.status === 200 && r.json?.preempted === "alice", JSON.stringify(r.json));
  const live = await (await fetch(`${TARGET}/anim`, { signal: AbortSignal.timeout(3000) })).json();
  check("robot is on the preempting pose (ring/none)", ["ring", "none"].includes(live.animation), live.animation);
  await new Promise((res) => setTimeout(res, 3200));
  r = await call("/status");
  check("alice's work pose was re-asserted", r.json?.recent?.some((e) => e.action === "re-asserted" && e.team === "alice"));

  console.log("\n5. nobody unlocks somebody else's pose");
  r = await call("/anim?name=none", { method: "POST", team: "bob" });
  check("bob cannot clear alice's pose", r.status === 409, `status ${r.status}`);
  r = await call("/anim?name=none", { method: "POST", team: "alice" });
  check("alice can clear her own pose", r.status === 200, `status ${r.status}`);

  console.log("\n6. rate limit");
  const bursts = await Promise.all(
    Array.from({ length: 14 }, (_, i) => call(`/anim?name=${i % 2 ? "thinking" : "typing"}`, { method: "POST", team: "carol" })),
  );
  check("burst is throttled with 429", bursts.some((x) => x.status === 429), bursts.map((x) => x.status).join(","));

  console.log("\n7. guard on destructive routes");
  r = await call("/settings/reset", { method: "POST", team: "bob" });
  check("factory reset needs admin key", r.status === 403, `status ${r.status}`);
  r = await call("/test/movement", { method: "POST", team: "bob" });
  check("/test/movement needs admin key", r.status === 403, `status ${r.status}`);
  r = await call("/settings", { method: "POST", team: "bob", body: JSON.stringify({ volume: 1 }), headers: { "content-type": "application/json" } });
  check("/settings write needs admin key", r.status === 403, `status ${r.status}`);
  r = await call("/settings", { admin: ADMIN });
  check("admin key still reads settings", r.status === 200 && r.json?.ok === true, `status ${r.status}`);

  if (DO_PLAY) {
    console.log("\n8. speaker mutex");
    const idx = await (await fetch(`${TARGET}/`, { signal: AbortSignal.timeout(3000) })).text();
    if (!idx.includes("/play")) {
      console.log(`  \x1b[33mSKIP\x1b[0m firmware on ${TARGET} has no POST /play route (v0.2.0) — needs a newer build`);
    } else {
      const { readFile } = await import("node:fs/promises");
      const wav = await readFile("out/_silence.wav");
      const [a, b] = await Promise.all([
        call("/play", { method: "POST", team: "alice", body: wav, headers: { "content-type": "audio/wav" } }),
        new Promise((res) => setTimeout(res, 30)).then(() => call("/play", { method: "POST", team: "bob", body: wav, headers: { "content-type": "audio/wav" } })),
      ]);
      check("first stream plays", a.status === 200 && a.json?.ok === true, JSON.stringify(a.json).slice(0, 120));
      check("second stream is refused with 409", b.status === 409, `status ${b.status}`);
    }
  }

  console.log("\n9. lease expiry");
  await new Promise((res) => setTimeout(res, 6500));
  r = await call("/status");
  check("idle lease is released", r.json?.lease === null, JSON.stringify(r.json?.lease));
  r = await call("/anim?name=thinking", { method: "POST", team: "bob" });
  check("next person can take over", r.status === 200, `status ${r.status}`);
} catch (err) {
  fail++;
  console.log(`\n\x1b[31mharness error\x1b[0m ${err.message}`);
} finally {
  await cleanup();
}

console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m`);
process.exit(fail === 0 ? 0 : 1);
