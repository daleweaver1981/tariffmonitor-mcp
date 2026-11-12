// Tool definitions and the logic behind them, with NO transport attached.
//
// Split out 2026-08-21 so the same code can serve two very different callers:
//   src/index.js  — the original stdio server, for Claude Desktop / Cursor. Behaviour unchanged.
//   src/http.js   — a stateless HTTPS endpoint, which is the only thing Voidnet accepts.
// Duplicating the tool bodies for the second transport would have guaranteed they drifted apart.
//
// 2026-09-11: measured against the live API, BOTH of the examples this file documented returned
// nothing, because the upstream matches a search query as ONE substring of a code description and
// resolves a rate by exact-or-prefix code:
//   /hts/search?q=athletic%20footwear -> ok:true, results: []  while "footwear" alone returns 30+
//   /rate?hts=6404110000              -> ok:false, not found   while "640411" resolves to 6404112030
// An agent that followed our own documentation got "no codes found" and stopped. The upstream runs
// on another host and is not ours to change for this, so both fallbacks below are client-side —
// and each one STATES what it did. A silent substitution would be answering a different question.

import { toIso2 } from './countries.js';
import { matchAlias } from './aliases.js';
import { classifyProduct, defaultChat } from './classify.js';

const API_BASE = 'https://adcreator-ai.com/api/tem';
const PACK_URL = 'https://scholar.0xpi.com/get/tariffmonitor';
const CALC_URL = 'https://adcreator-ai.com/tariffs/calculator';
const VERSION = "1.6.4";

// The Section 301 China product exclusion end date. USTR extended all 178 exclusions on 9 Nov 2026
// (FR Doc. 2026-22925, filed for public inspection 9 Nov, published 10 Nov 2026, read 2026-11-09):
//   "through 11:59 p.m. eastern time on January 9, 2027".
// Previous end: 11:59 p.m. EDT on 9 Nov 2026 (FR Doc. 2025-21671, 90 FR 55232). The engine reads the
// date from VM100 data/tem/s301-cn-dates-2026.json; these strings must match it.
export const EXCLUSION_END_SHORT = '11:59 p.m. ET on 9 Jan 2027 per the Federal Register (FR Doc. 2026-22925, which extended the earlier 9 Nov 2026 end)';
const EXCLUSION_END_NOTE = 'Section 301 China product exclusion end: USTR extended the 178 exclusions "through 11:59 p.m. eastern time on January 9, 2027" (FR Doc. 2026-22925 (USTR, filed for public inspection 9 Nov 2026, published 10 Nov 2026)), replacing the earlier end of 11:59 p.m. EDT on 9 Nov 2026 (FR Doc. 2025-21671). Since 1.5.0 the 178 exclusions are applied by statistical number (HTSUS ch. 99 U.S. note 20(vvv) and 20(www)): a whole-number exclusion takes the List duty off the total through 9 Jan 2027; a description-limited one is reported with the rate for matching goods.';
// From the cliff date the engine stops projecting (cliff_total_rate === total_rate, layers dated 10 Nov are in
// total_rate), so the reply switches to past tense instead of promising a change that already happened (Run 270).
export const EXCLUSION_CLIFF_DATE = '2027-01-10';
export function exclusionsEnded(d) {
  const asOf = (d && d.as_of) || new Date().toISOString().slice(0, 10);
  return asOf >= ((d && d.cliff_date) || EXCLUSION_CLIFF_DATE);
}
const exclusionEndedNote = (asOf) => 'Section 301 China product exclusions: USTR extended them "through 11:59 p.m. eastern time on January 9, 2027" (FR Doc. 2026-22925). That date has passed. The total above is the rate in force on ' + asOf + ', with no exclusion applied. This server re-reads the end date from the Federal Register daily; if USTR has extended an exclusion very recently, check https://www.federalregister.gov/ before relying on the rate.';
const exclusionNote = (d) => (exclusionsEnded(d)
  ? exclusionEndedNote((d && d.as_of) || new Date().toISOString().slice(0, 10)) : EXCLUSION_END_NOTE);

export const SERVER_INFO = { name: 'tariffmonitor', version: VERSION };

// The schedule's descriptions carry inline markup such as <il>10 kg</il>; an agent should see text.
const clean = (t) => String(t || '').replace(/<[^>]+>/g, '');
// 2026-10-31: a 10-digit line's own text is often just "For men" or "Other". The engine now sends the
// schedule's indent path (description_path, heading first); show it so the line means something.
const cut = (t, n) => (t.length > n ? t.slice(0, n - 3).trimEnd() + '...' : t);
const fullDesc = (r) => (Array.isArray(r.description_path) && r.description_path.length
  ? r.description_path.map(clean).join(' > ') : clean(r.description));
const lineDesc = (r) => (Array.isArray(r.description_path) && r.description_path.length > 1
  ? r.description_path.slice(-3).map((t) => cut(clean(t), 70)).join(' > ') : clean(r.description));

async function apiFetch(path, { read400 = false } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'User-Agent': `tariffmonitor-mcp/${VERSION}` },
  });
  if (read400 && res.status === 400) return res.json(); // the API's reason for rejecting the input, not an outage
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// Why no rate came back: the API's own reason, unless the code simply is not in the schedule.
function noRateText(hts, d) {
  if (d && d.error && !/not found/i.test(d.error)) return d.error;
  return `HTS code ${hts} is not in the current US schedule, and neither is its 8- or 6-digit heading. Use lookup_hts_code to find the right code.`;
}

// A multi-word description finds nothing upstream, so retry the individual words, longest first —
// the longest token is usually the most specific noun. Reports what was actually searched.
const EXTRA_STOP = new Set(['with', 'from', 'that', 'this', 'other', 'for', 'and', 'made', 'used', 'piece', 'pieces', 'pack', 'size']);
async function searchHts(query) {
  const first = await apiFetch('/hts/search?q=' + encodeURIComponent(query));
  if (first.ok && first.results?.length) return { data: first, searched: query, fellBackFrom: null };
  // In an HTS description the head noun is usually the LAST word - athletic footwear is a kind
  // of footwear - so try that first, then the remaining words longest-first.
  const tokens = query.split(/\s+/).filter((w) => w.length >= 3);
  const words = tokens.length > 1
    ? [tokens[tokens.length - 1]].concat(tokens.slice(0, -1).sort((a, b) => b.length - a.length))
    : tokens;
  if (words.length > 1) {
    for (const w of words) {
      const next = await apiFetch('/hts/search?q=' + encodeURIComponent(w));
      if (next.ok && next.results?.length) return { data: next, searched: w, fellBackFrom: query };
    }
  }
  return { data: first, searched: query, fellBackFrom: null };
}

// The schedule holds 10-digit statistical suffixes, not zero-padded headings: 6404110000 does not
// exist while 640411 does. Walk a not-found code back to its 8- then 6-digit heading rather than
// telling an importer their product is absent from the US tariff schedule when it is not.
async function fetchRate(hts, country, vol, explain = true, date = null) {
  const candidates = [hts];
  if (hts.length > 8) candidates.push(hts.slice(0, 8));
  if (hts.length > 6) candidates.push(hts.slice(0, 6));
  let last = null;
  for (const code of candidates) {
    const qs = `/rate?hts=${encodeURIComponent(code)}&country=${country}${explain ? '&explain=1' : ''}${date ? `&as_of=${date}` : ''}`
      + `${vol > 0 ? '&unit_cost=0' : ''}&utm_source=tariffmonitor-mcp`;
    last = await apiFetch(qs, { read400: true });
    if (last.ok) return { d: last, requested: hts, used: code };
  }
  return { d: last, requested: hts, used: null };
}

export const TOOLS = [
  {
    name: 'lookup_hts_code',
    title: 'Look up HTS code',
    annotations: { title: 'Look up HTS code', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    description: 'Find the US HTS (Harmonized Tariff Schedule) code for a product, by plain-language product name or numeric prefix, from the official USITC schedule (19,856 10-digit codes). Use this first whenever you have a product name rather than a code (e.g. "laptop", "t-shirt", "water bottle", "wireless earbuds", "toys", "e-bike", "running shoes"), then pass a code to calculate_tariff or compare_origins. Everyday shopping words that a plain search of the schedule misses are mapped to the official heading that covers them (e.g. laptop -> 8471.30 "Portable automatic data processing machines"), and the answer names that heading; when a word commonly falls under more than one heading (water bottle: 7323.93 stainless, 9617.00 vacuum flasks, 3924.10 plastic) each is listed, with the 10-digit lines ranked by match to the query. Otherwise descriptions are matched as one phrase; if a phrase matches nothing the tool retries single words and says which word it used. Returns up to 12 codes.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Product keyword (e.g. "footwear") or HTS code prefix (e.g. "6404"). Minimum 2 characters. Single keywords match best.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'calculate_tariff',
    title: 'Calculate US import tariff',
    annotations: { title: 'Calculate US import tariff', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    description: 'Calculate the full stacked US import tariff rate for an HTS code from a specific origin country. Returns: base rate, each additional layer (China Section 301 matched by HTS line to Lists 1, 2, 3, 4A and the 2024 four-year-review increases; Section 232 steel, aluminum and copper matched by HTS line to the U.S. note 16 lists, headings 9903.82.02-.26: 50% on listed metal articles, 25% on listed derivatives, UK and 15%-floor rates, with the metal-content conditions stated; other Section 232 programs (vehicles and parts, wood products, trucks, semiconductors, drones) flagged as needs review when the line is named, not computed; Section 301 Brazil, 25% since 22 Jul 2026, heading 9903.05.01, with its exemption lists; and the 2026 Section 301 forced-labor tariff on 60 economies: 10% or 12.5% by origin, or a 10%/12.5% cap net of MFN for the EU, Taiwan, Japan, South Korea and Switzerland, in effect since 24 Jul 2026, FR Doc. 2026-15181, HTS 9903.05.20-9903.05.84), the total current rate, the date the data was checked, and notes naming each exemption or assumption (Section 232 goods, USMCA- or CAFTA-DR-qualifying entries, listed products). For products of Canada it notes that Section 338 duties may apply; their product lists are published only as images, so they are not computed. Also states when the Section 301 China product exclusions end: through 11:59 p.m. ET on January 9, 2027 (Federal Register, FR Doc. 2026-22925, which extended the earlier 9 Nov 2026 end). Rates are effective-date aware: pass date (YYYY-MM-DD) for the rule in force on that entry date. For products of China it applies the 178 Section 301 product exclusions by statistical number (U.S. note 20(vvv)/(www)) through their end date, and the maritime Section 301 headings (9903.92.10 +25% on ship-to-shore cranes; from 10 Jan 2027 (the maritime action is suspended through 9 Jan 2027 by FR Doc. 2026-22867) 9903.91.14 +100% on those cranes and 9903.91.12 +100% on intermodal chassis, shown as "up to" because chapter 99 does not say how it combines with List 3), each with its legal source, and says when a rate depends on a proposed, not final, extension. Figures are estimates; IEEPA tariffs ended 20 Feb 2026 and are not included. Optionally computes dollar impact from annual import volume.',
    inputSchema: {
      type: 'object',
      properties: {
        hts_code: {
          type: 'string',
          description: 'HTS code — at least 6 digits, up to 10 (e.g. "6404.11" or "6404112030"). Dots and spaces are ignored. Zero-padded headings such as "6404110000" are not real schedule codes; if the exact code is not found, the 8- then 6-digit heading is tried and the answer states which code the rate is for.',
        },
        origin_country: {
          type: 'string',
          description: 'ISO-2 origin country code (e.g. "CN" for China, "VN" for Vietnam, "MX" for Mexico). Default: CN.',
          default: 'CN',
        },
        annual_import_value_usd: {
          type: 'number',
          description: 'Optional. Your annual import value in USD. If provided, the response includes the dollar cost of current duties and any additional cost once the Section 301 China exclusions end (after 11:59 p.m. ET on January 9, 2027 per the Federal Register, FR Doc. 2026-22925).',
        },
        date: {
          type: 'string',
          description: 'Optional. Entry date YYYY-MM-DD; the rate in force on that date is returned (e.g. "2027-01-09" vs "2027-01-10" to see the Section 301 exclusion end and the maritime duties). Default: today in US Eastern time.',
        },
      },
      required: ['hts_code'],
    },
  },
  {
    name: 'classify_product',
    title: 'Classify a product to HTS codes (photo or invoice line)',
    annotations: { title: 'Classify a product to HTS codes (photo or invoice line)', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    description: 'Suggest up to 3 US HTS-10 codes for a product from what you actually hold: a product description or invoice line (text), OR a product photo (image_url on https, or image_base64; PNG, JPEG or WebP, at most 1024 px on the long side and 3 MB). Each candidate has: the HTS description from our own HTS data (never written by a model), a one-line reason that quotes that description, a confidence label (high, medium or low), and, when you pass origin_country, the stacked duty from the same logic as calculate_tariff (MFN + Section 301 + Section 232 + the 2026 forced-labor layer). How it works: a photo is read by a self-hosted vision model on our own server (no outside AI provider), which notes what the product is, its material, use and any printed text; candidates are retrieved only from our HTS data; a self-hosted model then ranks only among those candidates, and any code that is not in our data is dropped. Photos are read on our own server and are not stored. These are SUGGESTIONS TO VERIFY, not a classification ruling: binding rulings come from US Customs and Border Protection (CBP, https://rulings.cbp.gov/), and the right line often depends on material, construction and use details a photo or one-line invoice may not show. Measured on our server: text takes about 1 to 3 minutes and a photo about 3 to 5 minutes because the models run on shared CPU hardware (set a long client timeout); if the model server is busy or unreachable the tool returns a retryable error. Free public endpoint: a text call counts as 1 of your 25 daily calls and a photo call counts as 2. Running the npm package locally needs your own Ollama server (set TM_OLLAMA_URL).',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Product description or invoice line, e.g. "men\'s 100% cotton knit t-shirt". Optional if a photo is given; with a photo it is used as extra context.' },
        image_url: { type: 'string', description: 'https URL of a product photo (PNG, JPEG or WebP, at most 1024 px on the long side, 3 MB). Fetched by our server; private addresses are refused.' },
        image_base64: { type: 'string', description: 'Alternative to image_url: the photo as base64 (a data: URL is accepted). Same size limits.' },
        origin_country: { type: 'string', description: 'Optional ISO-2 origin country (e.g. CN, VN, MX). When given, each candidate includes its stacked duty.' },
      },
    },
  },
  {
    name: 'compare_origins',
    title: 'Compare tariffs by origin country',
    annotations: { title: 'Compare tariffs by origin country', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    description: 'Compare the estimated US import tariff for ONE HTS code across several origin countries side by side (e.g. China vs Vietnam vs Mexico vs India), for sourcing and "China plus one" decisions. For each origin returns the total current rate, the layers that make it up (MFN base, Section 301 China, Section 232 by HTS line, Section 301 Brazil, 2026 Section 301 forced-labor tariff) and the rate after the Section 301 China exclusions end (through 11:59 p.m. ET on 9 Jan 2027 per the Federal Register, FR Doc. 2026-22925), sorted lowest first, with the dollar duty when an annual import value is given. Estimates only; preferential rates (USMCA, FTAs) depend on rules of origin and are not assumed.',
    inputSchema: {
      type: 'object',
      properties: {
        hts_code: {
          type: 'string',
          description: 'HTS code, 6 to 10 digits (e.g. "8471.30" or "6404112030"). Use lookup_hts_code first if you only have a product name.',
        },
        origin_countries: {
          type: 'array',
          items: { type: 'string' },
          description: 'ISO-2 origin country codes to compare, 2 to 8 of them (e.g. ["CN","VN","MX","IN"]). Default: CN, VN, MX, IN, TH.',
        },
        annual_import_value_usd: {
          type: 'number',
          description: 'Optional. Annual import value in USD; adds the estimated annual duty for each origin.',
        },
        date: {
          type: 'string',
          description: 'Optional. Entry date YYYY-MM-DD; the rate in force on that date is returned (e.g. "2027-01-09" vs "2027-01-10" to see the Section 301 exclusion end and the maritime duties). Default: today in US Eastern time.',
        },
      },
      required: ['hts_code'],
    },
  },
];

// 2026-11-08 (CEO): photo classification is OFF by default. Live tests: a stainless bottle was read as plastic and a
// photo took ~4.5 min (longer than most MCP clients wait). Text classification is accurate (cotton knit t-shirt ->
// 6109.10, all codes from our data). The listing must not offer what we don't serve, so when photos are off the
// tool advertises text only and loadImage refuses. Turn on with TM_CLASSIFY_PHOTOS=1 after photo quality passes.
export const CLASSIFY_PHOTOS = process.env.TM_CLASSIFY_PHOTOS === '1';
if (!CLASSIFY_PHOTOS) {
  const t = TOOLS.find((x) => x.name === 'classify_product');
  if (t) {
    t.title = 'Classify a product to HTS codes (description or invoice line)';
    if (t.annotations) t.annotations.title = t.title;
    delete t.inputSchema.properties.image_url; delete t.inputSchema.properties.image_base64;
    t.inputSchema.properties.description.description = 'Product description or invoice line, e.g. "men\'s 100% cotton knit t-shirt". Required.';
    t.inputSchema.required = ['description'];
    t.description = 'Suggest up to 3 US HTS-10 codes for a product from a product description or an invoice line. Each candidate has: the HTS description from our own HTS data (never written by a model), a one-line reason that quotes that description, a confidence label (high, medium or low), and, when you pass origin_country, the stacked duty from the same logic as calculate_tariff (MFN + Section 301 + Section 232 + the 2026 forced-labor layer). How it works: candidates are retrieved only from our HTS data; a self-hosted model on our own server (no outside AI provider) ranks only among those candidates, and any code that is not in our data is dropped. These are SUGGESTIONS TO VERIFY, not a classification ruling: binding rulings come from US Customs and Border Protection (CBP, https://rulings.cbp.gov/), and the right line often depends on material, construction and use details a one-line description may not show. Measured on our server: about 1 to 3 minutes per call because the model runs on shared CPU hardware (set a long client timeout); if the model server is busy or unreachable the tool returns a retryable error. Free public endpoint: each call counts as 1 of your 25 daily calls. Running the npm package locally needs your own Ollama server (set TM_OLLAMA_URL).';
  }
}


// Returns the MCP content object for a tool call. Never throws for ordinary failures —
// an unreachable upstream is reported to the caller as text, same as the stdio server always did.
// Rank 10-digit lines under a matched heading: lines whose own text shares words with the query first,
// "Other" catch-all lines last, otherwise schedule order. The schedule text decides; nothing is invented.
const RANK_SYNONYMS = { mens: 'men', man: 'men', womens: 'women', woman: 'women', ladies: 'women', lady: 'women',
  kids: 'child', kid: 'child', childrens: 'child', children: 'child', boys: 'child', girls: 'child' };
function rankLines(rows, query) {
  const words = String(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3)
    .map((w) => RANK_SYNONYMS[w] || w.replace(/s$/, ''));
  const score = (r) => {
    const d = clean(r.full_description || r.description).toLowerCase();
    let s = 0;
    // Word-start match: "men" scores "For men" but not "For women".
    for (const w of words) if (new RegExp('(^|[^a-z])' + w.replace(/[^a-z0-9]/g, '')).test(d)) s += 2;
    if (/^other\b/.test(d)) s -= 1;
    return s;
  };
  return rows.map((r, i) => ({ r, i, s: score(r) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.r);
}

// Argument names agents actually send (29 Oct Voidnet logs: "country" instead of "origin_country"). An
// unknown name used to fall through to the China default and return China's rate for a Vietnam question.
const ORIGIN_ALIASES = ['origin_country', 'country', 'origin', 'country_of_origin', 'origin_country_code', 'country_code', 'countryOfOrigin', 'originCountry'];
const ORIGINS_ALIASES = ['origin_countries', 'countries', 'origins', 'origin_country_codes', 'country_codes', 'originCountries'];
const DATE_ALIASES = ['date', 'as_of', 'entry_date', 'asOf', 'query_date'];
// Returns { date } (null = today) or { error } for a date that is not YYYY-MM-DD.
function pickDate(args) {
  const d = pick(args, DATE_ALIASES);
  if (!d) return { date: null };
  const v = String(d.value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v + 'T12:00:00Z'))) return { error: `${d.name} must be a date YYYY-MM-DD; got "${String(d.value).slice(0, 30)}".` };
  return { date: v };
}
const pctTxt = (x) => `${Number(x).toFixed(2)}%`;
// Exclusion, maritime, "up to" and proposed-extension lines from the engine's structured fields (1.5.0).
function nov10Lines(d) {
  const out = [];
  const x = d.section_301_exclusion;
  if (x) {
    const ents = x.entries.map((e) => `${e.note}${e.description ? ` ("${e.description}")` : ' (whole statistical number)'}`).join('; ');
    if (x.status === 'in_force' && x.whole_number) out.push(`Section 301 exclusion applied on ${d.as_of}: ${ents}, claimed under heading ${x.entries[0].claim_heading}, ${x.end_text} (${x.basis}, ${x.basis_url}). The ${x.entries[0].list} duty (+${x.entries[0].rate}%) is not in the total until it ends.`);
    else if (x.status === 'in_force') out.push(`Section 301 exclusion for matching goods: ${ents}. If your goods match that description, the rate on ${d.as_of} is ${pctTxt(x.total_rate_if_excluded)} (claim heading ${x.entries[0].claim_heading}), ${x.end_text} (${x.basis}, ${x.basis_url}); from ${d.cliff_date} it is ${pctTxt(d.cliff_total_rate)}. The total above assumes the goods do not match.`);
    else out.push(`Section 301 exclusion ended: ${ents} ran ${x.end_text} (${x.basis}). The ${x.entries[0].list} duty is in the total.`);
  }
  if (d.rate_qualifier === 'up_to') out.push(`"Up to": ${d.rate_qualifier_text || 'chapter 99 does not state how two layers combine, so the total adds both'}.`);
  if (d.total_rate_if_out_of_scope !== undefined) out.push(`Scope: heading(s) ${d.scope_conditional_headings.join(', ')} cover only the goods described in their U.S. note; for other goods under this number the rate is ${pctTxt(d.total_rate_if_out_of_scope)}.`);
  for (const p of d.depends_on_proposed || []) out.push(`DEPENDS ON A PROPOSED EXTENSION (not final): ${p.note.replace(/^Depends on a proposed, not final, notice: /, '')}`);
  return out;
}
// The engine notices repeat the exclusion and proposed-extension facts that nov10Lines() states first; drop the repeats.
const dedupNotices = (ns) => (ns || []).filter((n) => !/^(Depends on a proposed, not final, notice|Section 301 exclusion (applied|may apply|ended))/.test(n));
const KNOWN_ARGS = {
  lookup_hts_code: ['query', 'q', 'product', 'keyword'],
  calculate_tariff: ['hts_code', 'hts', 'code', 'htsCode', 'annual_import_value_usd', ...ORIGIN_ALIASES, ...DATE_ALIASES],
  compare_origins: ['hts_code', 'hts', 'code', 'htsCode', 'annual_import_value_usd', ...ORIGINS_ALIASES, ...DATE_ALIASES],
  classify_product: ['description', 'text', 'product', 'invoice_line', 'query', 'product_description', 'image_url', 'image_base64', ...ORIGIN_ALIASES],
};
function pick(args, names) {
  for (const n of names) if (args[n] !== undefined && args[n] !== null && args[n] !== '') return { name: n, value: args[n] };
  return null;
}
function unknownArgs(name, args) {
  const known = KNOWN_ARGS[name];
  if (!known) return null;
  const bad = Object.keys(args || {}).filter((k) => !known.includes(k));
  if (!bad.length) return null;
  const accepted = { lookup_hts_code: 'query', calculate_tariff: 'hts_code, origin_country, annual_import_value_usd, date', compare_origins: 'hts_code, origin_countries, annual_import_value_usd, date', classify_product: 'description, image_url, image_base64, origin_country' }[name];
  return { content: [{ type: 'text', text: `Unknown argument${bad.length > 1 ? 's' : ''} for ${name}: ${bad.join(', ')}. Accepted: ${accepted}. Nothing was calculated, so no default was applied.` }], isError: true };
}

// Test seam: the model call is replaced in unit tests.
export const classifyDeps = { chat: defaultChat };

export async function callTool(name, args = {}) {
  args = args && typeof args === 'object' ? args : {};
  const unk = unknownArgs(name, args);
  if (unk) return unk;

  if (name === 'classify_product') {
    return classifyProduct(args, {
      search: (q) => apiFetch('/hts/search?limit=60&q=' + encodeURIComponent(q)),
      rate: (code, country) => fetchRate(code, country, 0, false, null),
      chat: classifyDeps.chat,
    });
  }

  if (name === 'lookup_hts_code') {
    const query = String(pick(args, KNOWN_ARGS.lookup_hts_code)?.value || '').trim();
    if (query.length < 2) {
      return { content: [{ type: 'text', text: 'Query must be at least 2 characters.' }], isError: true };
    }
    // A shopping word ("laptop", "earbuds") either finds nothing in a keyword search or finds
    // the wrong goods ("toys" -> only pet toys). Search the official heading for it instead, and
    // say so, so the caller knows the codes come from a mapping and can still check the wording.
    const alias = /^[0-9.\s]+$/.test(query) ? null : matchAlias(query);
    let found;
    let aliasData = null;
    let altData = [];
    try {
      if (alias) {
        aliasData = await apiFetch('/hts/search?limit=60&q=' + encodeURIComponent(alias.prefix));
        altData = await Promise.all((alias.alts || []).map(async (x) => ({ alt: x, data: await apiFetch('/hts/search?limit=60&q=' + encodeURIComponent(x.prefix)) })));
      }
      found = await searchHts(query);
    } catch (e) {
      return { content: [{ type: 'text', text: 'Could not reach Tariff Monitor API: ' + e.message }], isError: true };
    }
    const data = found.data;
    if (aliasData?.ok && aliasData.results?.length) {
      const ranked = rankLines(aliasData.results, query);
      const rows = ranked.slice(0, 12).map((r) => `${r.hts10}  ${lineDesc(r)}`).join('\n')
        + (ranked.length > 12 ? `\n(${ranked.length - 12} more 10-digit lines under ${alias.heading}; search a longer code prefix to see them)` : '');
      const altBlocks = altData.filter((x) => x.data?.ok && x.data.results?.length).map((x) => {
        const rr = rankLines(x.data.results, query);
        return `\n\nAlso common for "${alias.term}": HTS ${x.alt.heading}: ${x.alt.label}.\n\n` + rr.slice(0, 6).map((r) => `${r.hts10}  ${lineDesc(r)}`).join('\n')
          + (rr.length > 6 ? `\n(${rr.length - 6} more under ${x.alt.heading})` : '');
      }).join('');
      const aliasCodes = new Set([...aliasData.results, ...altData.flatMap((x) => x.data?.results || [])].map((r) => r.hts10));
      // 2026-11-10: the backend search matches loosely ("screw cap" bottle -> 6505 hats). Keep an extra code only when its
      // description shares at least half of the query's content words, so the heading below stays true.
      const qWords = [...new Set(String(found.searched || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !EXTRA_STOP.has(w)))];
      const shares = (r) => { if (!qWords.length) return true; const d = lineDesc(r).toLowerCase(); return qWords.filter((w) => d.includes(w)).length * 2 >= qWords.length; };
      const extra = (data.ok ? data.results || [] : [])
        .filter((r) => !aliasCodes.has(r.hts10) && shares(r)).slice(0, 6)
        .map((r) => `${r.hts10}  ${lineDesc(r)}`).join('\n');
      const text = `"${alias.term}" is normally classified under HTS ${alias.heading}: ${alias.label}${alias.label.endsWith('...') ? '' : '.'} `
        + 'A plain keyword search of the schedule misses or mislabels this product, so these codes come from that heading.\n\n'
        + `Codes under ${alias.heading} (ranked by match to your words, then by code):\n\n${rows}${altBlocks}`
        + (extra ? `\n\nOther codes whose description contains "${found.searched}":\n\n${extra}` : '')
        + '\n\nClassification depends on the exact material, construction and use; this heading is a starting point, not a ruling. '
        + 'Confirm in the official schedule (https://hts.usitc.gov/) or with CBP rulings (https://rulings.cbp.gov/). '
        + 'Then use calculate_tariff or compare_origins with the most relevant code.';
      return { content: [{ type: 'text', text }] };
    }
    if (!data.ok || !data.results?.length) {
      return { content: [{ type: 'text', text: 'No HTS codes found matching "' + query + '"'
        + (query.includes(' ') ? ', and no single word in it matched either' : '')
        + '. Try a broader single keyword, or a numeric HTS prefix such as 6404.' }] };
    }
    const rows = data.results.map((r) => `${r.hts10}  ${lineDesc(r)}`).join('\n');
    const note = found.fellBackFrom
      ? `No code description contains the whole phrase "${found.fellBackFrom}", so this is a search for "${found.searched}".\n\n`
      : '';
    return {
      content: [{
        type: 'text',
        text: `${note}HTS codes matching "${found.searched}":\n\n${rows}\n\nUse calculate_tariff with the most relevant code.`,
      }],
    };
  }

  if (name === 'calculate_tariff') {
    const hts = String(pick(args, ['hts_code', 'hts', 'code', 'htsCode'])?.value || '').replace(/[^0-9]/g, '');
    const originArg = pick(args, ORIGIN_ALIASES);
    const countryRaw = toIso2(originArg ? originArg.value : 'CN');
    const country = countryRaw.slice(0, 2);
    const originNote = originArg ? '' : ' (no origin_country given, so China was assumed; pass origin_country for another origin)';
    const vol = Number(args.annual_import_value_usd) || 0;
    const qd = pickDate(args);
    if (qd.error) return { content: [{ type: 'text', text: qd.error }], isError: true };

    if (hts.length < 6) {
      return { content: [{ type: 'text', text: 'hts_code must be at least 6 digits. Use lookup_hts_code to find the right code.' }], isError: true };
    }
    if (!/^[A-Z]{2}$/.test(countryRaw)) {
      return { content: [{ type: 'text', text: `origin_country must be an ISO-2 code (e.g. CN, VN, MX, IN, KR, TW, DE, JP); got "${String(originArg ? originArg.value : '').slice(0, 40)}".` }], isError: true };
    }

    let r;
    try {
      // 2026-10-25: no AI-written explanation paragraph. It was sometimes cut off mid-sentence and could
      // state things the rate data does not (e.g. a wrong "no changes until" date); the structured stack is the answer.
      r = await fetchRate(hts, country, vol, false, qd.date);
    } catch (e) {
      return { content: [{ type: 'text', text: 'Could not reach Tariff Monitor API: ' + e.message }], isError: true };
    }
    const d = r.d;
    if (!d || !d.ok) {
      return { content: [{ type: 'text', text: noRateText(hts, d) }], isError: true };
    }

    const layers = (d.layers || []).map((l) => `  ${l.label}${l.needs_review || l.excluded ? '' : `: +${Number(l.rate).toFixed(2)}%`}`).join('\n');
    const cliffDelta = (d.cliff_total_rate - d.total_rate).toFixed(2);
    const ended = exclusionsEnded(d);
    const upTo = (q) => (q === 'up_to' ? 'up to ' : '');
    const exclMatch = d.section_301_exclusion && d.section_301_exclusion.status === 'in_force' && !d.section_301_exclusion.whole_number;
    const cliffLine = ended ? '' : Number(cliffDelta) > 0
      ? `\nFor entries on or after ${d.cliff_date} (Section 301 China exclusions end ${EXCLUSION_END_SHORT}${d.maritime_effective_date === d.cliff_date && (d.notices || []).some((n) => n.startsWith('Section 301 maritime action')) ? '; maritime Section 301 suspension ends' : ''}): ${upTo(d.cliff_rate_qualifier)}${d.cliff_total_rate.toFixed(2)}% (+${cliffDelta}pp)`
      : exclMatch ? `\nFor goods that match the exclusion below, the rate rises on ${d.cliff_date} from ${pctTxt(d.section_301_exclusion.total_rate_if_excluded)} to ${pctTxt(d.cliff_total_rate)}; for other goods under this number it does not change.`
      : '\nNo rate change projected for this code/country combination when the Section 301 China exclusions end.';

    let dollarLines = '';
    if (vol > 0) {
      const currentDuty = Math.round(d.total_rate / 100 * vol);
      const cliffExtra = !ended && Number(cliffDelta) > 0 ? Math.round(Number(cliffDelta) / 100 * vol) : 0;
      dollarLines = `\n\nDollar impact at $${vol.toLocaleString()}/yr import value:`
        + `\n  Current annual duties: $${currentDuty.toLocaleString()}`
        + (cliffExtra > 0 ? `\n  Additional once the exclusions end: $${cliffExtra.toLocaleString()}/yr` : '');
    }

    const explainBlock = '';
    // Say it plainly when the answer is for a different code than the one asked for. The rate is
    // right for the code named on the first line, and the caller must be able to see that.
    const resolvedNote = (r.used && r.used !== r.requested)
      ? `Note: ${r.requested} is not a line in the schedule. The rate below is for heading ${r.used}; the description shown is only the first statistical line listed under it (${d.hts10}), not necessarily your goods. Statistical suffixes can differ in Section 232 and 301 coverage, so confirm the exact line with lookup_hts_code ${r.used}.\n\n`
      : '';

    const text = [
      `${resolvedNote}HTS ${d.hts10} — ${fullDesc(d)}`,
      `Origin: ${country}${originNote}`,
      ...(d.data_as_of ? [`Data checked: ${d.data_as_of}`] : []),
      '',
      'Rate stack:',
      layers,
      `Total rate for entries on ${d.as_of}${qd.date ? '' : ' (today, US Eastern)'}: ${upTo(d.rate_qualifier)}${d.total_rate.toFixed(2)}%`,
      cliffLine,
      ...nov10Lines(d).map((n) => `\n${n}`),
      ...(dedupNotices(d.notices).map((n) => `\n${n}`)),
      `\n${exclusionNote(d)}`,
      dollarLines,
      explainBlock,
      '',
      `Estimate only. Check the authoritative rate at https://hts.usitc.gov/ before relying on it.`,
      `Free browser calculator: ${CALC_URL}?utm_source=mcp&utm_medium=referral&utm_campaign=tariffmonitor-202610-mcp&utm_content=calculator`,
    ].join('\n').replace(/\n{3,}/g, '\n\n').trim();

    return { content: [{ type: 'text', text }] };
  }

  if (name === 'compare_origins') {
    const hts = String(pick(args, ['hts_code', 'hts', 'code', 'htsCode'])?.value || '').replace(/[^0-9]/g, '');
    if (hts.length < 6) {
      return { content: [{ type: 'text', text: 'hts_code must be at least 6 digits. Use lookup_hts_code to find the right code.' }], isError: true };
    }
    const originsArg = pick(args, ORIGINS_ALIASES);
    const originsVal = originsArg ? (Array.isArray(originsArg.value) ? originsArg.value : String(originsArg.value).split(/[\s,;]+/).filter(Boolean)) : null;
    const raw = originsVal && originsVal.length ? originsVal : ['CN', 'VN', 'MX', 'IN', 'TH'];
    const countries = [...new Set(raw.map((c) => toIso2(c)))];
    const bad = countries.filter((c) => !/^[A-Z]{2}$/.test(c));
    if (bad.length) {
      return { content: [{ type: 'text', text: `Not ISO-2 country codes: ${bad.join(', ')}. Use codes such as CN, VN, MX, IN, TH, KR, TW, DE, JP.` }], isError: true };
    }
    if (countries.length < 2 || countries.length > 8) {
      return { content: [{ type: 'text', text: 'Give 2 to 8 origin countries to compare (ISO-2 codes).' }], isError: true };
    }
    const vol = Number(args.annual_import_value_usd) || 0;
    const qd = pickDate(args);
    if (qd.error) return { content: [{ type: 'text', text: qd.error }], isError: true };

    let results;
    try {
      // explain=false: the per-origin plain-English explanation is slow and not needed for a table.
      results = await Promise.all(countries.map(async (c) => ({ c, r: await fetchRate(hts, c, vol, false, qd.date) })));
    } catch (e) {
      return { content: [{ type: 'text', text: 'Could not reach Tariff Monitor API: ' + e.message }], isError: true };
    }
    const okRows = results.filter((x) => x.r.d && x.r.d.ok);
    if (!okRows.length) {
      return { content: [{ type: 'text', text: noRateText(hts, results.map((x) => x.r.d).find((d) => d && d.error && !/not found/i.test(d.error)) || results[0].r.d) }], isError: true };
    }
    const first = okRows[0].r;
    okRows.sort((a, b) => a.r.d.total_rate - b.r.d.total_rate);
    const lines = okRows.map(({ c, r }) => {
      const d = r.d;
      const layers = (d.layers || []).filter((l) => l.type !== 'base' && (Number(l.rate) > 0 || l.needs_review || l.excluded))
        .map((l) => l.needs_review || l.excluded ? l.label : `${l.label} +${Number(l.rate).toFixed(2)}%`).join('; ');
      const cliff = !exclusionsEnded(d) && Number(d.cliff_total_rate) > Number(d.total_rate)
        ? ` -> ${d.cliff_rate_qualifier === 'up_to' ? 'up to ' : ''}${Number(d.cliff_total_rate).toFixed(2)}% from ${d.cliff_date}` : '';
      const usd = vol > 0 ? ` | est. duty $${Math.round(d.total_rate / 100 * vol).toLocaleString()}/yr` : '';
      return `${c}: ${d.rate_qualifier === 'up_to' ? 'up to ' : ''}${Number(d.total_rate).toFixed(2)}%${cliff}${usd}\n    MFN base ${Number(d.base_rate).toFixed(2)}%${layers ? '; ' + layers : ''}`;
    });
    const failed = results.filter((x) => !(x.r.d && x.r.d.ok)).map((x) => x.c);
    const notices = [...new Set(okRows.flatMap(({ r }) => [...nov10Lines(r.d), ...dedupNotices(r.d.notices)]))];
    const resolvedNote = (first.used && first.used !== first.requested)
      ? `Note: ${first.requested} is not a line in the schedule. Rates are for heading ${first.used}; the description shown is only the first statistical line listed under it (${first.d.hts10}), not necessarily your goods. Confirm the exact line with lookup_hts_code ${first.used}.\n\n` : '';
    const text = [
      `${resolvedNote}HTS ${first.d.hts10} — ${fullDesc(first.d)}`,
      ...(first.d.data_as_of ? [`Data checked: ${first.d.data_as_of}`] : []),
      '',
      `Estimated total US import tariff by origin for entries on ${first.d.as_of}${qd.date ? '' : ' (today, US Eastern)'} (lowest first):`,
      ...lines,
      ...(failed.length ? [`\nNo rate returned for: ${failed.join(', ')}`] : []),
      ...notices.map((n) => `\n${n}`),
      `\n${exclusionNote(first.d)}`,
      '',
      'Preferential rates (USMCA, free trade agreements) depend on rules of origin and are not applied here; the origin of goods is where they were substantially transformed, not where they ship from.',
      'Estimate only. Check the authoritative rate at https://hts.usitc.gov/ before relying on it. For one origin in detail, use calculate_tariff.',
    ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return { content: [{ type: 'text', text }] };
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
}
