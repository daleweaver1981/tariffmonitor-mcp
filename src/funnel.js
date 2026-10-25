// Tariff Exposure Monitor: growth funnel for the hosted /mcp endpoint (Fleet Growth Rule s5, 7.1, 7.6).
// Added 2026-10-11. Used by src/http.js only; the stdio server (src/index.js) never loads it.
//
// Conversion event (registry): a PAID tool call through the Voidnet marketplace. Voidnet does the
// billing, and its metering is readable only with a console session (docs: money/usage, "requires a
// console session"; CLI needs a Console-issued vnp-pub- token). So from here we record step
// 'activate' for every tools/call that reaches the tools, and 'paid' stays with the Voidnet console.
// See growth/drafts/voidnet-paid-calls.md.
//
// Storage: SQLite via node:sqlite (Node >= 22.5, built in, no dependency) at data/funnel.db. This is
// an isolated publisher process with no database of its own, so it does not borrow AdCreator's Postgres.
// If node:sqlite is unavailable, recording is a silent no-op: instrumentation must never break a call.
//
// Classification of each call (flags, never deletion):
//   via        'voidnet' when the call carries x-voidnet-request-id (it came through the marketplace
//              gateway, which holds our publisher key), else 'direct'.
//   is_internal our egress/LAN/localhost, our own probe UAs, or x-fleet-test: 1.
//   is_bot     platform verification (Voidnet-Verify), directory scanners, health checks and generic
//              scripted clients, using the same UA list as node1 _mcp-first-arrival-watch.js.
//              EXCEPTION: a voidnet-routed call is NOT marked bot for its Go-http-client UA, because
//              that UA is the Voidnet gateway itself and every real paying buyer arrives with it.
//              Whether a routed call was a buyer or Voidnet's own composition check cannot be told
//              from our side; meta.cls says 'voidnet-routed' and the console settles it.
// Stored per call: tool, method, status, ms, client UA (first 80 chars), Voidnet request id, ip_class
// (ours | other). The client IP itself is not stored here (calls.jsonl, the older raw log, still has it).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const DB_PATH = process.env.FUNNEL_DB || path.join(DATA, 'funnel.db');
const ARRIVALS = path.join(ROOT, 'growth', 'arrivals.json');

// From node1 /root/_mcp-first-arrival-watch.js (2026-10-11 copy), plus 'voidnet-verify'.
const CRAWLER_UA = /voidnet-verify|go-http-client|mcp-discovery|measurement|academic|research|mcpbeat|rokmcp|mcpscan|proofbench|mcp-bench|bench\/|sasame|agentsure|the402|mcpmon|mcphub|glama|smithery|pulsemcp|modelcontext|audit|liveness|drift|monitor|registry|catalog|directory|census|python-httpx|^curl|scout|verify|smoke|sweep|inspector|-probe|healthcheck|uptime|@|https?:|tester|scoring|qvault|amp-server|amp-mcp|bot\b|crawler|spider/i;
const KNOWN_AGENT = /claude|anthropic|cursor|cline|windsurf|chatgpt|openai|librechat|goose|continue\.dev|zed|copilot|perplexity/i;
const OUR_IP = /^(73\.109\.71\.133|10\.0\.0\.\d+|127\.0\.0\.1|172\.17\.\d+|100\.114\.\d+|::1|::ffff:127\.0\.0\.1|localhost)$/;
const OUR_UA = /^fleet-|selfcheck|scout-run|keeper-|arrival-check/i;

let db = null;
let dbTried = false;
async function open() {
  if (db || dbTried) return db;
  dbTried = true;
  try {
    const { DatabaseSync } = await import('node:sqlite');
    fs.mkdirSync(DATA, { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS funnel_events (
        id           TEXT PRIMARY KEY,               -- uuid v4 (crypto.randomUUID)
        occurred_at  TEXT NOT NULL,                  -- ISO 8601 UTC
        anon_id      TEXT NOT NULL,                  -- 'voidnet' or 'direct': no buyer id reaches us
        user_id      TEXT,
        step         TEXT NOT NULL,                  -- activate (paid lives in the Voidnet console)
        source       TEXT,                           -- voidnet | direct
        medium       TEXT,
        campaign     TEXT,
        content      TEXT,
        landing_path TEXT,                           -- /mcp
        arrival_type TEXT,                           -- directory
        device       TEXT,
        is_bot       INTEGER NOT NULL DEFAULT 0,
        is_internal  INTEGER NOT NULL DEFAULT 0,
        meta         TEXT NOT NULL DEFAULT '{}'      -- JSON: tool, method, status, ms, ua, request_id, cls, ip_class
      );
      CREATE INDEX IF NOT EXISTS funnel_events_step_time ON funnel_events (step, occurred_at);
      CREATE INDEX IF NOT EXISTS funnel_events_campaign ON funnel_events (campaign);
      CREATE INDEX IF NOT EXISTS funnel_events_landing ON funnel_events (landing_path, occurred_at);
      CREATE TABLE IF NOT EXISTS funnel_daily (
        day TEXT NOT NULL, step TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', landing_path TEXT NOT NULL DEFAULT '',
        events INTEGER NOT NULL DEFAULT 0, humans INTEGER NOT NULL DEFAULT 0, computed_at TEXT NOT NULL,
        PRIMARY KEY (day, step, source, landing_path)
      );
      CREATE TABLE IF NOT EXISTS arrival_checks (
        id TEXT PRIMARY KEY, checked_at TEXT NOT NULL, arrival_id TEXT NOT NULL, url TEXT NOT NULL,
        ok INTEGER NOT NULL, status INTEGER, ms INTEGER, failures TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX IF NOT EXISTS arrival_checks_arrival_time ON arrival_checks (arrival_id, checked_at);
    `);
  } catch (e) {
    console.error('[funnel] disabled (node:sqlite unavailable or db error):', e.message);
    db = null;
  }
  return db;
}

export function classify({ ua = '', ip = '', voidnetRequestId = '', testHeader = '' }) {
  const via = voidnetRequestId ? 'voidnet' : 'direct';
  const firstIp = String(ip).split(',')[0].trim();
  const ours = OUR_IP.test(firstIp) || OUR_UA.test(ua) || testHeader === '1';
  let cls;
  if (ours) cls = 'internal';
  else if (/voidnet-verify/i.test(ua)) cls = 'platform-verify';
  else if (via === 'voidnet') cls = 'voidnet-routed';
  else if (CRAWLER_UA.test(ua) && !KNOWN_AGENT.test(ua)) cls = 'scanner';
  else cls = 'direct-client';
  return {
    via, cls,
    is_internal: ours,
    is_bot: cls === 'platform-verify' || cls === 'scanner',
    ip_class: OUR_IP.test(firstIp) ? 'ours' : 'other',
  };
}

/** Record one tools/call. Never throws. Returns the row id (or null). */
export async function recordToolCall(req, info) {
  try {
    const d = await open(); if (!d) return null;
    const ua = String(req.headers['user-agent'] || '').slice(0, 80);
    const rid = String(req.headers['x-voidnet-request-id'] || '').slice(0, 64);
    // 2026-10-25: the keyless public endpoint (/mcp-free) passes info.endpoint='free-remote' and the
    // client IP the gateway vouched for (info.ip), because its X-Forwarded-For head is client-supplied.
    // Keyed /mcp calls pass neither and are recorded exactly as before.
    const free = info.endpoint === 'free-remote';
    const c = classify({ ua, ip: (free && info.ip) || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '', voidnetRequestId: free ? '' : rid, testHeader: String(req.headers['x-fleet-test'] || '') });
    const id = crypto.randomUUID();
    const anon = free ? 'free-remote' : c.via;
    const source = free ? 'free-remote' : c.via;
    const landing = free ? '/mcp-free' : '/mcp';
    const campaign = free ? 'tariffmonitor-202610-free-remote' : null;
    d.prepare(`INSERT INTO funnel_events (id, occurred_at, anon_id, step, source, campaign, landing_path, arrival_type, is_bot, is_internal, meta)
               VALUES (?, ?, ?, 'activate', ?, ?, ?, 'directory', ?, ?, ?)`)
      .run(id, new Date().toISOString(), anon, source, campaign, landing, c.is_bot ? 1 : 0, c.is_internal ? 1 : 0,
        JSON.stringify({ tool: info.tool || null, method: info.method || null, status: info.status, ms: info.ms, ua, request_id: (free ? null : rid) || null, cls: c.cls, ip_class: c.ip_class,
          ...(free ? { endpoint: 'free-remote', ip_hash: info.ipHash || null } : {}) }));
    return id;
  } catch (e) { console.error('[funnel] record failed:', e.message); return null; }
}

/** Daily rollup: per-step counts by source into funnel_daily (humans = not bot, not internal). */
export async function rollup() {
  const d = await open(); if (!d) return;
  d.prepare(`INSERT INTO funnel_daily (day, step, source, landing_path, events, humans, computed_at)
             SELECT substr(occurred_at, 1, 10), step, COALESCE(source, ''), COALESCE(landing_path, ''),
                    COUNT(*), SUM(CASE WHEN is_bot = 0 AND is_internal = 0 THEN 1 ELSE 0 END), ?
               FROM funnel_events WHERE occurred_at >= date('now', '-90 days')
              GROUP BY 1, 2, 3, 4
             ON CONFLICT (day, step, source, landing_path)
             DO UPDATE SET events = excluded.events, humans = excluded.humans, computed_at = excluded.computed_at`)
    .run(new Date().toISOString());
}

export async function summary() {
  const d = await open(); if (!d) return null;
  const q = (sql) => d.prepare(sql).get();
  return {
    activate_total: q(`SELECT COUNT(*) n FROM funnel_events WHERE step='activate'`).n,
    activate_not_bot_not_internal: q(`SELECT COUNT(*) n FROM funnel_events WHERE step='activate' AND is_bot=0 AND is_internal=0`).n,
    voidnet_routed: q(`SELECT COUNT(*) n FROM funnel_events WHERE step='activate' AND json_extract(meta,'$.cls')='voidnet-routed'`).n,
    direct_clients: q(`SELECT COUNT(*) n FROM funnel_events WHERE step='activate' AND json_extract(meta,'$.cls')='direct-client'`).n,
    bot_or_internal: q(`SELECT COUNT(*) n FROM funnel_events WHERE is_bot=1 OR is_internal=1`).n,
    last_7d_routed: q(`SELECT COUNT(*) n FROM funnel_events WHERE step='activate' AND json_extract(meta,'$.cls')='voidnet-routed' AND occurred_at >= datetime('now','-7 days')`).n,
    free_remote_total: q(`SELECT COUNT(*) n FROM funnel_events WHERE step='activate' AND source='free-remote'`).n,
    free_remote_7d_not_bot_not_internal: q(`SELECT COUNT(*) n FROM funnel_events WHERE step='activate' AND source='free-remote' AND is_bot=0 AND is_internal=0 AND occurred_at >= datetime('now','-7 days')`).n,
  };
}

// ------------------------------------------------------------ arrival health (Rule 7.6)
const alerted = new Map();
function alertDale(subject, text) {
  // VM100 has one working mail path: AdCreator's opsAlert (its SMTP env). Fire-and-forget.
  const app = '/home/aiadmin/adcreator-ai';
  if (!fs.existsSync(path.join(app, 'src/services/opsAlert.js'))) return console.error('[arrivals] no alert path:', subject);
  execFile(process.execPath, ['-e', "require('dotenv').config({quiet:true});require('./src/services/opsAlert').alertOps(process.env.A_SUBJ,process.env.A_TEXT).then(ok=>process.exit(ok?0:1))"],
    { cwd: app, timeout: 90000, env: { ...process.env, A_SUBJ: subject, A_TEXT: text } },
    (err) => { if (err) console.error('[arrivals] alert failed:', err.message); });
}

async function probe(h) {
  const t0 = Date.now();
  try {
    const r = await fetch(h.url, {
      method: h.method || 'GET', redirect: 'manual',
      headers: { 'User-Agent': 'fleet-arrival-check/1.0 (internal health check)', ...(h.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      body: h.method === 'POST' ? (h.body || '{}') : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const text = await r.text().catch(() => '');
    return { status: r.status, ms: Date.now() - t0, text };
  } catch (e) { return { status: 0, ms: Date.now() - t0, text: '', err: e.message }; }
}

export async function checkArrivals({ dryRun = false } = {}) {
  const d = await open();
  let doc; try { doc = JSON.parse(fs.readFileSync(ARRIVALS, 'utf8')); } catch (e) { console.error('[arrivals] cannot read', e.message); return []; }
  const out = []; let changed = false;
  for (const a of doc.arrivals || []) {
    const eligible = a.status === 'live' || (a.status === 'paused' && a.paused_by === 'health-check');
    if (!eligible || !a.health) continue;
    const failures = [];
    const p = await probe(a.health);
    const want = a.health.expect_status || 200;
    if (p.status !== want) failures.push(`${a.health.method || 'GET'} ${a.health.url} -> ${p.status}${p.err ? ' ' + p.err : ''} (want ${want}, no redirects)`);
    for (const s of a.health.must_contain || []) if (!p.text.includes(s)) failures.push(`response missing "${s}"`);
    if (a.health.next_step_check) {
      const n = await probe(a.health.next_step_check);
      const nw = a.health.next_step_check.expect_status || 200;
      if (n.status !== nw) failures.push(`next step ${a.health.next_step_check.url} -> ${n.status} (want ${nw})`);
      for (const s of a.health.next_step_check.must_contain || []) if (!n.text.includes(s)) failures.push(`next step missing "${s}"`);
    }
    const ok = failures.length === 0;
    if (d && !dryRun) d.prepare('INSERT INTO arrival_checks (id, checked_at, arrival_id, url, ok, status, ms, failures) VALUES (?,?,?,?,?,?,?,?)')
      .run(crypto.randomUUID(), new Date().toISOString(), a.id, a.health.url, ok ? 1 : 0, p.status, p.ms, JSON.stringify(failures));
    out.push({ id: a.id, ok, status: p.status, ms: p.ms, failures });
    if (!ok && a.status === 'live') { a.status = 'paused'; a.paused_by = 'health-check'; changed = true; }
    if (ok && a.paused_by === 'health-check') { a.status = 'live'; delete a.paused_by; changed = true; }
    const day = new Date().toISOString().slice(0, 10);
    if (!ok && !dryRun && alerted.get(a.id) !== day) {
      alerted.set(a.id, day);
      alertDale(`tariffmonitor-mcp arrival check FAILED: ${a.id}`, `${failures.join('\n')}\n\nThe arrival is marked paused in ~/tariffmonitor-mcp/growth/arrivals.json on VM100 until it passes again.`);
    }
  }
  if (changed && !dryRun) fs.writeFileSync(ARRIVALS, JSON.stringify(doc, null, 2) + '\n');
  return out;
}

/** setInterval scheduler (never node-cron): once shortly after boot, then daily. */
export function startJobs() {
  const run = async () => {
    try { await rollup(); } catch (e) { console.error('[funnel] rollup failed:', e.message); }
    try { const r = await checkArrivals(); console.log('[arrivals]', r.map((x) => `${x.id}:${x.ok ? 'ok' : 'FAIL'}`).join(' ') || 'none live'); }
    catch (e) { console.error('[arrivals] check failed:', e.message); }
  };
  setTimeout(run, 90e3).unref();
  setInterval(run, 24 * 3600e3).unref();
}

export function close() { try { db && db.close(); } catch {} db = null; dbTried = false; }
