// 2026-11-06: when the API gives no rate, the tool repeats its reason. An engine failure must not read as "code not in
// the schedule", and a rejected origin must not read as "could not reach the API". Offline: fetch is stubbed.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { callTool } from '../src/tools.js';

const real = globalThis.fetch;
afterEach(() => { globalThis.fetch = real; });
const stub = (status, body) => { globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); };
const text = (r) => r.content[0].text;
const INTERNAL = 'Rate not available: the calculator could not compute this code, origin and date because of an internal error.';

test('engine failure is reported as such, by both rate tools', async () => {
  stub(200, { ok: false, code: 'rate_not_available', error: INTERNAL });
  for (const [tool, args] of [['calculate_tariff', { hts_code: '8483509040', origin_country: 'CN' }], ['compare_origins', { hts_code: '8483509040', origin_countries: ['CN', 'VN'] }]]) {
    const r = await callTool(tool, args);
    assert.equal(r.isError, true);
    assert.match(text(r), /internal error/);
    assert.doesNotMatch(text(r), /not in the current US schedule/);
  }
});

test('a rejected origin shows the API reason, not an outage', async () => {
  stub(400, { ok: false, error: 'country XX is not an ISO 3166-1 alpha-2 country code, so no origin-specific rate can be given' });
  const r = await callTool('calculate_tariff', { hts_code: '8483509040', origin_country: 'XX' });
  assert.equal(r.isError, true);
  assert.match(text(r), /country XX is not/);
  assert.doesNotMatch(text(r), /Could not reach/);
});

test('a code that is not in the schedule keeps its message; a real outage still reads as one', async () => {
  stub(200, { ok: false, error: 'HTS code not found in current schedule' });
  assert.match(text(await callTool('calculate_tariff', { hts_code: '9999999999', origin_country: 'CN' })), /not in the current US schedule/);
  stub(502, {});
  assert.match(text(await callTool('calculate_tariff', { hts_code: '8483509040', origin_country: 'CN' })), /Could not reach/);
});
