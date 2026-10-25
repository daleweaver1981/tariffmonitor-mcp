// Smoke tests for src/http.js: the keyless /mcp-free listener (limits, MCP handshake, error text)
// and the keyed /mcp listener (unchanged: 401 without key, server/discover with key).
// Run: npm test   (Node >= 22). No network: tools/call uses an input the tool rejects locally.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-test-'));
const KEYED = 18000 + Math.floor(Math.random() * 1000);
const FREE = KEYED + 1000;
let child;

before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, 'src/http.js')], {
    env: { ...process.env, PORT: String(KEYED), HOST: '127.0.0.1', FREE_HOST: '127.0.0.1', FREE_PORT: String(FREE),
      FREE_PER_IP_DAY: '2', FREE_GLOBAL_DAY: '3', FREE_STATE: path.join(TMP, 'limits.json'),
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

const rpc = (port, p, body, headers = {}) => fetch(`http://127.0.0.1:${port}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
  body: JSON.stringify(body) });
const call = (ip, id) => rpc(FREE, '/mcp-free', { jsonrpc: '2.0', id, method: 'tools/call',
  params: { name: 'lookup_hts_code', arguments: { query: 'x' } } }, { 'X-Real-IP': ip });

test('initialize negotiates a standard protocol version', async () => {
  const r = await rpc(FREE, '/mcp-free', { jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.result.protocolVersion, '2025-06-18');
  assert.equal(j.result.serverInfo.version, '1.3.2');
  assert.equal((await rpc(FREE, '/mcp-free', { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
});

test('tools/list serves the three tools with both exclusion-end wordings', async () => {
  const j = await (await rpc(FREE, '/mcp-free', { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
  assert.deepEqual(j.result.tools.map((t) => t.name), ['lookup_hts_code', 'calculate_tariff', 'compare_origins']);
  const co = j.result.tools.find((t) => t.name === 'compare_origins').description;
  assert.match(co, /9 Nov 2026/); assert.match(co, /10 Nov 2026/); assert.match(co, /2025-21671/);
});

test('GET is 405, unknown path is 404', async () => {
  assert.equal((await fetch(`http://127.0.0.1:${FREE}/mcp-free`)).status, 405);
  assert.equal((await rpc(FREE, '/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/list' })).status, 404);
});

test('per-IP limit, then global limit, with a pointer to npm and Voidnet', async () => {
  assert.equal((await call('203.0.113.5', 10)).status, 200);
  assert.equal((await call('203.0.113.5', 11)).status, 200);
  const over = await call('203.0.113.5', 12);
  assert.equal(over.status, 429);
  const j = await over.json();
  assert.equal(j.error.code, -32000);
  assert.equal(j.error.data.scope, 'per-ip');
  assert.match(j.error.message, /npx -y tariffmonitor-mcp/);
  assert.match(j.error.message, /openvoidnet\.com/);
  assert.ok(Number(over.headers.get('retry-after')) > 0);
  assert.equal((await call('203.0.113.6', 13)).status, 200); // 3rd call overall = global cap
  const g = await (await call('203.0.113.7', 14)).json();
  assert.equal(g.error.data.scope, 'global');
});

test('free calls are logged tagged free-remote', async () => {
  const lines = fs.readFileSync(path.join(TMP, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(lines.some((l) => l.endpoint === 'free-remote' && l.tool === 'lookup_hts_code' && l.status === 200));
  assert.ok(lines.some((l) => l.endpoint === 'free-remote' && l.limited === 'per-ip'));
});

test('keyed /mcp is unchanged: 401 without key, discover with key', async () => {
  const no = await rpc(KEYED, '/mcp', { jsonrpc: '2.0', id: 20, method: 'tools/list' });
  assert.equal(no.status, 401);
  const ok = await rpc(KEYED, '/mcp', { jsonrpc: '2.0', id: 21, method: 'server/discover' }, { Authorization: 'Bearer test-key-not-real' });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).result.supportedVersions, ['2026-07-28']);
  const init = await rpc(KEYED, '/mcp', { jsonrpc: '2.0', id: 22, method: 'initialize' }, { Authorization: 'Bearer test-key-not-real' });
  assert.equal(init.status, 400);
});

test("tools/list: every tool has a title and explicit read-only annotations (directory requirement)", async () => {
  const r = await rpc(FREE, "/mcp-free", { jsonrpc: "2.0", id: 99, method: "tools/list" });
  const { result } = await r.json();
  assert.equal(result.tools.length, 3);
  for (const t of result.tools) {
    assert.ok(t.title && t.title.length > 3, t.name + " title");
    assert.deepEqual(t.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }, t.name);
  }
});
