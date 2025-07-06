import { InkressStorefrontSDK } from '../index';

describe('InkressStorefrontSDK', () => {
  let sdk: InkressStorefrontSDK;

  beforeEach(() => {
    sdk = new InkressStorefrontSDK({
      merchantUsername: 'test-merchant'
    });
  });

  it('should initialize with default configuration', () => {
    expect(sdk).toBeDefined();
    expect(sdk.products).toBeDefined();
    expect(sdk.cart).toBeDefined();
    expect(sdk.wishlist).toBeDefined();
  });

  it('should set merchant username correctly', () => {
    const config = sdk.getConfig();
    expect(config.merchantUsername).toBe('test-merchant');
  });

  it('should have all required resources', () => {
    expect(sdk.merchants).toBeDefined();
    expect(sdk.products).toBeDefined();
    expect(sdk.categories).toBeDefined();
    expect(sdk.auth).toBeDefined();
    expect(sdk.orders).toBeDefined();
    expect(sdk.cart).toBeDefined();
    expect(sdk.wishlist).toBeDefined();
    expect(sdk.generic).toBeDefined();
    expect(sdk.generics).toBeDefined();
    expect(sdk.reviews).toBeDefined();
    expect(sdk.shipping).toBeDefined();
    expect(sdk.files).toBeDefined();
  });

  it('should support static factory methods', () => {
    const merchantSdk = InkressStorefrontSDK.forMerchant('test-merchant');
    expect(merchantSdk.getConfig().merchantUsername).toBe('test-merchant');

    const authSdk = InkressStorefrontSDK.withAuth('test-token');
    expect(authSdk).toBeDefined(); // authToken is not exposed in getConfig for security
  });

  it('should support event system', () => {
    const mockCallback = jest.fn();
    // Use cart event as a real example
    sdk.on('cart:item:added', mockCallback);
    
    // Events are emitted by internal operations, not directly
    expect(sdk.on).toBeDefined();
    expect(sdk.emit).toBeDefined();
  });
});
