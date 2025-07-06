import { InkressStorefrontSDK } from '../src/index';

// Example: Using the Generics Resource
async function demonstrateGenericsUsage() {
  // Initialize the SDK
  const inkress = new InkressStorefrontSDK({
    merchantUsername: 'your-merchant-username',
    authToken: 'your-auth-token' // Required for generics operations
  });

  try {
    // Example 1: Store user preferences
    const userPreferences = await inkress.generics.create({
      key: 'user-preferences',
      kind: 1, // User settings category
      data: {
        theme: 'dark',
        language: 'en',
        notifications: true,
        currency: 'USD'
      }
    });

    console.log('User preferences stored:', userPreferences.data);

    // Example 2: Store application configuration
    const appConfig = await inkress.generics.create({
      key: 'app-config',
      kind: 2, // Application settings category
      data: {
        maintenanceMode: false,
        featuresEnabled: ['cart', 'wishlist', 'reviews'],
        version: '1.0.0'
      }
    });

    console.log('App config stored:', appConfig.data);

    // Example 3: Get a specific generic by key
    const preferences = await inkress.generics.getByKey('user-preferences');
    if (preferences.data) {
      console.log('Retrieved preferences:', preferences.data.entries);
    }

    // Example 4: List all generics of a specific kind
    const allUserSettings = await inkress.generics.getByKind(1);
    console.log('All user settings:', allUserSettings.data);

    // Example 5: Update existing generic
    if (userPreferences.data) {
      const updatedPreferences = await inkress.generics.update(userPreferences.data.id, {
        key: 'user-preferences',
        kind: 1,
        data: {
          theme: 'light', // Changed from dark to light
          language: 'en',
          notifications: false, // Changed from true to false
          currency: 'EUR' // Changed from USD to EUR
        }
      });

      console.log('Updated preferences:', updatedPreferences.data);
    }

    // Example 6: Create or update (upsert) pattern
    const upsertedData = await inkress.generics.createOrUpdate('session-data', 3, {
      sessionId: 'abc123',
      startTime: new Date().toISOString(),
      pageViews: 1
    });

    console.log('Upserted session data:', upserteddata.entries);

    // Example 7: List all generics with filtering
    const filteredGenerics = await inkress.generics.list({
      kind: 1,
      page: 1,
      limit: 10,
      sort: 'created_at',
      order: 'desc'
    });

    console.log('Filtered generics:', filteredGenerics.data);

    // Example 8: Delete a generic by key
    const deleted = await inkress.generics.deleteByKey('session-data');
    console.log('Deleted session data:', deleted.data);

  } catch (error) {
    console.error('Error:', error);
  }
}

// Example: Common use cases for generics

// 1. User Settings/Preferences
async function storeUserSettings(sdk: InkressStorefrontSDK, userId: number, settings: any) {
  return sdk.generics.createOrUpdate(`user-settings-${userId}`, 1, settings);
}

// 2. Application Configuration
async function storeAppConfig(sdk: InkressStorefrontSDK, configData: any) {
  return sdk.generics.createOrUpdate('app-config', 2, configData);
}

// 3. Temporary Session Data
async function storeSessionData(sdk: InkressStorefrontSDK, sessionId: string, data: any) {
  return sdk.generics.createOrUpdate(`session-${sessionId}`, 3, data);
}

// 4. Feature Flags
async function storeFeatureFlags(sdk: InkressStorefrontSDK, flags: Record<string, boolean>) {
  return sdk.generics.createOrUpdate('feature-flags', 4, flags);
}

// 5. Custom Metadata
async function storeCustomMetadata(sdk: InkressStorefrontSDK, key: string, metadata: any) {
  return sdk.generics.createOrUpdate(key, 5, metadata);
}

// Export the demonstration function
export { demonstrateGenericsUsage };
