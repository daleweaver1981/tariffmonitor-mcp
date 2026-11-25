// 2026-11-24 (ceo-due #585): "LED strip lights" fell to the keyword "lights" and led with flashlights (8513.10).
// LED strips have no single settled heading: the alias is marked ambiguous and lists 9405.42 and 8539.51 as equal candidates.
// No network: matchAlias is pure.
import * as nt from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/aliases.js';

const isStrip = (q) => assert.ok(A.matchAlias(q) && A.matchAlias(q).heading === '9405.42' && A.matchAlias(q).ambiguous
  && A.matchAlias(q).alts.map((x) => x.heading).join() === '8539.51' && !/no CBP ruling/i.test(A.matchAlias(q).ambiguous), q);
for (const q of ['LED strip lights', 'led light strips', 'LED tape', 'LED strip lighting', 'LED ribbon lights 5m'])
  nt.test('led strip alias: ' + q, () => isStrip(q));

for (const pair of [['led bulb', '8539.52'], ['flashlight', '8513.10'], ['light fixture', '9405'], ['floor lamp', '9405']])
  nt.test('neighbour alias unchanged: ' + pair[0], () => assert.equal(A.matchAlias(pair[0]).heading, pair[1]));

for (const q of ['power strip', 'strip'])
  nt.test('not captured: ' + q, () => assert.equal(A.matchAlias(q), null));
