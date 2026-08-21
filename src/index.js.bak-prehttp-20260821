#!/usr/bin/env node
// Tariff Exposure Monitor MCP server
//
// Exposes two tools:
//   lookup_hts_code    — search 19,856 HTS codes by description or prefix
//   calculate_tariff   — stacked rate (base + Section 301 + IEEPA + reciprocal)
//                        plus the November 10, 2026 cliff projection
//
// Data is served from adcreator-ai.com — free, no API key required.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const API_BASE = 'https://adcreator-ai.com/api/tem';
const PACK_URL = 'https://scholar.0xpi.com/get/tariffmonitor';
const BUY_URL  = 'https://weaverdale5.gumroad.com/l/wmpath';

const server = new Server(
  { name: 'tariffmonitor', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'User-Agent': 'tariffmonitor-mcp/1.0.0' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'lookup_hts_code',
      description: 'Search for HTS (Harmonized Tariff Schedule) codes by description or numeric prefix. Returns up to 12 matching codes with descriptions. Use this before calculate_tariff when you only have a product description.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Product description (e.g. "athletic footwear") or HTS code prefix (e.g. "6404"). Min 2 characters.',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'calculate_tariff',
      description: 'Calculate the full stacked US import tariff rate for an HTS code from a specific origin country. Returns: base rate, each additional layer (Section 301, IEEPA, reciprocal), total current rate, and the projected rate after the November 10, 2026 cliff. Optionally computes dollar impact from annual import volume.',
      inputSchema: {
        type: 'object',
        properties: {
          hts_code: {
            type: 'string',
            description: 'HTS code — at least 6 digits, up to 10 (e.g. "6404.11" or "6404110000"). Dots and spaces are ignored.',
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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === 'lookup_hts_code') {
    const query = String(args.query || '').trim();
    if (query.length < 2) {
      return { content: [{ type: 'text', text: 'Query must be at least 2 characters.' }] };
    }
    let data;
    try {
      data = await apiFetch('/hts/search?q=' + encodeURIComponent(query));
    } catch (e) {
      return { content: [{ type: 'text', text: 'Could not reach Tariff Monitor API: ' + e.message }] };
    }
    if (!data.ok || !data.results?.length) {
      return { content: [{ type: 'text', text: 'No HTS codes found matching "' + query + '". Try a broader description or check the code prefix.' }] };
    }
    const rows = data.results.map(r => `${r.hts10}  ${r.description}`).join('\n');
    return {
      content: [{
        type: 'text',
        text: `HTS codes matching "${query}":\n\n${rows}\n\nUse calculate_tariff with the most relevant code.`,
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

    let d;
    try {
      d = await apiFetch(`/rate?hts=${encodeURIComponent(hts)}&country=${country}&explain=1${vol > 0 ? '&unit_cost=0' : ''}&utm_source=tariffmonitor-mcp`);
    } catch (e) {
      return { content: [{ type: 'text', text: 'Could not reach Tariff Monitor API: ' + e.message }] };
    }

    if (!d.ok) {
      return { content: [{ type: 'text', text: `HTS code ${hts} not found in the current US schedule. Use lookup_hts_code to find the right code.` }] };
    }

    const layers = (d.layers || []).map(l =>
      `  ${l.label}: +${Number(l.rate).toFixed(2)}%`
    ).join('\n');

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

    const text = [
      `HTS ${d.hts10} — ${d.description}`,
      `Origin: ${country}`,
      '',
      'Rate stack:',
      layers,
      `Total current rate: ${d.total_rate.toFixed(2)}%`,
      cliffLine,
      dollarLines,
      explainBlock,
      '',
      `Data source: ${PACK_URL}`,
      `Full 67-code Survival Kit (pre-computed cliff math): ${BUY_URL}`,
    ].join('\n').replace(/\n{3,}/g, '\n\n').trim();

    return { content: [{ type: 'text', text }] };
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
