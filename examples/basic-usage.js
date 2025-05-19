// Basic usage example for the Inkress SDK
const Inkress = require('@inkress/storefront-sdk'); // CommonJS import

// Import using ES modules:
// import Inkress from '@inkress/storefront-sdk';

// Initialize the SDK
const inkress = new Inkress({
  mode: 'test', // Use 'live' for production
  clientKey: 'your-client-key-here', // Optional
  token: 'your-api-token-here', // Optional
});

// Generate a payment URL
const paymentUrl = inkress.createPaymentUrl({
  username: 'your-merchant-username',
  total: 2500, // Amount in cents
  currency_code: 'JMD',
  title: 'Premium Subscription',
  reference_id: 'order-123',
  customer: {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    phone: '8761234567'
  }
});

console.log('Payment URL:', paymentUrl);

// You can now redirect the customer to this URL for payment
// Browser: window.location.href = paymentUrl