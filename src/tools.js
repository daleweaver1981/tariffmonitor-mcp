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

import { matchAlias } from './aliases.js';

const API_BASE = 'https://adcreator-ai.com/api/tem';
const PACK_URL = 'https://scholar.0xpi.com/get/tariffmonitor';
const CALC_URL = 'https://adcreator-ai.com/tariffs/calculator';
const VERSION = '1.3.2';

// The Section 301 China product exclusion end date, as the two official sources state it (both read
// 2026-10-25). They differ by one day, so an agent must see both rather than one silently chosen:
//   Federal Register, FR Doc. 2025-21671, 90 FR 55232 (1 Dec 2025): "extend the exclusions through
//     11:59 p.m. eastern daylight time on November 9, 2026".
//   USTR press release, 26 Nov 2025: "The exclusions have been extended until November 10, 2026."
// The legal text is the Federal Register notice; the press release is how most coverage reports it.
export const EXCLUSION_END_SHORT = '11:59 p.m. EDT on 9 Nov 2026 per the Federal Register (FR Doc. 2025-21671); USTR\'s 26 Nov 2025 press release says "until November 10, 2026"';
const EXCLUSION_END_NOTE = 'Section 301 China product exclusion end, two official wordings: the Federal Register notice (FR Doc. 2025-21671, 90 FR 55232, 1 Dec 2025) extends the exclusions "through 11:59 p.m. eastern daylight time on November 9, 2026"; the USTR press release of 26 Nov 2025 says the 178 exclusions "have been extended until November 10, 2026". The Federal Register text is the legal one. This calculator does not model individual exclusions.';

export const SERVER_INFO = { name: 'tariffmonitor', version: VERSION };

// The schedule's descriptions carry inline markup such as <il>10 kg</il>; an agent should see text.
const clean = (t) => String(t || '').replace(/<[^>]+>/g, '');

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'User-Agent': `tariffmonitor-mcp/${VERSION}` },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// A multi-word description finds nothing upstream, so retry the individual words, longest first —
// the longest token is usually the most specific noun. Reports what was actually searched.
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
async function fetchRate(hts, country, vol, explain = true) {
  const candidates = [hts];
  if (hts.length > 8) candidates.push(hts.slice(0, 8));
  if (hts.length > 6) candidates.push(hts.slice(0, 6));
  let last = null;
  for (const code of candidates) {
    const qs = `/rate?hts=${encodeURIComponent(code)}&country=${country}${explain ? '&explain=1' : ''}`
      + `${vol > 0 ? '&unit_cost=0' : ''}&utm_source=tariffmonitor-mcp`;
    last = await apiFetch(qs);
    if (last.ok) return { d: last, requested: hts, used: code };
  }
  return { d: last, requested: hts, used: null };
}

export const TOOLS = [
  {
    name: 'lookup_hts_code',
    title: 'Look up HTS code',
    annotations: { title: 'Look up HTS code', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    description: 'Find the US HTS (Harmonized Tariff Schedule) code for a product, by plain-language product name or numeric prefix, from the official USITC schedule (19,856 10-digit codes). Use this first whenever you have a product name rather than a code (e.g. "laptop", "wireless earbuds", "toys", "solar panels", "e-bike", "running shoes"), then pass a code to calculate_tariff or compare_origins. Everyday shopping words that a plain search of the schedule misses are mapped to the official heading that covers them (e.g. laptop -> 8471.30 "Portable automatic data processing machines"), and the answer names that heading. Otherwise descriptions are matched as one phrase; if a phrase matches nothing the tool retries single words and says which word it used. Returns up to 12 codes.',
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
    description: 'Calculate the full stacked US import tariff rate for an HTS code from a specific origin country. Returns: base rate, each additional layer (China Section 301 matched by HTS line to Lists 1, 2, 3, 4A and the 2024 four-year-review increases, Section 232, and the 2026 Section 301 forced-labor tariff on 60 economies: 10% or 12.5% by origin, or a 10%/12.5% cap net of MFN for the EU, Taiwan, Japan, South Korea and Switzerland, in effect since 24 Jul 2026, FR Doc. 2026-15181, HTS 9903.05.20-9903.05.84), the total current rate, the date the data was checked, and notes naming each exemption or assumption (Section 232 goods, USMCA- or CAFTA-DR-qualifying entries, listed products). Also states when the Section 301 China product exclusions end, in both official wordings: through 11:59 p.m. EDT on November 9, 2026 (Federal Register, FR Doc. 2025-21671), which USTR\'s 26 Nov 2025 press release gives as "until November 10, 2026". Figures are estimates; IEEPA tariffs ended 20 Feb 2026 and are not included. Optionally computes dollar impact from annual import volume.',
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
          description: 'Optional. Your annual import value in USD. If provided, the response includes the dollar cost of current duties and any additional cost once the Section 301 China exclusions end (after 11:59 p.m. EDT on November 9, 2026 per the Federal Register; USTR\'s press release says November 10, 2026).',
        },
      },
      required: ['hts_code'],
    },
  },
  {
    name: 'compare_origins',
    title: 'Compare tariffs by origin country',
    annotations: { title: 'Compare tariffs by origin country', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    description: 'Compare the estimated US import tariff for ONE HTS code across several origin countries side by side (e.g. China vs Vietnam vs Mexico vs India), for sourcing and "China plus one" decisions. For each origin returns the total current rate, the layers that make it up (MFN base, Section 301 China, Section 232, 2026 Section 301 forced-labor tariff) and the rate after the Section 301 China exclusions end (through 11:59 p.m. EDT on 9 Nov 2026 per the Federal Register, FR Doc. 2025-21671; USTR\'s press release says until 10 Nov 2026), sorted lowest first, with the dollar duty when an annual import value is given. Estimates only; preferential rates (USMCA, FTAs) depend on rules of origin and are not assumed.',
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
      },
      required: ['hts_code'],
    },
  },
];

// Returns the MCP content object for a tool call. Never throws for ordinary failures —
// an unreachable upstream is reported to the caller as text, same as the stdio server always did.
export async function callTool(name, args = {}) {

  if (name === 'lookup_hts_code') {
    const query = String(args.query || '').trim();
    if (query.length < 2) {
      return { content: [{ type: 'text', text: 'Query must be at least 2 characters.' }] };
    }
    // A shopping word ("laptop", "earbuds") either finds nothing in a keyword search or finds
    // the wrong goods ("toys" -> only pet toys). Search the official heading for it instead, and
    // say so, so the caller knows the codes come from a mapping and can still check the wording.
    const alias = /^[0-9.\s]+$/.test(query) ? null : matchAlias(query);
    let found;
    let aliasData = null;
    try {
      if (alias) aliasData = await apiFetch('/hts/search?q=' + encodeURIComponent(alias.prefix));
      found = await searchHts(query);
    } catch (e) {
      return { content: [{ type: 'text', text: 'Could not reach Tariff Monitor API: ' + e.message }] };
    }
    const data = found.data;
    if (aliasData?.ok && aliasData.results?.length) {
      const rows = aliasData.results.map((r) => `${r.hts10}  ${clean(r.description)}`).join('\n');
      const aliasCodes = new Set(aliasData.results.map((r) => r.hts10));
      const extra = (data.ok ? data.results || [] : [])
        .filter((r) => !aliasCodes.has(r.hts10)).slice(0, 6)
        .map((r) => `${r.hts10}  ${clean(r.description)}`).join('\n');
      const text = `"${alias.term}" is normally classified under HTS ${alias.heading}: ${alias.label}${alias.label.endsWith('...') ? '' : '.'} `
        + 'A plain keyword search of the schedule misses or mislabels this product, so these codes come from that heading.\n\n'
        + `Codes under ${alias.heading}:\n\n${rows}`
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
    const rows = data.results.map((r) => `${r.hts10}  ${clean(r.description)}`).join('\n');
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
    const hts = String(args.hts_code || '').replace(/[^0-9]/g, '');
    const country = String(args.origin_country || 'CN').toUpperCase().slice(0, 2);
    const vol = Number(args.annual_import_value_usd) || 0;

    if (hts.length < 6) {
      return { content: [{ type: 'text', text: 'hts_code must be at least 6 digits. Use lookup_hts_code to find the right code.' }] };
    }
    if (!/^[A-Z]{2}$/.test(country)) {
      return { content: [{ type: 'text', text: 'origin_country must be an ISO-2 code (e.g. CN, VN, MX, IN, KR, TW, DE, JP).' }] };
    }

    let r;
    try {
      // 2026-10-25: no AI-written explanation paragraph. It was sometimes cut off mid-sentence and could
      // state things the rate data does not (e.g. a wrong "no changes until" date); the structured stack is the answer.
      r = await fetchRate(hts, country, vol, false);
    } catch (e) {
      return { content: [{ type: 'text', text: 'Could not reach Tariff Monitor API: ' + e.message }] };
    }
    const d = r.d;
    if (!d || !d.ok) {
      return { content: [{ type: 'text', text: `HTS code ${hts} is not in the current US schedule, and neither is its 8- or 6-digit heading. Use lookup_hts_code to find the right code.` }] };
    }

    const layers = (d.layers || []).map((l) => `  ${l.label}: +${Number(l.rate).toFixed(2)}%`).join('\n');
    const cliffDelta = (d.cliff_total_rate - d.total_rate).toFixed(2);
    const cliffLine = Number(cliffDelta) > 0
      ? `\nAfter the Section 301 China exclusions end (${EXCLUSION_END_SHORT}): ${d.cliff_total_rate.toFixed(2)}% (+${cliffDelta}pp)`
      : '\nNo rate change projected for this code/country combination when the Section 301 China exclusions end.';

    let dollarLines = '';
    if (vol > 0) {
      const currentDuty = Math.round(d.total_rate / 100 * vol);
      const cliffExtra = Number(cliffDelta) > 0 ? Math.round(Number(cliffDelta) / 100 * vol) : 0;
      dollarLines = `\n\nDollar impact at $${vol.toLocaleString()}/yr import value:`
        + `\n  Current annual duties: $${currentDuty.toLocaleString()}`
        + (cliffExtra > 0 ? `\n  Additional once the exclusions end: $${cliffExtra.toLocaleString()}/yr` : '');
    }

    const explainBlock = '';
    // Say it plainly when the answer is for a different code than the one asked for. The rate is
    // right for the code named on the first line, and the caller must be able to see that.
    const resolvedNote = (r.used && r.used !== r.requested)
      ? `Note: ${r.requested} is not in the schedule. This rate is for heading ${r.used}, resolved to ${d.hts10}.\n\n`
      : '';

    const text = [
      `${resolvedNote}HTS ${d.hts10} — ${clean(d.description)}`,
      `Origin: ${country}`,
      ...(d.data_as_of ? [`Data checked: ${d.data_as_of}`] : []),
      '',
      'Rate stack:',
      layers,
      `Total current rate: ${d.total_rate.toFixed(2)}%`,
      cliffLine,
      ...((d.notices || []).map((n) => `\n${n}`)),
      `\n${EXCLUSION_END_NOTE}`,
      dollarLines,
      explainBlock,
      '',
      `Estimate only. Check the authoritative rate at https://hts.usitc.gov/ before relying on it.`,
      `Free browser calculator: ${CALC_URL}`,
    ].join('\n').replace(/\n{3,}/g, '\n\n').trim();

    return { content: [{ type: 'text', text }] };
  }

  if (name === 'compare_origins') {
    const hts = String(args.hts_code || '').replace(/[^0-9]/g, '');
    if (hts.length < 6) {
      return { content: [{ type: 'text', text: 'hts_code must be at least 6 digits. Use lookup_hts_code to find the right code.' }] };
    }
    const raw = Array.isArray(args.origin_countries) && args.origin_countries.length
      ? args.origin_countries : ['CN', 'VN', 'MX', 'IN', 'TH'];
    const countries = [...new Set(raw.map((c) => String(c).trim().toUpperCase()))];
    const bad = countries.filter((c) => !/^[A-Z]{2}$/.test(c));
    if (bad.length) {
      return { content: [{ type: 'text', text: `Not ISO-2 country codes: ${bad.join(', ')}. Use codes such as CN, VN, MX, IN, TH, KR, TW, DE, JP.` }] };
    }
    if (countries.length < 2 || countries.length > 8) {
      return { content: [{ type: 'text', text: 'Give 2 to 8 origin countries to compare (ISO-2 codes).' }] };
    }
    const vol = Number(args.annual_import_value_usd) || 0;

    let results;
    try {
      // explain=false: the per-origin plain-English explanation is slow and not needed for a table.
      results = await Promise.all(countries.map(async (c) => ({ c, r: await fetchRate(hts, c, vol, false) })));
    } catch (e) {
      return { content: [{ type: 'text', text: 'Could not reach Tariff Monitor API: ' + e.message }] };
    }
    const okRows = results.filter((x) => x.r.d && x.r.d.ok);
    if (!okRows.length) {
      return { content: [{ type: 'text', text: `HTS code ${hts} is not in the current US schedule, and neither is its 8- or 6-digit heading. Use lookup_hts_code to find the right code.` }] };
    }
    const first = okRows[0].r;
    okRows.sort((a, b) => a.r.d.total_rate - b.r.d.total_rate);
    const lines = okRows.map(({ c, r }) => {
      const d = r.d;
      const layers = (d.layers || []).filter((l) => l.type !== 'base' && Number(l.rate) > 0)
        .map((l) => `${l.label} +${Number(l.rate).toFixed(2)}%`).join('; ');
      const cliff = Number(d.cliff_total_rate) > Number(d.total_rate)
        ? ` -> ${Number(d.cliff_total_rate).toFixed(2)}% once the exclusions end` : '';
      const usd = vol > 0 ? ` | est. duty $${Math.round(d.total_rate / 100 * vol).toLocaleString()}/yr` : '';
      return `${c}: ${Number(d.total_rate).toFixed(2)}%${cliff}${usd}\n    MFN base ${Number(d.base_rate).toFixed(2)}%${layers ? '; ' + layers : ''}`;
    });
    const failed = results.filter((x) => !(x.r.d && x.r.d.ok)).map((x) => x.c);
    const notices = [...new Set(okRows.flatMap(({ r }) => r.d.notices || []))];
    const resolvedNote = (first.used && first.used !== first.requested)
      ? `Note: ${first.requested} is not in the schedule. Rates are for heading ${first.used}, resolved to ${first.d.hts10}.\n\n` : '';
    const text = [
      `${resolvedNote}HTS ${first.d.hts10} — ${clean(first.d.description)}`,
      ...(first.d.data_as_of ? [`Data checked: ${first.d.data_as_of}`] : []),
      '',
      'Estimated total US import tariff by origin (lowest first):',
      ...lines,
      ...(failed.length ? [`\nNo rate returned for: ${failed.join(', ')}`] : []),
      ...notices.map((n) => `\n${n}`),
      `\n${EXCLUSION_END_NOTE}`,
      '',
      'Preferential rates (USMCA, free trade agreements) depend on rules of origin and are not applied here; the origin of goods is where they were substantially transformed, not where they ship from.',
      'Estimate only. Check the authoritative rate at https://hts.usitc.gov/ before relying on it. For one origin in detail, use calculate_tariff.',
    ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return { content: [{ type: 'text', text }] };
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
}
