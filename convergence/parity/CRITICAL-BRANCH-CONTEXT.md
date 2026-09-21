# ⚠️ CRITICAL — the parity audit read the WRONG branch

The commerce-api working tree (`/Users/romario/projects/inkress/commerce-api`) is checked out on
**`feature/spi-3ds`**, an SPI/3DS security rework. The three PARITY-*.md audits + PARITY-order-records.md
were all read against this branch. **`feature/spi-3ds` is NOT prod** and has **no common ancestor**
with the prod branch (`git merge-base` is empty; histories were rewritten).

## Two divergent lines (no common ancestor)
- **`origin/version/4.1-beta` = PROD** (deploys to pserve; the discount stack #208-214 shipped here,
  incl. Romario's `c3cf49de` / #214 "apply discount codes in the session-based checkout", 2026-09-20).
- **`feature/spi-3ds` = working tree** (HEAD `47377c92`). Recent commits are all SPI/3DS: signed
  checkout-intent, strict strength gate + auth/capture + purchase|store mode, SPI completion gate,
  opt-in HPP redirect, always-on 3DS. **Missing the 116-commit discount stack.**
- Divergence counts (1622 ahead / 116 behind) are an artifact of disjoint history, NOT feature deltas.

## Which audit findings are REAL on prod vs stale-branch artifacts
Verified against `origin/version/4.1-beta`:
- **Session discounts** — audit said "hardcoded 0 (P0)". **FALSE on prod**: `resolve_session_discount`
  (session_based_checkout.ex:646 on beta), `Service.Discount.resolve/check_products/availability`
  (:657-663), `discount_total_frozen` (:1271), `put_discount_fields` (:1295). Already live.
- **Auth/capture collapse** — audit said "marks captured on a hold (P0)". **FALSE on prod**: beta records
  `captured` only on settlement-indicating results else `authorized` (:1410-1421), gates paid-on-captured
  (:1425-1428), and the CaptureFlipReconciler (commerce-worker) flips authorized→captured on settlement
  (:1087, :1407). Correct.
- **3DS strength gate** — audit said "sessions lack it (P1)". Prod HAS `gate_3ds_strength`,
  `complete_charge_3ds`, `finalize_authenticated_charge`, `authorize_only` (fac.ex on beta).
- **Velocity / transaction-limit bypass, shipping-address not persisted, decline webhooks, bare customer
  User** — found on feature/spi-3ds; **NOT yet re-verified on `version/4.1-beta`.** Status unknown on prod.

## Implication
"Fully wire up checkout sessions to full functionality" is **not a green-field build** and largely
**not even a prod gap** — on prod the session path already has discounts + correct capture + 3DS.
The real problem is **branch reconciliation**: `feature/spi-3ds` (new 3DS security) diverged from
`version/4.1-beta` (discounts + capture correctness) with no common ancestor, so neither branch has
everything, and a git merge is impossible (hand-port only).

**Do not action the PARITY-*.md punch list as prod gaps.** Awaiting Romario's direction on branch
strategy (which branch ships; port direction) before any code. The genuinely branch-independent gap
is the browser side: storefront-sdk `createSession` + the new DOM kit checkout hook are still dormant
(that part of the earlier finding stands).
