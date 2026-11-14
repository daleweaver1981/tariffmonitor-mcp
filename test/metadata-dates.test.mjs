// Guard (scout Run 295, 14 Nov 2026): metadata that directories and skill crawlers ingest
// (package.json description, skills/*/SKILL.md) must state the same Section 301 exclusion end
// as the engine. LobeHub was still showing "the November 10, 2026 cliff" from stale metadata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXCLUSION_END_SHORT } from '../src/tools.js';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const skill = readFileSync(new URL('skills/us-import-tariff-lookup/SKILL.md', root), 'utf8');
const endDate = EXCLUSION_END_SHORT.match(/on (\d{1,2} [A-Z][a-z]{2} \d{4})/)[1];

test('package.json description states the engine exclusion end date', () => {
  assert.ok(pkg.description.includes(endDate), 'description lacks ' + endDate);
  assert.ok(!/EDT, 9 Nov 2026 per|press release says 10 Nov 2026/.test(pkg.description));
});

test('SKILL.md has no superseded Nov 2026 cliff wording', () => {
  assert.ok(!/November 10,? 2026|Nov 10,? 2026/.test(skill), 'SKILL.md still names the old 10 Nov 2026 cliff');
});

test('versions agree across package.json, server.json and the server', () => {
  const srv = JSON.parse(readFileSync(new URL('server.json', root), 'utf8'));
  const tools = readFileSync(new URL('src/tools.js', root), 'utf8');
  assert.equal(srv.version, pkg.version);
  assert.ok(srv.packages.every((p) => p.version === pkg.version));
  assert.ok(tools.includes('const VERSION = "' + pkg.version + '"'));
});
