// Scout Run 282 (10 Nov 2026): tool descriptions are what agents and directories read.
// They said maritime +100% "from 10 Nov 2026" and quoted a stale press-release date
// after FR Docs. 2026-22925/22867 moved both to 9 Jan 2027. Guard the class.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/tools.js', import.meta.url), 'utf8');
const descs = [...src.matchAll(/description:\s*'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]).join('\n');
test('no tool or parameter description presents 10 Nov 2026 as a future change date', () => {
  assert.doesNotMatch(descs, /from 10 Nov(ember)? 2026/i);
  assert.doesNotMatch(descs, /press release says November 10/i);
  assert.doesNotMatch(descs, /November 10, 2026 rate cliff/i);
});
test('maritime +100% headings are described as starting 10 Jan 2027', () => {
  assert.match(descs, /from 10 Jan 2027[^']*9903\.91\.14/);
});
