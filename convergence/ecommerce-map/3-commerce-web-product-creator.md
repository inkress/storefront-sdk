# commerce-web — Product Creator map

READ-ONLY investigation. How a merchant authors a product + its options in
commerce-web, and the exact shape that lands in `product.data` on the Inkress API.

- Repo: `/Users/romario/projects/inkress/commerce-web`
- Branch: `version/4.1-beta` (confirmed via `git rev-parse`; HEAD `3339c41`) — this is the branch prod (`inkress.com`) deploys.
- Stack: Remix (RR7/Vite). Merchant dashboard route + a thin REST client wrapping the Inkress API.
- API counterpart repo: `/Users/romario/projects/inkress/commerce-api` (Elixir/Phoenix).

Key files:
- Editor route (loader + action): `app/routes/dashboard.store.products.$id.tsx`
- List route: `app/routes/dashboard.store.products._index.tsx`
- Form component: `app/components/forms/product-form.tsx`
- REST client: `app/interfaces/client/product.ts` (POST/PATCH `products`)
- Pricing util: `app/lib/utils/product-pricing.ts` (sale/compare-at only; NOT options)
- Buyer-side consumption (options → line price): `app/routes/marketplace.$username.$permalink.tsx`, `app/hooks/useCart.tsx`
- API schema: `commerce-api/lib/api/schema/inventory/product.ex` (+ real relational variants in `product_variant.ex`)

---

## 1. Create/Edit flow: fields → validation → payload → endpoint → stored

### 1a. Route + loader
`dashboard.store.products.$id.tsx` handles both **create** (`id === 'new'`) and **edit** (`id` = product id) — same route, same form.

- Loader (`:22-119`): requires `store.products` permission (`:26`), loads product categories (`kind: 1`, `:32`) and merchant username (for preview). For `id === 'new'` returns `product: null` (`:39-45`). Otherwise `admin.product.get(id)` (`:46`), then **flattens the API record into a form-shaped object** (`:92-112`):
  - reads `product.data` into `productData` (`:52`)
  - `custom_fields` = `[...productData.attributes, ...productData.customer_inputs]` (`:83-87`) — merges the two authored arrays back into one editable list
  - `images` = `convertToProductImages(productData, primaryImage)` combining `product.image` (primary) + `productData.images` (`:55-90`)
  - maps `discounted_price`, `video_url`, `type`, `description` out of `productData` (`:108-111`)
  - `units_remaining`, `currency` (as `currency_id`), `category` (as `category_id`), `status`, `unlimited` off the top-level record (`:96-104`)

### 1b. Form + validation (`product-form.tsx`)
Zod schema `formSchema` (`:35-74`). Fields:
- `title` (min 3), `description` (min 3, rich-text via `Editor`), `price` (coerce number ≥ 0), `discounted_price?` (number), `category?` (number), `stock?` (number ≥ 0), `unlimited` (bool, default false), `currency` (number ≥ 1; UI only offers 1=JMD, 2=USD — `:76-79`), `status` (number, default 1), `type` enum `physical|virtual|service` (default `physical`, `:50`), `video_url?` (url), `images[]` `{url, alt}`, `primaryImage?`.
- `product_attributes[]` — `{ name, type: text|number|image|file, value: string|File }` (`:52-56`)
- `customer_inputs[]` — `{ name, type: text|number|options|image|file, price?: number, options?: [{label, price:number=0}] }` with a `superRefine` requiring ≥1 option when `type==='options'` (`:57-73`)

Two collapsible field-array sections author these:
- **Product Attributes** (`:726-757`) → `product_attributes` (static specs, e.g. Material: Cotton). `useFieldArray name="product_attributes"` (`:481-484`).
- **Customer Inputs** (`:759-790`) → `customer_inputs` (buyer-filled fields incl. option pickers). `useFieldArray name="customer_inputs"` (`:486-489`).

`CustomFieldRow` (`:181-325`) renders a Name + Type pair; the Type dropdown is context-sensitive (`:226-232`): `customer_inputs` gets a **Options** type; `product_attributes` gets **image/file** types instead. For `options` type it renders `OptionsEditor` (`:90-179`) — a repeating `{label, price}` list.

### 1c. Client payload build — `onSubmit` (`product-form.tsx:491-554`)
Builds a `multipart/form-data` `FormData`:
```ts
// :496-501 — scalar fields, but SKIP the structured ones
Object.entries(data).forEach(([key, value]) => {
  if (key === 'images' || key === 'primaryImage' || key === 'product_attributes' || key === 'customer_inputs') return;
  if (value !== undefined && value !== null) formData.append(key, String(value));
});
// :504-521 — images: primary as `image`, all urls repeated as `image_urls`, alts as JSON
const imageUrls = data.images.map(img => img.url);
const primaryImage = data.primaryImage || (imageUrls.length > 0 ? imageUrls[0] : undefined);
if (primaryImage) formData.append('image', primaryImage);
imageUrls.forEach((url) => formData.append(`image_urls`, url));
formData.append('image_alts', JSON.stringify(imageAlts));
// :524-538 — attributes + inputs MERGED into one `custom_fields` JSON blob
const allCustomFields = [ ...(data.product_attributes || []), ...(data.customer_inputs || []) ];
const customFieldsData = allCustomFields.map((field, index) => {
  if ((field.type === 'image' || field.type === 'file') && field.value instanceof File) {
    formData.append(`custom_field_file_${index}`, field.value);
    return { ...field, value: `file:custom_field_file_${index}` };   // file placeholder
  }
  return field;
});
formData.append('custom_fields', JSON.stringify(customFieldsData));
// :545 — POST on create, PATCH on edit
submit(formData, { method: initialData ? "patch" : "post", encType: "multipart/form-data" });
```
So over the wire the client sends scalars (`title, description, price, discounted_price, category, stock, unlimited, currency, status, type, video_url`), image fields (`image`, `image_urls[]`, `image_alts`), and one `custom_fields` JSON array that concatenates attributes + inputs. There is **no `variants` key** and no `data` key from the client — `data.*` is assembled server-side in the action.

### 1d. Server action — request → API payload (`dashboard.store.products.$id.tsx:230-485`)
Runs in the Remix action (server). (`_action === "create_category"` short-circuits to category create, `:240-274`.)

1. Parse formData into `args` (`:294-320`): pulls out `image_urls[]`, `image_alts`, `image`(primary), `custom_field_file_*`; everything else becomes `args[key]`.
2. `args.data = {}` (`:323`).
3. **Split `custom_fields` back into two arrays under `data`** (`:326-346`):
```ts
const attributes     = customFields.filter((f) => f.type !== 'options' && f.value);      // has a value, not options
const customerInputs = customFields.filter((f) => f.type === 'options' || !f.value);     // options type OR no value
if (attributes.length > 0)     args.data.attributes = attributes;
if (customerInputs.length > 0) args.data.customer_inputs = customerInputs;
delete args.custom_fields;
```
4. Images → `args.image` (primary) + `args.data.images` (non-primary `{url, alt}`) (`:348-371`).
5. **Key remapping via `transformer` (`:218-228`, applied `:373-385`)** — renames top-level keys and pushes several into `data.*`:
```ts
const transformer = {
  'total': 'price', 'currency': 'currency_id', 'category': 'category_id', 'file': 'image',
  'description': 'data.description', 'stock': 'units_remaining',
  'video_url': 'data.video_url', 'discounted_price': 'data.discounted_price', 'type': 'data.type',
};
// nested targets deep-merge into the existing args.data (`:376-380`)
```
6. Normalise flags: `args.public = true` (forced `:407`, also coerced `:392`), `status → parseInt` (`:395-397`), `unlimited → boolean` (`:400-402`).
7. **Dispatch** (`:409-416`):
```ts
if (id !== 'new') { args.id = id; actionResponse = await admin.product.update(args.id, args); }
else               { actionResponse = await admin.product.create(args); }
```
8. Custom-field **file** uploads happen *after* create (needs the product id): each `file:custom_field_file_N` placeholder is uploaded via `admin.file.create` (kind 53, record `products`, `:488-520`), the returned URL is patched back into the matching field, and the product is `update()`d again (`:444-475`).
9. Success → `redirect('/dashboard/store/products')` (`:477`).

### 1e. Endpoint (`app/interfaces/client/product.ts`)
`admin.product` is this REST client. It hits the Inkress API (base URL configured in the client `base`/`makeRequest`; `admin` is wired in `inkress.server`):
- create → `makeRequest("products", "POST", data)` (`:16-18`) → **POST `/products`**
- update → `makeRequest("products/{id}", "PATCH", data)` (`:21-23`) → **PATCH `/products/:id`**
- Also `list` GET `products`, `get` GET `products/:id`, `delete` DELETE `products/:id`.

### 1f. What gets stored (API side, `commerce-api`)
- Schema `Api.Inventory.Product` (`product.ex`): top-level columns `data:map, meta:map, permalink, price:float, image, public:bool, unlimited:bool, rating_*, status:int, tag_ids, teaser, title, units_remaining, units_sold, currency_code, currency_id, category_id, uid`. `data` is a **free-form `:map`** — no embedded schema, no sub-key validation.
- `changeset` casts `cast(attrs, __schema__(:fields))` (`:57`, `:65`) → **only whitelisted product columns survive; any unknown top-level key is silently dropped by Ecto.**
- Context `Context.Inventory.Product.process_context` (`context/inventory/product.ex`) only derives `currency_id`; it does **not** touch or validate `data`. So `data.*` is persisted verbatim.
- `@required = price, currency_id, permalink, price, status, title` (`:48`). `permalink` is auto-generated (`put_permalink`) if absent.

---

## 2. Exact product DATA SHAPE authored here

The creator writes these keys under **`product.data`** (assembled in the action, `:322-385`):

| `product.data.*` key | Source | Shape |
|---|---|---|
| `description` | transformer `description→data.description` | string (rich HTML) |
| `discounted_price` | transformer | number (sale price) |
| `video_url` | transformer | string (currently the UI field is commented out, `:709-722`) |
| `type` | transformer | `"physical"｜"virtual"｜"service"` |
| `images` | action `:371` | `[{ url, alt }]` — **non-primary** images only (primary lives in top-level `product.image`) |
| `attributes` | action `:337` (conditional) | `[{ name, type, value }]` |
| `customer_inputs` | action `:340` (conditional) | `[{ name, type, price?, options? }]` |

Top-level (not under `data`): `title, price, currency_id, category_id, units_remaining, status, public(=true), unlimited, image` (primary).

### The options question — it is BOTH structures, under two different keys
Answering the deliverable's either/or directly:

- **`data.attributes[]` = `{ name, type, value }`** — static product specs (Material: Cotton). `type ∈ text|number|image|file`. Authored in the "Product Attributes" section.
- **`data.customer_inputs[]` = `{ name, type, price?, options?: [{ label, price }] }`** — buyer-facing inputs, and this is where **option pickers with per-option pricing** live. `type ∈ text|number|options|image|file`. Authored in the "Customer Inputs" section.

The split rule (identical in the client default-load `product-form.tsx:451-452` and the server action `:333-334`):
```ts
attributes     = fields.filter(f => f.type !== 'options' && f.value);   // static, has a value
customer_inputs = fields.filter(f => f.type === 'options' || !f.value);  // options-type, or any input with no author-set value
```
Consequence: a text/number/image/file field the merchant leaves valueless is treated as a **customer input** (buyer fills it); a field with a value is a **static attribute**. `options`-type always routes to `customer_inputs`.

The option list itself is built by `OptionsEditor` (`product-form.tsx:90-179`) — each row is a `{ label, price }` pair (`:99-113`, `:121-152`):
```ts
// addOption (:99-105)
form.setValue(`customer_inputs.${inputIndex}.options`, [ ...currentOptions, { label: '', price: 0 } ]);
```
So a single `customer_inputs` entry of `type: 'options'` holds **all** its choices inline as `options: [{label, price}, ...]`. There is **no separate per-variant/SKU record** — the whole option set is one embedded JSON object.

Confirmed keys this creator writes under `product.data`: **`description, discounted_price, video_url, type, images, attributes, customer_inputs`** — nothing else. (It never writes `data.variants`, `data.sku`, `data.options` at top level, etc.)

---

## 3. Option pricing at authoring time → line price

### Authoring (add-on delta model)
- **Per-option add-on**: each `options[]` entry carries its own `price` (default 0) — a delta added when that option is chosen. UI labelled "Define options with individual add-on prices." (`product-form.tsx:174-176`, input `:135-151`).
- **Non-options input add-on**: a single `price?` on the `customer_inputs` entry — "Extra charge when this field is filled (optional)." (`:245-267`).
- The product's own **`price`** (top-level) is the **base**. Options/inputs are **additive deltas**, never a replacement price. There is no per-variant absolute price authored here.

### How it drives the line price (buyer side)
`marketplace.$username.$permalink.tsx`:
- `getOptionPrice(inputName, selectedValue)` (`:514-530`): for an `options` input returns the chosen option's `price`; for other input types returns the input's `price` when a value is present; else 0.
- `addToCart` (`:532-568`): builds `properties[key] = { value, price }` when `price > 0`, otherwise stores the bare value (`:543-556`), then `addItem({ id, name, price: product.price, ... properties }, quantity)` — the **base** line price is `product.price`.
- Cart summation `useCart.tsx`:
```ts
function calculatePropertyAddOns(properties) {           // :44-55
  return Object.values(properties).reduce((total, v) =>
    (v && typeof v === 'object' && 'price' in v && typeof v.price === 'number') ? total + v.price : total, 0);
}
function calculateTotal(items) {                          // :57-63
  return items.reduce((total, item) =>
    total + item.quantity * (item.price + calculatePropertyAddOns(item.properties)), 0);
}
```
So **line unit price = `product.price` + Σ(selected option/input add-on deltas)**, multiplied by quantity. Distinct option selections produce distinct cart lines via `generateCartItemId` hashing product id + sorted properties (`useCart.tsx:66-79`) — a purely client-side pseudo-variant identity; the server sees a product id + a `properties` bag, not a SKU.

Note `product-pricing.ts` (`calculatePricing`, `normalizeProductPricing`) covers **only** regular-vs-`data.discounted_price` sale math (compare-at strikethrough); it has nothing to do with options add-ons.

---

## 4. Stock / inventory / status / visibility fields

- **`unlimited`** (bool): checkbox (`product-form.tsx:971-992`). When true the Stock input is hidden (`:994-1008`) and the client force-sets `unlimited='true'` (`:541-543`); server coerces to boolean (`:400-402`). Top-level product column.
- **`stock`** → **`units_remaining`** (transformer `stock→units_remaining`, `:226`): numeric input shown only when not unlimited. Top-level column. (`units_sold` is server-managed, not authored here.)
- **`status`** (int): Draft=1 / Published=2 / Archived=3 select (`:799-820`). Default 1. `parseInt` server-side (`:395-397`). NOTE: the API schema **defaults status to 2** on create if unset (`product.ex:54`), but this form always sends an explicit status (default 1 = Draft).
- **`public`** (bool): **not a form field** — the action **hard-codes `args.public = true`** (`:407`, plus permissive coercion at `:392`). So every product saved from this creator is public regardless of `status`. (The loader round-trips `public` as `'1'|'2'` at `:103` but the form ignores it.)
- **`type`** (`physical|virtual|service`): select (`:821-844`) → stored in `data.type` (no top-level column exists for it).
- **`currency`** → `currency_id`, **`category`** → `category_id`: top-level FKs (transformer `:220-221`). Category can be created inline (`admin.category.create`, `:248-251`).

---

## 5. Top-level `variants` — NOT written here; and it would be dropped by the API

- **This creator writes no top-level `variants` key at all.** The action only ever produces `args.data.{attributes,customer_inputs,images,...}` plus scalars (§1d). Grep of `app/` shows the only `variant` hits are **order-line frozen fields** (`product_variant_id`, `product_variant_name_frozen`, `product_variant_total_frozen`) on sales/invoices/packing-slips — read-only, from the API, unrelated to authoring.
- **If it did send `variants`, the API changeset would silently drop it.** `Api.Inventory.Product.changeset` casts `cast(attrs, __schema__(:fields))` (`product.ex:57`); `variants` is not a field on the Product schema, so Ecto's cast whitelist discards it. (`data` is the only free map; a nested `data.variants` would persist as opaque JSON but nothing in commerce-web reads it.)
- **There IS a real relational variant model in commerce-api that this creator ignores entirely**: `Api.Inventory.ProductVariant` (`product_variant.ex`, table `variants`) — a proper per-SKU row: `name, price:float, quantity, quantity_sold, sku, image, available, unlimited, description, hash`, `belongs_to :product`, `@required = hash, price, quantity, sku, product_id, creator_id`. Plus `product_variant_group`, `product_variant_attribute`, `product_variant_exclusion` schemas/queries/views. commerce-web's product creator has **no UI and no code path** that writes any of these — it exclusively uses the `data.customer_inputs` JSON add-on model.

---

## 6. IMPLICATIONS FOR FLEEKSITE MAPPING

**Two incompatible "variant" models coexist in Inkress, and this creator uses the weaker one.**

- **What commerce-web authors** is an *option/add-on* model, not a per-SKU variant model:
  - One product row = one price + one stock pool (`price`, `units_remaining`/`unlimited`). Options are inline JSON (`data.customer_inputs[].options[] = {label, price-delta}`).
  - Option pricing is **additive** (base + deltas), resolved **client-side** in the cart. There is **no per-combination SKU, no per-variant stock, no per-variant image/price** at the data layer.
  - Cart-line identity for a chosen option set is a **client hash** of `product.id + properties`; the server never receives a variant id — it receives `product_id` + a `properties` bag (see order-line `product_variant_name_frozen`/`_total_frozen`, which freeze a display string + a summed total, not a SKU reference).

- **A true per-SKU model DOES exist server-side** (`variants` table, `ProductVariant` + variant groups/attributes/exclusions), but it is **orphaned from this UI**. A per-SKU product (Shopify-style: Size×Color → each combo its own SKU, price, inventory, barcode, image) maps naturally onto `ProductVariant`, **not** onto `data.customer_inputs`.

- **So a FleekSite → Inkress product mapping must choose a target and will hit an impedance mismatch:**
  1. **If it targets the `data.customer_inputs` model** (what commerce-web + the marketplace/checkout actually read and price today): collapse each FleekSite option *dimension* into one `customer_inputs` entry of `type:'options'` with `options:[{label, price}]`, where `price` is the **add-on delta from the base**, not the variant's absolute price. It must pick a base `product.price`, fold per-variant inventory into a single `units_remaining`/`unlimited` (per-SKU stock is **not representable**), and it loses per-SKU image/barcode/SKU code. Multi-dimension variants (Size × Color) become multiple independent `customer_inputs` entries whose deltas add — it cannot express "only these specific combinations exist / these are excluded" (no cross-option matrix; `product_variant_exclusion` is unreachable from here).
  2. **If it targets the real `variants` table** (per-SKU parity): it must write `ProductVariant` rows (`sku`, absolute `price`, `quantity`, `image`, `hash`, `product_id`, `creator_id`) + variant groups/attributes — a **different endpoint and payload than this creator uses**, and one with no commerce-web authoring UI. This gives true per-SKU price/stock/image and combination control, at the cost of not being what the current storefront/checkout read paths consume.

- **Practical guidance for the convergence SDK**: the storefront-SDK product/quote path should treat commerce-web's shape as canonical for the current storefront (base `price` + `data.customer_inputs` add-on deltas, quote box sends `properties`/`products:[{id,cost}]`). A FleekSite catalogue with genuine per-SKU variants cannot round-trip losslessly into `data.customer_inputs`; either (a) flatten to base + add-on deltas and accept single-pool inventory + no per-SKU media, or (b) invest in the `ProductVariant` relational path (new authoring + new read path) for true parity. Decide this explicitly before mapping — it changes both the authored payload and which API endpoints the SDK calls.

---

## DONE
