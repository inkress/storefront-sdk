export interface Customer {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone: string;
}

export interface PaymentURLOptions {
  username: string;
  total: number;
  payment_link_id?: string;
  /**
   * Currency code (default: 'JMD')
   */
  currency_code?: string;
  title?: string;
  reference_id?: string;
  customer?: Customer;
}

interface InkressInterface {
  setToken: (token: string) => void;
  setClient: (clientKey: string) => void;
  createPaymentUrl: (options: PaymentURLOptions) => string;
  generateRandomId: () => string;
}

/**
 * Inkress payment processing library
 * Provides functions for creating orders, generating payment URLs, and handling webhooks
 */
class Inkress implements InkressInterface {
  private clientKey: string;
  private baseUrl: string;
  private token: string;

  /**
   * Creates a new Inkress instance
   * @param token - Your API token
   * @param clientKey - Your client key (optional)
   * @param mode - Your environment mode (live or test)
   */
  constructor({
    clientKey = '',
    token = '',
    mode = 'live'
  }: {
    clientKey?: string;
    token?: string;
    mode?: 'live' | 'test';
  } = {}) {
    this.baseUrl = mode === 'live' ? 'https://inkress.com/api/v1' : 'https://dev.inkress.com/api/v1';
    this.token = token;
    this.clientKey = clientKey;
  }

  /**
   * Sets the client key for API requests
   * @param clientKey - Your client key
   */
  setClient(clientKey: string): void {
    this.clientKey = clientKey;
  }

  /**
   * Sets the authentication token for API requests
   * @param token - Your API token
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Encodes a JSON object to base64
   * @param data - Object to encode
   * @returns Base64-encoded string
   */
  private encodeJSONToB64(data: any): string {
    try {
      const jsonStr = JSON.stringify(data);
      
      // Detect browser environment by checking for window object
      const isBrowser = typeof window !== 'undefined';
      
      if (!isBrowser) {
        // Server environment - try to use Buffer if it exists
        // without directly referencing Node.js types
        try {
          // Using Function constructor to avoid direct reference to global and process
          // This is a workaround to prevent TypeScript errors
          const getBufferFn = new Function('return typeof Buffer !== "undefined" ? Buffer : null')();
          
          if (getBufferFn) {
            // If Buffer exists, use it for base64 encoding
            return getBufferFn.from(jsonStr).toString('base64');
          }
        } catch (e) {
          console.warn('Server-side Buffer not available, falling back to browser method');
        }
      }
      
      // Browser environment or fallback
      return btoa(unescape(encodeURIComponent(jsonStr)));
    } catch (error) {
      console.error('Error encoding JSON to base64:', error);
      throw new Error('Failed to encode payment data');
    }
  }

  /**
   * Generates a random ID for order references
   * @returns Random alphanumeric ID
   */
  generateRandomId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Validates required fields for payment URL creation
   * @param options - Payment options
   * @throws Error if required fields are missing
   */
  private validatePaymentOptions(options: PaymentURLOptions): void {
    const { username, total } = options;
    
    if (!username) {
      throw new Error('Merchant username is required');
    }
    
    if (total === undefined || total === null || isNaN(Number(total))) {
      throw new Error('Valid total amount is required');
    }
  }

  /**
   * Creates a payment URL for the Inkress platform
   * @param options - Configuration options for the payment URL
   * @returns Generated payment URL
   */
  createPaymentUrl(options: PaymentURLOptions): string {
    this.validatePaymentOptions(options);
    
    const {
      username,
      total,
      currency_code = 'JMD',
      title = `Payment to ${username}`,
      reference_id = this.generateRandomId(),
      customer = {},
      payment_link_id,
    } = options;
    
    const defaultCustomer: Customer = {
      first_name: '',
      last_name: '',
      email: '',
      phone: ''
    };
    
    const orderData = {
      total: Number(total),
      currency_code,
      title,
      reference_id,
      customer: {
        ...defaultCustomer,
        ...customer
      }
    };
    
    const orderToken = this.encodeJSONToB64(orderData);
    const baseUrlWithoutApi = this.baseUrl.replace('/api/v1', '');
    return `${baseUrlWithoutApi}/merchants/${encodeURIComponent(username)}/order?link_token=${payment_link_id || ''}&order_token=${orderToken}`;
  }
}

export default Inkress;