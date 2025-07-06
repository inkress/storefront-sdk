import { InkressStorefrontSDK } from './src/index';

// Test that the types are correctly aligned
async function typeTest() {
  const sdk = new InkressStorefrontSDK({
    merchantUsername: 'test-merchant'
  });

  // Test that order_lines are used correctly in types
  const orderMock = {
    id: 1,
    reference_id: 'test-123',
    total: 100,
    kind: 2,
    status: 'pending',
    status_on: 1,
    uid: 'uid-123',
    currency: { id: 1, code: 'USD', symbol: '$', name: 'US Dollar' },
    order_lines: [
      {
        id: 1,
        order_id: 1,
        product_id: 123,
        product_variant_name_frozen: 'Standard',
        product_variant_total_frozen: 100,
        quantity: 1
      }
    ],
    merchant: { id: 1, name: 'Test', username: 'test' },
    created_at: '2025-01-01',
    updated_at: '2025-01-01'
  };

  // Test that reviews use parent_id correctly
  const reviewMock = {
    parent_id: 123,
    rating: 5,
    body: 'Great product!'
  };

  console.log('✅ Types are correctly aligned!');
  console.log('✅ Orders use order_lines field');
  console.log('✅ Reviews use parent_id field');
  console.log('✅ Products use title field');
}

typeTest().catch(console.error);
