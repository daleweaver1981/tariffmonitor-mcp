#!/usr/bin/env node
// One-off, idempotent: copy historical tools/call lines from calls.jsonl (per-call log since 2026-09-18)
// into data/funnel.db as step 'activate', classified with the same rules as live calls (meta.backfilled=true).
// Usage on VM100: cd ~/tariffmonitor-mcp && node growth/backfill-calls.mjs [--dry-run]
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { classify, rollup, close } from '../src/funnel.js';

const dry = process.argv.includes('--dry-run');
await rollup(); // opens and creates the schema
const db = new DatabaseSync(new URL('../data/funnel.db', import.meta.url).pathname);
const exists = db.prepare(`SELECT 1 FROM funnel_events WHERE occurred_at = ? AND json_extract(meta,'$.backfilled') = 1`);
const ins = db.prepare(`INSERT INTO funnel_events (id, occurred_at, anon_id, step, source, landing_path, arrival_type, is_bot, is_internal, meta)
                        VALUES (?, ?, ?, 'activate', ?, '/mcp', 'directory', ?, ?, ?)`);
let n = 0, skipped = 0;
for (const line of fs.readFileSync(new URL('../calls.jsonl', import.meta.url), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let r; try { r = JSON.parse(line); } catch { continue; }
  if (r.method !== 'tools/call') continue;
  if (exists.get(r.ts)) { skipped++; continue; }
  const rid = (r.ids && r.ids['x-voidnet-request-id']) || '';
  const c = classify({ ua: r.ua || '', ip: r.ip || '', voidnetRequestId: rid });
  if (c.cls === 'internal') continue; // our own probes/tests are never history
  n++;
  if (!dry) ins.run(crypto.randomUUID(), r.ts, c.via, c.via, c.is_bot ? 1 : 0, c.is_internal ? 1 : 0,
    JSON.stringify({ tool: r.tool, method: r.method, status: r.status, ms: r.ms, ua: String(r.ua || '').slice(0, 80), request_id: rid || null, cls: c.cls, ip_class: c.ip_class, backfilled: true }));
}
db.close(); close();
if (!dry) await rollup();
console.log(`${dry ? 'would insert' : 'inserted'} ${n}, already present ${skipped}`);
