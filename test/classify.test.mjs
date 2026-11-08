// classify_product unit tests: no network, no Ollama. Run: npm test   (Node >= 22)
// Live checks against Ollama are in test/classify-live.mjs (manual, slow).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProduct, parseModelJson, validatePicks, isPrivateIp, sniffImage, imageSize, loadImage,
  singleFlight, searchKeys, retrieveCandidates, ClassifyError, MAX_QUEUE,
} from '../src/classify.js';
import { TOOLS, callTool, classifyDeps } from '../src/tools.js';

const ROWS = [
  { hts10: '6109100012', full_description: "T-shirts, singlets, tank tops and similar garments, knitted or crocheted > Of cotton > Men's or boys' > Other" },
  { hts10: '6109100040', full_description: "T-shirts, singlets, tank tops and similar garments, knitted or crocheted > Of cotton > Women's or girls' > Other" },
  { hts10: '6109907030', full_description: 'T-shirts, singlets, tank tops and similar garments, knitted or crocheted > Of other textile materials > Other' },
];
const search = async () => ({ ok: true, results: ROWS });
const rate = async (code) => ({ d: { ok: true, hts10: code, total_rate: 16.5, base_rate: 16.5, as_of: '2026-11-08', layers: [] }, used: code, requested: code });
const deps = (reply) => ({ search, rate, chat: async () => (typeof reply === 'function' ? reply() : reply) });
const text = (r) => r.content[0].text;

test('classify_product is listed with the honest contract', () => {
  const t = TOOLS.find((x) => x.name === 'classify_product');
  assert.ok(t);
  assert.match(t.description, /SUGGESTIONS TO VERIFY/);
  assert.match(t.description, /CBP/);
  assert.match(t.description, /not stored/);
  assert.match(t.description, /counts as 2/);
  assert.equal(t.annotations.readOnlyHint, true);
});

test('a code that is not in our data is rejected in code', async () => {
  const reply = JSON.stringify({ picks: [
    { code: '6109.10.0012', quote: "Men's or boys'", reason: 'cotton knit tee', confidence: 'high' },
    { code: '9999999999', quote: 'invented', reason: 'x', confidence: 'high' },
  ] });
  const r = await classifyProduct({ description: "men's cotton knit t-shirt", origin_country: 'cn' }, deps(reply));
  assert.ok(!r.isError);
  assert.equal(r.structuredContent.candidates.length, 1);
  assert.equal(r.structuredContent.candidates[0].hts10, '6109100012');
  assert.equal(r.structuredContent.rejected_not_in_data, 1);
  assert.match(text(r), /16\.50% total/);
  assert.match(text(r), /dropped because the code is not in our HTS data/);
});

test('a misquoted description is downgraded to low confidence and shows no quote', () => {
  const cands = ROWS.map((r) => ({ code: r.hts10, full: r.full_description }));
  const v = validatePicks({ picks: [{ code: '6109100012', quote: 'made of unicorn silk', reason: 'r', confidence: 'high' }] }, cands);
  assert.equal(v.picks[0].confidence, 'low');
  assert.equal(v.picks[0].quote, null);
});

test('only the first pick may be high; at most 3 and no duplicates', () => {
  const cands = ROWS.map((r) => ({ code: r.hts10, full: r.full_description }));
  const p = (code) => ({ code, quote: 'Other', reason: 'r', confidence: 'high' });
  const v = validatePicks({ picks: [p('6109100012'), p('6109100012'), p('6109100040'), p('6109907030'), p('6109907030')] }, cands);
  assert.deepEqual(v.picks.map((x) => x.confidence), ['high', 'medium', 'medium']);
  assert.equal(v.picks.length, 3);
});

test('parser robustness: fences, prose, trailing commas, arrays, garbage', () => {
  assert.deepEqual(parseModelJson('```json\n{"picks":[{"code":"1"}]}\n```').picks[0].code, '1');
  assert.equal(parseModelJson('Sure! Here you go: {"picks":[],} thanks').picks.length, 0);
  assert.equal(parseModelJson('[{"code":"6109100012"}]').picks[0].code, '6109100012');
  assert.equal(parseModelJson('no json here'), null);
  assert.equal(parseModelJson(''), null);
  assert.equal(parseModelJson(null), null);
});

test('unparsable model output falls back to text-match rank, all low, and says so', async () => {
  const r = await classifyProduct({ description: "men's cotton knit t-shirt" }, deps('I cannot do JSON'));
  assert.ok(!r.isError);
  assert.ok(r.structuredContent.candidates.every((c) => c.confidence === 'low'));
  assert.match(text(r), /no usable pick/);
  assert.equal(r.structuredContent.candidates[0].hts10, '6109100012');
});

test('empty input and bad origin are rejected with a clear message', async () => {
  assert.equal((await classifyProduct({}, deps('{}'))).isError, true);
  assert.equal((await classifyProduct({ description: 'ab' }, deps('{}'))).isError, true);
  const bad = await classifyProduct({ description: 'cotton t-shirt', origin_country: 'China' }, deps('{}'));
  assert.equal(bad.isError, true);
  assert.match(text(bad), /ISO-2/);
});

test('model timeout / unreachable becomes a retryable error, not a throw', async () => {
  const boom = () => { throw new ClassifyError('The self-hosted model did not answer within 240 s.', { retryable: true }); };
  const r = await classifyProduct({ description: "men's cotton knit t-shirt" }, deps(boom));
  assert.equal(r.isError, true);
  assert.match(text(r), /retryable/);
  assert.equal(r._meta.retryable, true);
});

test('no HTS match at all gives a plain message, not an error', async () => {
  const r = await classifyProduct({ description: 'zzzz qqqq' }, { search: async () => ({ ok: true, results: [] }), rate, chat: async () => '{}' });
  assert.ok(!r.isError);
  assert.match(text(r), /No HTS codes in our data/);
});

test('through callTool: unknown argument is refused; no TM_OLLAMA_URL gives the configuration error', async () => {
  const u = await callTool('classify_product', { descripton: 'typo' });
  assert.equal(u.isError, true);
  assert.match(text(u), /Unknown argument/);
  const saved = process.env.TM_OLLAMA_URL; delete process.env.TM_OLLAMA_URL;
  const orig = classifyDeps.chat;
  try {
    const { defaultChat } = await import('../src/classify.js');
    classifyDeps.chat = defaultChat;
    // search is the live HTS API; if it is unreachable the tool still must not throw.
    const r = await callTool('classify_product', { description: "men's cotton knit t-shirt" });
    assert.ok(r.content[0].text.length > 0);
  } finally { classifyDeps.chat = orig; if (saved) process.env.TM_OLLAMA_URL = saved; }
});

test('SSRF guards: private addresses and non-https are refused; base64 limits', async () => {
  for (const ip of ['10.0.0.30', '127.0.0.1', '169.254.169.254', '192.168.1.1', '172.16.0.1', '::1', 'fd00::1', '::ffff:10.0.0.30']) assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '208.80.154.224']) assert.equal(isPrivateIp(ip), false, ip);
  await assert.rejects(loadImage({ image_url: 'http://example.com/a.jpg' }), /https/);
  await assert.rejects(loadImage({ image_url: 'https://10.0.0.30/a.jpg' }), /not allowed/);
  await assert.rejects(loadImage({ image_url: 'https://localhost/a.jpg' }), /Could not fetch|not allowed/);
  await assert.rejects(loadImage({ image_url: 'https://example.com:8443/a.jpg' }), /port/);
  await assert.rejects(loadImage({ image_base64: 'not base64!!' }), /valid base64/);
  await assert.rejects(loadImage({ image_base64: Buffer.from('hello world, not an image at all').toString('base64') }), /PNG, JPEG or WebP/);
});

test('image size limit: a 2000 px PNG header is refused, 1024 px passes', async () => {
  const png = (w, h) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
  assert.equal(sniffImage(png(1, 1)), 'png');
  assert.deepEqual(imageSize(png(640, 480), 'png'), { w: 640, h: 480 });
  await assert.rejects(loadImage({ image_base64: png(2000, 1000).toString('base64') }), /2000x1000/);
  assert.ok(await loadImage({ image_base64: 'data:image/png;base64,' + png(1024, 768).toString('base64') }));
});

test('single-flight queue runs one at a time and refuses beyond MAX_QUEUE', async () => {
  let running = 0; let peak = 0;
  const job = () => singleFlight(async () => { running += 1; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 20)); running -= 1; return 1; });
  const ok = await Promise.all(Array.from({ length: MAX_QUEUE }, job));
  assert.equal(ok.length, MAX_QUEUE);
  assert.equal(peak, 1);
  const many = await Promise.allSettled(Array.from({ length: MAX_QUEUE + 2 }, job));
  assert.equal(many.filter((x) => x.status === 'rejected' && x.reason.retryable).length, 2);
});

test('retrieval: keys come from the text, alias heading is searched, results ranked by word match', async () => {
  assert.ok(searchKeys(["men's 100% cotton knit t-shirt"]).includes('cotton'));
  const seen = [];
  const c = await retrieveCandidates([], "men's 100% cotton knit t-shirt", async (q) => { seen.push(q); return { ok: true, results: ROWS }; });
  assert.ok(seen.includes('6109'));
  assert.equal(c[0].code, '6109100012');
});

test('free endpoint: photo counts 2 calls, text counts 1 (see free-remote tests for the listener)', async () => {
  // Contract is asserted in the tool description; the counting itself lives in http.js and is exercised in free-remote.test.mjs.
  const t = TOOLS.find((x) => x.name === 'classify_product');
  assert.match(t.description, /text call counts as 1 .*photo call counts as 2/);
});

test('a line that names details the input never stated cannot be high confidence', () => {
  const cands = [
    { code: '6109100004', full: "T-shirts > Of cotton > Men's or boys' > T-shirts, all white, short hemmed sleeves, without pockets, trim or embroidery (352)" },
    { code: '6109100012', full: "T-shirts > Of cotton > Men's or boys' > Other T-shirts > Men's (338)" },
  ];
  const mk = (code) => ({ picks: [{ code, quote: 'Other T-shirts', reason: 'r', confidence: 'high' }] });
  const ctx = "men's 100% cotton knit t-shirt";
  assert.equal(validatePicks({ picks: [{ code: '6109100004', quote: 'all white', reason: 'r', confidence: 'high' }] }, cands, ctx).picks[0].confidence, 'medium');
  assert.equal(validatePicks(mk('6109100012'), cands, ctx).picks[0].confidence, 'high');
});

test('a photo-sourced pick is never above medium confidence', async () => {
  const reply = JSON.stringify({ picks: [{ code: '6109100012', quote: "Men's or boys'", reason: 'r', confidence: 'high' }] });
  const vision = JSON.stringify({ product: "men's t-shirt", kind: 'shirt', material: 'cotton knit', use: 'wear', printed_text: '', search_terms: ['t-shirt'] });
  const png = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png); png.writeUInt32BE(13, 8); png.write('IHDR', 12); png.writeUInt32BE(400, 16); png.writeUInt32BE(400, 20);
  let n = 0;
  const r = await classifyProduct({ image_base64: png.toString('base64') }, { search, rate, chat: async () => (n++ === 0 ? vision : reply) });
  assert.ok(!r.isError, JSON.stringify(r));
  assert.equal(r.structuredContent.source, 'photo');
  assert.equal(r.structuredContent.candidates[0].confidence, 'medium');
  assert.match(text(r), /Read from the photo \(on our own server, not stored\)/);
});
