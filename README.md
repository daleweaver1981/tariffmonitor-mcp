# tariffmonitor-mcp

MCP server for the **Tariff Exposure Monitor** — a live US import tariff calculator covering 19,856 HTS codes.

Give Claude (or any MCP-compatible AI) the ability to look up real stacked tariff rates and project the **November 10, 2026 cliff** impact on any product.

## What it does

Two tools:

| Tool | What it does |
|---|---|
| `lookup_hts_code` | Search 19,856 HTS codes by description or numeric prefix |
| `calculate_tariff` | Returns an estimated stacked rate (MFN base + Section 301 + Section 232) and flags the Nov 10, 2026 Section 301 exclusion expiry. Optional: annual import volume → dollar impact |

Example exchange — a real capture from the live API on 2026-09-11, not a mock-up:

```
You: What's the tariff on athletic footwear from China, and what does it cost me at $800k/year?

Claude: [calls lookup_hts_code query="athletic footwear", then calculate_tariff
         hts_code="6404110000", origin_country="CN", annual_import_value_usd=800000]

Note: 6404110000 is not in the schedule. This rate is for heading 640411, resolved to 6404112030.

HTS 6404112030 - For men
Origin: CN

Rate stack:
  MFN base rate: +0.00%
  Section 301 (China trade enforcement): +7.50%
Total current rate: 7.50%

No cliff change projected for this code/country combination.

Dollar impact at $800,000/yr import value:
  Current annual duties: $60,000
```

Rates change, and a rate is per HTS code and origin country - treat the numbers above as the shape
of the answer, not as a quote for your shipment. The tool never invents a rate: if the upstream is
unreachable or the code is not in the schedule, it says so instead of estimating.

## Install (Claude Desktop)

Add to your `claude_desktop_config.json`:

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

Restart Claude Desktop. The `lookup_hts_code` and `calculate_tariff` tools appear automatically.

## Install (Cursor / other MCP clients)

```json
{
  "mcp": {
    "servers": {
      "tariffmonitor": {
        "command": "npx",
        "args": ["-y", "tariffmonitor-mcp"]
      }
    }
  }
}
```

## No API key required

The tool calls the free public API at adcreator-ai.com. No signup, no rate limits for reasonable use.

## Related

- [Free tariff calculator](https://adcreator-ai.com/tariffs/calculator) — browser version
- [Free sample pack](https://scholar.0xpi.com/get/tariffmonitor) — 5 HTS codes with full cliff math PDF
- [Tariff Survival Kit ($39)](https://weaverdale5.gumroad.com/l/wmpath) — 67 HTS codes pre-computed + sourcing alternatives + Nov 10 action checklist

## Affiliate program

Earn 35% on every sale. [Sign up here](https://app.gumroad.com/affiliates/products/wmpath).

Built by [Dale Weaver / 0xpi](https://0xpi.com).
