// Benchmark gap 3 (growth/benchmark-20261110.md): an unnamed article under an alias heading falls in the
// residual "Other" line, so that line is listed first when no line's own text matches the query.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _rankLines } from '../src/tools.js';

const head = 'Articles and equipment for general physical exercise, gymnastics or athletics';
const row = (hts10, leaf) => ({ hts10, description: leaf, full_description: head + ' ' + leaf });
const ex = [row('9506910010', 'Exercise cycles'), row('9506910020', 'Exercise rowing machines'), row('9506910030', 'Other')];
const phones = [row('8518301000', 'Line telephone handsets'), row('8518302000', 'Other')];

test('yoga mat: residual Other line first, not exercise cycles', () => {
  assert.equal(_rankLines(ex, 'yoga mat')[0].hts10, '9506910030');
});
test('wireless earbuds: residual Other line first, not line telephone handsets', () => {
  assert.equal(_rankLines(phones, 'wireless earbuds')[0].hts10, '8518302000');
});
test('a named article still ranks first and Other goes last', () => {
  const r = _rankLines(ex, 'rowing machine');
  assert.equal(r[0].hts10, '9506910020');
  assert.equal(r[r.length - 1].hts10, '9506910030');
});
test('telephone handset query keeps handsets first', () => {
  assert.equal(_rankLines(phones, 'telephone handset')[0].hts10, '8518301000');
});
