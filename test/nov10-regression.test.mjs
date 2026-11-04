// 10 Nov 2026 regression (2026-11-04): the engine must answer every row of /tariffs/november-10-2026 correctly on both
// sides of the date, with its legal source, and must NOT move 20 control codes.
// Fixture test/nov10-regression.json: 206 page rows (exclusion entries of HTSUS ch. 99 U.S. note 20(vvv)/(www) and the
// maritime headings 9903.91.12/9903.91.14) with the before/after rates the page derived from chapter 99, plus 20 controls.
//   node --test test/nov10-regression.test.mjs        (TEM_API defaults to VM100 on the LAN; the public host rate-limits)
//   TEM_API=https://adcreator-ai.com/api/tem node --test test/nov10-regression.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const API = process.env.TEM_API || 'http://10.0.0.105:3000/api/tem';
const F = JSON.parse(fs.readFileSync(new URL('./nov10-regression.json', import.meta.url), 'utf8'));
const BEFORE = '2026-11-09', AFTER = '2026-11-10';
const cache = new Map();
async function rate(hts, country, date) {
  const k = `${hts}|${country}|${date}`;
  if (!cache.has(k)) {
    cache.set(k, (async () => {
      for (let i = 0; i < 4; i++) {
        const r = await fetch(`${API}/rate?hts=${hts}&country=${country}&as_of=${date}&utm_source=nov10-regression`);
        if (r.status === 429) { await new Promise((s) => setTimeout(s, 30000)); continue; }
        return r.json();
      }
      throw new Error('rate limited');
    })());
  }
  return cache.get(k);
}
const near = (a, b, msg) => assert.ok(Math.abs(Number(a) - Number(b)) < 0.006, `${msg}: got ${a}, expected ${b}`);
const code = (h) => h.replace(/\./g, '');
const itemOf = (s) => s.match(/U\.S\. note 20\((?:vvv|www)\)(?:\([ivx]+\))? item \(\d+\)/)[0];

test('fixture has the 206 page rows and 20 controls', () => {
  assert.equal(F.rows.length, 206);
  assert.equal(F.controls.length, 20);
});

test('exclusion rows: exclusion rate through 9 Nov, List duty from 10 Nov, cited to note 20 and FR Doc. 2025-21671', async () => {
  const rows = F.rows.filter((r) => r.kind === 'exclusion');
  const fails = [];
  for (const r of rows) {
    const c = code(r.hts);
    const [b, a] = [await rate(c, 'CN', BEFORE), await rate(c, 'CN', AFTER)];
    try {
      if (c === '3926909985') {   // named by note 20(vvv)(iv) items (10), (11) but not a line in HTSUS Rev. 22
        assert.equal(b.ok, false); assert.equal(a.ok, false); continue;
      }
      assert.ok(b.ok && a.ok, 'engine has the code');
      assert.equal(b.hts10, c, 'resolved to the exact statistical number');
      const xb = b.section_301_exclusion, xa = a.section_301_exclusion;
      assert.ok(xb && xa, 'exclusion block present');
      assert.equal(xb.status, 'in_force'); assert.equal(xa.status, 'ended');
      assert.match(xb.basis, /2025-21671/);
      assert.ok(xb.entries.some((e) => e.note === itemOf(r.source_note)), `cites ${itemOf(r.source_note)}`);
      const before = r.whole_number ? b.total_rate : xb.total_rate_if_excluded;
      if (r.whole_number) assert.equal(xb.whole_number, true);
      if (r.rate_before !== null && r.rate_before !== undefined) {
        near(before, r.rate_before, `${r.hts} before`);
        near(a.total_rate, r.rate_after, `${r.hts} after`);
      } else {
        near(a.total_rate - before, r.rise_pp, `${r.hts} rise (page had no engine rate)`);
      }
      near(b.cliff_total_rate, a.total_rate, `${r.hts} cliff = rate on 10 Nov`);
      assert.ok(a.layers.some((l) => l.heading === xa.entries[0].list_heading && l.rate === r.rise_pp && !l.excluded), 'List layer charged on 10 Nov');
    } catch (e) { fails.push(`${r.hts} [${r.source_note}]: ${e.message.split('\n')[0]}`); }
  }
  assert.deepEqual(fails, []);
});

test('maritime rows: +100% from 10 Nov; chassis "up to", cranes exact with 9903.92.10; proposed extension flagged', async () => {
  const fails = [];
  for (const r of F.rows.filter((x) => x.kind === 'maritime')) {
    const c = code(r.hts);
    const [b, a] = [await rate(c, 'CN', BEFORE), await rate(c, 'CN', AFTER)];
    const hd = r.program.match(/9903\.91\.1[24]/)[0];
    try {
      near(b.total_rate, r.rate_before, `${r.hts} before`);
      near(a.total_rate, r.rate_after, `${r.hts} after`);
      near(b.cliff_total_rate, r.rate_after, `${r.hts} cliff`);
      assert.ok(!b.layers.some((l) => l.heading === hd), `${hd} not charged on 9 Nov`);
      const L = a.layers.find((l) => l.heading === hd);
      assert.ok(L && L.rate === 100 && L.source_url.includes('hts.usitc.gov'), `${hd} +100% with ch. 99 source`);
      if (hd === '9903.91.12') { assert.equal(a.rate_qualifier, 'up_to'); assert.equal(b.cliff_rate_qualifier, 'up_to'); }
      else { assert.equal(a.rate_qualifier, null); assert.ok(a.layers.some((l) => l.heading === '9903.92.10' && l.rate === 25)); assert.ok(b.layers.some((l) => l.heading === '9903.92.10')); }
      assert.ok(a.depends_on_proposed.some((p) => /2026-21755/.test(p.basis) && p.status === 'proposed'), 'says the further suspension is only proposed');
    } catch (e) { fails.push(`${r.hts}: ${e.message.split('\n')[0]}`); }
  }
  assert.deepEqual(fails, []);
});

test('20 control codes do not change on 10 Nov', async () => {
  const fails = [];
  for (const k of F.controls) {
    const [b, a] = [await rate(k.hts, k.country, BEFORE), await rate(k.hts, k.country, AFTER)];
    try {
      near(b.total_rate, k.total, `${k.hts} ${k.country} 9 Nov`);
      near(a.total_rate, k.total, `${k.hts} ${k.country} 10 Nov`);
      near(b.cliff_total_rate, k.total, `${k.hts} ${k.country} cliff`);
      assert.ok(!b.layers.some((l) => l.excluded), 'no exclusion applied');
    } catch (e) { fails.push(e.message.split('\n')[0]); }
  }
  assert.deepEqual(fails, []);
});

test('query date validation', async () => {
  const r = await fetch(`${API}/rate?hts=6404112030&country=CN&as_of=11/10/2026`);
  assert.equal(r.status, 400);
});
