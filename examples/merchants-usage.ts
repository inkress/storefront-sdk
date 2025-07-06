import { InkressStorefrontSDK } from '../src/index';

// Example: Using the Merchants Resource
async function demonstrateMerchantsUsage() {
  // Initialize the SDK
  const inkress = new InkressStorefrontSDK({
    merchantUsername: 'your-merchant-username'
  });

  try {
    console.log('=== Merchants Resource Examples ===');

    // Example 1: Get merchant profile information
    const merchantProfile = await inkress.merchants.getByUsername('acme-store');
    console.log('Merchant profile:', merchantProfile.data);
    console.log('Merchant name:', merchantProfile.data?.name);
    console.log('Merchant logo:', merchantProfile.data?.logo);
    console.log('Merchant about:', merchantProfile.data?.about);

    // Example 2: Get merchant's products
    const merchantProducts = await inkress.merchants.getProducts('acme-store', {
      limit: 10,
      page: 1
    });
    console.log('Merchant products:', merchantProducts.data);

    // Example 3: Get merchant's fee structure
    const merchantFees = await inkress.merchants.getFees('acme-store');
    console.log('Merchant fees:', merchantFees.data);
    console.log('Platform fee:', merchantFees.data?.fees.platform_fee);
    console.log('Payment processing fee:', merchantFees.data?.fees.payment_processing_fee);
    console.log('Total fees:', merchantFees.data?.fees.total_fees);

    // Example 4: Get merchant's public tokens/keys
    const merchantTokens = await inkress.merchants.getTokens('acme-store');
    console.log('Merchant tokens:', merchantTokens.data);
    console.log('Publishable key:', merchantTokens.data?.publishable_key);

    // Example 5: Get merchant's payment methods
    const paymentMethods = await inkress.merchants.getPaymentMethods('acme-store');
    console.log('Available payment methods:', paymentMethods.data);
    
    // Filter enabled payment methods
    const enabledMethods = paymentMethods.data?.filter(method => method.enabled);
    console.log('Enabled payment methods:', enabledMethods);

    // Example 6: Complete storefront setup using merchant data
    if (merchantProfile.data) {
      console.log('\n=== Complete Storefront Setup ===');
      
      // Set up storefront with merchant branding
      const storefront = {
        name: merchantProfile.data.name,
        logo: merchantProfile.data.logo,
        about: merchantProfile.data.about,
        theme: merchantProfile.data.theme_colour,
        domain: merchantProfile.data.domain?.cname
      };
      
      console.log('Storefront configuration:', storefront);
      
      // Get merchant's products for display
      const featuredProducts = await inkress.merchants.getProducts(merchantProfile.data.username, {
        limit: 6,
        page: 1
      });
      
      console.log('Featured products for storefront:', featuredProducts.data);
      
      // Get payment methods for checkout
      const checkoutMethods = await inkress.merchants.getPaymentMethods(merchantProfile.data.username);
      console.log('Checkout payment methods:', checkoutMethods.data);
    }

  } catch (error) {
    console.error('Error in merchants usage:', error);
  }
}

// Example: Building a merchant storefront page
async function buildMerchantStorefront(merchantUsername: string) {
  const inkress = new InkressStorefrontSDK({
    merchantUsername: merchantUsername
  });

  try {
    console.log('\n=== Building Merchant Storefront ===');

    // Step 1: Get merchant profile
    const merchant = await inkress.merchants.getByUsername(merchantUsername);
    if (!merchant.data) {
      throw new Error('Merchant not found');
    }

    // Step 2: Get merchant's products
    const products = await inkress.merchants.getProducts(merchantUsername, {
      limit: 20,
      page: 1
    });

    // Step 3: Get payment methods
    const paymentMethods = await inkress.merchants.getPaymentMethods(merchantUsername);

    // Step 4: Get fee structure for transparency
    const feeStructure = await inkress.merchants.getFees(merchantUsername);

    // Step 5: Build storefront object
    const storefront = {
      merchant: {
        name: merchant.data.name,
        username: merchant.data.username,
        logo: merchant.data.logo,
        about: merchant.data.about,
        theme: merchant.data.theme_colour,
        domain: merchant.data.domain?.cname
      },
      products: products.data?.entries || [],
      paymentMethods: paymentMethods.data?.filter(method => method.enabled) || [],
      feeStructure: feeStructure.data,
      productCount: products.data?.page_info?.total_entries || 0
    };

    console.log('Complete storefront data:', storefront);
    return storefront;

  } catch (error) {
    console.error('Error building storefront:', error);
    throw error;
  }
}

// Example: Multi-merchant comparison
async function compareMerchants(merchantUsernames: string[]) {
  const inkress = new InkressStorefrontSDK({
    merchantUsername: merchantUsernames[0] // Use first merchant as default
  });

  try {
    console.log('\n=== Multi-Merchant Comparison ===');

    const merchantData = await Promise.all(
      merchantUsernames.map(async (username) => {
        try {
          const [profile, products, fees] = await Promise.all([
            inkress.merchants.getByUsername(username),
            inkress.merchants.getProducts(username, { limit: 5 }),
            inkress.merchants.getFees(username)
          ]);

          return {
            username,
            profile: profile.data,
            productCount: products.data?.page_info?.total_entries || 0,
            sampleProducts: products.data?.entries || [],
            fees: fees.data
          };
        } catch (error) {
          console.error(`Error fetching data for ${username}:`, error);
          return null;
        }
      })
    );

    const validMerchants = merchantData.filter(Boolean);
    console.log('Merchant comparison data:', validMerchants);

    // Compare fees
    const feeComparison = validMerchants.map(merchant => ({
      name: merchant?.profile?.name,
      username: merchant?.username,
      platformFee: merchant?.fees?.fees.platform_fee,
      paymentFee: merchant?.fees?.fees.payment_processing_fee,
      totalFees: merchant?.fees?.fees.total_fees
    }));

    console.log('Fee comparison:', feeComparison);

  } catch (error) {
    console.error('Error in merchant comparison:', error);
  }
}

// Export examples
export {
  demonstrateMerchantsUsage,
  buildMerchantStorefront,
  compareMerchants
};

// Run examples if this file is executed directly
if (require.main === module) {
  demonstrateMerchantsUsage();
}
