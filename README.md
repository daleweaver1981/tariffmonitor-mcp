# tariffmonitor-mcp

MCP server for the **Tariff Exposure Monitor** — a live US import tariff calculator covering 19,856 HTS codes.

Give Claude (or any MCP-compatible AI) the ability to look up real stacked tariff rates and project the **November 10, 2026 cliff** impact on any product.

## What it does

Two tools:

| Tool | What it does |
|---|---|
| `lookup_hts_code` | Search 19,856 HTS codes by description or numeric prefix |
| `calculate_tariff` | Returns stacked rate (base + Section 301 + IEEPA + reciprocal) + Nov 10 cliff projection. Optional: annual import volume → dollar impact |

Example exchange:
```
You: What's the tariff on athletic footwear from China, and how does the cliff change my costs if I import $800k/year?

Claude: [uses calculate_tariff with hts_code="6404.11", origin_country="CN", annual_import_value_usd=800000]
HTS 6404110000 — Footwear with outer soles of rubber/plastics...
Rate stack:
  Base rate (MFN): +20.00%
  Section 301 (List 4A): +7.50%
  IEEPA emergency tariff: +145.00%
Total current rate: 172.50%
Nov 10, 2026 cliff: 195.00% (+22.50pp jump)

Dollar impact at $800,000/yr import value:
  Current annual duties: $1,380,000
  Additional after Nov 10 cliff: $180,000/yr
```

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
