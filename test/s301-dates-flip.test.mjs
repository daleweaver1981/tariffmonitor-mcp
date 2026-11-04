// scripts/s301-dates-flip.mjs: which Federal Register notices flip the engine's Section 301 China dates (2026-11-04).
// The real notices are also run through it in dry-run mode: 2025-21671 and 2025-19873 (no later date: no change) and
// 2026-21755 (request for comments: never flips). These cases cover a final extension, which has not been published.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDoc, classify, throughDates } from '../scripts/s301-dates-flip.mjs';

const base = () => ({
  exclusions: { last_day: '2026-11-09', end_text: 'x', basis: 'FR Doc. 2025-21671', pending: [] },
  maritime: { suspended_through: '2026-11-09', end_text: 'y', basis: 'FR Doc. 2025-19873', status: 'final',
    pending: [{ status: 'proposed', would_suspend_through: '2027-01-09', basis: 'FR Doc. 2026-21755' }] },
  history: [],
});
const codes = ['8483509040', '8607211000', '8413919039', '9401710031'];
const doc = (title, n = '2026-99999') => ({ document_number: n, title, type: 'Notice', publication_date: '2026-11-06', html_url: 'https://www.federalregister.gov/d/' + n });

test('dates are read from "through 11:59 p.m. ... <Month D, YYYY>"', () => {
  assert.deepEqual(throughDates('extended through 11:59 p.m. eastern daylight time on May 31, 2027, and'), ['2027-05-31']);
  assert.deepEqual(throughDates('suspended through 11:59 p.m. Eastern Time on January 9, 2027.'), ['2027-01-09']);
});

test('requests for comments and proposals never flip', () => {
  assert.equal(classify(doc("Request for Comments on Further Suspension of Section 301 Action: China's Targeting of the Maritime, Logistics, and Shipbuilding Sectors")), null);
  assert.equal(classify({ ...doc('Notice of Proposed Action ... Maritime, Logistics, and Shipbuilding'), type: 'Proposed Rule' }), null);
});

test('final maritime suspension moves the start of 9903.91.12/.14 and resolves the proposal', () => {
  const d = base();
  const r = applyDoc(d, codes, doc("Notice of Further Suspension of Section 301 Action: China's Targeting of the Maritime, Logistics, and Shipbuilding Sectors"), 'is suspended through 11:59 p.m. Eastern Time on January 9, 2027.', '2026-11-06');
  assert.equal(r.changed, true);
  assert.equal(d.maritime.suspended_through, '2027-01-09');
  assert.equal(d.maritime.pending.length, 0);
  assert.ok(d.history.some((h) => h.field === 'maritime.suspended_through' && h.basis.includes('2026-99999')));
});

test('exclusion extension: named numbers move; global date only when >= 95% are named', () => {
  const d = base();
  const t = 'extend the exclusions through 11:59 p.m. eastern daylight time on May 31, 2027: (1) Grooved pulleys (described in statistical reporting number 8483.50.9040)';
  const r = applyDoc(d, codes, doc("Notice of Product Exclusion Extensions: China's Acts, Policies, and Practices Related to Technology Transfer"), t, '2026-11-06');
  assert.equal(r.changed, true);
  assert.equal(d.exclusions.per_code['8483509040'], '2027-05-31');
  assert.equal(d.exclusions.last_day, '2026-11-09');
  const d2 = base();
  applyDoc(d2, codes, doc("Notice of Product Exclusion Extensions: China's Acts, Policies, and Practices Related to Technology Transfer"), t + ' 8607.21.1000 8413.91.9039 9401.71.0031', '2026-11-06');
  assert.equal(d2.exclusions.last_day, '2027-05-31');
});

test('an extension naming none of our numbers changes nothing', () => {
  const d = base();
  const r = applyDoc(d, codes, doc("Notice of Product Exclusion Extensions: China's Acts, Policies, and Practices Related to Technology Transfer"), 'through 11:59 p.m. on May 31, 2027', '2026-11-06');
  assert.equal(r.changed, false);
  assert.equal(d.history.length, 0);
});
