#!/usr/bin/env node
// Federal Register tariff watcher (2026-10-26). Daily from cron on CT150. Finds new USTR, presidential and
// CBP documents that touch the tariff schedule, reads their text for chapter 99 headings (9903.xx.xx), and
// adds ONE CEO due item when a document names a heading that is not in scripts/known-ch99-headings.json
// (HTSUS 2026 Rev. 21) or is a presidential tariff action. The engine (VM100 server.js) is not changed
// automatically: a person checks the document and updates data/tem.
//   node scripts/fr-tariff-watch.mjs [--days=3] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const known = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/known-ch99-headings.json'), 'utf8')).headings);
const STATE = process.env.FR_WATCH_STATE || path.join(ROOT, 'data/fr-watch-state.json');
const argv = process.argv.slice(2);
const days = Number((argv.find((a) => a.startsWith('--days=')) || '--days=3').split('=')[1]);
const dry = argv.includes('--dry-run');
const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const UA = { 'User-Agent': 'Mozilla/5.0 (tariffmonitor fr-watch; +https://adcreator-ai.com/tariffs/calculator)' };
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { seen: {} };

const base = 'https://www.federalregister.gov/api/v1/documents.json?per_page=100&order=newest'
  + `&conditions[publication_date][gte]=${since}&fields[]=document_number&fields[]=title&fields[]=type&fields[]=html_url&fields[]=raw_text_url&fields[]=publication_date`;
const queries = [
  '&conditions[agencies][]=trade-representative-office-of-united-states',
  '&conditions[type][]=PRESDOCU&conditions[term]=' + encodeURIComponent('"Harmonized Tariff Schedule"'),
  '&conditions[agencies][]=u-s-customs-and-border-protection&conditions[term]=' + encodeURIComponent('"chapter 99"'),
];
const docs = new Map();
for (const q of queries) {
  const r = await fetch(base + q, { headers: UA });
  if (!r.ok) { console.error('FR API', r.status, q); process.exitCode = 2; continue; }
  for (const d of (await r.json()).results || []) docs.set(d.document_number, d);
}
const findings = [];
for (const d of docs.values()) {
  if (state.seen[d.document_number]) continue;
  let text = '';
  try { text = await (await fetch(d.raw_text_url, { headers: UA })).text(); } catch (e) { console.error('text fetch failed', d.document_number); continue; }
  const heads = [...new Set(text.match(/9903\.\d{2}\.\d{2}/g) || [])];
  const fresh = heads.filter((h) => !known.has(h));
  const tariffy = /additional (ad valorem )?dut|rate of duty|tariff/i.test(d.title + ' ' + text.slice(0, 20000));
  state.seen[d.document_number] = { date: d.publication_date, headings: heads.length, new: fresh };
  if (fresh.length || (d.type === 'Presidential Document' && tariffy)) {
    findings.push(`${d.publication_date} FR Doc. ${d.document_number} "${d.title.slice(0, 160)}"${fresh.length ? ` names chapter 99 heading(s) not in Rev. 21: ${fresh.slice(0, 12).join(', ')}${fresh.length > 12 ? ' …' : ''}` : ' (presidential tariff action)'} ${d.html_url}`);
  }
}
console.log(`${docs.size} documents since ${since}; ${findings.length} need review`);
for (const f of findings) console.log(' - ' + f);
if (!dry) {
  fs.writeFileSync(STATE + '.tmp', JSON.stringify(state, null, 1)); fs.renameSync(STATE + '.tmp', STATE);
  if (findings.length) {
    const f = '/tmp/_tmp-claude-fr-watch-due.txt';
    fs.writeFileSync(f, `${findings.length} new Federal Register tariff document(s) to check against the calculator (VM100 adcreator-ai data/tem, temComputeStackedRate): ${findings.join(' | ')}`);
    try { console.log(execFileSync('node', ['/root/youtube-pipeline/_ceo-due-add.js', `TARIFF FR WATCH ${new Date().toISOString().slice(0, 10)}:`, f]).toString().trim()); } catch (e) { console.error('ceo-due add failed:', e.message); }
    fs.unlinkSync(f);
  }
}
