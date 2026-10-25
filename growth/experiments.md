# tariffmonitor-mcp: experiments log

Conversion event: a paid tool call through the Voidnet marketplace. Our proxy step is `activate`: a `tools/call`
that reached the tools on `/mcp`. ICP: developers and AI agents handling US import tariffs.

## Baseline at instrumentation (2026-10-11)
- **The listing cannot convert yet.** The public marketplace API reports `has_free_tier: true`, `has_paid_tier: false`
  and `stripe_price_id: null`, so paid calls are 0 by construction.
- `calls.jsonl` (per-call log since 18 Sep, backfilled into `data/funnel.db`): 22 authenticated `tools/call`, all
  `Go-http-client/1.1`.
  - 18 carried `x-voidnet-request-id` (Voidnet gateway): 6 in September and 12 in October (2 Oct x10, 11 Oct x2).
  - 4 were from September from the gateway before it sent request IDs.
  - Voidnet confirmed in writing on 23 Sep that every call up to then was their own composition check, with zero
    external buyers. The October calls are unattributed: buyer or Voidnet check can only be settled in the Voidnet
    console (Usage Logs, matched by request ID).
- Unauthenticated scanners (BrickBlueBot, AgentScout, opencompose-crawler, Ziwei-Seat, RIAA-RadarIAAgent and others)
  get a 401 before any tool runs, and are not counted as calls.
- Human-attributable activate: 0 proven · paid: 0.

## EXP-tariffmonitor-001: Voidnet marketplace listing (free tier)
- Date started: 2026-08-21 (re-published under @daleweaver1981 on 2026-09-26, Free Only)
- Product / funnel step: arrive -> activate
- Arrival id(s): voidnet-marketplace-listing, mcp-endpoint
- Hypothesis: a marketplace with built-in metering brings agent buyers without our own distribution.
- Primary metric: external (non-Voidnet) tools/call per week
- Result so far: 0 confirmed external calls in 7 weeks. Voidnet said its buyer outreach "started this week" on 23 Sep.
- Decision: iterate. The listing has no paid tier, so even a real buyer could not convert. Next is a paid tier
  (Dale's call: price and Stripe Connect), then judge after 14 days.

## EXP-tariffmonitor-002: npm package + official MCP registry (stdio)
- Date started: 2026-09-19 (v1.2.1 published)
- Result: not measurable from our side. stdio runs on the user's machine and sends us nothing, and npm download
  counts include mirrors and bots. It does not lead to the paid conversion event.
- Decision: hold (no further work)

## EXP-tariffmonitor-003: Gumroad $39 pack + free sampler (validated negative, unpublished)
- Date: 2026-08-21 to 2026-09-19
- Result: 0 sales and 0 tariff leads. Both were unpublished on 19 Sep because their rate data was stale
  (post-SCOTUS: IEEPA ended 20 Feb 2026). Phantom $79/$149 tiers were removed on 21 Aug.
- Decision: kill
- Learning: never sell a rate table that cannot be re-verified; an offer is only as true as its provisioning path.

## EXP-tariffmonitor-004: instrument the funnel (Rule Section 5)
- Date started: 2026-10-11
- Result: live. src/funnel.js records every tools/call as `activate` with tool, client UA, Voidnet request ID and
  class (voidnet-routed / platform-verify / scanner / internal / direct-client); daily rollup to funnel_daily;
  daily arrival checks to arrival_checks.
- Decision: keep

### EXP-tariffmonitor-001 update, 2026-10-20 (scout Run 222): the October calls are SETTLED as Voidnet-internal
- Source: the Voidnet console metering (Published Apps -> tariffmonitor, read-only via the fleet browser session; the
  console API takes the session, a bare fetch gets 401). 37 metered tools/call records since 27 Sep came from 2 buyer ids:
  - `7b82034f…` 35 calls (27 Sep -> 19 Oct). Its first session is 27 Sep 04:55Z, which Voidnet confirmed as its own
    composition check. It also calls our PRP review-checker app in the same minute (e.g. 19 Oct 15:34:29 tariff,
    15:34:31 PRP), i.e. a platform-side test runner that walks publisher apps.
  - `841be8d6…` 2 calls on 15 Oct, and the same id made 1 PRP check_reviews call on 1 Oct. Also cross-app.
- The Run 114 IP trigger (x-voidnet-request-id from a non-HUTCHISON-LK IP) has been firing since 2 Oct only because
  Voidnet's gateway egress moved to AWS 3.233.165.210. IP no longer discriminates. **New trigger: a metering record
  whose buyerId is not 7b82034f or 841be8d6** (console only; the buyer id never reaches our server).
- Console analytics 30 d: 45 MCP requests, 0 paid, $0.00 revenue, 0 active subscriptions. Stripe not connected.
- Human-attributable activate: 0. Paid: 0. Decision unchanged: iterate is blocked on a paid tier (Dale's call);
  no further scout work on this listing until a third buyer id appears.

## EXP-tariffmonitor-005: answer quality for agents (compare_origins, product-word lookup, China 301 by line)
- Date started: 2026-10-24
- Product / funnel step: activate -> repeat tools/call (an agent that gets a right, usable answer calls again)
- Arrival id(s): mcp-endpoint, voidnet-marketplace-listing; npm/registry stdio (unmeasured, EXP-002)
- Evidence before the change (gateway access log, all tariffmonitor-mcp upstream calls since 18 Sep):
  20 distinct queries, all footwear/bicycle; "running shoes" returned 0 codes. Spot checks: "laptop" 0 codes,
  "toys" only pet toys, "solar" only solar water heaters. China Section 301 was applied by whole chapter:
  laptops 8471.30 and smartphones 8517.13 got +25% (on no list in force; List 4B suspended), wooden furniture
  9403.60 and refrigerators 8418.10 got 0 (both List 3, +25%).
- Change: (1) adcreator-ai 5c97a15: China 301 per HTS line from HTSUS 2026 Rev. 21 ch. 99 U.S. notes 20 and 31
  (9,924 codes on Lists 1-4A; four-year-review headings 9903.91.xx with dates; described-product lists shown as
  may-apply notes only). (2) tariffmonitor-mcp 1.3.0 (c982dc8, npm): new compare_origins tool; ~55 product words
  mapped to USITC headings; markup stripped. Hosted /mcp on VM100 runs 1.3.0.
- Hypothesis: if answers are correct and usable for the common product questions, then repeat tools/call per
  buyer id moves from 0 non-Voidnet buyers to >=1 buyer with >=3 calls in 14 days, because agents re-use tools
  that return a usable number.
- Primary metric: count of Voidnet buyer ids other than 7b82034f / 841be8d6 with >=3 metered calls (console).
- Minimum sample: any third buyer id. Window: 14 days (judge 2026-11-07).
- Kill criteria: no third buyer id by 7 Nov -> the constraint is distribution, not answer quality; stop
  feature work and only keep data current.
- Scale criteria: a third buyer with repeat calls -> add the next most-asked origin/product gaps from its calls.
- Not done (needs a browser login): MCP registry 1.3.0 (mcp-publisher JWT expired); Voidnet listing
  description update for the new tool.
- Result: pending

## EXP-tariffmonitor-006: keyless public remote (/mcp-free) + registry `remotes` entry
- Date started: 2026-10-25 (endpoint live; registry 1.3.1 with the remotes entry is STAGED, see growth/drafts/registry-publish-1.3.1.md)
- Product / funnel step: arrive -> activate (first tools/call without a key or install)
- Arrival id(s): mcp-free-remote (new); npm/registry stdio stays unmeasured (EXP-002)
- Why: rivals in the official MCP registry list hosted remote URLs; ours offered only npm stdio (unmeasurable) and a
  Voidnet-keyed /mcp, so an agent could not try the tools without a key. Paid conversion is still blocked on a Voidnet
  paid tier (EXP-001), so this measures reach, not revenue.
- Change: https://adcreator-ai.com/mcp-free (VM400 gateway `location = /mcp-free` -> VM100 10.0.0.105:8792, ufw only
  from the gateway). Same 1.3.1 tools as /mcp. Standard Streamable HTTP, stateless, JSON responses. Limits: 25
  tools/call per client IP per UTC day + 500/day global (our egress/LAN exempt); over the limit -> HTTP 429 +
  JSON-RPC -32000 naming `npx -y tariffmonitor-mcp` and the Voidnet listing. Every POST goes to calls.jsonl with
  endpoint=free-remote; every tools/call that reaches the tools -> funnel_events step=activate, source=free-remote,
  landing_path=/mcp-free, with the same classify() bot/scanner/internal flags as /mcp.
- Hypothesis: if agents can call the tools with no key, then weekly free-remote tools/call from non-Voidnet,
  non-scanner, non-internal clients moves from 0 (endpoint did not exist) to >=10/week from >=2 distinct ip_hash,
  because the registry and directories surface a URL that works on first try.
- Primary metric (bot-filtered): weekly count of funnel_events step=activate, source=free-remote, is_bot=0,
  is_internal=0 (see funnel.summary() free_remote_7d_not_bot_not_internal).
- Minimum sample before judging: 14 days after the registry 1.3.1 publish (the remotes entry is the main arrival).
- Window: 14 days; judge 2026-11-08 (move the date if the registry publish lands later).
- Kill criteria: <3 qualifying calls in the window -> remote URL is not a distribution lever; keep it up (cost ~0) but
  stop feature work for it.
- Scale criteria: >=10/week from >=2 clients -> list the remote in mcpservers.org/Glama entries and add a server card;
  look at which tools they call and fix the gaps.
- Watch: daily share of the 500 global cap used (data/free-limits.json); upstream load on adcreator-ai.com/api/tem.
- Result: pending
