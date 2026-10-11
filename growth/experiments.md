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
