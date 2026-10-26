// Network test: every canary line must match the live engine. Run with `npm run canary` (not part of `npm test`,
// which stays offline). Fails on the pre-26 Oct engine: 7323.93 CN gave 14.5 (no 232), 7615.10.20.15 CN gave 53.1
// (chapter rule 50%), 8418.10 had no 232, Brazil 6109 gave 29 (no Section 301 Brazil).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkLine } from '../scripts/tariff-canary.mjs';

const { lines } = JSON.parse(fs.readFileSync(new URL('./canary-lines.json', import.meta.url), 'utf8'));
for (const l of lines) {
  test(`canary ${l.hts} ${l.country} = ${l.total}%`, async () => {
    const r = await checkLine(l);
    assert.ok(r.ok, r.why);
  });
}
