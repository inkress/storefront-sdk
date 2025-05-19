# Inkress SDK

A JavaScript/TypeScript SDK for integrating with the Inkress payment platform.

## Installation

```bash
# Using npm
npm install @inkress/storefront-sdk

# Using yarn
yarn add @inkress/storefront-sdk
```

## Features

- Create payment URLs for the Inkress platform
- Works in both browser and Node.js environments
- Written in TypeScript with full type definitions
- Compatible with modern frameworks like React, Next.js, and Remix

## Usage

### Basic Usage

```typescript
import Inkress from '@inkress/storefront-sdk';

const inkress = new Inkress({
  token: 'your-api-token', // Optional
  clientKey: 'your-client-key', // Optional
  mode: 'live' // 'live' or 'test', defaults to 'live'
});

// Generate a payment URL
const paymentUrl = inkress.createPaymentUrl({
  username: 'your-merchant-username',
  total: 1000, // Amount in cents
  currency_code: 'JMD', // Optional, defaults to JMD
  title: 'Payment for Order #123', // Optional
  reference_id: '123', // Optional, auto-generated if not provided
  customer: { // Optional
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@example.com',
    phone: '8761234567'
  }
});

console.log(paymentUrl);
```

### Using in React

```tsx
import React, { useState } from 'react';
import Inkress from '@inkress/storefront-sdk';

const inkress = new Inkress({
  mode: 'test',
  clientKey: 'your-client-key'
});

function PaymentButton() {
  const [loading, setLoading] = useState(false);
  
  const handlePayment = () => {
    setLoading(true);
    
    const paymentUrl = inkress.createPaymentUrl({
      username: 'merchant123',
      total: 2500,
      title: 'Premium Subscription'
    });
    
    window.location.href = paymentUrl;
  };
  
  return (
    <button 
      onClick={handlePayment}
      disabled={loading}
    >
      {loading ? 'Redirecting...' : 'Pay with Inkress'}
    </button>
  );
}

export default PaymentButton;
```

### API Reference

#### Constructor

```typescript
new Inkress({
  token?: string;
  clientKey?: string;
  mode?: 'live' | 'test';
})
```

#### Methods

##### setToken

```typescript
setToken(token: string): void
```

##### setClient

```typescript
setClient(clientKey: string): void
```

##### createPaymentUrl

```typescript
createPaymentUrl(options: PaymentURLOptions): string
```

The `PaymentURLOptions` interface:

```typescript
interface PaymentURLOptions {
  username: string;
  total: number;
  payment_link_id?: string;
  currency_code?: string; // Defaults to 'JMD'
  title?: string;
  reference_id?: string;
  customer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone: string;
  };
}
```

##### generateRandomId

```typescript
generateRandomId(): string
```

## License

MIT