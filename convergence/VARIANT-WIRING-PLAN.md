# Finish-the-variant-wiring plan (B) — 2026-09-21

Deliverable (B) from Romario's "A+B, don't break existing Inkress product functionality; vet all
product read/write areas." (A) = the confirmed truth ([[VARIANT-TRUTH.md]]); the vetting =
`vet-product-{write,read,consumers}.md`. This is the concrete, expand-only build plan grounded in them.

## The reframe
Inkress is NOT variant-less. There are **two things** (VARIANT-TRUTH.md):
1. **LIVE:** the **product is the buyable unit**; "options" (size/colour) live in `product.data`
   jsonb. The marketplace + storefront SDK read `data.attributes` / `data.customer_inputs`; the revamp
   markets editor reads/writes `data.variants.options`. Checkout freezes the order line from the
   PRODUCT (`variant_id = product.id`, `product_variant_*_frozen` from product title/price,
   `processor.ex:1264-1267`).
2. **ORPHANED:** a real `variants` table + `Api.Inventory.ProductVariant` schema (`belongs_to :product`;
   name/price/quantity/sku/unlimited/image), a generic CRUD resource, `Query.ProductVariant`, a view,
   RBAC + OAuth scope — with **zero live readers or writers** and known scaffold rot.

FleekSite needs **buyable variant SKUs** (each variant its own id/price/stock; `distinct: post_id`
grids). So "finish the variant wiring" = make the orphaned `variants` table a real buyable unit,
**additively**, WITHOUT breaking the live product+`data`-options model the marketplace, markets editor
and checkout depend on.

## Guardrails (from the vetting — every step obeys these)
- **G1 — the product+`data`-options model is load-bearing; expand-only.** Never remove/rename a
  `product.data` option key, never change the `/products` response shape. Marketplace reads
  `data.attributes`/`customer_inputs` (all 4 loaders), the SDK reads the same, revamp reads
  `data.variants.options` (`vet-product-consumers.md`).
- **G2 — the `variants` table has ZERO live consumers → wiring it is purely additive** (repo-wide sweep,
  `vet-product-consumers.md §Two decisive conclusions`). Nothing breaks by populating it.
- **G3 — order-line frozen fields keep their SHAPE regardless of source.** `product_variant_name_frozen`
  / `_total_frozen` stay strings/decimals whether fed from a product or a real variant, so mobile + web
  order display is unaffected by changing the source (`vet-product-consumers.md`, `orders.ts:106-108`).
- **G4 — migrations are expand/contract.** commerce-api runs `mix ecto.migrate` in the Docker BUILD,
  against prod DB, before the new container swaps in ([[commerce-api-build-phase-migrations]]). Add
  columns now; drop nothing a running release reads.
- **G5 — serialization has NO view layer and NO sparse-fieldset / `?include=`** (`vet-product-read.md
  §0, §concl.2`). A preload added to `Query.Product`'s `@attribs` appears in EVERY product response at
  once (public + admin) — blast radius. So variant reads go through a **separate endpoint**, not a
  default product preload (or we first add an opt-in `?include=` to `Query.Defaults`).
- **G6 — reuse the `sanitize/1` discipline just shipped (PR #215).** Any public variant read that
  preloads `product → merchant` MUST run the merchant through `Merchant.to_public` (override
  `Query.ProductVariant.sanitize/1`), or it re-opens the bank-detail leak I just closed
  (`vet-product-read.md §6b` flagged exactly this). See [[reference-commerce-api-public-read-redaction]].

## Phases — each is independently shippable, reversible, and expand-only

### V0 — Make the scaffold real & safe (no route, no behavior change)
Nothing here is reachable in prod, so it is invisible until V1/V2.
- Reconcile the ProductVariant **schema ↔ migration column mismatch** (`quantity` ↔ `units_remaining`):
  pick the canonical column, add any missing one additively (G4), delete the copy-paste validations for
  fields the schema doesn't have (`product_variant.ex:63-66` validates `units_remaining`/`units_sold`/
  `rating_*`; `product.ex:94` unique_constraint on non-existent fields — both no-ops today).
- Fix `ProductVariantView` (reads a non-existent `user_id`).
- **Fix/replace the 4 non-compiling scaffold test files** (they reference a nonexistent `Api.Stores`
  namespace — `product_controller_test.exs`, `product_variant_controller_test.exs`, +group/attribute;
  `vet-product-write.md §3/DONE`). There is **zero working test coverage** for `Context.Inventory.Product`
  / `ProductVariant` — stand up a real regression net for product+variant create/update/delete BEFORE
  touching any live path.
- Add `Product has_many :variants, Api.Inventory.ProductVariant` — **association only** (no preload, no
  `cast_assoc`). Additive; invisible until read/written (`vet-product-read.md §concl.2`).

### V1 — Variant persistence (additive write), DUAL-WRITE
- Wire variant writes via the dedicated `/variants` CRUD (the generic `/:resource_path` resolver already
  routes `ProductVariant`) or `cast_assoc(:variants)` on product create/update. Decide one; prefer the
  dedicated resource (keeps the Product changeset untouched — it currently drops a top-level `variants`,
  `VARIANT-TRUTH.md`).
- Migration: additive columns only (id/product_id FK+index/sku/name/price/`units_remaining`/unlimited/
  image + an option-axis map). Expand/contract (G4).
- **HARD (G1): keep writing `product.data` options in parallel.** Variants become the SKU source of
  truth; `data.attributes`/`customer_inputs` + `data.variants.options` stay written so the marketplace,
  SDK and markets editor keep working. This is a dual-write transition, not a cutover.
- Two live activations to handle deliberately, both surfaced by the vetting:
  - **OAuth**: `variants:create`/`update` is already granted to `products:write` apps (`scopes.ex:109-120`)
    — the moment the write route validates successfully, those apps can write real rows. No new scope,
    but a live grant activates (`vet-product-write.md §6`).
  - **FK constraints**: `Booking.variant_id` and `Review.variant_id` have `assoc_constraint(:variant)`
    against the (today always-empty) table; populating it makes those constraints start biting
    booking/review writes that supply a `variant_id` (`vet-product-write.md §concl`). Audit both.

### V2 — Public variant read (additive, sanitized)
- `Query.ProductVariant`: add `preloads: [:product]` (and `product → merchant` if the storefront needs
  merchant context). Open the reads FleekSite needs: **list** (distinct-by-product + `?q`), **get**, and
  **bulk `POST /variants/check_stock {variant_ids:[]}` → `[{id,stock}]`** (`SDK-GAP-AND-PLAN.md §gap 4`,
  `search.json` is built on this).
- **Do NOT** add `:variants` to `Query.Product`'s default preloads (G5 blast radius). Ship a separate
  `/variants` surface; if variants must appear ON a product response, first add an opt-in `?include=`
  to `Query.Defaults` (its own small, reusable change) rather than a blanket preload.
- **Override `Query.ProductVariant.sanitize/1`** to run the preloaded `product.merchant` through
  `Merchant.to_public` (G6) — non-negotiable, or V2 re-opens PR #215's leak.
- Open `rbac.yaml:301-306` `list` to `'public'` only if direct public listing is wanted (`view` is
  already public; `list` is not — `vet-product-read.md §concl.3`).

### V3 — Checkout resolves off variants (additive branch, PROD money path)
- `processor.ex:755-868`/`:1260-1287` AND `session_based_checkout.ex:474-583`/`:1193-1219` both hard-code
  Product as the priced/stocked unit and never query `variants` (`vet-product-read.md §3/§concl.4`). Add a
  branch: when a line carries a **real** variant id, resolve price/stock/id from the variant row; else fall
  back to the product (today's behavior). Order lines freeze name/price/total from the variant — **same
  frozen-field SHAPE** (G3), so order display is unaffected.
- **Coordinate PR #213** (`variant_id` on invoice lines) — it makes `variant_id` come from the line rather
  than the product id; it is held for the Phase-② checkout refactor, and it is the natural carrier of a
  real variant id here. Merge/sequence together.
- Expand/contract: add the variant branch, remove nothing. This is the only phase that touches the prod
  money path → it goes behind the V0 regression net + an adversarial review, and ships after V0–V2.

### V4 — SDK + FleekSite (unblocks Phase ③; no commerce-api prod risk)
- SDK: promote Variant to a first-class entity — cart keys by `variant_id` (not `product.id`,
  `cart.ts:178,351`), `buildCheckoutInput` sends the variant id, add bulk `check_stock`, add the
  `search.json` shape. This is `SDK-GAP-AND-PLAN.md §gap 1`, the biggest SDK gap.
- FleekSite: sync its own local variant SKU table (`fs-hono commerce.ts:19-45`) → Inkress variants (the
  re-platforming, `vet-product-consumers.md §CRITICAL 3`); browser calls stay same-origin per the kit
  transport constraints (`SDK-GAP-AND-PLAN.md §kit constraint 2`).

## Reconciling the two `data`-options shapes (the incoherence, resolved expand-only)
Today: `data.attributes`/`customer_inputs` (marketplace + SDK canonical) vs `data.variants.options`
(revamp, read by nobody but revamp's own mock storefront) — they don't interoperate, so a
revamp-authored product looks OPTION-LESS to the marketplace (`vet-product-consumers.md §CRITICAL 1`).
- **Real variant rows become the canonical buyable-SKU source.** The `data` option shapes are demoted to
  option-AXIS descriptors (the size/colour axes) that MAP onto variant rows.
- **Adapter is expand-only:** authoring writes variant rows AND keeps both `data` shapes in sync
  (dual-write, V1). A later **contract** step stops dual-writing only once every reader consumes variants
  — not before. Also fix revamp persisting the option-GROUP names (hardcoded `['Size','Color','Material']`,
  never submitted — `new.tsx:1006,2372-2373`).

## Sequencing & risk
- **V0–V2 are low risk** (additive; no live path changes until V3) and already give FleekSite a read-only
  variant catalogue surface. Do these first.
- **V3 is the only prod-money-path change** — gate on the V0 regression net + adversarial review +
  expand/contract + #213 coordination.
- **V4 is SDK/FleekSite** — no commerce-api prod risk; it's what actually unblocks Phase ③.
- Two authz paths (`rbac.yaml` vs DB-backed `Api.Auth.Policy`) already grant the same 6 roles on
  `variants`; no RBAC change is implied, but be aware of pre-existing `ENFORCE_DB_AUTHZ` drift
  (`vet-product-write.md §6`, [[commerce-api-auth-flip]]).

## What this plan explicitly does NOT change
The `/products` response shape; the marketplace `data`-options reads; the revamp markets editor; the
mobile/web order-line display; and the checkout's product-based resolution when no real variant id is
present. All strictly expand-only until a real `variant_id` flows through.

## DONE
