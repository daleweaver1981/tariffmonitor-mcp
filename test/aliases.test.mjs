// Alias regressions: everyday product words must reach the right HTS heading, not a one-word fallback.
// Run: npm test. No network: matchAlias is pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchAlias } from '../src/aliases.js';

const cases = [
  // 2026-11-01: "vacuum bottle" fell through to "bottle" and returned dishwashing machinery 8422.20.
  ['vacuum bottle', '9617.00'],
  ['vacuum insulated tumbler', '9617.00'],
  ['stainless vacuum flask', '9617.00'],
  ['water bottle', '7323.93'],
  ['tumbler', '7323.93'],
  ['laptop', '8471.30'],
];

for (const [q, heading] of cases) {
  test(`alias: "${q}" -> ${heading}`, () => {
    const a = matchAlias(q);
    assert.ok(a, `no alias for "${q}"`);
    assert.equal(a.heading, heading);
  });
}
