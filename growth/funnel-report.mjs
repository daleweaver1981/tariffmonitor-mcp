#!/usr/bin/env node
// tariffmonitor-mcp funnel report. Usage on VM100: cd ~/tariffmonitor-mcp && node growth/funnel-report.mjs
import { DatabaseSync } from 'node:sqlite';
import { rollup, summary, close } from '../src/funnel.js';
await rollup();
console.log(JSON.stringify(await summary(), null, 2));
close();
const db = new DatabaseSync(new URL('../data/funnel.db', import.meta.url).pathname);
console.log('by class:', JSON.stringify(db.prepare(`SELECT json_extract(meta,'$.cls') cls, COUNT(*) n, MIN(occurred_at) first, MAX(occurred_at) last FROM funnel_events GROUP BY 1`).all()));
console.log('latest arrival checks:', JSON.stringify(db.prepare(`SELECT arrival_id, ok, status, MAX(checked_at) at FROM arrival_checks GROUP BY arrival_id`).all()));
console.log('paid: not visible here; see growth/drafts/voidnet-paid-calls.md');
db.close();
