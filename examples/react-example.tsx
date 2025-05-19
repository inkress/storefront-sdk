import React, { useState } from 'react';
import Inkress from '@inkress/storefront-sdk';

// Initialize the SDK
const inkress = new Inkress({
  mode: 'test', // Use 'live' for production
  clientKey: 'your-client-key-here', // Optional
  token: 'your-api-token-here', // Optional
});

interface PaymentFormProps {
  amount: number;
  merchantUsername: string;
}

const PaymentButton: React.FC<PaymentFormProps> = ({ amount, merchantUsername }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handlePayment = () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Generate a payment URL
      const paymentUrl = inkress.createPaymentUrl({
        username: merchantUsername,
        total: amount, // Amount in cents
        currency_code: 'JMD',
        title: 'Product Purchase',
        customer: {
          phone: '' // Required field, but can be empty for anonymous checkout
        }
      });
      
      // Redirect to the payment page
      window.location.href = paymentUrl;
      
    } catch (err: any) {
      setError(err.message || 'Failed to create payment URL');
      setIsLoading(false);
    }
  };
  
  return (
    <div>
      <button 
        onClick={handlePayment}
        disabled={isLoading}
        style={{
          backgroundColor: '#4CAF50',
          color: 'white',
          padding: '10px 20px',
          border: 'none',
          borderRadius: '4px',
          cursor: isLoading ? 'not-allowed' : 'pointer'
        }}
      >
        {isLoading ? 'Processing...' : 'Pay with Inkress'}
      </button>
      
      {error && (
        <div style={{ color: 'red', marginTop: '10px' }}>
          Error: {error}
        </div>
      )}
    </div>
  );
};

// Example usage
export const CheckoutPage = () => {
  return (
    <div>
      <h2>Checkout</h2>
      <p>Total: $25.00 USD</p>
      
      <PaymentButton 
        amount={2500} 
        merchantUsername="your-merchant-username"
      />
    </div>
  );
};

export default PaymentButton;