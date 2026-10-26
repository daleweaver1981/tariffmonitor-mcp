#!/usr/bin/env node
// Tariff canary (2026-10-26): recomputes the fixed lines in test/canary-lines.json against the LIVE engine
// and fails loudly on any drift in the total or in the set of layers. Run daily from cron on CT150.
//   node scripts/tariff-canary.mjs              -> prints a table, exit 1 on drift
//   node scripts/tariff-canary.mjs --due        -> also adds one CEO due item on drift (CT150 data/ceo-due.json)
//   node scripts/tariff-canary.mjs --mcp        -> also calls the public /mcp-free endpoint per line and prints its stack verbatim
//   API_BASE=... to point at another engine.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { lines } = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/canary-lines.json'), 'utf8'));
const API = process.env.API_BASE || 'https://adcreator-ai.com/api/tem';
const MCP = process.env.MCP_URL || 'https://adcreator-ai.com/mcp-free';
const args = new Set(process.argv.slice(2));

export async function checkLine(l) {
  const r = await fetch(`${API}/rate?hts=${l.hts}&country=${l.country}&utm_source=tariff-canary&cb=${Date.now()}`, { headers: { 'User-Agent': 'tariffmonitor-canary' } });
  const d = await r.json();
  if (!d.ok) return { l, ok: false, why: `engine error: ${d.error}` };
  const types = (d.layers || []).map((x) => x.type);
  const problems = [];
  if (Math.abs(d.total_rate - l.total) > 0.051) problems.push(`total ${d.total_rate} != ${l.total}`);
  if (d.hts10 !== l.hts) problems.push(`resolved to ${d.hts10}`);
  if (JSON.stringify([...types].sort()) !== JSON.stringify([...l.layers].sort())) problems.push(`layers [${types}] != [${l.layers}]`);
  if (l.notice && !(d.notices || []).some((n) => n.includes(l.notice))) problems.push(`notice "${l.notice}" missing`);
  return { l, ok: !problems.length, why: problems.join('; '), d };
}

async function mcpCall(hts, country) {
  const H = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  const post = async (body, sid) => {
    const r = await fetch(MCP, { method: 'POST', headers: { ...H, ...(sid ? { 'mcp-session-id': sid } : {}) }, body: JSON.stringify(body) });
    const t = await r.text(); const line = t.split('\n').find((x) => x.startsWith('data:'));
    return { j: JSON.parse(line ? line.slice(5) : t), sid: r.headers.get('mcp-session-id') };
  };
  const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'tariff-canary', version: '1' } } });
  const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'calculate_tariff', arguments: { hts_code: hts, origin_country: country } } }, init.sid);
  return res.j.result ? res.j.result.content.map((c) => c.text).join('\n') : JSON.stringify(res.j.error || res.j);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = [];
  for (const l of lines) results.push(await checkLine(l));
  for (const x of results) {
    console.log(`${x.ok ? 'OK  ' : 'FAIL'} ${x.l.hts} ${x.l.country}  expected ${x.l.total}%  live ${x.d ? x.d.total_rate : '-'}%  ${x.d ? x.d.layers.map((y) => `${y.type}${y.needs_review ? ':review' : ':' + y.rate}`).join(' + ') : ''}${x.ok ? '' : '  <- ' + x.why}`);
    if (args.has('--mcp')) {
      const text = await mcpCall(x.l.hts, x.l.country);
      const stack = text.split('\n').filter((s) => /^HTS |^Origin|^  |^Total current rate/.test(s)).join('\n');
      console.log(stack.split('\n').map((s) => '      mcp| ' + s).join('\n'));
    }
  }
  const bad = results.filter((x) => !x.ok);
  console.log(`\n${results.length - bad.length}/${results.length} lines match.`);
  if (bad.length && args.has('--due')) {
    const f = '/tmp/_tmp-claude-tariff-canary-due.txt';
    fs.writeFileSync(f, `${bad.length} of ${results.length} canary lines drifted (${new Date().toISOString().slice(0, 10)}): ` + bad.map((x) => `${x.l.hts} ${x.l.country}: ${x.why}`).join(' | ') + '. Check the engine (VM100 server.js temComputeStackedRate) and data/tem against HTSUS chapter 99 before customers act on it.');
    try { console.log(execFileSync('node', ['/root/youtube-pipeline/_ceo-due-add.js', 'TARIFF CANARY DRIFT:', f]).toString().trim()); } catch (e) { console.error('ceo-due add failed:', e.message); }
    fs.unlinkSync(f);
  }
  process.exit(bad.length ? 1 : 0);
}
