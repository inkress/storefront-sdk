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
declare class Inkress implements InkressInterface {
    private clientKey;
    private baseUrl;
    private token;
    /**
     * Creates a new Inkress instance
     * @param token - Your API token
     * @param clientKey - Your client key (optional)
     * @param mode - Your environment mode (live or test)
     */
    constructor({ clientKey, token, mode }?: {
        clientKey?: string;
        token?: string;
        mode?: 'live' | 'test';
    });
    /**
     * Sets the client key for API requests
     * @param clientKey - Your client key
     */
    setClient(clientKey: string): void;
    /**
     * Sets the authentication token for API requests
     * @param token - Your API token
     */
    setToken(token: string): void;
    /**
     * Encodes a JSON object to base64
     * @param data - Object to encode
     * @returns Base64-encoded string
     */
    private encodeJSONToB64;
    /**
     * Generates a random ID for order references
     * @returns Random alphanumeric ID
     */
    generateRandomId(): string;
    /**
     * Validates required fields for payment URL creation
     * @param options - Payment options
     * @throws Error if required fields are missing
     */
    private validatePaymentOptions;
    /**
     * Creates a payment URL for the Inkress platform
     * @param options - Configuration options for the payment URL
     * @returns Generated payment URL
     */
    createPaymentUrl(options: PaymentURLOptions): string;
}
export default Inkress;
