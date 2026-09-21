/**
 * Auto-mount entry — the no-build seam for themes.
 *
 * Built to `dist/inkress-storefront.kit.js` (IIFE, minified). A theme drops in one
 * script tag and the kit reads its config off `<html>` (the DOM config seam),
 * constructs the SDK, and mounts — exactly how `fk-cart.js` loads today:
 *
 *   <html data-ik-merchant="island-vibes" data-ik-mode="live" data-currency="USD">
 *   <script src="https://cdn.inkress.com/storefront/inkress-storefront.kit.js" defer></script>
 *
 * After boot, `window.inkress` is the SDK instance and `window.inkressCart`
 * (+ `window.fkCart`) is the imperative cart surface.
 */
import { InkressStorefrontSDK } from './index';
import { mountStorefront } from './dom';
import type { SdkMode } from './client';

function boot(): void {
  const root = document.documentElement;
  const merchant =
    root.getAttribute('data-ik-merchant') || root.getAttribute('data-merchant') || undefined;
  const modeAttr = root.getAttribute('data-ik-mode');
  const mode: SdkMode = modeAttr === 'sandbox' ? 'sandbox' : 'live';

  const sdk = new InkressStorefrontSDK({ merchantUsername: merchant, mode });
  mountStorefront(sdk);

  // Expose the instance so theme code can reach the full SDK if it needs to.
  (window as unknown as Record<string, unknown>).inkress = sdk;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
