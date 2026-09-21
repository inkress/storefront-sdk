#!/usr/bin/env node
// Seed the Windward Leather demo catalogue into an Inkress merchant.
// Ready to run once a merchant access token exists (no account creation here).
//
//   INKRESS_TOKEN=<merchant token_api or login JWT> \
//   INKRESS_USERNAME=<merchant username> \
//   [INKRESS_API=https://api.inkress.com/api/v1] \
//   node seed.mjs [--dry]
//
// Idempotent: skips a product whose permalink already exists (so re-runs are safe).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const API = (process.env.INKRESS_API || 'https://api.inkress.com/api/v1').replace(/\/$/, '');
const TOKEN = process.env.INKRESS_TOKEN;
const USERNAME = process.env.INKRESS_USERNAME;
const DRY = process.argv.includes('--dry');

if (!DRY && (!TOKEN || !USERNAME)) {
  console.error('Set INKRESS_TOKEN and INKRESS_USERNAME (or pass --dry to preview payloads).');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}`, 'Client-Id': `m-${USERNAME}` } : {}),
};

const seed = JSON.parse(readFileSync(join(__dir, 'products.seed.json'), 'utf8'));
const STATUS_PUBLISHED = 2; // Draft 1 / Published 2 / Archived 3

// Map a seed product -> Inkress /products create body.
// currency_code is resolved to currency_id by Context.Inventory.Product.process_context.
// category_id is intentionally omitted for M1 (the grid renders all products); the
// /shop?c=<category> filter mapping is a follow-up once Inkress categories are created.
function toCreateBody(p) {
  const data = { description: p.description };
  if (p.discounted_price != null) data.discounted_price = p.discounted_price;
  // NOTE: do NOT send `permalink` — commerce-api's put_permalink prepends "/<prefix>"
  // (empty prefix => leading "/") then slugifies, which turns an explicit permalink
  // into "-the-windward-holdall". Omitting it lets the API slug the TITLE cleanly
  // ("The Windward holdall" -> "the-windward-holdall"), matching the theme's routes.
  const body = {
    title: p.title,
    // teaser is required by the high-value risk gate (>= US$250 orders need a
    // product with title + image + teaser); also used for cards/SEO.
    teaser: p.description,
    price: p.price,
    image: p.image,
    public: true,
    status: STATUS_PUBLISHED,
    unlimited: !!p.unlimited,
    // send `currency` (name), NOT `currency_code` — process_context's lookup
    // `x == ctx["currency"] || ctx["currency_code"]` is always-truthy on the
    // latter and lands every product on currency_id 1 (JMD).
    currency: seed.currency_code,
    data,
  };
  if (!p.unlimited) body.units_remaining = p.units_remaining ?? 0;
  return body;
}

async function existsByPermalink(permalink) {
  const url = `${API}/public/m/${USERNAME}/products?permalink=${encodeURIComponent(permalink)}&page_size=1`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const j = await r.json();
    const entries = (j.result || j.data || {}).entries || [];
    return entries.find((e) => e.permalink === permalink) || null;
  } catch { return null; }
}

async function main() {
  console.log(`API=${API} merchant=${USERNAME || '(dry)'} products=${seed.products.length}${DRY ? ' [DRY RUN]' : ''}\n`);
  for (const p of seed.products) {
    const body = toCreateBody(p);
    if (DRY) { console.log(`— ${p.permalink}\n`, JSON.stringify(body)); continue; }
    const found = await existsByPermalink(p.permalink);
    if (found) { console.log(`skip  ${p.permalink} (exists, id=${found.id})`); continue; }
    const r = await fetch(`${API}/products`, { method: 'POST', headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.state !== 'error') {
      const id = (j.result || j.data || {}).id;
      console.log(`created ${p.permalink} -> id=${id} ($${p.price}${p.discounted_price ? ` sale $${p.discounted_price}` : ''}${p.unlimited ? '' : ` stock=${p.units_remaining}`})`);
    } else {
      console.error(`FAIL  ${p.permalink}: HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
      process.exit(2);
    }
  }
  console.log('\nDone. Verify: GET ' + `${API}/public/m/${USERNAME}/products`);
}
main();
