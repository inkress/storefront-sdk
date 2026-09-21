# Session checkout — REAL gaps on prod (version/4.1-beta)

Verified against a worktree off `origin/version/4.1-beta` (`claude/session-checkout-audit`,
tip `0e599d34` #215). Supersedes the PARITY-*.md files, which were read on the stale
`feature/spi-3ds` branch. See CRITICAL-BRANCH-CONTEXT.md.

## Already done on prod — NOT gaps
- Discount codes (#214): `resolve_session_discount` + `Service.Discount` (scoping, caps). ✅
- Auth/capture correctness: records authorized vs captured from the gateway result, gates
  paid-on-captured, CaptureFlipReconciler (commerce-worker) flips on settlement. ✅
- 3DS strength gate (`gate_3ds_strength`, `complete_charge_3ds`, `authorize_only`). ✅
- Order-record parity (lines, totals, same `Context.Purchase.*` creators, customer link),
  idempotency (FOR UPDATE NOWAIT), subscription spin-up, fee engine, tax(=0), multi-currency. ✅

## Confirmed REAL gaps (file:line on the 4.1-beta worktree)
1. **P1 — Velocity + transaction-limit enforcement missing.** `session_based_checkout.ex` has no
   `Velocity.check` (anti-carding) or `check_daily_transaction_limit` (merchant daily/monthly/single
   caps); `Processor` (POST /orders) runs both. A session checkout can exceed a merchant's caps and
   skips the carding brake. Reuse: both are public, return `{:error, msg}`; call inside
   `create_checkout_session`'s `with` before `generate_payment_link`.
2. **P1 — Shipping address not persisted.** No `shipping_address_frozen` on the session order;
   `create_checkout_session` neither accepts nor stores a ship-to address (order_detail.data only holds
   `{customer, fulfillment_total}`). Physical-goods merchants can't fulfil. Reuse: order-first
   `fetch_address(:shipping_address)` + `shipping_address_frozen`; thread an address param through
   create → session.data → order_detail.
3. **P2 — No merchant webhook on decline/cancel.** `handle_failed_payment` (:1105) /
   `handle_cancelled_payment` (:1126) only update session status; only success enqueues
   `enqueue_merchant_payment_webhook` (:1089). Merchant is blind to declines. Reuse: order-first's
   decline-notify.
4. **P2 — Bare customer User.** `fetch_or_create_customer_for_order` uses `Context.Accounts.User.create`
   (:1699), not `Service.Auth.Account.setup` with `role: "customer"`; session buyers lack account
   scaffolding (role-scoped queries, later auth).
5. **Browser side (branch-independent) — dormant SDK/kit path.** storefront-sdk `createSession` +
   the new DOM kit checkout hook are not wired to the live session flow (live path is fs-hono →
   admin-sdk → `/checkout/sessions`). This is the FleekSite-kit-facing wiring.

## Lower priority / verify-if-in-scope
- P1? Subscription fee basis: session uses the subscription product's `billing_plan` fee_sets vs
  order-first's merchant active processing plan (money-agent finding; matters only for subscription
  sessions).
- Saved cards: sessions can't vault/charge a saved `card_ref` (separate feature, not wire-up).
- Shipping validation strictness: both trust client `fulfillment_total`; session coerces junk→0 vs
  order-first `validate_money` guard.

## Recommended first pass
Close the two **P1s** (velocity/limits + shipping-address) — real security + fulfilment gaps, both
small drop-in reuses from the processor — and wire the **browser side** (storefront-sdk createSession
+ kit hook) to the live session path. P2s (decline webhook, customer scaffolding) are quick adds to
batch in. All additive; verify on dev (Island Vibes) via `simulate_webhook`.
