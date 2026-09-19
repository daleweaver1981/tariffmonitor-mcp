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

const API_BASE = 'https://adcreator-ai.com/api/tem';
const PACK_URL = 'https://scholar.0xpi.com/get/tariffmonitor';
const CALC_URL = 'https://adcreator-ai.com/tariffs/calculator';

export const SERVER_INFO = { name: 'tariffmonitor', version: '1.2.1' };

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'User-Agent': 'tariffmonitor-mcp/1.2.0' },
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
async function fetchRate(hts, country, vol) {
  const candidates = [hts];
  if (hts.length > 8) candidates.push(hts.slice(0, 8));
  if (hts.length > 6) candidates.push(hts.slice(0, 6));
  let last = null;
  for (const code of candidates) {
    const qs = `/rate?hts=${encodeURIComponent(code)}&country=${country}&explain=1`
      + `${vol > 0 ? '&unit_cost=0' : ''}&utm_source=tariffmonitor-mcp`;
    last = await apiFetch(qs);
    if (last.ok) return { d: last, requested: hts, used: code };
  }
  return { d: last, requested: hts, used: null };
}

export const TOOLS = [
  {
    name: 'lookup_hts_code',
    description: 'Search for HTS (Harmonized Tariff Schedule) codes by description or numeric prefix. Returns up to 12 matching codes. Use this before calculate_tariff when you only have a product description. Descriptions are matched as a single phrase, so one keyword ("footwear") matches far more than a phrase ("athletic footwear"); if a phrase matches nothing this tool retries the individual words and tells you which word it used.',
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
    description: 'Calculate the full stacked US import tariff rate for an HTS code from a specific origin country. Returns: base rate, each additional layer (Section 301, Section 232), total current rate, and the projected rate after the November 10, 2026 Section 301 exclusion expiry. Figures are estimates; IEEPA tariffs ended 20 Feb 2026 and are not included. Optionally computes dollar impact from annual import volume.',
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
          description: 'Optional. Your annual import value in USD. If provided, the response includes the dollar cost of current duties and the additional cost from the Nov 10 cliff.',
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
    let found;
    try {
      found = await searchHts(query);
    } catch (e) {
      return { content: [{ type: 'text', text: 'Could not reach Tariff Monitor API: ' + e.message }] };
    }
    const data = found.data;
    if (!data.ok || !data.results?.length) {
      return { content: [{ type: 'text', text: 'No HTS codes found matching "' + query + '"'
        + (query.includes(' ') ? ', and no single word in it matched either' : '')
        + '. Try a broader single keyword, or a numeric HTS prefix such as 6404.' }] };
    }
    const rows = data.results.map((r) => `${r.hts10}  ${r.description}`).join('\n');
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
      r = await fetchRate(hts, country, vol);
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
      ? `\nNov 10, 2026 cliff: ${d.cliff_total_rate.toFixed(2)}% (+${cliffDelta}pp jump)`
      : '\nNo cliff change projected for this code/country combination.';

    let dollarLines = '';
    if (vol > 0) {
      const currentDuty = Math.round(d.total_rate / 100 * vol);
      const cliffExtra = Number(cliffDelta) > 0 ? Math.round(Number(cliffDelta) / 100 * vol) : 0;
      dollarLines = `\n\nDollar impact at $${vol.toLocaleString()}/yr import value:`
        + `\n  Current annual duties: $${currentDuty.toLocaleString()}`
        + (cliffExtra > 0 ? `\n  Additional after Nov 10 cliff: $${cliffExtra.toLocaleString()}/yr` : '');
    }

    const explainBlock = d.explanation ? `\n\nExplanation: ${d.explanation}` : '';
    // Say it plainly when the answer is for a different code than the one asked for. The rate is
    // right for the code named on the first line, and the caller must be able to see that.
    const resolvedNote = (r.used && r.used !== r.requested)
      ? `Note: ${r.requested} is not in the schedule. This rate is for heading ${r.used}, resolved to ${d.hts10}.\n\n`
      : '';

    const text = [
      `${resolvedNote}HTS ${d.hts10} — ${d.description}`,
      `Origin: ${country}`,
      '',
      'Rate stack:',
      layers,
      `Total current rate: ${d.total_rate.toFixed(2)}%`,
      cliffLine,
      dollarLines,
      explainBlock,
      '',
      `Estimate only. Check the authoritative rate at https://hts.usitc.gov/ before relying on it.`,
      `Free browser calculator: ${CALC_URL}`,
    ].join('\n').replace(/\n{3,}/g, '\n\n').trim();

    return { content: [{ type: 'text', text }] };
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
}
