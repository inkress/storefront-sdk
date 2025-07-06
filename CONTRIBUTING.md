# Contributing to Inkress Storefront SDK

We love contributions from the community! This guide will help you get started with contributing to the Inkress Storefront SDK.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Create a new branch for your feature or bugfix
4. Make your changes
5. Test your changes
6. Submit a pull request

## Development Setup

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- TypeScript knowledge
- Familiarity with browser APIs and ecommerce concepts
- Understanding of localStorage, events, and browser storage

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/storefront-sdk.git
cd storefront-sdk

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Start development mode with watch
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint
```

### Project Structure

```
src/
├── client.ts           # HTTP client and configuration
├── index.ts           # Main SDK export
├── types.ts           # TypeScript type definitions
├── storage.ts         # Storage management utilities
├── events.ts          # Event system implementation
├── resources/         # API resource implementations
│   ├── auth.ts        # Customer authentication
│   ├── cart.ts        # Shopping cart with storage
│   ├── categories.ts  # Product categories
│   ├── files.ts       # File upload and media
│   ├── generics.ts    # Custom data storage
│   ├── merchants.ts   # Merchant information
│   ├── orders.ts      # Order management
│   ├── products.ts    # Product browsing
│   ├── reviews.ts     # Product reviews
│   ├── shipping.ts    # Shipping methods
│   └── wishlist.ts    # Wishlist with sync
└── lib/               # Utility libraries
    ├── api.ts         # API helpers
    └── storage.ts     # Storage utilities
```

## Making Changes

### Branching Strategy

- `main` - Production ready code
- `develop` - Integration branch for features
- `feature/feature-name` - New features
- `bugfix/bug-description` - Bug fixes
- `hotfix/critical-fix` - Critical production fixes

### Coding Standards

- Use TypeScript for all new code
- Follow existing code style and conventions
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Write tests for new functionality
- Consider browser compatibility for client-side features
- Use proper event naming conventions for cart/wishlist events

### Adding New Resources

When adding a new API resource:

1. Create the resource class in `src/resources/`
2. Define TypeScript types for request/response data in `src/types.ts`
3. Add the resource to the main SDK class in `src/index.ts`
4. Add JSDoc documentation with browser-specific examples
5. Write tests for the new resource
6. Update the README with usage examples

Example:

```typescript
// In src/resources/newsletter.ts

/**
 * Subscribe to newsletter
 * @param email - Customer email address
 * @param preferences - Subscription preferences
 */
async subscribe(email: string, preferences?: NewsletterPreferences): Promise<ApiResponse<Subscription>> {
  return this.client.post<Subscription>('/newsletter/subscribe', { email, ...preferences });
}
```

### Browser-Specific Features

When adding browser-specific functionality:

```typescript
// Check for browser environment
if (typeof window !== 'undefined') {
  // Browser-specific code
  localStorage.setItem('key', 'value');
}

// Emit events for reactive updates
this.eventEmitter.emit('cart:item:added', { item, cart });
```

### TypeScript Types

All new functionality should have proper TypeScript types:

```typescript
// In src/types.ts

export interface NewsletterPreferences {
  categories?: string[];
  frequency?: 'daily' | 'weekly' | 'monthly';
  format?: 'html' | 'text';
}

export interface CartItem {
  id: number;
  product: Product;
  quantity: number;
  price: number;
  total: number;
}
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- cart.test.ts

# Run tests with coverage
npm test -- --coverage
```

### Writing Tests

- Write unit tests for all new functionality
- Test browser-specific features with proper mocks
- Test storage and event functionality
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies

Example test:

```typescript
// src/__tests__/cart.test.ts

describe('CartResource', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it('should add item to cart and emit event', async () => {
    const mockStorage = createMockStorage();
    const mockEventEmitter = createMockEventEmitter();
    const cart = new CartResource(mockStorage, mockEventEmitter, mockClient);
    
    const product = { id: 1, title: 'Test Product', price: 10 };
    await cart.addItem(product, 2);
    
    expect(mockStorage.setItem).toHaveBeenCalled();
    expect(mockEventEmitter.emit).toHaveBeenCalledWith('cart:item:added', expect.any(Object));
  });
});
```

### Browser Testing

```typescript
// Test localStorage functionality
it('should persist cart data in localStorage', () => {
  const cart = new CartResource(storage, eventEmitter, client);
  cart.addItem(product, 1);
  
  const storedData = localStorage.getItem('inkress-cart');
  expect(JSON.parse(storedData)).toMatchObject({ items: expect.any(Array) });
});
```

## Submitting Changes

### Pull Request Process

1. **Create a Pull Request**
   - Use a clear and descriptive title
   - Reference any related issues
   - Provide a detailed description of changes
   - Include browser compatibility notes if applicable

2. **Pull Request Template**
   ```markdown
   ## Description
   Brief description of what this PR does.

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update
   - [ ] Browser compatibility fix

   ## Browser Testing
   - [ ] Chrome/Chromium tested
   - [ ] Firefox tested
   - [ ] Safari tested (if applicable)
   - [ ] Mobile browsers tested (if applicable)

   ## Testing
   - [ ] Unit tests added/updated
   - [ ] Integration tests added/updated
   - [ ] All tests passing
   - [ ] Manual testing completed
   - [ ] Storage/event functionality tested

   ## Checklist
   - [ ] Code follows project conventions
   - [ ] TypeScript types updated
   - [ ] Self-review completed
   - [ ] Documentation updated
   - [ ] CHANGELOG.md updated
   - [ ] Examples updated (if applicable)
   ```

3. **Review Process**
   - All PRs require at least one review
   - Address feedback promptly
   - Keep PRs focused and reasonably sized
   - Test in multiple browser environments

### Commit Guidelines

Use conventional commits for clear history:

```
type(scope): description

feat(cart): add persistent storage for cart items
fix(wishlist): handle sync conflicts properly
docs(readme): update browser compatibility notes
test(files): add upload progress tests
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `chore`: Maintenance tasks

## Browser Compatibility

### Supported Browsers

- Chrome 70+
- Firefox 65+
- Safari 12+
- Edge 79+

### Feature Support

- **Local Storage**: Required for cart and wishlist persistence
- **Fetch API**: Required for HTTP requests (polyfill available)
- **File API**: Required for file uploads
- **URL API**: Required for image transformations

### Testing Across Browsers

```bash
# Test in different environments
npm run test:chrome
npm run test:firefox
npm run test:safari
```

## Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality
- **PATCH** version for backwards-compatible bug fixes

### Release Steps

1. Update version in `package.json`
2. Update `CHANGELOG.md` with new version
3. Test across supported browsers
4. Create a git tag: `git tag v1.0.1`
5. Push changes: `git push origin main --tags`
6. GitHub Actions will automatically publish to npm

## Getting Help

- 📚 [API Documentation](https://docs.inkress.com)
- 💬 [Discord Community](https://discord.gg/inkress)
- 🐛 [GitHub Issues](https://github.com/inkress/storefront-sdk/issues)
- 📧 Email: [dev@inkress.com](mailto:dev@inkress.com)
- 🌐 [Storefront Examples](https://github.com/inkress/storefront-examples)

## Recognition

Contributors will be recognized in:
- GitHub contributors list
- Release notes
- Project documentation

Thank you for contributing to the Inkress Storefront SDK! 🎉
