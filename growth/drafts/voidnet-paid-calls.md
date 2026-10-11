<!--
target_channel: Voidnet console (www.openvoidnet.com/console), account @daleweaver1981 (Google login)
target_person: Dale
funnel_step: activate -> paid
status: DRAFT. Nothing was changed in the console. Every step below needs a console session.
written: 2026-10-11 by Claude Code
-->

# tariffmonitor-mcp: where "paid" numbers come from, and what blocks them

## Paid-call data needs a login
- Voidnet's metering is readable only from the Console (Published Apps -> tariffmonitor -> Usage Logs, Export CSV)
  or `GET /api/console/publishers/apps/{appId}/metering`, which "requires a console session" (docs.openvoidnet.com/docs/money/usage).
- The `voidnet` CLI (`voidnet logs tail --app <id>`) needs a browser login or a Console-issued `vnp-pub-` machine token.
  No such token exists on the fleet.
- The only login-free source is the public app record `https://www.openvoidnet.com/api/marketplace/apps/tariffmonitor`.
  It shows tier status but no call counts. On 2026-10-11: `has_paid_tier: false`, `stripe_price_id: null`, free tier
  limits 1000/day, 100/min, 10000 meter limit. App id `4565e242-13b2-4233-b30f-da79493f553f`.
- Paid tool calls are therefore 0 by construction until a paid tier exists.

## What Dale would do (only if he decides to charge)
1. Console -> Published Apps -> tariffmonitor -> Pricing: add a paid tier. Price is his decision (Rule s3). The record
   currently holds a placeholder `pricing_amount: 999` (USD 9.99/month) that is not active.
2. Connect Stripe (Stripe Connect onboarding) so the tier can bill.
3. Republish.
4. Optional, for automation: Console -> create a machine token with `usage:read` / `billing:read`, then on VM100 run
   `voidnet login --token <token>` as aiadmin. The keeper could then join Usage Logs to `data/funnel.db` by
   `x-voidnet-request-id` (meta.request_id) and write `paid` rows. Until then, paid numbers come from the console.

## Reconciliation already possible
Every routed call in `data/funnel.db` stores `meta.request_id` (= `x-voidnet-request-id`). Voidnet confirmed on 23 Sep
that request IDs join one-to-one with Usage Logs, and that `tools/list` is never metered, so join on `tools/call` only.
To settle the open question on the 12 October calls (2 Oct x10, 11 Oct x2): look up those request IDs in Usage Logs and
check whether each buyer is Voidnet's own account.

## Also stale on the listing (fix at the next republish)
The tool descriptions Voidnet cached on 26 Sep still say "Calculate the full stacked US import tariff rate"; the
listing description says "No API key", while buyers do use a Voidnet key. A Re-Verify refreshes the tool text from the
live server.
