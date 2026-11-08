// classify_product: a product photo or an invoice line -> up to 3 candidate HTS-10 codes.
//
// Gap closed: tariff MCP servers (npm registry descriptions checked 7 Nov 2026) offer code lookup, description
// search and duty maths; none describes classifying a product from a photo or an invoice line.
// Design: classification from what the importer actually holds, grounded in OUR HTS data plus the stacked
// 2026 rates, and read on our own server (self-hosted Ollama), so product photos never reach an outside AI.
//
// Pipeline (every model call goes through ONE single-flight queue, because the CPU is shared):
//   1. photo -> self-hosted vision model reads what the product is, its material, use and printed text.
//   2. candidates come ONLY from our HTS search (the API behind lookup_hts_code), never from the model.
//   3. a self-hosted model picks and ranks among those candidates and must quote their description.
//      Any code that is not in the retrieved set is rejected here, in code.
//   4. duty for an optional origin comes from the existing rate logic (fetchRate), passed in as a dependency.
import dns from 'node:dns';
import https from 'node:https';
import net from 'node:net';
import { matchAlias } from './aliases.js';

const CFG = () => ({
  url: (process.env.TM_OLLAMA_URL || '').replace(/\/+$/, ''),
  visionModel: process.env.TM_VISION_MODEL || 'gemma4:e2b',
  pickModel: process.env.TM_PICK_MODEL || 'gpt-oss:20b',
  timeoutMs: Number(process.env.TM_OLLAMA_TIMEOUT_MS || 240000),
});

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 1024;
export const MAX_QUEUE = 3;
const UA = 'tariffmonitor-mcp/1.6 (+https://adcreator-ai.com/tariffs/calculator; classify_product image fetch)';

export class ClassifyError extends Error {
  constructor(message, { retryable = false } = {}) { super(message); this.retryable = retryable; }
}

// ---- single-flight queue -------------------------------------------------------------------------
let tail = Promise.resolve();
let waiting = 0;
export function singleFlight(fn) {
  if (waiting >= MAX_QUEUE) {
    return Promise.reject(new ClassifyError(`The classifier is busy (${waiting} requests ahead). Retry in a minute.`, { retryable: true }));
  }
  waiting += 1;
  const run = tail.then(fn, fn);
  tail = run.then(() => {}, () => {});
  return run.finally(() => { waiting -= 1; });
}

// ---- Ollama --------------------------------------------------------------------------------------
async function ollamaChat({ model, prompt, images, think, numPredict = 900 }, cfg = CFG()) {
  if (!cfg.url) {
    throw new ClassifyError('classify_product needs a self-hosted Ollama server: set TM_OLLAMA_URL (for example http://localhost:11434) with a vision model such as gemma4:e2b and a text model such as gpt-oss:20b. The hosted tariffmonitor endpoints have it configured.');
  }
  return singleFlight(async () => {
    const body = {
      model, stream: false, format: 'json', think: think ?? (model.startsWith('gpt-oss') ? 'low' : false),
      options: { temperature: 0, num_ctx: 8192, num_predict: numPredict },
      messages: [{ role: 'user', content: prompt, ...(images?.length ? { images } : {}) }],
    };
    let res;
    try {
      res = await fetch(cfg.url + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(cfg.timeoutMs) });
    } catch (e) {
      const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
      throw new ClassifyError(timedOut
        ? `The self-hosted model did not answer within ${Math.round(cfg.timeoutMs / 1000)} s (the server is shared and may be busy). Retry in a minute; lookup_hts_code and calculate_tariff still work.`
        : 'The self-hosted model server is unreachable right now. Retry in a minute; lookup_hts_code and calculate_tariff still work.', { retryable: true });
    }
    if (!res.ok) throw new ClassifyError(`The self-hosted model server answered HTTP ${res.status}. Retry in a minute.`, { retryable: true });
    let j;
    try { j = await res.json(); } catch { throw new ClassifyError('The self-hosted model server sent an unreadable reply. Retry in a minute.', { retryable: true }); }
    const text = j?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new ClassifyError('The self-hosted model returned an empty answer. Retry in a minute.', { retryable: true });
    return text;
  });
}

// Tolerant JSON extraction: code fences, prose around the object, trailing commas.
export function parseModelJson(s) {
  if (typeof s !== 'string') return null;
  let t = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const tryParse = (x) => { try { return JSON.parse(x); } catch { try { return JSON.parse(x.replace(/,\s*([}\]])/g, '$1')); } catch { return null; } } };
  let v = tryParse(t);
  if (Array.isArray(v)) return { picks: v };
  if (v && typeof v === 'object') return v;
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { v = tryParse(t.slice(a, b + 1)); if (v && typeof v === 'object') return v; }
  const a2 = t.indexOf('['); const b2 = t.lastIndexOf(']');
  if (a2 >= 0 && b2 > a2) { v = tryParse(t.slice(a2, b2 + 1)); if (Array.isArray(v)) return { picks: v }; }
  return null;
}

// ---- image loading (SSRF-safe) ---------------------------------------------------------------------
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1' || x.startsWith('fe80') || x.startsWith('fc') || x.startsWith('fd')) return true;
    const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivateIp(m[1]) : false;
  }
  return true;
}

export function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export function imageSize(buf, kind) {
  try {
    if (kind === 'png') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (kind === 'jpeg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const m = buf[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (kind === 'webp') {
      const f = buf.toString('ascii', 12, 16);
      if (f === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (f === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (f === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
    }
  } catch { /* fall through */ }
  return null;
}

function checkImage(buf) {
  const kind = sniffImage(buf);
  if (!kind) throw new ClassifyError('The image must be a PNG, JPEG or WebP file.');
  if (buf.length > MAX_IMAGE_BYTES) throw new ClassifyError(`The image is ${(buf.length / 1048576).toFixed(1)} MB; the limit is ${MAX_IMAGE_BYTES / 1048576} MB. Send a copy no larger than ${MAX_IMAGE_SIDE}px on its long side.`);
  const sz = imageSize(buf, kind);
  if (sz && (sz.w > MAX_IMAGE_SIDE || sz.h > MAX_IMAGE_SIDE)) {
    throw new ClassifyError(`The image is ${sz.w}x${sz.h}px; the limit is ${MAX_IMAGE_SIDE}px on the long side. Send a downscaled copy.`);
  }
  return buf;
}

function safeLookup(hostname, opts, cb) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = addrs.filter((a) => !isPrivateIp(a.address));
    if (!ok.length || ok.length !== addrs.length) return cb(new Error('blocked address'));
    if (opts && opts.all) return cb(null, ok);
    return cb(null, ok[0].address, ok[0].family);
  });
}

function fetchOnce(u) {
  return new Promise((resolve, reject) => {
    const req = https.get({ hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, lookup: safeLookup,
      headers: { 'User-Agent': UA, Accept: 'image/png,image/jpeg,image/webp' }, timeout: 20000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve({ redirect: res.headers.location }); }
      if (res.statusCode !== 200) { res.resume(); return reject(new ClassifyError(`The image URL answered HTTP ${res.statusCode}.`)); }
      const chunks = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n > MAX_IMAGE_BYTES) { req.destroy(); reject(new ClassifyError(`The image is larger than ${MAX_IMAGE_BYTES / 1048576} MB. Send a copy no larger than ${MAX_IMAGE_SIDE}px.`)); } else chunks.push(c); });
      res.on('end', () => resolve({ buf: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new ClassifyError('The image URL timed out.')); });
    req.on('error', (e) => reject(e instanceof ClassifyError ? e : new ClassifyError('Could not fetch the image URL (' + (e.message === 'blocked address' ? 'address not allowed' : 'network error') + ').')));
  });
}

export async function loadImage({ image_url, image_base64 }) {
  if (process.env.TM_CLASSIFY_PHOTOS !== '1') throw new ClassifyError('Photo classification is not available yet. Send a product description or invoice line instead.');
  if (image_base64) {
    const raw = String(image_base64).replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
    if (raw.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8) throw new ClassifyError(`The image is larger than ${MAX_IMAGE_BYTES / 1048576} MB.`);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw new ClassifyError('image_base64 is not valid base64.');
    return checkImage(Buffer.from(raw, 'base64'));
  }
  let u;
  try { u = new URL(String(image_url)); } catch { throw new ClassifyError('image_url is not a valid URL.'); }
  for (let hop = 0; hop < 4; hop++) {
    if (u.protocol !== 'https:') throw new ClassifyError('image_url must be an https URL.');
    if (u.username || u.password || (u.port && u.port !== '443')) throw new ClassifyError('image_url must not carry credentials or a custom port.');
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && isPrivateIp(u.hostname.replace(/^\[|\]$/g, ''))) throw new ClassifyError('image_url address is not allowed.');
    const r = await fetchOnce(u);
    if (r.buf) return checkImage(r.buf);
    try { u = new URL(r.redirect, u); } catch { throw new ClassifyError('The image URL redirected somewhere invalid.'); }
  }
  throw new ClassifyError('The image URL redirected too many times.');
}

// ---- retrieval from OUR HTS data -----------------------------------------------------------------------
const STOP = new Set(('the and for with without from this that made new set pack pcs piece pieces unit units each per lot assorted '
  + 'item items product products size sizes color colour colors colours black white red blue green large small medium xl xxl qty '
  + 'mens womens men women boys girls kids adult adults style type model brand logo print printed design designed').split(' '));
const RANK_SYN = { mens: 'men', man: 'men', womens: 'women', woman: 'women', boys: 'men', childrens: 'child', kids: 'child', children: 'child' };

export function wordsOf(text) {
  return String(text || '').toLowerCase().replace(/(\d)%/g, '$1 percent ').split(/[^a-z]+/).filter((w) => w.length >= 3);
}

// 2026-11-08 (live call): for "men's 100% cotton knit t-shirt" the model wrote "the material (cotton) is not specified in
// the description". A reason must never claim the input lacks something the input states. Drop any clause that calls a
// word missing/unspecified when that word (stemmed) is in the input; if nothing is left, use a neutral line.
const MATERIALS = new Set(('cotton polyester nylon wool silk linen rayon viscose acrylic spandex elastane leather '
  + 'plastic polyethylene polypropylene pvc rubber silicone steel stainles iron aluminum aluminium copper brass zinc '
  + 'glass ceramic porcelain wood bamboo paper cardboard') .split(' '));
const ABSENT_RE = /\b(not (?:specified|stated|mentioned|provided|given|indicated)|unspecified|missing|lacks?|absent)\b/i;
export function honestReason(reason, ctx) {
  if (!reason || !ctx || !ctx.size) return reason;
  const parts = reason.split(/(?<=[.;])\s+|,\s*(?=but\b)|\s+but\s+/i);
  const kept = parts.filter((cl) => {
    if (!ABSENT_RE.test(cl)) return true;
    const words = wordsOf(cl).map(stem).filter((w) => w.length >= 4 && !STOP.has(w));
    if (words.some((w) => ctx.has(w))) return false;
    // "material not specified" when the input names a material (cotton, steel, plastic ...) is also false.
    if (/\bmaterial|fabric|fib(?:re|er)\b/i.test(cl) && [...ctx].some((w) => MATERIALS.has(w))) return false;
    return true;
  });
  const out = kept.join(' ').replace(/\s+/g, ' ').replace(/^[,;\s]+|[,;\s]+$/g, '').trim();
  if (!out) return 'Matches the wording of your input; see the quoted description.';
  return /[.!?]$/.test(out) ? out : out + '.';
}
const stem = (w) => (RANK_SYN[w] || w.replace(/ies$/, 'y').replace(/s$/, ''));

export function searchKeys(terms) {
  const keys = []; const seen = new Set();
  for (const t of terms) {
    const ws = wordsOf(t).filter((w) => !STOP.has(w) && w !== 'percent');
    for (const w of ws.reverse()) { const k = stem(w); if (k.length >= 3 && !seen.has(k)) { seen.add(k); keys.push(k); } }
  }
  return keys.slice(0, 7);
}

export async function retrieveCandidates(terms, ctxText, search) {
  const pool = new Map();
  const aliasPrefixes = [];
  for (const t of [ctxText, ...terms]) {
    const a = t ? matchAlias(t) : null;
    if (a) { aliasPrefixes.push(a.prefix, ...(a.alts || []).map((x) => x.prefix)); }
  }
  const prefixes = [...new Set(aliasPrefixes)];
  const qs = [...prefixes, ...searchKeys([ctxText, ...terms].filter(Boolean))];
  const results = await Promise.all(qs.map(async (q) => {
    try { const r = await search(q); return { q, rows: r && r.ok ? (r.results || []) : [] }; } catch (e) { return { q, rows: [], err: e }; }
  }));
  if (results.length && results.every((x) => x.err)) throw new ClassifyError('The HTS data service is unreachable right now. Retry in a minute.', { retryable: true });
  const qwords = [...new Set(wordsOf([ctxText, ...terms].join(' ')).map(stem))].filter((w) => !STOP.has(w));
  for (const { q, rows } of results) {
    for (const r of rows) {
      const code = String(r.hts10 || '');
      if (!/^\d{10}$/.test(code)) continue;
      const full = String(r.full_description || (Array.isArray(r.description_path) ? r.description_path.join(' > ') : r.description || '')).replace(/<[^>]+>/g, '');
      const cur = pool.get(code) || { code, full, viaPrefix: false, hits: 0 };
      cur.hits += 1;
      if (prefixes.includes(q)) cur.viaPrefix = true;
      pool.set(code, cur);
    }
  }
  const lower = (s) => s.toLowerCase();
  const scored = [...pool.values()].map((c) => {
    const d = lower(c.full);
    let s = c.viaPrefix ? 3 : 0;
    for (const w of qwords) if (new RegExp('(^|[^a-z])' + w).test(d)) s += 2;
    if (/(^|> )other\b/.test(d)) s -= 1;
    return { ...c, score: s };
  });
  scored.sort((a, b) => b.score - a.score || (a.code < b.code ? -1 : 1));
  return scored.slice(0, 24);
}

// ---- model prompts ---------------------------------------------------------------------------------------
const VISION_PROMPT = 'Look at this product photo and report ONLY what you can see. Reply with JSON: '
  + '{"product":"the everyday name a shopper would use for the item, 1-4 words, for example water bottle, t-shirt, USB-C cable, desk lamp","kind":"one word for the type of object","material":"what it appears to be made of (for example stainless steel, cotton knit, plastic, glass), else empty","use":"what it is used for","printed_text":"any readable printed text, brand or model, else empty","search_terms":["2 to 5 short nouns or noun phrases a customs schedule might use, most specific first"]}. '
  + 'Do not guess a tariff code. If a detail is not visible, leave it empty. Name the object itself, not its surroundings.';

function pickPrompt(text, photo, cands) {
  // Candidates under one heading repeat the same long path: print the shared prefix once.
  const paths = cands.map((c) => c.full.split(' > '));
  let k = 0;
  while (paths.every((p) => p.length > k + 1 && p[k] === paths[0][k])) k += 1;
  const shared = paths[0].slice(0, k).join(' > ');
  return 'You help classify goods under the US Harmonized Tariff Schedule. Choose up to 3 candidates for the product below, '
    + 'ONLY from the numbered list. Never output a code that is not in the list.\n\n'
    + `PRODUCT (user text): ${text || '(none, see photo reading)'}\n`
    + (photo ? `PHOTO READING (by a small vision model, may be wrong): product=${photo.product || ''}; material=${photo.material || ''}; use=${photo.use || ''}; printed text=${photo.printed_text || ''}\n` : '')
    + (shared ? `\nAll candidates sit under: ${shared}\n` : '')
    + '\nCANDIDATES (code | description path):\n'
    + cands.map((c, i) => `${i + 1}. ${c.code} | ${paths[i].slice(k).join(' > ')}`).join('\n')
    + '\n\nReply with JSON only: {"picks":[{"code":"10-digit code from the list","quote":"a short exact phrase (under 12 words) copied from that code\'s description","reason":"one sentence tying what the product is, its material or use to that wording","confidence":"high|medium|low"}]}. '
    + 'Best match first. A candidate that names details the product text does not state (a colour, pockets, trim, a size or a special feature) is not a high-confidence match: prefer the plain "Other" line that fits what IS stated. '
    + 'Use "high" only when every word of the description is supported by the input. If a detail the description needs is missing from the input (material, men\'s or women\'s, knitted or woven), say so in the reason and use "medium" or "low".';
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const LEVELS = ['low', 'medium', 'high'];
const GENERIC_LEAF = new Set('other parts part than whether not including excluding certain articles article kind kinds described specified provided heading subheading'.split(' '));

export function validatePicks(parsed, cands, context = '', maxLevel = 'high') {
  const ctx = new Set(wordsOf(context).map(stem));
  const byCode = new Map(cands.map((c) => [c.code, c]));
  const picks = Array.isArray(parsed?.picks) ? parsed.picks : Array.isArray(parsed) ? parsed : [];
  const out = []; let rejected = 0; const seen = new Set();
  for (const p of picks) {
    const code = String(p?.code ?? '').replace(/[^0-9]/g, '');
    const c = byCode.get(code);
    if (!c) { rejected += 1; continue; }
    if (seen.has(code)) continue;
    seen.add(code);
    const quote = String(p.quote || '').trim();
    const quoteOk = quote.length >= 4 && norm(c.full).includes(norm(quote));
    let level = LEVELS.includes(String(p.confidence).toLowerCase()) ? String(p.confidence).toLowerCase() : 'low';
    if (!quoteOk) level = 'low';
    // Specifics the input never stated (all white, pockets, trim ...) cap the label at medium, whatever the model says.
    const leaf = c.full.split(' > ').pop();
    const unstated = [...new Set(wordsOf(leaf).map(stem))].filter((w) => w.length >= 4 && !STOP.has(w) && !GENERIC_LEAF.has(w) && !ctx.has(w));
    if (context && unstated.length >= 2 && level === 'high') level = 'medium';
    if (out.length > 0 && level === 'high') level = 'medium';
    // A small vision model's reading of a photo cannot justify more than medium.
    if (LEVELS.indexOf(level) > LEVELS.indexOf(maxLevel)) level = maxLevel;
    out.push({ code, full: c.full, quote: quoteOk ? quote : null, reason: honestReason(String(p.reason || '').slice(0, 300), ctx), confidence: level });
    if (out.length === 3) break;
  }
  return { picks: out, rejected };
}

const fmtCode = (c) => `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6)}`;

// ---- main ----------------------------------------------------------------------------------------------------
export const DESC_ALIASES = ['description', 'text', 'product', 'invoice_line', 'query', 'product_description'];
export const ORIGIN_KEYS = ['origin_country', 'country', 'origin', 'country_of_origin', 'originCountry'];

export async function classifyProduct(args, deps) {
  const err = (text, retryable) => ({ content: [{ type: 'text', text }], isError: true, ...(retryable ? { _meta: { retryable: true } } : {}) });
  let text = '';
  for (const k of DESC_ALIASES) if (args[k]) { text = String(args[k]).replace(/\s+/g, ' ').trim().slice(0, 500); break; }
  const hasImage = !!(args.image_url || args.image_base64);
  if (!text && !hasImage) return err('Give either description (a product description or invoice line) or a photo (image_url, or image_base64), up to 1024 px.');
  if (text && text.length < 3 && !hasImage) return err('description must be at least 3 characters.');
  let origin = null;
  for (const k of ORIGIN_KEYS) if (args[k]) { origin = String(args[k]).trim().toUpperCase(); break; }
  if (origin && !/^[A-Z]{2}$/.test(origin)) return err(`origin_country must be an ISO-2 code (e.g. CN, VN, MX); got "${origin.slice(0, 30)}".`);

  try {
    let photo = null;
    if (hasImage) {
      const buf = await loadImage(args);
      const raw = await deps.chat({ model: CFG().visionModel, prompt: VISION_PROMPT, images: [buf.toString('base64')], think: false, numPredict: 400 });
      photo = parseModelJson(raw);
      if (!photo) throw new ClassifyError('The vision model returned output that could not be read. Retry, or send a description instead.', { retryable: true });
      for (const k of ['product', 'kind', 'material', 'use', 'printed_text']) photo[k] = String(photo[k] ?? '').slice(0, 200);
      photo.search_terms = (Array.isArray(photo.search_terms) ? photo.search_terms : []).map((s) => String(s).slice(0, 60)).slice(0, 6);
      if (!photo.product && !photo.search_terms.length && !text) throw new ClassifyError('Nothing identifiable was read from the photo. Send a clearer photo or a description.');
    }
    const terms = photo ? [photo.product, photo.kind, photo.material, ...photo.search_terms].filter(Boolean) : [];
    const cands = await retrieveCandidates(terms, text, deps.search);
    if (!cands.length) {
      return { content: [{ type: 'text', text: 'No HTS codes in our data matched that product. Try a plainer description (what it is and what it is made of), or use lookup_hts_code with a single keyword.' }] };
    }
    let picks; let rejected = 0; let fallback = false;
    const raw = await deps.chat({ model: CFG().pickModel, prompt: pickPrompt(text, photo, cands), numPredict: 900 });
    const parsed = parseModelJson(raw);
    if (parsed) ({ picks, rejected } = validatePicks(parsed, cands, [text, photo && photo.product, photo && photo.kind, photo && photo.material, photo && photo.use, photo && photo.printed_text].filter(Boolean).join(' '), photo ? 'medium' : 'high'));
    if (!picks || !picks.length) {
      // Model output unreadable or every code rejected: fall back to the text-match rank and say so.
      fallback = true;
      picks = cands.slice(0, 3).map((c, i) => ({ code: c.code, full: c.full, quote: null, confidence: 'low',
        reason: 'Ranked by word match to your description only; the model did not give a usable pick.' + (i === 0 ? '' : '') }));
    }
    const duty = [];
    if (origin) {
      for (const p of picks) {
        try {
          const r = await deps.rate(p.code, origin);
          const d = r.d;
          if (d && d.ok) {
            const layers = (d.layers || []).filter((l) => l.type !== 'base' && (Number(l.rate) > 0 || l.needs_review || l.excluded))
              .map((l) => (l.needs_review || l.excluded ? l.label : `${l.label} +${Number(l.rate).toFixed(2)}%`)).join('; ');
            duty.push({ code: p.code, total_rate: Number(d.total_rate), qualifier: d.rate_qualifier || null, base_rate: Number(d.base_rate),
              as_of: d.as_of, layers, rate_code: d.hts10, resolved: r.used && r.used !== r.requested });
          } else duty.push({ code: p.code, error: (d && d.error) || 'no rate returned' });
        } catch { duty.push({ code: p.code, error: 'rate service unreachable' }); }
      }
    }
    const lines = [];
    lines.push(`classify_product: ${picks.length} suggested HTS code${picks.length > 1 ? 's' : ''}${origin ? ` with stacked duty for origin ${origin}` : ''}. These are suggestions to verify, not a ruling: binding classification comes from CBP (https://rulings.cbp.gov/).`);
    if (photo) lines.push(`Read from the photo (on our own server, not stored): ${photo.product || 'unidentified'}${photo.material ? `; material: ${photo.material}` : ''}${photo.use ? `; use: ${photo.use}` : ''}${photo.printed_text ? `; printed text: ${photo.printed_text}` : ''}`);
    picks.forEach((p, i) => {
      lines.push('', `${i + 1}. HTS ${fmtCode(p.code)} (${p.code}) - ${p.confidence} confidence`);
      lines.push(`   HTS description (our data): ${p.full}`);
      lines.push(`   Why: ${p.reason || 'n/a'}${p.quote ? ` [quoted from the description: "${p.quote}"]` : ''}`);
      const d = duty.find((x) => x.code === p.code);
      if (d && !d.error) lines.push(`   Duty for ${origin} (entries on ${d.as_of}): ${d.qualifier === 'up_to' ? 'up to ' : ''}${d.total_rate.toFixed(2)}% total (MFN base ${d.base_rate.toFixed(2)}%${d.layers ? '; ' + d.layers : ''})${d.resolved ? ` - rate is for ${d.rate_code}` : ''}. Use calculate_tariff for the full notices.`);
      else if (d) lines.push(`   Duty for ${origin}: not available (${d.error}). Try calculate_tariff.`);
    });
    if (!origin) lines.push('', 'Pass origin_country (ISO-2, e.g. CN, VN) to include the stacked duty for each candidate.');
    if (rejected) lines.push('', `${rejected} model suggestion${rejected > 1 ? 's were' : ' was'} dropped because the code is not in our HTS data.`);
    if (fallback) lines.push('', 'Note: the ranking model gave no usable pick, so these are the closest text matches in our HTS data, all marked low confidence.');
    lines.push('', 'Confirm the code in the official schedule (https://hts.usitc.gov/); the right line often depends on material, construction and use details the input may not show.');
    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      structuredContent: { origin, source: photo ? 'photo' : 'text', candidates: picks.map((p) => ({ hts10: p.code, description: p.full, reason: p.reason,
        quote: p.quote, confidence: p.confidence, duty: duty.find((x) => x.code === p.code) || null })), rejected_not_in_data: rejected },
    };
  } catch (e) {
    if (e instanceof ClassifyError) return err(e.message + (e.retryable ? ' (retryable)' : ''), e.retryable);
    return err('classify_product failed unexpectedly. Retry, or use lookup_hts_code.', true);
  }
}

export const defaultChat = (o) => ollamaChat(o);
