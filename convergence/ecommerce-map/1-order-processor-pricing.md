# commerce-api: order money pipeline (line price + order total)

Repo: `/Users/romario/projects/inkress/commerce-api`
Branch: `feature/spi-3ds` @ `47377c921bb7633a67f45f2fd0380b41cb419b6e`
Status: COMPLETE

Scope: how an order LINE price is derived from product/options/quantity, and how the
ORDER TOTAL is assembled from fee groups. Feeds the cross-repo ecommerce structure map.

Key files:
- `lib/api/services/orders/processor.ex` — classic order-create path (`record_online/1`, `record_offline/1`)
- `lib/api/services/orders/session_based_checkout.ex` — Shopify-style /checkout/sessions path
- `lib/api/services/payments/calculators/transaction.ex` — `TransactionCalculator` fee engine
- `lib/api/schema/purchase/{order,order_line,order_detail}.ex` — frozen schemas

---

## 1. Classic processor pipeline (processor.ex)

Entry: `Service.Order.Processor.record_online/1` (the `with` block at
`processor.ex:163-294`). Offline/cash twin: `record_offline/1` (`319-...`), same line
logic, no fees/tax, no ledger txn.

Order of operations inside the `Repo.transaction`:

1. Resolve merchant (`fetch_merchant`, tenant-context only, `726-753`), validate account
   status, anti-carding velocity guard (`172-178`).
2. Concurrent fetch (`Utils.Process.async`, `180-184`): currency, **products**, customer,
   subscription plan, provider config.
3. `validate_total(...)` — **server re-derives the order total from products** (see §2).
4. `validate_shipping_total` (`193`, `624-632`) — `fulfillment_total` from client, passed
   through `validate_money`, default `0`.
5. `fetch_discount` / `fetch_tax` — **STUBBED to `%{total: 0}`** (`1197-1213`). The classic
   path applies **no tax and no discount**; they exist in the fee args only as zeros.
6. `calculate_fees(...)` (`204-216`) → `TransactionCalculator.calculate_from_legacy` (see §3).
7. `check_daily_transaction_limit(fees[:customer_total_jmd] || fees[:customer_total])`.
8. `create_order(total: fees[:sub_total])` — **order.total = sub_total** (`221-231, 1244-1251`).
9. `create_order_detail(...)` — freezes addresses, merchant name,
   `tax_total_frozen: fees[:tax_total]`, `discount_total_frozen: fees[:discount_total]` (`234-244`).
10. `create_order_lines(products: products)` — one line per product (`245-249`, §4).
11. `create_order_transaction(total: fees[:customer_total], provider_fee: fees[:provider_total],
    platform_fee: fees[:platform_total])` — **ledger txn total = customer_total** (`250-260`).
12. `create_payment_urls(...)` builds the provider redirect.

So three different "totals" land in three places:
- `order.total`            = `fees[:sub_total]`      (goods sub-total, pre-fee)
- `order_detail`           = `tax_total_frozen`, `discount_total_frozen` (both 0 here)
- `ledger transaction`     = `fees[:customer_total]` (what the customer is actually charged)

---

## 2. Line price derivation & client-vs-server authority

### `fetch_products/1` (`processor.ex:755-868`) — the per-line calc

Client sends a `products` list; each entry has (atomized): `id`, `quantity`,
`properties` (a `{name => value}` / list of `{name,value}`), and optionally
`property_list`.

Server work per product:
- DB load (`759-762`): `select map(p, [:id, :title, :price, :image, :currency_id,
  :units_remaining, :unlimited, :data])`. **Price/stock/title come from the DB row**, matched
  by `"#{product[:id]}" == "#{record.id}"`.
- `customer_inputs = record[:data]["customer_inputs"]` (`772`) — the server-side option/add-on
  definitions (name + options[] with label/price, or a scalar price).
- Server-derived `property_list` (`774-793`): for each client `{name,value}` in
  `product[:properties]`, find the matching `customer_inputs` entry; the option price is
  `selected_option[:price]` (when the input has `:options`, matched by `opt[:label] == value`)
  else `option[:price]`. Stored as `%{name, value, price: parse_float(price,0)}`.
  **This is server-side option pricing sourced from `product.data.customer_inputs`.**
- `base_cost` (`801-808`): `record[:price]`, overridden by `record[:data]["discounted_price"]`
  when that is `> 0`. **DB-authoritative base price.**
- `unit_cost = base_cost + property_costs` (`810`), `total_cost = quantity * unit_cost` (`812`).
- Product map is rebuilt (`832-850`): `cost = total_cost`, `price = total_cost`,
  `property_list = <server-derived list>`, `properties = property_map` (name => `%{value, price}`),
  `line_meta_data.original_product = {title, price, image, unit_cost, addon_cost,
  discounted_cost, customer_inputs, attributes, currency_code}`.
- Stock guard (`853-858`): out-of-stock / insufficient-stock unless `record[:unlimited]`.
  **Inventory is validated but NOT decremented on the create path.**

### THE ADD-ON PRICE BUG / SUBTLETY (important)

`property_costs` (`796-799`) — the add-on delta that feeds `unit_cost`/line price — is summed
from **`product[:property_list]`**, i.e. the **CLIENT-provided** field:

```elixir
property_costs = (product[:property_list] || [])
|> Enum.map(&(&1.price || 0))
|> Enum.sum()
```

It is NOT summed from the server-derived `property_list` variable built at `774-793`
(that variable is only stored back onto the line at `834`, AFTER `property_costs` is computed).

Consequences:
- If the client sends `properties` **only** (no `property_list`): `property_costs = 0`, so
  **options add nothing to the charged price**, even though the server-derived per-option prices
  are still frozen into `line.properties`. (Price and frozen option prices disagree.)
- If the client sends `property_list` with prices: those **client** prices drive the add-on
  delta and therefore the charged line price.
  → Whether option add-ons are server-authoritative depends on which field the client populates.
  (Confirm what the storefront SDK / controller actually sends — flagged for the caller.)

### Is the base line price authoritative? YES.

`validate_total/2` (`592-622`) — when `params[:products]` is non-empty:

```elixir
params[:products] |> Enum.map(&(&1.cost)) |> Enum.sum()
```

is returned as the order total (`597-603`). The client-sent `total` is **ignored/overridden**
whenever products are present. `product.cost` is the server-derived `total_cost`
(`quantity * (base_cost + property_costs)`). So the **base price and quantity are
server-authoritative**; only the add-on delta has the client-field caveat above.

(No-products branch, e.g. raw payment-link amount: client `total` is trusted, subject to
`validate_money` and min-thresholds USD≥$1 / JMD≥$150, `605-618`.)

---

## 3. Fee-group model (`TransactionCalculator`, transaction.ex)

`calculate_fees` (`processor.ex:988-1101`) builds the arg map and calls
`TransactionCalculator.calculate_from_legacy`. Notable:
- `total` = `Enum.sum(products.cost)` again (`1028`), i.e. goods sub-total.
- Fee sets = `billing_plan.fee_sets ++ provider_plan.fee_sets` (`1069`), each preloaded with
  `[fees: :currency]`.
- For fee_set `kind 6` (platform) / `kind 7` (provider), the `fee_payer` on each fee is
  overridden from `merchant.platform_fee_structure` / `merchant.provider_fee_structure`
  (`1036-1066`).
- `offset_fees: true` is passed (`1078`) — customer-gross-up mode is ON for the order path.
- Subscriptions: tax & shipping skipped; `customer_total` forced to `total` (`1084-1092`).
- `customer_total_jmd = Api.Currency.to_jmd(customer_total, currency)` for limit check (`1095`).

### Fee-set kind → group kind (`transaction.ex:292-300`, `@fee_set_kind_map`)
| DB kind | group kind        | meaning                 |
|--------:|-------------------|-------------------------|
| 1       | `discount`        | discount                |
| 2       | `shipping`        | shipping/fulfillment    |
| 3       | `before_tax_fee`  | merchant fee            |
| 4       | `tax`             | tax                     |
| 5       | `after_tax_fee`   |                         |
| 6       | `platform_fee`    | Inkress platform fee    |
| 7       | `bank_fee`        | provider/processor fee  |

### Processing order (`@kind_priority`, `transaction.ex:535-543`)
`discount(1) → shipping(2) → before_tax_fee(3) → tax(4) → after_tax_fee(5) →
platform_fee(6) → bank_fee(7)`. Groups sorted by this (`sort_fee_groups`, `722`).
**Relative to tax: discount, shipping, before_tax_fee are pre-tax; after_tax_fee,
platform_fee, bank_fee are post-tax.** Bank/provider fee is last (applies to the full
customer total).

### `calculated_on` (`@calculated_on_map`, `309-312`)
`1 => base_total`, `2 => customer_total` (compound). Per fee-set; picks whether the group is
computed on the goods base or the running customer total (`process_fee_group:1008`).

### Payer (`@fee_payer_map`, `319-322`): `1 => merchant`, `2 => customer`
- `customer`: fee is **added on top** of `customer_total` (customer pays).
- `merchant`: fee is **subtracted** from `merchant_total` (merchant absorbs); customer_total
  unchanged.
See `apply_standard_fee` (`1377-1386`), `apply_offset_eligible_fee` (`1388-1395`),
`apply_discount` (`1368-1375`, subtracts from customer+merchant+offset base).

### Offset mode (`offset_fees: true`, the order path)
`process_groups_with_offset` (`755-774`): post-tax `platform_fee`/`bank_fee` groups are split
out and run through `FeeEngine.compute` (`810-874`) which **grosses the fee up onto the
customer** when `fee_payer == "customer"` (so the merchant nets the pre-fee amount), else the
merchant absorbs it. Pre-tax groups run the normal path first.

### Result assembly (`build_result`, `1397-1429`)
- `sub_total`      = `base_total` (Σ item cost − item discount + item tax)
- `customer_total` = `base_total + Σ(fees where charged_party==customer) − discount_total`
  (**recomputed from fee_mappings**, not the running state var)
- `platform_total`, `provider_total`, `shipping_total`, `tax_total`, `discount_total`,
  `merchant_total`, `before_tax_fee_total`, `after_tax_fee_total`, plus `fee_mappings` /
  `fee_ids`.

### Currency handling
- Flat fees pre-converted to the order currency up front via exchange rate
  (`preconvert_flat_fees:625`, `to_money:947-973`, `Worker.Services.Finance.ExchangeRate`).
- Percentage fees are currency-agnostic (left as basis points; `4000 bp = 4%`, `/100000`).
- Item costs converted to target currency in `calculate_base_total` (`677-693`).
- Money stored as integer cents; `money_to_float` divides by 100, rounds to 3 dp (`1446-1453`).

### IMPORTANT: with products present, global discount/tax are dropped
`build_items` has two clauses. **With a non-empty product list** (`324-346`) it reads
**per-product** `discount`/`tax` and IGNORES the global `opts[:tax]`/`opts[:discount]`. The
no-product clause (`348-371`) is the only place the global discount/tax total is applied. Since
`fetch_products` sets each product's discount/tax to value `0` (`840-849`) and
`fetch_discount`/`fetch_tax` return `0`, **the classic order path yields `discount_total = 0`
and `tax_total = 0`.** (The server-authoritative discount-code feature must enter via the
session/other path — verifying next.)

---

## 4. Frozen order-line fields (`create_order_lines`, `processor.ex:1260-1287`)

Per product, an `OrderLine` is created with:
| field                         | source (in `fetch_products` output)                    |
|-------------------------------|--------------------------------------------------------|
| `product_variant_name_frozen` | `product[:title]` = DB `record.title`                  |
| `product_variant_total_frozen`| `product[:price]` = `total_cost` (**line total = qty×unit**, not unit) |
| `quantity`                    | `product[:quantity]` (client-sent int)                 |
| `variant_id`                  | `product[:id]` = **the PRODUCT id** (no variant table) |
| `properties`                  | `product[:properties]` = server-derived `%{name => %{value, price}}` |
| `meta_data`                   | `product[:line_meta_data]` = `%{original_product: {...snapshot...}}` |

Note the frozen `properties` carry the **server-derived** per-option prices even though the
charged add-on delta used the client `property_list` (the §2 mismatch).

`OrderLine` schema (`schema/purchase/order_line.ex`): the "variant" FK **is the product** —
`belongs_to :product, Api.Inventory.Product, foreign_key: :variant_id, references: :id` (`19-21`).
There is **no variant table**; `variant_id` stores a `products.id`. The line also has
`discount_id`, `discount_total_frozen` (dflt 0), `tax_id`, `tax_total_frozen` (dflt 0) which the
create paths **do not set** (stay 0). Required: `product_variant_name_frozen`,
`product_variant_total_frozen`, `quantity`, both `*_total_frozen`, `order_id`.
`product_variant_total_frozen` validated `>= 0 and < 300_000_000`.

`Order` schema: `total :float`, immutable after create; `has_many :order_lines`;
`has_many :products, through: [:order_lines, :product]`.
`OrderDetail` schema: has `discount_code_frozen`, `discount_id`, `discount_total_frozen`,
`shipping_method_frozen`, `tax_total_frozen`, and a whitelisted `data` jsonb
(`@allowed_data_keys`: lynk_id, customer, plan_id, shipping_address, fulfillment_type,
fulfillment_total, pickup_location, note).

---

## 5. Session-based checkout path (session_based_checkout.ex)

Entry `create_checkout_session/1` (`108-160`), called directly by
`ApiWeb.CheckoutSessionController.create` (`checkout_session_controller.ex:67`) with raw params.
Two-phase (Shopify-style):

**Phase A — session create (pre-payment):** `fetch_merchant → billing_plan → currency →
customer → provider_config → provider_plan → validate_products → calculate_checkout_fees →
create_session_record → gate_checkout (Api.Risk.CheckoutGate) → generate_payment_link (FAC)`.
Fees are computed **once here** and frozen onto `session.data["fees"]`.

**Phase B — order create (on FAC webhook success):** `handle_payment_webhook` →
`create_order_from_session/2` (`248-300`, `Repo.transaction`, `FOR UPDATE` lock + idempotency):
`build_order_params → create_order_record → create_order_detail_record →
create_order_line_records → create_transaction_record → create_invoice_link_record →
mark_order_as_paid`. **No re-pricing** — everything reads `session.data["fees"]` / `["products"]`.

### `validate_products/1` (`474-583`) vs processor `fetch_products`
Same DB load, same `unit_cost = base_cost + property_costs`, `total_cost = qty * unit_cost`,
same `cost`/`price = total_cost`, same frozen shape. Two real differences:

1. **Add-on wiring is "fixed" here:** `property_costs` (`511-513`) sums the **server-derived**
   `property_list` variable (`500-508`), NOT a client field. So the client cannot inject add-on
   prices here.
2. **...but option price resolution is broken here:** `property_list` uses
   `Utils.parse_float(option[:price], 0)` (`506`) where `option` is a **raw string-keyed**
   `customer_inputs` entry that is **never atomized** (contrast processor `779`
   `Utils.string_keys_to_atom()`). `option[:price]` (atom key on a string-keyed map) is `nil`,
   and there is **no `option[:options]`/label handling** (contrast processor `782-787`). Net:
   **server-side option add-ons resolve to 0 on the session path** for both the scalar-price and
   the per-label-option `customer_inputs` shapes. (Product `data` is jsonb → string keys;
   confirmed `attr["name"]` string access at `502`.) Verify against a real payload/fixture.

So per-line base price + quantity are server-authoritative on BOTH paths; **option deltas are
effectively 0 on the session path**, and client-field-dependent (`property_list`) on the
processor path.

### `parse_total/2` (`587-598`) and `calculate_checkout_fees/1` (`600-687`)
- `parse_total`: `nil` total + products ⇒ `Σ product.cost` (server); a **provided** total is
  trusted (`parse_float`). But it only feeds the `total == 0` guard and the no-products item.
- With products, `calculate_checkout_fees` rebuilds `items` from products and sets
  `final_total = Σ items.cost` (`647`) — **server-authoritative total** regardless of client
  `total`. Items carry `discount/tax` value 0 (`641-642`), and the call passes global
  `discount: 0`, `tax: 0` (`661-662`), `offset_fees: true` (`667`). Fee sets built the same way
  (`build_fee_sets`, `689-704`; kind 6/7 payer overridden from merchant structures).
- Subscriptions: `customer_total` forced to `final_total` (`673-679`).
- Same `TransactionCalculator.calculate_from_legacy` engine (§3).

### Frozen writes from session (Phase B)
- `build_order_params` (`1134-1150`): `order.total = fees["sub_total"]`.
- `create_order_detail_record` (`1171-1191`): `tax_total_frozen = fees["tax_total"]||0`,
  `discount_total_frozen = fees["discount_total"]||0`; `data = %{customer, fulfillment_total}`.
  **Note: session path does NOT freeze billing/shipping address** into order_detail (processor
  does, via `billing_address_frozen`/`shipping_address_frozen`).
- `create_order_line_records` (`1193-1226`): `variant_id = product["id"]`,
  `product_variant_name_frozen = product["title"]`,
  `product_variant_total_frozen = product["price"] || product["cost"] || 0` (line total),
  `properties = product["properties"]` (server map), `meta_data = product["line_meta_data"]`.
- `create_transaction_record` (`1228-...`): `status = transaction_captured` (order is created
  post-payment), `total = customer_total`, plus full breakdown (`sub_total, discount_total,
  shipping_total, tax_total, platform_total, provider_total, merchant_total`).

---

## 6. processor.ex vs session_based_checkout.ex — pricing diff

| aspect | processor.ex (classic) | session_based_checkout.ex |
|---|---|---|
| when fees computed | inline, at create | once at session create, frozen on session |
| order created | immediately (`order_pending`, pre-payment) | on webhook success (`FOR UPDATE`, idempotent) |
| txn status at create | pending (kind 30) | `transaction_captured` (kind = transaction_order) |
| base price / qty | server-authoritative (DB `record.price`) | same |
| option add-on delta | from **client** `product[:property_list]` (0 if omitted); server prices computed but unused for cost | from **server** `property_list`, but prices resolve to **0** (atom-key + no options handling) |
| total when products | `Σ product.cost` (server) via `validate_total` | `Σ items.cost` (server) via `final_total` |
| total when no products | client `total` (min-threshold checks) | client `total` (`parse_total`) |
| discount / tax | `0` (stubs `1197-1213`) | `0` (hard-coded `661-662`) |
| offset_fees | `true` | `true` |
| address freezing | billing + shipping frozen | not frozen (customer + fulfillment_total only) |
| fee engine | identical `TransactionCalculator` | identical |

Both feed the **same** `TransactionCalculator`; the money model is identical, only the
orchestration, option-cost wiring, and what gets frozen differ.

---

## 7. Discount & tax reality on this branch (`feature/spi-3ds`)

Both order paths pass `discount_total = 0` and `tax_total = 0` into the engine, so
`discount_total`/`tax_total` come out **0** and the frozen `*_total_frozen` fields are 0.
- `processor.fetch_discount`/`fetch_tax` are commented-out stubs returning `%{total: 0}`
  (`1197-1213`).
- Session path hard-codes `discount`/`tax` value 0 (`661-662`) and per-item 0 (`641-642`).
- **No `/discount` resolver route exists** under `/v1/public/m/:merchant_username`
  (`router.ex:208-214` has `/products`, `/fees`, `/tokens`, `/payment_methods` only). The quote
  endpoint is `MerchantController.get_fees` → `Processor.check_fees` (`processor.ex:26-61`),
  which also zeroes discount/tax.
- `lib/api/services/payments/calculators/discount.ex` is a **separate legacy** module
  (`Ecommerce.Discounts`, item/purchase discount math) that is **not wired** into either order
  path or the `TransactionCalculator`.

The discount-code feature the KB notes as LIVE (server-authoritative resolver, discount
fee-group) lives on the `version/4.1-beta` prod line, **not on this `feature/spi-3ds` branch**.
The engine already supports it structurally: fee-set `kind 1` → `discount` group, priority 1
(pre-tax), `apply_discount` subtracts from customer + merchant totals (`transaction.ex:1368-1375`).

---

## 8. IMPLICATIONS FOR VARIANTS

Today price + stock live on the **product** row (`products.price`, `data.discounted_price`,
`data.customer_inputs`, `units_remaining`, `unlimited`); the order line freezes from that product
and stores the product id in `order_line.variant_id` (aliased "variant" but FK → `products.id`).

A real **per-SKU variant table** OR a **product-per-SKU** mapping would change:
- **Unit price source.** `base_cost` would resolve from the chosen SKU's price/`discounted_price`
  instead of the parent product's (`fetch_products:801-808`, `validate_products:516-519`). The
  client would send a `variant_id` (or SKU id) per line to select it; today the client sends a
  product `id` and free-form `properties`.
- **Stock.** The out-of-stock / insufficient-stock guards would key off the SKU's
  `units_remaining`/`unlimited`, not the product's (`processor:853-858`,
  `session:559-571`). Per-SKU inventory becomes possible (note: neither path decrements stock at
  create today — that stays true).
- **Line freeze.** `variant_id` would finally point at a genuine variant/SKU row;
  `product_variant_name_frozen` would be the SKU/variant name (e.g. "Tee / L / Blue") rather than
  the product title; `product_variant_total_frozen` (line total) is unchanged in meaning.
- **Option pricing.** Priced options (`customer_inputs`) are the current stand-in for variants.
  A SKU model would move size/colour price differences out of `customer_inputs` add-ons into SKU
  base price — which sidesteps BOTH current bugs (client-controlled `property_list` on processor;
  0-resolving option price on session), since the delta would be in the server-owned SKU price.
  Free-form add-ons (engraving, notes) could remain as `properties`.

What it would **NOT** change:
- **Fee/total assembly.** `TransactionCalculator` operates on item `cost` only (§3). Line cost is
  still `Σ` into `base_total`; fee groups, ordering (discount→shipping→before_tax→tax→after_tax→
  platform→bank), payer semantics, offset gross-up, currency conversion, and the
  `sub_total / customer_total / platform_total / provider_total / merchant_total` outputs are all
  unaffected by where a line's price comes from.
- **The three-total split.** `order.total = sub_total`, `order_detail` freezes tax/discount,
  ledger txn = `customer_total` — unchanged.
- **Frozen field set / schema.** `order_lines` already has the `product_variant_*_frozen` +
  `variant_id` columns; a variant model reuses them (variant would be a new FK target, or SKUs
  become products). No new order-side columns are strictly required for the money path.
- **Money precision / rounding.** integer-cents Money, `/100` float round(3) — unchanged.

Net: variants are a **catalog/line-resolution** change (which row supplies price + stock +
frozen name), not a **fee-engine** change. The cleanest lever is making a line's `cost` come from
a server-owned per-SKU price; everything downstream already consumes `cost` and is variant-agnostic.

---

## DONE

---

## LIVE-BRANCH CORRECTIONS (version/4.1-beta @ c3cf49de) — added by parent synthesis

Agent 1 read the main checkout, which is on `feature/spi-3ds`. The LIVE deploy branch is
`version/4.1-beta` (`c3cf49de`); its `processor.ex` is 1977 lines (materially refactored — discount +
risk + SPI hardening). Verified directly from `git show c3cf49de:…processor.ex`:

- **Line-price calc (LIVE, `processor.ex:949-996`):**
  - `customer_inputs = record[:data]["customer_inputs"]` (`:949`).
  - **Server-derived** option prices: `property_list` (`:951-971`) maps each client-selected
    `{name,value}` to its price from `customer_inputs` — a selected option's label price
    (`opt[:label]==value → opt[:price]`, `:959-961`) or the input's flat `option[:price]` (`:963`).
  - `base_cost = data["discounted_price"] if > 0 else price` (`:978-985`).
  - `catalog_unit_cost = base_cost + property_costs` (`:987`).
  - `resolve_unit_price(product[:unit_price], catalog_unit_cost, override_allowed?)` (`:863-870,:993-994`):
    a **trusted secret-key** request may override the whole unit price (above OR below catalog, never
    clamped), stamped `price_source :override|:catalog` into `line_meta_data` (`:1016-1024`). Non-override
    lines = `catalog_unit_cost` (unchanged behaviour).
  - `total_cost = quantity × unit_cost` (`:996`).

- **BUG CONFIRMED ON LIVE (same as Agent 1 flagged):** `property_costs` (`:973-976`) sums
  **`product[:property_list]`** — the CLIENT-sent array — not the server-derived `property_list` from
  `:951`. So the charged add-on delta is client-controlled, and **$0 if the client omits `property_list`**
  (the `/checkouts/:id` order-create sends `{id,quantity}` and even strips `properties` — see
  `2-commerce-web-checkout.md`). The correctly-priced server list is used ONLY for the frozen
  `property_map`/`properties` display (`:1007-1011`), never for the charge. ⇒ **Inkress option add-ons
  very likely do not actually bill today** unless a caller sends `property_list` with prices.

- **Discounts ARE wired on LIVE** (Agent 1 saw them stubbed on feature/spi-3ds): `Service.Discount.resolve`
  + `Service.Discount.availability` (`:74-87`), product-scoped line items `%{id, cost}` (`:45`), and the
  order freezes `discount_code_frozen` + `discount_id` (`:302-303`). Matches the live coupon feature.

- **Variant implication (reinforced):** moving to product-per-SKU makes the line price come from the
  **product row** (`base_cost`, server-authoritative), which ELIMINATES the option-delta path (`:951-987`)
  and its client-controlled `property_costs` bug entirely — options become distinct SKUs with real prices.
  Everything downstream (fee engine, three-total split, frozen columns, precision) consumes only line
  `cost`, so it is unaffected.
