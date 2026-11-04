#!/usr/bin/env node
// Section 301 China date flipper (2026-11-04). Called by scripts/fr-tariff-watch.mjs on every run; also runs alone.
// When USTR publishes a FINAL Federal Register notice that extends the China product exclusions or further suspends the
// maritime Section 301 action, this reads the new end date from the notice text and rewrites the engine's dates file
// (VM100 ~/adcreator-ai/data/tem/s301-cn-dates-2026.json). The engine re-reads that file when it changes, so every
// rate query (web calculator, /api/tem/rate, both MCP endpoints) answers with the new dates the same day, no restart.
//   - Exclusions: a stat number named in the notice text gets the new last day (per_code); if the notice names >= 95%
//     of the numbers we track, the global last_day moves too. A notice naming few or none -> no change + CEO due item.
//   - Maritime: a "suspension" notice with a later "through 11:59 p.m. ... <date>" moves suspended_through, and any
//     proposal it resolves leaves `pending` (kept in history).
//   - Requests for comments / proposed actions never flip anything (they are already listed as proposed).
// Every change is logged in the file's history with the FR document, and raises one CEO due item to verify.
//   node scripts/s301-dates-flip.mjs [--days=3] [--dry-run] [--doc=2025-21671]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REMOTE = process.env.S301_DATES_REMOTE || 'adcreator:adcreator-ai/data/tem/s301-cn-dates-2026.json';
const REMOTE_DATA = process.env.S301_DATA_REMOTE || 'adcreator:adcreator-ai/data/tem/s301-cn-nov10-2026.json';
const UA = { 'User-Agent': 'Mozilla/5.0 (tariffmonitor s301-dates-flip; +https://adcreator-ai.com/tariffs/november-10-2026)' };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function throughDates(text) {
  const t = text.replace(/\s+/g, ' ');
  const out = [];
  for (const m of t.matchAll(/through 11:59 (?:p\.m\.|pm) (?:eastern (?:daylight|standard) time|e[ds]t|eastern time|et)?,? ?(?:on )?([A-Z][a-z]+) (\d{1,2}), (20\d\d)/gi)) {
    const mo = MONTHS.indexOf(m[1].toLowerCase());
    if (mo >= 0) out.push(`${m[3]}-${String(mo + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`);
  }
  return out;
}
export function classify(doc) {
  const t = doc.title || '';
  if (/request for comments|proposed|proposal/i.test(t) || doc.type === 'Proposed Rule') return null;
  if (/Maritime, Logistics, and Shipbuilding/i.test(t) && /suspen|modif/i.test(t)) return 'maritime';
  if (/exclusion/i.test(t) && /(Technology Transfer|Intellectual Property|China)/i.test(t) && /extension|extend/i.test(t)) return 'exclusions';
  return null;
}
const sh = (cmd, args, input) => execFileSync(cmd, args, { input, timeout: 60000 }).toString();
const nextDay = (d) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };

export function applyDoc(dates, codes, doc, text, today) {
  const kind = classify(doc);
  if (!kind) return { changed: false };
  const ds = throughDates(text).sort();
  const latest = ds[ds.length - 1];
  const basis = `FR Doc. ${doc.document_number} (${doc.publication_date})`;
  const rec = (field, from, to) => ({ date: today, field, from, to, basis, basis_url: doc.html_url, title: doc.title.slice(0, 200), by: 'fr-tariff-watch (auto-read from the notice text; verify)' });
  if (kind === 'maritime') {
    const M = dates.maritime;
    if (!latest || latest <= M.suspended_through) return { changed: false, kind, why: `no later "through" date (found ${ds.join(', ') || 'none'})` };
    dates.history.push(rec('maritime.suspended_through', M.suspended_through, latest));
    M.suspended_through = latest; M.end_text = `through 11:59 p.m. Eastern Time on ${latest} (as read from ${basis})`;
    M.basis = basis; M.basis_url = doc.html_url; M.status = 'final';
    const resolved = M.pending.filter((p) => (p.would_suspend_through || '') <= latest);
    M.pending = M.pending.filter((p) => !resolved.includes(p));
    for (const p of resolved) dates.history.push({ ...rec('maritime.pending', p.basis, 'resolved'), proposal: p });
    return { changed: true, kind, summary: `maritime suspension now through ${latest} (heading 9903.91.12/9903.91.14 start ${nextDay(latest)})` };
  }
  const X = dates.exclusions;
  if (!latest || latest <= X.last_day) return { changed: false, kind, why: `no later "through" date (found ${ds.join(', ') || 'none'})` };
  const flat = text.replace(/\s+/g, ' ');
  const named = codes.filter((c) => flat.includes(`${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6)}`));
  if (!named.length) return { changed: false, kind, why: `extends to ${latest} but names none of our ${codes.length} statistical numbers; needs a person` };
  X.per_code = X.per_code || {};
  for (const c of named) X.per_code[c] = latest;
  dates.history.push({ ...rec('exclusions.per_code', X.last_day, latest), codes: named });
  let summary = `${named.length}/${codes.length} excluded statistical numbers now through ${latest}`;
  if (named.length >= Math.ceil(codes.length * 0.95)) {
    dates.history.push(rec('exclusions.last_day', X.last_day, latest));
    X.last_day = latest; X.end_text = `through 11:59 p.m. on ${latest} (as read from ${basis})`; X.basis = basis; X.basis_url = doc.html_url;
    summary += '; global last_day moved';
  }
  return { changed: true, kind, summary };
}

async function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry-run');
  const one = (argv.find((a) => a.startsWith('--doc=')) || '').slice(6);
  const days = Number((argv.find((a) => a.startsWith('--days=')) || '--days=3').split('=')[1]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '_tmp-claude-s301flip-'));
  try {
    sh('scp', ['-q', REMOTE, path.join(tmp, 'd.json')]);
    sh('scp', ['-q', REMOTE_DATA, path.join(tmp, 'x.json')]);
    const dates = JSON.parse(fs.readFileSync(path.join(tmp, 'd.json'), 'utf8'));
    const codes = Object.keys(JSON.parse(fs.readFileSync(path.join(tmp, 'x.json'), 'utf8')).exclusions);
    const fields = '&fields[]=document_number&fields[]=title&fields[]=type&fields[]=html_url&fields[]=raw_text_url&fields[]=publication_date';
    let docs;
    if (one) docs = [await (await fetch(`https://www.federalregister.gov/api/v1/documents/${one}.json?${fields.slice(1)}`, { headers: UA })).json()];
    else {
      const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
      const r = await fetch(`https://www.federalregister.gov/api/v1/documents.json?per_page=100&order=newest&conditions[agencies][]=trade-representative-office-of-united-states&conditions[publication_date][gte]=${since}${fields}`, { headers: UA });
      docs = (await r.json()).results || [];
    }
    const today = new Date().toISOString().slice(0, 10);
    const done = [];
    for (const d of docs) {
      if (!classify(d)) continue;
      if (!one && dates.history.some((h) => h.basis && h.basis.includes(d.document_number))) continue;
      const text = await (await fetch(d.raw_text_url, { headers: UA })).text();
      const r = applyDoc(dates, codes, d, text, today);
      console.log(`${d.document_number} ${r.kind || '-'}: ${r.changed ? r.summary : r.why}`);
      if (r.changed) done.push(`FR Doc. ${d.document_number} "${d.title.slice(0, 140)}": ${r.summary}`);
      else if (r.why && /needs a person/.test(r.why)) done.push(`FR Doc. ${d.document_number}: ${r.why} (NOT applied)`);
    }
    if (!done.length) { console.log('s301-dates-flip: nothing to change'); return; }
    if (dry) { console.log('DRY RUN, would write:', JSON.stringify({ exclusions: dates.exclusions, maritime: dates.maritime }).slice(0, 1500)); return; }
    if (dates.history.length && done.some((x) => !/NOT applied/.test(x))) {
      dates.updated_at = today; dates.updated_by = 'fr-tariff-watch / s301-dates-flip.mjs';
      fs.writeFileSync(path.join(tmp, 'd.json'), JSON.stringify(dates, null, 1) + '\n');
      const [host, rpath] = REMOTE.split(':');
      sh('scp', ['-q', path.join(tmp, 'd.json'), `${host}:${rpath}.tmp`]);
      sh('ssh', [host, `mv ${rpath}.tmp ${rpath}`]);
      console.log('dates file updated on', host);
    }
    const f = path.join(tmp, 'due.txt');
    fs.writeFileSync(f, `Section 301 China dates changed by a Federal Register notice; the engine now uses them for every rate query. Verify against the notice text and fix data/tem/s301-cn-dates-2026.json if the reading is wrong: ${done.join(' | ')}`);
    try { console.log(sh('node', ['/root/youtube-pipeline/_ceo-due-add.js', `TARIFF S301 DATES ${today}:`, f]).trim()); } catch (e) { console.error('ceo-due add failed:', e.message); }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
