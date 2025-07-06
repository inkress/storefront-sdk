# Wishlist Resource - Hybrid Storage Implementation

## Overview
The WishlistResource class has been rewritten to leverage the "generics" resource for remote storage while maintaining local storage as a fallback. This provides a robust hybrid approach that works both online and offline.

## Key Features

### 1. Hybrid Storage Architecture
- **Primary**: Remote storage via generics API
- **Fallback**: Local browser storage
- **Synchronization**: Automatic sync between local and remote

### 2. New Constructor
```typescript
constructor(
  storage: BrowserStorage<Wishlist>, 
  eventEmitter: EventEmitter,
  generic: GenericResource,
  userId?: number
)
```

### 3. Async/Await API
Most methods are now async to support remote storage operations:
- `get()` - Gets wishlist (remote first, local fallback)
- `addItem(product)` - Adds item to both local and remote
- `removeItem(itemId)` - Removes item from both storages
- `clear()` - Clears both local and remote wishlist
- `hasProduct(productId)` - Checks if product exists
- `toggleProduct(product)` - Toggles product in/out of wishlist

### 4. Synchronous Methods (Local Only)
For backward compatibility and performance:
- `getLocal()` - Gets wishlist from local storage only
- `hasProductLocal(productId)` - Checks local storage only
- `getItemCountLocal()` - Gets count from local storage
- `isEmptyLocal()` - Checks if local wishlist is empty
- `getProductsLocal()` - Gets products from local storage

### 5. Sync Operations
- `syncFromRemote()` - Force sync from remote to local
- `syncToRemote()` - Force sync from local to remote
- `setUserId(userId)` - Set user ID for remote storage

### 6. Remote Storage Implementation
Uses the generics API with:
- **Key**: `wishlist_{userId}`
- **Kind**: `2` (wishlist identifier)
- **Data**: Complete wishlist object

## Usage Examples

### Basic Usage (Hybrid)
```typescript
const sdk = new InkressStorefrontSDK({
  merchantUsername: 'your-merchant',
  authToken: 'user-token'
});

sdk.setUserId(123);

// Add item (saves to both local and remote)
await sdk.wishlist.addItem(product);

// Get wishlist (tries remote first, falls back to local)
const wishlist = await sdk.wishlist.get();

// Check if product exists
const hasProduct = await sdk.wishlist.hasProduct(productId);
```

### Local Storage Only (Synchronous)
```typescript
// Fast synchronous operations (local storage only)
const localWishlist = sdk.wishlist.getLocal();
const hasProduct = sdk.wishlist.hasProductLocal(productId);
const itemCount = sdk.wishlist.getItemCountLocal();
```

### Manual Sync Operations
```typescript
// Force sync from remote
await sdk.wishlist.syncFromRemote();

// Force sync to remote
await sdk.wishlist.syncToRemote();
```

## Event System
All events are still emitted for both local and remote operations:
- `wishlist:item:added`
- `wishlist:item:removed`
- `wishlist:cleared`

## Error Handling
- Remote operations fail gracefully to local storage
- Network errors are logged but don't break functionality
- Local storage always works as expected

## Benefits
1. **Offline Support**: Works without internet connection
2. **Data Persistence**: Wishlist syncs across devices when logged in
3. **Performance**: Local storage for immediate responses
4. **Reliability**: Falls back to local if remote fails
5. **Backward Compatibility**: Maintains existing API where possible

## Migration Notes
- Most methods are now async (breaking change)
- Constructor requires additional parameters
- Added synchronous alternatives for local-only operations
- Events work exactly the same way
