// Photo path is gated off by default (TM_CLASSIFY_PHOTOS); these tests cover it as it behaves when enabled.
import "./_photos-on.mjs";
// Free-endpoint quota for classify_product: text = 1 call, photo = 2 calls. Own server instance; no network, no model.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-cq-'));
const KEYED = 21000 + Math.floor(Math.random() * 1000);
const FREE = KEYED + 1000;
let child;
before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, 'src/http.js')], {
    env: { ...process.env, PORT: String(KEYED), HOST: '127.0.0.1', FREE_HOST: '127.0.0.1', FREE_PORT: String(FREE),
      FREE_PER_IP_DAY: '3', FREE_GLOBAL_DAY: '100', FREE_STATE: path.join(TMP, 'limits.json'), TM_OLLAMA_URL: 'http://127.0.0.1:1',
      FUNNEL_DB: path.join(TMP, 'funnel.db'), CALL_LOG: path.join(TMP, 'calls.jsonl'), VOIDNET_PUBLISHER_KEY: 'test-key-not-real' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${FREE}/health`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});
after(() => { child?.kill(); fs.rmSync(TMP, { recursive: true, force: true }); });

const cp = (ip, id, args) => fetch(`http://127.0.0.1:${FREE}/mcp-free`, { method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip },
  body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'classify_product', arguments: args } }) });

test('photo = 2 calls, text = 1 call; third-call photo is refused with the 2-call wording', async () => {
  const ip = '203.0.113.90';
  assert.equal((await cp(ip, 1, { image_base64: 'AAAA' })).status, 200); // 2 used (image rejected locally)
  assert.equal((await cp(ip, 2, { description: '' })).status, 200);     // 3 used
  assert.equal((await cp(ip, 3, { description: '' })).status, 429);     // limit 3
  const ip2 = '203.0.113.91';
  assert.equal((await cp(ip2, 4, {})).status, 200);                      // 1 used
  assert.equal((await cp(ip2, 5, {})).status, 200);                      // 2 used
  const r = await cp(ip2, 6, { image_base64: 'AAAA' });                  // needs 2, 1 left
  assert.equal(r.status, 429);
  assert.match((await r.json()).error.message, /counts as 2/);
});

test('Ollama unreachable gives a retryable error through the real HTTP path', async () => {
  const r = await cp('203.0.113.92', 7, { description: "men's 100% cotton knit t-shirt" });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.result.isError, true);
  assert.match(j.result.content[0].text, /unreachable|did not answer|HTS data|retryable/);
});
