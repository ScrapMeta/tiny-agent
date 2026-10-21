#!/usr/bin/env node
/**
 * te-gateway — share one Tiny Engineer robot between several people/agents.
 *
 * The firmware is a single shared resource: no sessions, no queue, latest /anim wins,
 * one request at a time (a /play stream blocks everything). This proxy adds the missing
 * coordination layer:
 *
 *   - leases        one team owns the "continuous" poses (typing/reading/thinking/talking)
 *                   at a time; others get 409 busy instead of making the robot jitter
 *   - preemption    ring/attention/error/abort always get through, then the lease
 *                   holder's pose is re-asserted automatically
 *   - dedupe        same team + same pose inside 1.2s is collapsed (firmware holds 1s)
 *   - rate limit    token bucket per team
 *   - play mutex    one WAV stream at a time; others get 409 + Retry-After
 *   - guard         /settings, /settings/reset, /test/*, /setup/* need X-Admin-Key
 *   - dashboard     GET / shows who is driving, GET /status is the same as JSON
 *
 * Zero dependencies. Node 18+.
 *
 *   node te-gateway.mjs --target http://192.168.70.196 --port 8080
 *   node te-gateway.mjs --target http://192.168.70.196 --port 8080 --admin-key s3cret
 *   node te-gateway.mjs --target http://192.168.70.196 --dry-run     # log, never POST
 */

import http from "node:http";
import process from "node:process";

// ---------------------------------------------------------------- config

const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) continue;
  const key = a.slice(2);
  const next = argv[i + 1];
  if (next === undefined || next.startsWith("--")) flags[key] = true;
  else {
    flags[key] = next;
    i++;
  }
}

const CFG = {
  target: String(flags.target || process.env.TE_TARGET || "http://192.168.70.196").replace(/\/+$/, ""),
  port: Number(flags.port || process.env.TE_PORT || 8080),
  bind: String(flags.bind || process.env.TE_BIND || "0.0.0.0"),
  token: String(flags.token ?? process.env.TE_TOKEN ?? ""),
  adminKey: String(flags["admin-key"] ?? process.env.TE_ADMIN_KEY ?? ""),
  leaseTtl: Number(flags["lease-ttl"] ?? process.env.TE_LEASE_TTL ?? 90) * 1000,
  rate: Number(flags.rate ?? process.env.TE_RATE ?? 6),
  burst: Number(flags.burst ?? process.env.TE_BURST ?? 10),
  reassertMs: Number(flags["reassert-ms"] ?? process.env.TE_REASSERT_MS ?? 2600),
  dryRun: Boolean(flags["dry-run"]),
};

const CONTINUOUS = new Set(["typing", "reading", "thinking", "talking"]);
const PREEMPT = new Set(["ring", "attention", "error", "abort", "dead"]);
const ALL_ANIMS = new Set([
  "none", "typing", "reading", "thinking", "talking", "ring", "welcome",
  "attention", "error", "abort", "dead", "wakeup", "sleep",
]);
const PLAY_POSES = new Set(["talking", "typing", "reading", "thinking", "none"]);

// ---------------------------------------------------------------- state

const state = {
  started: Date.now(),
  lease: { team: null, until: 0, lastContinuous: null },
  playing: null, // { team, since, bytes }
  teams: new Map(), // team -> counters
  recent: [], // newest first
  totals: { requests: 0, forwarded: 0, blocked: 0, deduped: 0, errors: 0 },
};

const team = (id) => {
  if (!state.teams.has(id)) {
    state.teams.set(id, { id, lastSeen: 0, requests: 0, forwarded: 0, blocked: 0, deduped: 0 });
  }
  return state.teams.get(id);
};

const note = (entry) => {
  const rec = { at: new Date().toISOString().slice(11, 19), ...entry };
  state.recent.unshift(rec);
  if (state.recent.length > 40) state.recent.length = 40;
  console.log(
    `${rec.at}  ${String(rec.team).padEnd(12)} ${String(rec.name || rec.path).padEnd(12)} ${rec.action}` +
      (rec.detail ? `  ${rec.detail}` : ""),
  );
};

const leaseHolder = () => (state.lease.until > Date.now() ? state.lease.team : null);

const acquire = (id, continueName) => {
  state.lease.team = id;
  state.lease.until = Date.now() + CFG.leaseTtl;
  if (continueName) state.lease.lastContinuous = continueName;
};

const releaseIfOwner = (id) => {
  if (state.lease.team === id) {
    state.lease = { team: null, until: 0, lastContinuous: null };
  }
};

// ---------------------------------------------------------------- upstream

function upstreamHeaders(extra = {}) {
  const h = { ...extra };
  if (CFG.token) h.authorization = `Bearer ${CFG.token}`;
  return h;
}

async function postAnim(name) {
  if (CFG.dryRun) return { ok: true, dry_run: true, animation: name };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`${CFG.target}/anim?name=${encodeURIComponent(name)}`, {
      method: "POST",
      headers: upstreamHeaders(),
      signal: ctrl.signal,
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { ok: res.ok, raw: text.slice(0, 200) };
    }
  } catch (err) {
    // the firmware is single-threaded: a burst or an in-flight /play makes /anim wait
    return { ok: false, error: err?.name === "AbortError" ? "robot busy (timeout)" : String(err?.message || err) };
  } finally {
    clearTimeout(t);
  }
}

async function getAnim() {
  try {
    const res = await fetch(`${CFG.target}/anim`, { headers: upstreamHeaders(), signal: AbortSignal.timeout(2000) });
    return await res.json();
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

// ---------------------------------------------------------------- helpers

function send(res, code, body, headers = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const type = typeof body === "string" && body.startsWith("<") ? "text/html; charset=utf-8" : "application/json";
  res.writeHead(code, { "content-type": type, "cache-control": "no-store", ...headers });
  res.end(text);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function whoAmI(req, url) {
  return (
    req.headers["x-team-id"] ||
    url.searchParams.get("client") ||
    req.headers["x-forwarded-user"] ||
    req.socket.remoteAddress ||
    "anon"
  )
    .toString()
    .slice(0, 40)
    .replace(/[^\w.@:-]/g, "");
}

function rateOk(t) {
  const now = Date.now();
  const refill = (now - (t.__reset || now)) / 1000;
  t.__tokens = Math.min(CFG.burst, (t.__tokens ?? CFG.burst) + refill * CFG.rate);
  t.__reset = now;
  if (t.__tokens < 1) return false;
  t.__tokens -= 1;
  return true;
}

// ---------------------------------------------------------------- handlers

async function handleAnim(req, res, url) {
  const name = url.searchParams.get("name");
  const id = whoAmI(req, url);
  const t = team(id);
  const now = Date.now();
  t.lastSeen = now;
  t.requests++;
  state.totals.requests++;

  if (!name) return send(res, 400, { ok: false, error: "missing name" });
  if (!ALL_ANIMS.has(name)) return send(res, 400, { ok: false, error: "unknown animation" });

  if (!rateOk(t)) {
    t.blocked++;
    state.totals.blocked++;
    note({ team: id, name, action: "429 rate-limited" });
    return send(res, 429, { ok: false, error: "rate limited" }, { "retry-after": "1" });
  }

  // collapse identical poses from the same team inside the firmware's 1s hold window
  if (t.__lastName === name && now - (t.__lastAt || 0) < 1200) {
    t.deduped++;
    state.totals.deduped++;
    return send(res, 200, { ok: true, animation: name, deduped: true, team: id });
  }
  t.__lastName = name;
  t.__lastAt = now;

  const holder = leaseHolder();

  // continuous poses are lease-gated: no tug of war
  if (CONTINUOUS.has(name)) {
    if (holder && holder !== id) {
      t.blocked++;
      state.totals.blocked++;
      note({ team: id, name, action: "409 busy", detail: `holder=${holder}` });
      return send(
        res,
        409,
        {
          ok: false,
          error: "busy",
          holder,
          retry_after_ms: Math.max(500, state.lease.until - now),
          hint: "another person owns the robot's work pose; your hooks can ignore this",
        },
        { "retry-after": "5" },
      );
    }
    acquire(id, name);
  } else if (name === "none") {
    // only the owner may clear the pose
    if (holder && holder !== id) {
      t.blocked++;
      state.totals.blocked++;
      note({ team: id, name, action: "409 busy", detail: `holder=${holder}` });
      return send(res, 409, { ok: false, error: "busy", holder });
    }
    releaseIfOwner(id);
  } else if (name === "sleep") {
    releaseIfOwner(id);
  } else if (holder === id) {
    state.lease.until = now + CFG.leaseTtl;
  }

  const result = await postAnim(name);
  t.forwarded++;
  state.totals.forwarded++;
  note({ team: id, name, action: "→ robot", detail: result.ok ? "" : JSON.stringify(result).slice(0, 120) });
  if (!result.ok) state.totals.errors++;

  // a one-shot that cut in front of somebody's work pose: give it back afterwards
  if (PREEMPT.has(name) && holder && holder !== id) {
    const giveBack = holder;
    const pose = state.lease.lastContinuous;
    setTimeout(async () => {
      if (!pose || leaseHolder() !== giveBack) return;
      const again = await postAnim(pose);
      note({ team: giveBack, name: pose, action: "re-asserted", detail: again.ok ? "" : "failed" });
    }, CFG.reassertMs).unref?.();
  }

  send(res, 200, { ...result, team: id, ...(holder && holder !== id ? { preempted: holder } : {}) });
}

function handlePlay(req, res, url) {
  const id = whoAmI(req, url);
  const pose = url.pathname === "/play" ? "talking" : url.pathname.slice("/play/".length);
  const t = team(id);
  t.requests++;
  t.lastSeen = Date.now();
  state.totals.requests++;

  if (!PLAY_POSES.has(pose)) return send(res, 400, { ok: false, error: "bad play pose" });
  const len = Number(req.headers["content-length"] || 0);
  if (!len) return send(res, 411, { ok: false, error: "content-length required" });

  if (state.playing) {
    t.blocked++;
    state.totals.blocked++;
    note({ team: id, name: `play/${pose}`, action: "409 busy", detail: `speaking=${state.playing.team}` });
    return send(
      res,
      409,
      { ok: false, error: "busy", speaking: state.playing.team, hint: "the speaker is single-track" },
      { "retry-after": "2" },
    );
  }

  state.playing = { team: id, since: Date.now(), bytes: len };
  note({ team: id, name: `play/${pose}`, action: "→ robot", detail: `${(len / 1024).toFixed(0)} KiB` });

  const target = new URL(`${CFG.target}/play${pose === "talking" ? "" : `/${pose}`}`);
  const up = http.request(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path: target.pathname,
      method: "POST",
      headers: upstreamHeaders({ "content-type": req.headers["content-type"] || "audio/wav", "content-length": len }),
      timeout: 120000,
    },
    (upRes) => {
      const chunks = [];
      upRes.on("data", (c) => chunks.push(c));
      upRes.on("end", () => {
        state.playing = null;
        const body = Buffer.concat(chunks).toString() || "{}";
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = { ok: upRes.statusCode < 400, raw: body.slice(0, 200) };
        }
        note({ team: id, name: `play/${pose}`, action: "done", detail: `http ${upRes.statusCode}` });
        send(res, upRes.statusCode || 200, { ...parsed, team: id }, upRes.headers["retry-after"] ? { "retry-after": upRes.headers["retry-after"] } : {});
      });
    },
  );
  up.on("timeout", () => {
    up.destroy(new Error("play timeout"));
  });
  up.on("error", (err) => {
    state.playing = null;
    state.totals.errors++;
    note({ team: id, name: `play/${pose}`, action: "502", detail: err.message });
    if (!res.headersSent) send(res, 502, { ok: false, error: "robot unreachable", detail: err.message });
  });
  req.pipe(up);
}

async function handleAdmin(req, res, url) {
  const id = whoAmI(req, url);
  const key = req.headers["x-admin-key"] || url.searchParams.get("admin_key") || "";
  if (!CFG.adminKey) {
    note({ team: id, name: url.pathname, action: "403 denied", detail: "no --admin-key configured" });
    return send(res, 403, {
      ok: false,
      error: "admin disabled",
      hint: "start the gateway with --admin-key <secret> to allow settings/tests/setup routes",
    });
  }
  if (key !== CFG.adminKey) {
    note({ team: id, name: url.pathname, action: "403 denied", detail: "bad admin key" });
    return send(res, 403, { ok: false, error: "admin key required" });
  }

  const body = ["GET", "HEAD"].includes(req.method) ? null : await readBody(req);
  const target = new URL(CFG.target + url.pathname + url.search);
  const headers = upstreamHeaders(
    body ? { "content-type": req.headers["content-type"] || "application/json", "content-length": body.length } : {},
  );
  try {
    const up = await fetch(target, {
      method: req.method,
      headers,
      body: body && body.length ? body : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await up.text();
    note({ team: id, name: url.pathname, action: "admin → robot", detail: `http ${up.status}` });
    res.writeHead(up.status, { "content-type": up.headers.get("content-type") || "application/json", "cache-control": "no-store" });
    res.end(text);
  } catch (err) {
    state.totals.errors++;
    send(res, 502, { ok: false, error: "robot unreachable", detail: err.message });
  }
}

// ---------------------------------------------------------------- dashboard

function statusJSON() {
  const holder = leaseHolder();
  return {
    ok: true,
    target: CFG.target,
    dry_run: CFG.dryRun,
    uptime_s: Math.round((Date.now() - state.started) / 1000),
    lease: holder
      ? { team: holder, expires_in_s: Math.round((state.lease.until - Date.now()) / 1000), last_continuous: state.lease.lastContinuous }
      : null,
    playing: state.playing ? { team: state.playing.team, elapsed_s: Math.round((Date.now() - state.playing.since) / 1000) } : null,
    totals: state.totals,
    teams: [...state.teams.values()].map((t) => ({
      team: t.id,
      requests: t.requests,
      forwarded: t.forwarded,
      blocked: t.blocked,
      deduped: t.deduped,
      idle_s: t.lastSeen ? Math.round((Date.now() - t.lastSeen) / 1000) : null,
    })),
    recent: state.recent.slice(0, 20),
  };
}

const PAGE = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Tiny Engineer gateway</title>
<style>
:root{--bg:#111214;--card:#1a1c20;--line:#2a2d33;--fg:#e8e6e3;--mut:#8b8f96;--acc:#e85d04;--ok:#2d9b63;--bad:#e05561}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:28px;max-width:1000px}
h1{font-size:19px;margin:0 0 4px}h1 span{color:var(--acc)}
.sub{color:var(--mut);font-size:12.5px;margin-bottom:22px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));margin-bottom:20px}
.box{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:13px 15px}
.k{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.v{font-size:17px;font-variant-numeric:tabular-nums;margin-top:3px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:9px;overflow:hidden;font-size:13px}
th{text-align:left;color:var(--mut);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:8px 12px;border-bottom:1px solid var(--line)}
td{padding:7px 12px;border-bottom:1px solid #22252a;font-variant-numeric:tabular-nums}
tr:last-child td{border-bottom:none}
.tag{display:inline-block;padding:1px 7px;border-radius:20px;font-size:11px}
.on{background:rgba(45,155,99,.16);color:#5fd39a}.off{background:rgba(224,85,97,.14);color:#f08a92}
h2{font-size:13px;color:var(--mut);font-weight:500;text-transform:uppercase;letter-spacing:.06em;margin:24px 0 9px}
.cmd{background:#0c0d0f;border:1px solid var(--line);border-radius:7px;padding:10px 12px;font-family:ui-monospace,Consolas,monospace;font-size:12px;color:#c8cbd0;overflow-x:auto;white-space:pre}
</style></head><body>
<h1>Tiny Engineer <span>gateway</span></h1>
<div class="sub" id="sub">loading…</div>
<div class="grid" id="cards"></div>
<h2>teams</h2>
<table><thead><tr><th>team</th><th>requests</th><th>forwarded</th><th>blocked</th><th>deduped</th><th>idle</th></tr></thead><tbody id="teams"></tbody></table>
<h2>recent</h2>
<table><thead><tr><th>time</th><th>team</th><th>pose</th><th>action</th><th>detail</th></tr></thead><tbody id="recent"></tbody></table>
<h2>point your agent here</h2>
<div class="cmd" id="cmdsample"></div>
<script>
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function tick(){
  let d; try { d = await (await fetch("/status")).json(); } catch { document.getElementById("sub").textContent = "gateway unreachable"; return; }
  const pct = d.totals.requests ? Math.round(100*d.totals.blocked/d.totals.requests) : 0;
  document.getElementById("sub").textContent = "robot " + d.target + (d.dry_run ? " (dry run)" : "") + " · up " + d.uptime_s + "s";
  document.getElementById("cards").innerHTML = [
    ["driver", d.lease ? esc(d.lease.team) + " · " + d.lease.expires_in_s + "s" : "nobody driving", d.lease ? "on":"off"],
    ["work pose", d.lease ? esc(d.lease.last_continuous || "—") : "—", ""],
    ["speaker", d.playing ? esc(d.playing.team) + " · " + d.playing.elapsed_s + "s" : "idle", d.playing ? "on":"off"],
    ["requests", d.totals.requests + " fwd " + d.totals.forwarded, ""],
    ["blocked", d.totals.blocked + " (" + pct + "%)", pct > 25 ? "off" : ""],
    ["errors", d.totals.errors, d.totals.errors ? "off" : ""],
  ].map(([k,v,c]) => '<div class="box"><div class="k">'+k+'</div><div class="v">'+v+(c?' <span class="tag '+c+'">'+c+'</span>':'')+'</div></div>').join("");
  document.getElementById("teams").innerHTML = d.teams.length ? d.teams.map(t =>
    '<tr><td>'+esc(t.team)+'</td><td>'+t.requests+'</td><td>'+t.forwarded+'</td><td>'+t.blocked+'</td><td>'+t.deduped+'</td><td>'+(t.idle_s===null?"—":t.idle_s+"s")+'</td></tr>').join("")
    : '<tr><td colspan="6" style="color:#8b8f96">no traffic yet</td></tr>';
  document.getElementById("recent").innerHTML = d.recent.map(r =>
    '<tr><td>'+esc(r.at)+'</td><td>'+esc(r.team)+'</td><td>'+esc(r.name||"")+'</td><td>'+esc(r.action)+'</td><td style="color:#8b8f96">'+esc(r.detail||"")+'</td></tr>').join("");
  document.getElementById("cmdsample").textContent =
    'export TINY_ENGINEER_URL="' + location.origin + '"\nexport TINY_ENGINEER_TEAM="' + (d.lease ? d.lease.team : "yourname") + '"\nnpx -y tiny-engineer setup --all --yes';
}
tick(); setInterval(tick, 2000);
</script></body></html>`;

// ---------------------------------------------------------------- server

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    return send(res, 204, "", {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization,content-type,x-team-id,x-admin-key",
      "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    });
  }
  res.setHeader("access-control-allow-origin", "*");

  try {
    if (req.method === "GET" && url.pathname === "/") return send(res, 200, PAGE);
    if (req.method === "GET" && url.pathname === "/status") return send(res, 200, statusJSON());

    if (url.pathname === "/anim" || url.pathname === "/anim/") {
      if (req.method === "GET") {
        const live = await getAnim();
        return send(res, 200, { ...live, via: "gateway", lease: leaseHolder() });
      }
      if (req.method === "POST") return await handleAnim(req, res, url);
      return send(res, 405, { ok: false, error: "method not allowed" });
    }

    if (url.pathname === "/play" || url.pathname.startsWith("/play/")) {
      if (req.method !== "POST") return send(res, 405, { ok: false, error: "method not allowed" });
      return handlePlay(req, res, url);
    }

    // read-only passthroughs are harmless
    if (req.method === "GET" && ["/health", "/auth", "/settings"].includes(url.pathname)) {
      const up = await fetch(`${CFG.target}${url.pathname}`, { headers: upstreamHeaders(), signal: AbortSignal.timeout(3000) });
      const text = await up.text();
      res.writeHead(up.status, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(text);
    }

    // anything that can change calibration, welcome/sleep config, wifi or firmware state
    return await handleAdmin(req, res, url);
  } catch (err) {
    state.totals.errors++;
    console.error("gateway error:", err);
    if (!res.headersSent) send(res, 500, { ok: false, error: "gateway error", detail: err.message });
  }
});

// a lease that nobody refreshed in time must not block the next person
setInterval(() => {
  if (state.lease.team && state.lease.until <= Date.now()) {
    note({ team: state.lease.team, name: state.lease.lastContinuous || "", action: "lease expired" });
    state.lease = { team: null, until: 0, lastContinuous: null };
  }
}, 1000).unref();

server.listen(CFG.port, CFG.bind, () => {
  console.log(`te-gateway  http://${CFG.bind}:${CFG.port}  →  ${CFG.target}${CFG.dryRun ? "  [dry run]" : ""}`);
  console.log(`  lease ttl ${CFG.leaseTtl / 1000}s · rate ${CFG.rate}/s burst ${CFG.burst} · admin ${CFG.adminKey ? "on" : "off"}`);
  console.log(`  dashboard http://localhost:${CFG.port}/`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log("\nbye");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500);
  });
}
