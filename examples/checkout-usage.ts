/**
 * Checkout (money path) — hosted-order URL, checkout session, and cart checkout.
 */
import { InkressStorefrontSDK } from '@inkress/storefront-sdk';

const sdk = InkressStorefrontSDK.forMerchant('acme');

// 1) Simplest: a hosted-order URL the customer opens. No card data in the SDK.
const url = sdk.checkout.createPaymentUrl({
  total: 49.99,
  title: 'Order #1024',
  customer: { email: 'shopper@example.com' },
});
sdk.checkout.redirectToCheckout(url); // SSR-safe: no-ops on the server

// 2) Checkout session — returns a hosted payment frame (PowerTranz SPI).
async function paySession() {
  const { result } = await sdk.checkout.createSession({
    currency_code: 'JMD',
    total: 100,
    customer: { email: 'shopper@example.com', first_name: 'Jane' },
  });
  if (result) {
    sdk.checkout.redirectToCheckout(result.frame_url);
    // Later, poll status:
    const state = await sdk.checkout.getSession(result.session_id);
    console.log('status:', state.result?.status);
  }
}

// 3) From the local cart — builds the order payload from line items.
async function payCart() {
  const session = await sdk.cart.checkout({ customer: { email: 'shopper@example.com' } });
  if (session.result) sdk.checkout.redirectToCheckout(session.result.frame_url);
}

void paySession;
void payCart;
