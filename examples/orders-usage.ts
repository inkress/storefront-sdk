import { InkressStorefrontSDK } from '../src/index';

// Example: Using the Orders Resource - Core Functions
async function demonstrateOrdersUsage() {
  // Initialize the SDK
  const inkress = new InkressStorefrontSDK({
    merchantUsername: 'your-merchant-username',
    authToken: 'your-auth-token' // Required for authenticated operations
  });

  try {
    // Example 1: Create a new order (reference_id will be auto-generated)
    const order = await inkress.orders.create({
      currency_code: 'USD',
      kind: 'order',
      customer: {
        email: 'customer@example.com',
        first_name: 'John',
        last_name: 'Doe'
      },
      products: [
        {
          id: 1,
          quantity: 2
        },
        {
          id: 2,
          quantity: 1
        }
      ],
      data: {
        shipping_address: {
          address: '123 Main St',
          city: 'New York',
          state: 'NY',
          postal_code: '10001',
          country: 'US'
        }
      }
      // Note: reference_id is optional and will be auto-generated if not provided
    });
    
    console.log('Order created:', order.result);
    const orderId = order.result?.id;
    const referenceId = order.result?.reference_id;

    // Example 2: Create order with custom reference_id
    const customOrder = await inkress.orders.create({
      currency_code: 'USD',
      kind: 'order',
      reference_id: `CUSTOM-${Date.now()}`, // Custom reference ID
      customer: {
        email: 'customer2@example.com',
        first_name: 'Jane',
        last_name: 'Smith'
      },
      products: [
        {
          id: 3,
          quantity: 1
        }
      ],
      data: {
        shipping_address: {
          address: '456 Oak Ave',
          city: 'Los Angeles',
          state: 'CA',
          postal_code: '90210',
          country: 'US'
        }
      }
    });
    
    console.log('Custom order created:', customOrder.result);

    // Example 3: Get specific order by ID
    if (orderId) {
      const orderDetails = await inkress.orders.get(orderId);
      console.log('Order details:', orderDetails.result);
      // Access order lines using the correct field name
      console.log(`Items: ${orderDetails.result?.order_lines?.length || 0}`);
    }

    // Example 4: Get order by reference ID
    if (referenceId) {
      const orderByRef = await inkress.orders.getByReference(referenceId);
      console.log('Order by reference:', orderByRef.result);
    }

    // Example 5: List all orders
    const allOrders = await inkress.orders.list({
      page_size: 10,
      page: 1
    });
    console.log('All orders:', allOrders.result?.entries);

    // Example 6: Get recent orders
    const recentOrders = await inkress.orders.getRecent(3);
    console.log('Recent orders:', recentOrders.result?.entries);

    // Example 7: Get orders by status
    const pendingOrders = await inkress.orders.getByStatus('pending');
    const completedOrders = await inkress.orders.getByStatus('completed');
    const cancelledOrders = await inkress.orders.getByStatus('cancelled');
    
    console.log('Pending orders:', pendingOrders.result?.entries);
    console.log('Completed orders:', completedOrders.result?.entries);
    console.log('Cancelled orders:', cancelledOrders.result?.entries);

    // Example 8: Cancel an order
    if (orderId) {
      const cancelResult = await inkress.orders.cancel(orderId, 'Customer request');
      console.log('Order cancelled:', cancelResult.result);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

// Example: Working with Order Data
async function demonstrateOrderDataHandling() {
  const inkress = new InkressStorefrontSDK({
    merchantUsername: 'your-merchant-username',
    authToken: 'your-auth-token'
  });

  try {
    // Create an order without specifying reference_id (will be auto-generated)
    const order = await inkress.orders.create({
      currency_code: 'USD',
      kind: 'order',
      customer: {
        email: 'auto-ref@example.com',
        first_name: 'Auto',
        last_name: 'Reference'
      },
      products: [
        {
          id: 5,
          quantity: 2
        }
      ],
      data: {
        shipping_address: {
          address: '789 Pine St',
          city: 'Seattle',
          state: 'WA',
          postal_code: '98101',
          country: 'US'
        }
      }
    });

    if (order.state === 'ok' && order.result) {
      console.log('Order created successfully:');
      console.log('- Order ID:', order.result.id);
      console.log('- Reference (auto-generated):', order.result.reference_id);
      console.log('- Status:', order.result.status);
      console.log('- Total:', order.result.total);
      console.log('- Currency:', order.result.currency_code);
      console.log('- Items count:', order.result.order_lines?.length || 0);
      
      // Display order lines
      if (order.result.order_lines) {
        console.log('Order lines:');
        order.result.order_lines.forEach((line, index) => {
          console.log(`  ${index + 1}. Product ID: ${line.product_id}, Qty: ${line.quantity}`);
        });
      }
    }

  } catch (error) {
    console.error('Error creating order:', error);
  }
}

// Run examples if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  demonstrateOrdersUsage()
    .then(() => demonstrateOrderDataHandling())
    .catch(console.error);
}

export {
  demonstrateOrdersUsage,
  demonstrateOrderDataHandling
};
