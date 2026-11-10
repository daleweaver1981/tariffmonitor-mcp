// 2026-11-10 regression: classify_product put "Stainless steel vacuum-insulated drinking bottle ... with screw cap" in
// 6505.00 (hats). Hyphens must match as spaces, and "cap" on a container must never mean headwear.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchAlias } from '../src/aliases.js';
const h = (q) => (matchAlias(q) || {}).heading || null;
test('hyphenated words match their spaced alias', () => {
  assert.equal(h('Stainless steel vacuum-insulated drinking bottle, 750 ml, with screw cap'), '9617.00');
  assert.equal(h('vacuum-insulated tumbler'), '9617.00');
  assert.equal(h('t-shirt'), '6109');
});
test('a cap on a container is not headwear', () => {
  for (const q of ['glass jar with screw cap', 'water bottle with screw cap', 'pen with cap', 'tube with flip cap']) assert.notEqual(h(q), '6505.00', q);
  assert.equal(h('baseball cap'), '6505.00');
  assert.equal(h('knit beanie'), '6505.00');
});
test('drinking bottle is a known everyday word', () => {
  assert.equal(h('drinking bottle'), '7323.93');
});
