// Example of using Inkress SDK in a Next.js application
import React, { useState } from 'react';
import { GetServerSideProps } from 'next';
import Inkress from '@inkress/storefront-sdk';

// Type definitions for props
interface CheckoutPageProps {
  productName: string;
  productPrice: number;
  merchantUsername: string;
}

// Server-side initialization of the SDK for API calls
export const getServerSideProps: GetServerSideProps<CheckoutPageProps> = async () => {
  // You can use the SDK server-side for data fetching if needed
  const serverSideInkress = new Inkress({
    mode: process.env.NODE_ENV === 'production' ? 'live' : 'test',
    token: process.env.INKRESS_API_TOKEN,
    clientKey: process.env.INKRESS_CLIENT_KEY,
  });

  // Example product data (in real app, fetch from database or API)
  return {
    props: {
      productName: 'Premium Subscription',
      productPrice: 2500, // $25.00 in cents
      merchantUsername: process.env.INKRESS_MERCHANT_USERNAME || 'your-merchant-username',
    },
  };
};

// Client-side component with Inkress integration
export default function CheckoutPage({ 
  productName, 
  productPrice, 
  merchantUsername 
}: CheckoutPageProps) {
  const [isLoading, setIsLoading] = useState(false);

  // Initialize the client-side SDK instance
  // In production code, you might want to memoize this
  const inkress = new Inkress({
    mode: process.env.NODE_ENV === 'production' ? 'live' : 'test', 
    clientKey: process.env.NEXT_PUBLIC_INKRESS_CLIENT_KEY,
  });

  const handlePayment = () => {
    try {
      setIsLoading(true);
      
      // Create the payment URL with the SDK
      const paymentUrl = inkress.createPaymentUrl({
        username: merchantUsername,
        total: productPrice,
        title: `Payment for ${productName}`,
        reference_id: `order-${Date.now()}`,
        customer: {
          phone: '' // Required field, can be empty for anonymous checkout
        }
      });
      
      // Redirect to the payment page
      window.location.href = paymentUrl;
    } catch (error) {
      console.error('Payment creation failed:', error);
      setIsLoading(false);
    }
  };

  return (
    <div className="checkout-container">
      <h1>Checkout</h1>
      
      <div className="product-details">
        <h2>{productName}</h2>
        <p className="price">${(productPrice / 100).toFixed(2)}</p>
      </div>
      
      <button 
        onClick={handlePayment} 
        disabled={isLoading}
        className="payment-button"
      >
        {isLoading ? 'Processing...' : 'Pay with Inkress'}
      </button>
      
      <style jsx>{`
        .checkout-container {
          max-width: 500px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
            Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        }
        .product-details {
          margin-bottom: 20px;
          padding: 15px;
          border: 1px solid #eaeaea;
          border-radius: 5px;
        }
        .price {
          font-size: 24px;
          font-weight: bold;
          color: #333;
        }
        .payment-button {
          display: block;
          width: 100%;
          padding: 12px;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 16px;
          cursor: pointer;
        }
        .payment-button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}