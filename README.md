# tariffmonitor-mcp

MCP server for the **Tariff Exposure Monitor** — a live US import tariff calculator covering 19,856 HTS codes.

Give Claude (or any MCP-compatible AI) the ability to look up real stacked tariff rates and see what changes when the Section 301 China product exclusions end (**through 11:59 p.m. EDT on November 9, 2026**, per FR Doc. 2025-21671) for any product.

## What it does

Two tools:

| Tool | What it does |
|---|---|
| `lookup_hts_code` | Search 19,856 HTS codes by description or numeric prefix |
| `calculate_tariff` | Returns an estimated stacked rate (MFN base + China Section 301 + Section 232 + the 2026 Section 301 forced-labor tariff on 60 economies), the date the data was checked, each exemption or assumption, and the Section 301 China exclusion end (11:59 p.m. EDT, 9 Nov 2026). Optional: annual import volume → dollar impact |

Example exchange — a real capture from the live API on 2026-10-24, not a mock-up (the AI-written
explanation paragraph is left out):

```
You: What's the tariff on athletic footwear from China, and what does it cost me at $800k/year?

Claude: [calls lookup_hts_code query="athletic footwear", then calculate_tariff
         hts_code="6404110000", origin_country="CN", annual_import_value_usd=800000]

Note: 6404110000 is not in the schedule. This rate is for heading 640411, resolved to 6404112030.

HTS 6404112030 - For men
Origin: CN
Data checked: 2026-10-24

Rate stack:
  MFN base rate: +0.00%
  Section 301 (China trade enforcement): +7.50%
  Section 301 forced-labor tariff (2026): +12.50%
Total current rate: 20.00%

No rate change projected for this code/country combination when the Section 301 China exclusions end.

The MFN base rate for this code is missing from our data and is counted as 0, so the total may be understated. Check the general rate at https://hts.usitc.gov/.

Section 301 forced-labor tariff (FR Doc. 2026-15181; data checked 2026-10-24): included. China: +12.5%, heading 9903.05.31. Stacks on other Section 301 duties.

Assumption: the good is not covered by a Section 232 action (exempt under U.S. note 52(f)); this calculator only detects Section 232 steel, aluminum and copper by chapter.

Section 301 China product exclusions are extended "through 11:59 p.m. eastern daylight time on November 9, 2026" (Federal Register, FR Doc. 2025-21671, 90 FR 55232). This calculator does not model individual exclusions.

Dollar impact at $800,000/yr import value:
  Current annual duties: $160,000
```

The Section 301 forced-labor layer (USTR, 60 economies, entries from 12:01 a.m. ET on 24 Jul 2026,
Federal Register 91 FR 47318, HTS 9903.05.20-9903.05.84) is 12.5% or 10% depending on origin; for the
EU and Taiwan it tops the MFN rate up to 10%, and for Japan, South Korea and Switzerland up to 12.5%.
Products listed in U.S. note 52 and goods carrying a Section 232 layer are exempt; exemptions that
depend on facts the tool cannot see (USMCA or CAFTA-DR qualification, civil-aircraft or pharmaceutical
use) are stated as assumptions in the answer.

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
- [Official US Harmonized Tariff Schedule](https://hts.usitc.gov/) — the authoritative rates

Built by [Dale Weaver / 0xpi](https://0xpi.com).
