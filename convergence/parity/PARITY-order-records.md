# Parity — order records (session vs order-first)

Anchor read (parent). Compares the persisted order/order_detail/order_line/transaction
records produced by session `create_order_from_session` vs order-first
`Service.Order.Processor`. Both write through the SAME `Context.Purchase.*` +
`Context.Ledger.Transaction` creators, so downstream (reporting, reconcile) is compatible.

### Structural parity — SAME creators
- order-first: `create_order` → `Context.Purchase.Order.create` (processor.ex:1244); `create_order_detail` → `OrderDetail.create` (:1252); `create_order_lines` → `OrderLine.create` (:1259).
- session: `create_order_record` → `Context.Purchase.Order.create` (session_based_checkout.ex:1165); `create_order_detail_record` → `OrderDetail.create` (:1190); `create_order_line_records` → `OrderLine.create` (:1212); `create_transaction_record` → `Ledger.Transaction.create` (:1258).
- gap: none — same write layer.
- severity: — · effort: —

### Order LINES — parity
- order-first: frozen fields = product_variant_name_frozen, product_variant_total_frozen (product[:price]), quantity, variant_id, order_id, properties, meta_data (processor.ex:1259-1271).
- session: identical set; total uses `price || cost || 0` (session_based_checkout.ex:1199-1212).
- gap: none (comment even says "same fields as main order creation flow").
- severity: — · effort: —

### Shipping ADDRESS — GAP
- order-first: freezes `shipping_address_frozen` on order_detail (processor.ex:237 and :368), fetched via `fetch_address(params, :shipping_address)` (:199/:350).
- session: `create_order_detail_record` sets order_id, title, merchant_name_frozen, tax_total_frozen, discount_total_frozen, `data: {customer, fulfillment_total}` (session_based_checkout.ex:1171-1186) — **no shipping_address_frozen, no ship-to address anywhere on the order.**
- gap: a session order carries no ship-to address; physical-goods merchants can't fulfil. `create_checkout_session` doesn't accept/persist a shipping address either.
- severity: **P1** (functional gap for physical goods) · effort: S–M
- reuse: order-first `fetch_address` + `shipping_address_frozen`; thread a shipping_address param through create → session.data → order_detail.

### order.total — parity
- order-first: order.total = `fees[:sub_total]` (processor.ex:225); transaction.total = `fees[:customer_total]` (:257).
- session: order.total = `fees["sub_total"]` (session_based_checkout.ex:1140); transaction.total = `fees["customer_total"]` (:1249).
- gap: none (same convention: order = merchandise sub_total, transaction = grand customer_total).
- severity: — · effort: —

### discount_total_frozen — record ready, calc is the gap
- session: order_detail `discount_total_frozen = fees["discount_total"]` (:1181); transaction carries discount_total (:1246). So the moment fees compute a real discount, the records are correct.
- gap: (a) fees hardcode discount 0 (see PARITY-money); (b) **no discount CODE / discount record persisted** and **no count-based reclaim** on order creation — order-first records+reclaims the code (needed for per-customer caps + count limits). Session would double-allow.
- severity: **P0** (caps/reclaim correctness once codes are accepted) · effort: M
- reuse: order-first discount resolve+reclaim (see PARITY-money) inside the same locked transaction.

### Transaction captured on webhook — cross-check vs FAC
- session: transaction.status = `transaction_captured` (:1239); mark_order_as_paid fires `update_transaction_status(payment_method_order_id, "captured")` (fire-and-forget, :1296) + `Processor.update_order_status(:order_paid)` (:1316) + daily/monthly usage counters (:1309-1310).
- gap: session marks the local txn captured on the payment webhook. Whether a real FAC CAPTURE occurs (vs auth-only) is the auth/capture question → see PARITY-payments. If FAC session is auth-only, local "captured" diverges from FAC settlement (FAC settlement = source of truth).
- severity: cross-ref PARITY-payments · effort: —

### meta_data / return_url
- session: order.meta_data = session_data["metadata"] (:1146). Storefront return/confirmation redirect (order.meta_data.return_url pattern used by commerce-web status page) — confirm the session render page honours it → see PARITY-lifecycle.
- severity: cross-ref PARITY-lifecycle

## DONE
Top order-record gaps: (1) **no shipping address persisted** (P1); (2) **no discount code record / reclaim** on order creation once codes are accepted (P0, pairs with the fee-calc gap); (3) captured-on-webhook needs the FAC auth/capture cross-check. Everything else (lines, totals, creators, customer link, usage counters, idempotency) is at parity.
