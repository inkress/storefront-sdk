# PARITY — Order Lifecycle & Integrity (SESSION vs ORDER-FIRST)

Audit of behavior/flow parity for the session-based checkout path vs the order-first path. Struct FIELD diffs are audited separately (not here). Every claim is backed by file:line in `commerce-api` (canonical repo).

**Path map.** "ORDER-FIRST" is really two sub-paths that share `update_order_status`:
- **(A) `Processor.record`** — POST /orders + apps/subscriptions (`processor.ex`, entered via `context/purchase/order.ex:14`). Order created up-front `order_pending`; a FAC **order webhook** (`fac.ex:process_order_based_webhook` ~307) later marks it paid.
- **(B) Payment-link charge** — `payment_link_controller.ex` → `Context.Purchase.PaymentLink` → `fac.ex` (`generate_session_url` 537 / `generate_charge` 563 / `checkout_intent` 878 / `complete_*`). Order pre-exists; charge marks it paid.

"SESSION" = `session_based_checkout.ex` (order materialized only after a successful FAC webhook, dispatched by `fac_session_webhook_worker.ex`).

---

### 1. Customer: guest vs account
- order-first: `fetch_customer` (processor.ex:894-947). New buyer created via `Service.Auth.Account.setup()` (processor.ex:914-917) → user gets `role: "customer"` + full account scaffolding; existing looked up by email (`get_by_email`, 899); merchant link via `RecordAssociationHelper.create_merchant_record` (processor.ex:935); `Process.put(:current_user, ...)` set (943). Email-keyed — no association to an authenticated/logged-in buyer.
- session:     `fetch_or_create_customer_for_order` (session_based_checkout.ex:1518-1552). New buyer created via **bare `Context.Accounts.User.create()`** (1533) — NO role, NO `Account.setup`; existing looked up by email (1523); merchant link via `create_merchant_record` (1538/1549); `current_user` set (1536/1548). Also email-keyed.
- gap: Top-level parity holds — BOTH treat the buyer as a guest keyed by email; NEITHER links a logged-in account. Divergence: session inserts a **bare User** while order-first runs `Service.Auth.Account.setup` with `role: "customer"`. Session-origin customers therefore lack the "customer" role/account scaffolding, so they may be invisible to role-scoped customer queries and unable to authenticate later.
- severity:    P2
- effort:      S
- reuse:       Replace session's `Context.Accounts.User.create(user_params)` with the same `Service.Auth.Account.setup(%{"user"=>..., "role"=>"customer"})` call order-first uses at processor.ex:914-917.

### 2. Risk gate parity
Three DISTINCT guards exist; each path runs a different subset:
- **CheckoutGate** (edge `ref` → commerce-risk, `Api.Risk.CheckoutGate.authorize`, checkout_gate.ex): session **YES** — `gate_checkout` (session_based_checkout.ex:141, 165-184). Order-first (B) **YES** — `gate_payment_link` (fac.ex:543/568/884, 1022-1050). Order-first (A) `Processor.record` **NO** — CheckoutGate is absent from `processor.ex` (grep: referenced only in checkout_gate.ex, fac.ex, session_based_checkout.ex).
- **Velocity** (frequency / anti-carding, `Service.Order.Velocity.check`, velocity.ex): order-first (A) **YES** — processor.ex:172-178. session **NO** (absent from session_based_checkout.ex).
- **Daily/monthly/single value limit** (`check_daily_transaction_limit`, processor.ex:430-518): order-first (A) **YES** — enforced at processor.ex:217-220. session **NO** — `calculate_checkout_fees` (session_based_checkout.ex:600-687) never calls it; session only WRITES the dtu/mtu counters post-hoc in `mark_order_as_paid` (1305-1313) without ever enforcing them.
- gap: Session runs CheckoutGate only. It **bypasses the anti-carding Velocity guard AND the merchant daily/monthly/single transaction-limit enforcement** that `Processor.record` runs. Conversely `Processor.record` skips CheckoutGate (only the payment-link sub-path B overlaps session on it). Net: a session checkout can exceed a merchant's configured daily/monthly/single caps and is not velocity-throttled.
- severity:    P1  (limit-enforcement + anti-carding bypass on the session money path)
- effort:      M
- reuse:       Both guards are public and already return the `{:error, msg}` shape the `with`-chain wants. Add `Service.Order.Velocity.check/1` (processor.ex:173) and `Service.Order.Processor.check_daily_transaction_limit/1` (processor.ex:217) into `create_checkout_session` before `gate_checkout`/FAC handoff. Also cross-check the dtu/mtu WRITE ownership: it currently lives ONLY in the session path (session_based_checkout.ex:1309-1310); `Processor.record` never increments the counter it enforces against (processor.ex:487/492 are `incrbyfloat(...,0)` reads) — see idempotency note below.

### 3. Inventory / stock
- order-first: reads `units_remaining` for an availability check in `fetch_products` (processor.ex:856-857); records order_lines (create_order_lines, 1260-1287); NEVER writes units_sold/units_remaining. The `record_offline` doc even states the online path "does not decrement inventory" (processor.ex:317-318).
- session:     reads `units_remaining` for the same availability check in `validate_products` (session_based_checkout.ex:566-570); records order_lines (1193-1226); NEVER writes stock.
- gap: **NONE (parity).** A repo-wide grep for any WRITE of `units_sold` / `units_remaining` (put/update/incr/decr/update_all) returns zero hits — neither path, and no worker, decrements stock or reserves units on order creation. Shared limitation (not a session-vs-order-first divergence): stock is advisory-only, the storefront `check_stock` is client-side, so oversell is possible on BOTH paths.
- severity:    P2  (shared gap; no divergence)
- effort:      M  (only if reservation is ever wanted — must land on both paths)
- reuse:       n/a

### 4. Merchant webhooks
- order-first: `process_order_based_webhook` (fac.ex:307-334) builds the notification via `order_to_webhook` → `generate_jwt` → `enqueue_webhook(%{action: "payment"...})` (fac.ex:324-327) on SUCCESS. The error branch `check_status` (fac.ex:254-266) ALSO enqueues an `action: "payment"` webhook carrying the error status (fac.ex:257-260) — merchant is notified on success AND failure/decline.
- session:     `enqueue_merchant_payment_webhook` (session_based_checkout.ex:1349-1375) uses the IDENTICAL `order_to_webhook` + `generate_jwt` + `enqueue_webhook(action: "payment")` builder — but is called ONLY from `handle_successful_payment` (1001). `handle_failed_payment` / `handle_cancelled_payment` / `handle_pending_payment` (1016-1045) update `session.data["status"]` and return, with NO webhook.
- gap: On SUCCESS: full parity (same event type `"payment"`, same JWT payload builder, same queue). Divergence: session fires **no merchant webhook on failed/cancelled/pending** payments; order-first does. Merchants integrated against the session path lose decline/failure notifications.
- severity:    P2
- effort:      S
- reuse:       Enqueue the same webhook from `handle_failed_payment`/`handle_cancelled_payment`. (No order exists yet on a failed session, so the payload is session-derived rather than order-derived — minor extra shaping vs the success path.)

### 5. Idempotency / duplicate webhooks
- order-first: entry guard `ensure_order_is_not_already_paid(%{status: 3})` (fac.ex:317, 1102-1107) short-circuits an already-paid order; `update_order_status` (processor.ex:1351-1391) does a **status-guarded** `Repo.update_all` (`WHERE status IN cancellable OR IS NULL`) returning `{0, nil}` when already transitioned, so only one webhook flips pending→paid. Payment-link path adds `get_session` scoped to `o.status != order_paid` (fac.ex:1071). **No row lock** — two concurrent webhooks can both pass the `status: 3` entry check and both reach `enqueue_webhook`, so a merchant "payment" webhook can be enqueued twice under a tight race (the status still flips only once; not a double-charge since provider capture is keyed on the single transaction).
- session:     `create_order_from_session` runs the whole materialization inside `Repo.transaction` with `fetch_session_by_id(lock: true)` = **`FOR UPDATE NOWAIT`** (session_based_checkout.ex:253-255, 890-904), plus `validate_session_for_order_creation` (1061-1078) and `ensure_no_duplicate_order` by reference_id (1101-1126) that return the existing order idempotently (`{:already_exists, ...}`). A concurrent duplicate hits NOWAIT, raises (lock unavailable), aborts the tx, and Oban retries (`fac_session_webhook_worker.ex` max_attempts 3); by retry the session is `"completed"` with `order_id` set and the existing order is returned.
- gap: Session dedup is the **stronger** design (pessimistic row lock + reference_id guard + completed short-circuit) — the order/transaction is created exactly once even under concurrent duplicate webhooks. Order-first relies on an optimistic status-guarded update with no lock (weaker; small double-merchant-webhook race window, but no double-order/double-charge). Rough edge on the session side: the `FOR UPDATE NOWAIT` lock failure raises a Postgrex error rather than being caught, so a racing duplicate surfaces as a noisy job error (retried) instead of a clean "in progress" result.
- severity:    P2  (session is robust; no double-charge on either path)
- effort:      S  (optional: catch the NOWAIT lock error in session and return an idempotent "in progress")
- reuse:       Session already robust. Order-first (A) could adopt the `FOR UPDATE NOWAIT` pattern from session_based_checkout.ex:896, but that is outside session scope.

### 6. Order status lifecycle
- order-first: order created up-front as `order_pending` (`create_order`, processor.ex:1244-1251); `@cancellable_statuses` = pending/confirmed/prepared/error/cancelled/stale (processor.ex:16-23); paid via shared `update_order_status(ref, :order_paid)` (processor.ex:1351) — stamps `status_on` (1363) and enqueues the subscription `BillingWorker` (`create_from_order`) when `billing_plan_id` set or kind `order_subscription` (processor.ex:1374-1384). Offline sales are created already `order_paid` (build_offline_order_attrs, 686-690). **No TTL** — an unpaid order lingers in `order_pending` indefinitely. Confirmation/return: `invoice_link` short_link (create_payment_urls, 1329-1349) + status-polling endpoints (order_controller.ex `status`/`cached_status`/`basic_status`).
- session:     a pre-order state machine in `session.data["status"]`: `pending` → `awaiting_payment` (update_session_with_payment_data, 848-856) → `payment_pending` | `payment_failed` | `payment_cancelled` | `order_creation_failed` | `completed` (1016-1055, 1321-1329); explicit **24h expiry** via `calculate_session_expiry` (778-780) enforced in `validate_session_for_webhook` (906-938, flips to `"expired"`); cancellation via `cancel_session` → `validate_session_cancellable` (312-317, 1331-1339). The ORDER it creates goes `order_pending` → `order_paid` through the SAME shared `update_order_status` (mark_order_as_paid, 1316) — so order-level transitions + subscription spin-up are at FULL parity.
- gap: Order-LEVEL lifecycle (pending→paid, `status_on`, subscription enqueue) is identical because both call the shared `update_order_status`. Divergences are at the session layer only, and mostly session-in-favor: session adds a richer pre-order state machine + a 24h session TTL that order-first lacks (order-first leaves an abandoned unpaid ORDER in `order_pending` with no expiry — pre-existing). Session also enqueues a buyer `NotificationWorker` email (1448) that order-first does NOT enqueue from commerce-api. No `return_url` is persisted on either path; confirmation is polling-based on both (order id/reference vs session_id).
- severity:    P2  (session is richer, not deficient; only true order-first gap is no expiry on abandoned pending orders — predates this work)
- effort:      n/a
- reuse:       n/a

---

## DONE

Top gaps (lifecycle & integrity):

- **P1 — Risk/limit bypass on the session money path (Dimension 2).** Session runs only `CheckoutGate`; it skips the anti-carding `Velocity.check` AND the daily/monthly/single transaction-limit enforcement (`check_daily_transaction_limit`) that `Processor.record` runs — so a session checkout can exceed a merchant's configured caps and isn't velocity-throttled. Both guards are public and drop into `create_checkout_session` with no shape changes. (Related: the dtu/mtu counter WRITE currently lives only in the session path, and `Processor.record` enforces a counter it never increments.)

- **P2 — No merchant webhook on failed/cancelled session payments (Dimension 4).** Success-path webhooks are byte-for-byte at parity (same `action: "payment"` builder), but session's failure/cancel handlers update session status only, while order-first notifies the merchant on decline too.

- **P2 — Session creates a bare customer User (Dimension 1).** Order-first runs `Service.Auth.Account.setup` with `role: "customer"`; session uses bare `User.create` (no role/account scaffolding), so session-origin buyers may be invisible to role-scoped queries and unable to authenticate later.

Non-gaps confirmed: **inventory** (Dim 3) — neither path decrements stock anywhere in the repo (shared advisory-only limitation, not a divergence); **idempotency** (Dim 5) — session's `FOR UPDATE NOWAIT` + reference_id dedup is strictly stronger than order-first's lock-free status guard, no double-charge on either; **order-level status transitions + subscription spin-up** (Dim 6) — identical via shared `update_order_status`.
