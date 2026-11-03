// Run 270: exclusion wording must switch to past tense from the cliff date (10 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exclusionsEnded, EXCLUSION_CLIFF_DATE } from '../src/tools.js';

test('exclusions not ended before the cliff date', () => {
  assert.equal(exclusionsEnded({ as_of: '2026-11-09', cliff_date: '2026-11-10' }), false);
  assert.equal(exclusionsEnded({ as_of: '2026-11-03' }), false);
});

test('exclusions ended on and after the cliff date', () => {
  assert.equal(exclusionsEnded({ as_of: '2026-11-10', cliff_date: '2026-11-10' }), true);
  assert.equal(exclusionsEnded({ as_of: '2027-01-01' }), true);
  assert.equal(EXCLUSION_CLIFF_DATE, '2026-11-10');
});
