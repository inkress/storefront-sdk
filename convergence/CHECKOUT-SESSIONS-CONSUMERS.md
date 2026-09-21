# Checkout-sessions — what's live, what renders, what's missing

Evidence-backed map (read-only sweep of all repos under `~/projects/inkress` +
`~/projects/fleeksite`; worktrees/`*-old`/`*-prod` duplicates excluded). Verified the
load-bearing fs-hono finding directly.

## Server anchor (commerce-api → api.inkress.com)
- Routes **live**: `router.ex:262-268` `/v1/checkout` → `post /sessions`, `get /sessions/:id`,
  `delete /sessions/:id`, `post /sessions/:session_id/simulate_webhook`.
- `checkout_session_controller.ex` create/show/delete → `Service.Order.SessionBasedCheckout`.
- `session_based_checkout.ex` (~1560 loc): create session (no order) → risk gate → FAC payment
  link; webhook → create order (idempotent, FOR UPDATE NOWAIT). `generate_payment_link` :782,
  `build_webhook_url` :843.
- `frame_url` = `{web}/marketplace/{username}/checkout/session/{id}` (controller :291-304).

## 1. Live callers (all via `@inkress/admin-sdk` `checkoutSessions`)
- **fs-hono (FleekSite storefronts) — LIVE prod.** `src/routes/payments/index.ts:98 case 'inkress'`
  → `InkressGateway.createCheckoutSession` → `src/lib/payments/inkress.ts:118 sdk.checkoutSessions.create()`
  → returns `frame_url`. **Verified directly.**
- **doorman** (event ticketing) — LIVE. `app/lib/checkout.server.ts:196` → `inkress.server.ts:145`.
- **inkress-events** — LIVE (same scaffold).
- **doorman-scanner** — sibling copy, live-capable.
- **commerce-shopify-pay** — wired (`hosted-checkout.server.ts:49`) but **risk-blocked (402)** in its
  own verification notes; not confirmed live.

## 2. Render page — LIVE, real (not a stub)
- `commerce-web/app/routes/marketplace.$username.checkout.session.$id._index.tsx` — loads
  `admin.checkout.show(id)` (GET /checkout/sessions/:id), requires `status == awaiting_payment`
  + `redirect_data`, renders `<PayWithFacCard>` in `CheckoutShell`. `{web}` = commerce-web (inkress.com).
- No-username fallback URL `/marketplace/checkout/session/{id}` (controller :299) has **no matching
  route** — minor gap.

## 3. FAC webhook — live handling
- FAC `redirect_url` = `{PAYMENT_PROVIDER_ADAPTER_URL}/fac/webhook` (external adapter, not commerce-api).
- `providers/fac/fac.ex process_session_based_webhook` → enqueues `FacSessionWebhookWorker`
  → `fac_session_webhook_worker.ex:53` → `SessionBasedCheckout.handle_payment_webhook/1`
  (creates order + enqueues merchant webhook). fs-hono receives `POST /payments/webhooks/inkress`.
- Stage4 migrator webhooks (`{api}/webhooks/payments/stage4/...`) are a **separate/experimental** path.

## 4. Order-first path (the OTHER, mainstream commerce-web flow)
- commerce-web Dawn `app/routes/checkouts.$id.tsx` → `paymentLink.invoice` + `order.create` (POST /orders)
  → `/payments/link/{token}/...`. Heavily used = production for commerce-web/marketplace.
- storefront-sdk `createSession`/`cart.createSession` + commerce-web `checkout.ts` create/delete are
  **built but DORMANT** (no live callers) — the admin-sdk resource is what's live.

## Takeaway
Session-based checkout **is the live storefront/ticketing money path** (fs-hono/FleekSite,
doorman, inkress-events), with a live render page and a live FAC webhook→order worker. The
**order-first** path is the parallel commerce-web/marketplace flow. The storefront-SDK's own
`createSession` (what the new DOM kit's checkout hook calls) is dormant and needs aligning with the
live session path.

## Confirmed gap for "full functionality"
`calculate_checkout_fees` hardcodes `discount: {flat, 0}` (line + total) — **session checkout cannot
apply discount codes**. Per-product `discounted_price` (sale prices) and shipping (`fulfillment_total`)
DO work. The order-first path already resolves codes via `services/payments/calculators/discount.ex`
and threads the result into the SAME `TransactionCalculator` — so the fix is reuse, not new math.
