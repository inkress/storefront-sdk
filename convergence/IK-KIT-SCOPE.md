# Storefront-SDK DOM kit — `ik-*` / `fk:cart` conventions

> **Status (2026-09-21): DELIVERED + verified.** Cart money-path increment built,
> type-checks, 15 new jsdom tests green (122/122 total, nothing broken), all four
> bundles build incl. `dist/inkress-storefront.kit.js`. Verified LIVE in a real
> browser via `examples/kit-demo.html`: `data-ik-*` add + buy-qty stepper + drawer +
> line render + `cart-total`/`cart-filled` + `ik:cart` event; legacy `data-fk-*` add
> (fallback); rendered `ik-inc`/`ik-remove` controls; `fk:cart` compat event;
> `window.inkressCart`/`fkCart`. Not committed (awaiting Romario). Deferred items below
> unchanged.


Phase ④ start. Goal: give `@inkress/storefront-sdk` the two declarative conventions
FleekSite themes rely on — DOM `data-*` hooks and a DOM cart event — **cohesively on
top of the existing programmatic SDK**, not as a parallel runtime. The SDK's cart,
events and resources are unchanged; the DOM layer is an opt-in controller/view over
them.

## Decisions

**One cart.** The DOM layer drives `inkress.cart` (add / update / remove / clear /
checkout). There is no second cart model. A hook's flat DOM fields
(`variant-id`, `price`, `image`, `href`, `stock`…) map onto the SDK `Product` — which
already carries `title`, `image`, `permalink`, `unlimited`, `units_remaining`,
`currency`, `meta` — through a single isolated `productFromHook()` boundary (the one
place DOM→domain casting happens).

**`ik-*` native, `fk-*` fallback — one rule for everything.** Every attribute read
goes through `attr(el, name)` → `data-ik-<name>` first, then `data-fk-<name>`, then
bare `data-<name>`. Behavioural hooks *and* data-payload attributes follow the same
rule, so a new theme authors `data-ik-add` / `data-ik-price` while every ported
FleekSite theme keeps working untouched. No theme churn, no hard rename.

**Events are a bridge, not a rebuild.** The SDK already emits typed
`cart:item:added` etc. on its `EventEmitter`. On mount we subscribe and re-dispatch
to the DOM: native `ik:cart` (+ granular `ik:cart:item:added`…) and, for compat,
`fk:cart` with the FleekSite-shaped detail (`{ items: [...flat lines] }`).

**Opt-in, side-effect-free core.** Importing the SDK still does nothing to the DOM.
`mountStorefront(sdk, opts?)` wires the listeners and returns a handle with
`unmount()`. A separate build entry (`dist/inkress-storefront.kit.js`, IIFE, no build
step for the consumer) reads config off `<html>` (`data-currency`, `lang`) — the DOM
config seam — news up the SDK and auto-mounts, mirroring how `fk-cart.js` loads today.

**CSS class contract stays `fk-`.** Kit-rendered cart-line markup keeps the
`fk-cline` / `fk-stepper` class names so existing theme CSS applies pixel-for-pixel.
Class rebrand is a separate, later concern from the JS hook convention.

**Money is major-unit throughout**, matching the SDK cart and the catalogue adapter.
`money(major, currency, locale)` formats via `Intl.NumberFormat`, arithmetic rounded
to minor units for cent-accurate display.

**Globals for compat.** `window.inkressCart` mirrors `window.fkCart`
(`read/add/setQty/remove/clear/count/subtotal/money/open/close`); `window.fkCart` is
aliased to it unless disabled, so theme code calling `fkCart.add(...)` keeps working.

## Covered in this increment (the cart money-path)

- Add / buy-now + buy-box stepper: `add`, `buynow`, `buy`, `buy-qty`, `buy-inc`, `buy-dec`
- Variant `<select>` live price/stock/label: `variant`, `buy-price`, `buy-stock`
- Line controls: `inc`, `dec`, `qty`, `remove`
- Cart display: `cart-count`, `cart-total`, `cart-lines`, `cart-empty`, `cart-filled`
- Drawer: `drawer`, `drawer-open`, `drawer-close`, `drawer-scrim`
- Checkout: `checkout`, `checkout-status` → `inkress.cart.checkout()` → redirect to `frame_url`
- Event: `ik:cart` (+ granular) and `fk:cart` (compat)
- Globals: `window.inkressCart` (+ `window.fkCart` alias)

Stock cap is preserved through the Product's own `unlimited` / `units_remaining`
(quantity clamped on add and inc when not unlimited).

## Deferred, sequenced next

1. **Checkout transport modes** — `cart.checkout()` currently goes direct-to-Inkress
   (needs merchant public key / CORS). Storefronts today use a same-origin cookie proxy
   (`/payments/checkout` on fs-hono). Add an `SdkMode`/transport option so the same
   binder works both ways. This is the real fork; the binder above is transport-agnostic.
2. **Auth forms + prefill** — `auth`, `auth-status`, `me` (needs `/auth/me`, session).
3. **Guest-cart server sync** — `POST /api/v1/cart` flush-on-sign-in (auth-coupled).
4. **Collection filter/sort + query fill** — `colbar`, `instock`, `sort`, `count`,
   `fill-from-query`. Pure presentation; belongs in an optional UI kit, not the commerce SDK.
5. **Theme chrome** — `fk.js` nav / header / reveal / lead / lightbox. Not commerce;
   out of scope for the storefront SDK entirely.

## Files

- `src/dom/prefix.ts` — `attr`/`selector`/`data` dual-convention readers
- `src/dom/format.ts` — `money()`
- `src/dom/events.ts` — emitter → DOM CustomEvent bridge
- `src/dom/controller.ts` — hook delegation, paint, drawer, buy-box, checkout
- `src/dom/index.ts` — `mountStorefront()` + globals + public types
- `src/kit.ts` — auto-mount IIFE entry (new rollup output)
- `src/__tests__/dom.test.ts` — jsdom coverage
- `examples/kit-demo.html` — self-contained live demo
