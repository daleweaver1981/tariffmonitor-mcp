# tariffmonitor-mcp

**tariffmonitor-mcp is US import tariff lookup software by 0xpi for AI agents and developers: an MCP server that looks up 19,856 HTS codes and estimates stacked US import duty rates (MFN, Section 301 and Section 232) by country of origin. Free and open source, with a free hosted endpoint.** It is not an electricity or energy tariff tool. Made by [0xpi](https://0xpi.com/about); 0xpi is not affiliated with Pi Network, any cryptocurrency or blockchain project.

MCP server for the **Tariff Exposure Monitor** — a live US import tariff calculator covering 19,856 HTS codes.

Give Claude (or any MCP-compatible AI) the ability to look up real stacked tariff rates and see what changes when the Section 301 China product exclusions end (**through 11:59 p.m. EDT on November 9, 2026** per the Federal Register, FR Doc. 2025-21671; USTR's 26 Nov 2025 press release says "until November 10, 2026") for any product.

## What it does

Three tools:

| Tool | What it does |
|---|---|
| `lookup_hts_code` | Search 19,856 HTS codes by product name or numeric prefix. Everyday words a keyword search misses (laptop, earbuds, toys, solar panels, e-bike, running shoes and ~50 more) map to the official USITC heading that covers them |
| `calculate_tariff` | Returns an estimated stacked rate (MFN base + China Section 301 by HTS line, Lists 1-4A and the 2024 four-year-review increases + Section 232 + the 2026 Section 301 forced-labor tariff on 60 economies), the date the data was checked, each exemption or assumption, and the Section 301 China exclusion end (11:59 p.m. EDT, 9 Nov 2026 per the Federal Register; 10 Nov 2026 in USTR's press release). Optional: annual import volume → dollar impact |
| `compare_origins` | One HTS code, 2-8 origin countries side by side (e.g. CN vs VN vs MX vs IN), lowest rate first, with each layer, the post-9-Nov-2026 rate and optional annual dollar duty. For sourcing and "China plus one" decisions |

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

Section 301 China product exclusions are extended "through 11:59 p.m. eastern daylight time on November 9, 2026" (Federal Register, FR Doc. 2025-21671, 90 FR 55232, 1 Dec 2025). USTR's press release of 26 Nov 2025 says the 178 exclusions "have been extended until November 10, 2026". The Federal Register text is the legal one. This calculator does not model individual exclusions.

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

## Try it without installing (free hosted remote)

A keyless public endpoint serves the same three tools over Streamable HTTP:

```
https://adcreator-ai.com/mcp-free
```

- No key, no signup. Limits: 25 tool calls per IP per day, and 500 per day across all users (reset 00:00 UTC). `initialize` and `tools/list` do not count.
- Over the limit you get a JSON-RPC error (HTTP 429) that points to the npm package below, which has no limit because it runs on your machine.
- Each call is logged (time, method, tool, status, user agent, client IP, and the client name the MCP client reports) to measure use and filter scanners. The log does not store tool arguments. Log lines are deleted after 365 days. Full details: [Privacy Policy](#privacy-policy).

Claude Code: `claude mcp add --transport http tariffmonitor https://adcreator-ai.com/mcp-free`

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

Restart Claude Desktop. The `lookup_hts_code`, `calculate_tariff` and `compare_origins` tools appear automatically.

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

## Privacy Policy

The hosted endpoint `https://adcreator-ai.com/mcp-free` is covered by the privacy notice at
https://adcreator-ai.com/public/mcp-privacy.html. In short:

- **Collected:** for each request, the time, MCP method, tool name, status, duration, client IP address, user agent and the client name/version sent at `initialize`. Tool arguments are not stored in the call log. Rate limits use a hashed form of the IP address.
- **Use:** answering the call, rate limits, abuse and scanner filtering, and counting use. No profiling, advertising or sale of data.
- **Sharing:** none beyond hosting providers. HTS lookups go to our own tariff database (adcreator-ai.com), which records the HTS code and origin country of each rate lookup without your IP address. No data is sent to AI providers.
- **Retention:** call-log lines are deleted automatically after 365 days; rate-limit counters last one day.
- **Contact:** customer.service@0xpi.com for access or deletion requests.

The npm package (`npx -y tariffmonitor-mcp`) runs on your machine and sends only its lookups (product search words, HTS codes and origin countries) to the same tariff database.
