// Verify the toVariantRow mapping shape against real Inkress data + a synthetic sale.
const num = (v, d=0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const STOCK_WHEN_UNLIMITED = 999999;
function toVariantRow(p, siteId) {
  const regular = num(p.price, 0);
  const discounted = p.data?.discounted_price != null ? num(p.data.discounted_price, 0) : 0;
  const onSale = discounted > 0 && discounted < regular;
  const selling = onSale ? discounted : regular;
  const compareAt = onSale ? regular : undefined;
  const image = p.image ?? (Array.isArray(p.data?.images) ? p.data.images[0] : null) ?? null;
  const images = Array.isArray(p.data?.images) && p.data.images.length ? p.data.images : (image ? [image] : []);
  const stock = p.unlimited ? STOCK_WHEN_UNLIMITED : num(p.units_remaining, 0);
  const meta = { images }; if (compareAt != null) meta.compare_at = compareAt;
  const post = { id: p.id, uid: `inkress-${p.id}`, title: p.title, permalink: p.permalink ?? '', cover_image: image, price: selling, price_min: selling, price_max: selling, status: 1, type: 3, site_id: siteId, meta, data: p.data ?? {} };
  return { id: p.id, post_id: p.id, site_id: siteId, name: p.title, price: selling, stock, unlimited: !!p.unlimited, image, title: p.title, permalink: p.permalink ?? '', cover_image: image, meta, post };
}

// 1) Real merchant fetch (the exact endpoint the adapter uses)
const U = 'jamaicaauthentictreats';
const r = await fetch(`https://api.inkress.com/api/v1/public/m/${U}/products?page_size=2`, { headers: { Accept: 'application/json' } });
const j = await r.json();
const entries = (j.result || j.data || {}).entries || [];
console.log(`FETCH /public/m/${U}/products -> HTTP ${r.status}, ${entries.length} products`);
if (entries.length) {
  const row = toVariantRow(entries[0], 999);
  console.log('MAPPED ROW (real product):');
  console.log('  card fields: title=%j permalink=%j cover_image=%j price=%j', row.title, row.permalink, !!row.cover_image, row.price);
  console.log('  variant: id=%j stock=%j unlimited=%j name=%j', row.id, row.stock, row.unlimited, row.name);
  console.log('  post.title=%j post.permalink=%j post.price=%j post.meta.images=%d', row.post.title, row.post.permalink, row.post.price, row.post.meta.images.length);
}

// 2) Synthetic sale + sold-out (matches the Windward seed)
const sale = toVariantRow({ id: 42, title: 'Long wallet', permalink: 'long-wallet', price: 95, image: 'x.jpg', unlimited: true, data: { discounted_price: 79 } }, 999);
console.log('\nSALE case (price 95 / discounted 79):');
console.log('  selling price=%j  meta.compare_at=%j  onSale?=%j', sale.price, sale.meta.compare_at, sale.meta.compare_at > sale.price);
const soldout = toVariantRow({ id: 43, title: 'Evening bag', permalink: 'evening-bag', price: 210, image: 'y.jpg', unlimited: false, units_remaining: 0, data: {} }, 999);
console.log('SOLD-OUT case: stock=%j unlimited=%j (card shows sold out when stock<=0 && !unlimited)', soldout.stock, soldout.unlimited);
