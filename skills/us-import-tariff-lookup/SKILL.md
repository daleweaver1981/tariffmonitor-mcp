---
name: us-import-tariff-lookup
description: Look up what it costs to import a product into the United States - find the HTS code for a product, then get an estimated stacked duty rate (MFN base + Section 301 + Section 232) for a specific origin country, whether the November 10 2026 Section 301 exclusion expiry affects it, and the dollar impact at a given annual import volume. Use when someone asks about tariffs, duties, HTS or HS codes, customs cost, or how much a trade measure will cost them.
---

# US import tariff lookup

## When to use this

Use it when a question turns on what the United States actually charges to import something:

- "What's the tariff on athletic footwear from China?"
- "We import $2M of aluminium fittings from Vietnam - what are we paying in duty?"
- "What HTS code covers cotton t-shirts?"
- "How much worse does the November 2026 cliff make this?"

Do NOT use it for export duties, for non-US destinations, or for customs valuation, freight or
brokerage costs. It answers one question: the US import duty rate for an HTS code from a country.

## How to call it

The data comes from the `tariffmonitor` MCP server. Install it once:

```json
{
  "mcpServers": {
    "tariffmonitor": {
      "command": "npx",
      "args": ["-y", "tariffmonitor-mcp"]
    }
  }
}
```

No API key, no signup. Two tools:

| Tool | Arguments | Returns |
|---|---|---|
| `lookup_hts_code` | `query` - a product keyword or numeric HTS prefix | up to 12 candidate codes with descriptions |
| `calculate_tariff` | `hts_code` (6-10 digits), `origin_country` (ISO-2, default CN), optional `annual_import_value_usd` | the rate stack layer by layer, the total, the Nov 10 2026 cliff projection, and the dollar cost if a volume was given |

Normal sequence: `lookup_hts_code` to get a code, confirm the description matches the product with
the user, then `calculate_tariff`.

## Two things that will bite you

Both were measured against the live API on 2026-09-11, and the tool now handles both - but you get
better answers if you know why.

1. **Descriptions match as one phrase.** `"athletic footwear"` matches no code description;
   `"footwear"` matches dozens. The tool retries the individual words (head noun first) and tells
   you which word it actually searched. Prefer a single keyword.
2. **Zero-padded headings are not real codes.** `6404110000` does not exist in the schedule;
   `640411` resolves to `6404112030`. The tool walks a not-found code back to its 8- then 6-digit
   heading and states which code the rate is for. Read that note before quoting the number - the
   rate belongs to the resolved code, not to the one you asked for.

## Honest limits - do not paper over these

- A rate is per HTS code AND origin country. Changing either changes the answer.
- The 10-digit statistical suffix matters. If you resolved to a 6-digit heading, the rate is for
  one specific suffix under it, which may not be the user's exact product. Say so.
- Duty rate is not landed cost: it excludes freight, insurance, MPF, HMF, brokerage and any
  antidumping or countervailing duty order.
- The November 10 2026 cliff figure is a projection from currently scheduled measures, not a
  prediction of policy.
- Classification is the importer's legal responsibility. This is a lookup, not a customs ruling.

## If the tool fails

If the MCP call errors, or the upstream is unreachable, or the code is not found at any heading:
**say that the rate could not be retrieved. Do not estimate a tariff rate from memory.** Duty rates
change several times a year and a confident wrong number costs the user real money at the border.
Point them at https://hts.usitc.gov/ to check by hand.

## Attribution

Data and tool: Tariff Exposure Monitor - https://scholar.0xpi.com/get/tariffmonitor
Source: https://github.com/daleweaver1981/tariffmonitor-mcp
