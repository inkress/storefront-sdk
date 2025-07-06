# Changelog

All notable changes to the Inkress Storefront SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-07-06

### Added
- Initial release of the Inkress Storefront SDK
- TypeScript support with comprehensive type definitions
- Browser-first design with Node.js compatibility
- Shopping cart functionality with persistent storage
- Wishlist management with local and remote sync
- Customer authentication and session management
- Complete product browsing and search capabilities
- Order placement and tracking
- File upload and media management
- Real-time event system for cart and wishlist updates

### Features
- **Merchants Resource**: Access merchant information and storefront data
- **Products Resource**: Product browsing, search, filtering, and categorization
- **Categories Resource**: Category navigation with hierarchical tree support
- **Authentication Resource**: Customer login, registration, and session management
- **Cart Resource**: Shopping cart with persistent storage and event-driven updates
- **Wishlist Resource**: Product wishlist with hybrid local/remote storage
- **Orders Resource**: Order creation, tracking, and history management
- **Reviews Resource**: Product reviews and ratings system
- **Shipping Resource**: Shipping methods and cost calculation
- **Files Resource**: File upload, image optimization, and media management
- **Generic Resource**: Custom data storage and retrieval
- **Generics Resource**: Batch operations for custom data management

### Browser Features
- **Persistent Storage**: Automatic cart and wishlist persistence using localStorage
- **Event System**: Real-time updates for cart additions, removals, and modifications
- **Image Optimization**: Automatic image resizing, format conversion, and optimization
- **File Upload**: Drag-and-drop file upload with progress tracking
- **Responsive Design**: Built-in responsive image URL generation

### Developer Experience
- **TypeScript First**: Comprehensive type definitions for all APIs
- **Event-Driven Architecture**: Subscribe to cart, wishlist, and other events
- **Storage Management**: Automatic data persistence with conflict resolution
- **Error Handling**: Structured error responses with helpful debugging information
- **Multiple Formats**: ESM, CJS, and browser bundles included
- **Tree Shaking**: Optimized for modern bundlers with selective imports

### Storage & Sync
- **Local Storage**: Automatic persistence of cart and wishlist data
- **Remote Sync**: Seamless synchronization with server when authenticated
- **Conflict Resolution**: Smart merging of local and remote data
- **Cross-Tab Sync**: Cart and wishlist updates across browser tabs

### Image & Media
- **File Upload**: Support for images, documents, and media files
- **Image Transformation**: Automatic resizing, cropping, and format optimization
- **CDN Integration**: Optimized delivery through content delivery networks
- **Responsive Images**: Generate multiple sizes for different screen resolutions

## [Unreleased]

### Planned
- WebSocket support for real-time updates
- Progressive Web App (PWA) utilities
- Enhanced caching strategies
- Payment integration helpers
- Analytics and tracking utilities
- A/B testing framework integration
- Advanced search with filters and facets
- Social sharing utilities
- SEO optimization helpers
