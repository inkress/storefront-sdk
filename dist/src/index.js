"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Encodes a JSON object to base64
 * @param data - Object to encode
 * @returns Base64-encoded string
 */
const encodeJSONToB64 = (data) => {
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
            }
            catch (e) {
                console.warn('Server-side Buffer not available, falling back to browser method');
            }
        }
        // Browser environment or fallback
        return btoa(unescape(encodeURIComponent(jsonStr)));
    }
    catch (error) {
        console.error('Error encoding JSON to base64:', error);
        throw new Error('Failed to encode payment data');
    }
};
/**
 * Validates required fields for payment URL creation
 * @param options - Payment options
 * @throws Error if required fields are missing
 */
const validatePaymentOptions = (options) => {
    const { username, total } = options;
    if (!username) {
        throw new Error('Merchant username is required');
    }
    if (total === undefined || total === null || isNaN(Number(total))) {
        throw new Error('Valid total amount is required');
    }
};
/**
 * Inkress payment processing library
 * Provides functions for creating orders, generating payment URLs, and handling webhooks
 */
const Inkress = (() => {
    let clientKey = '';
    let baseUrl = 'https://inkress.com/api/v1';
    let token = '';
    /**
     * Sets the client key for API requests
     * @param newClientKey - Your client key
     */
    const setClient = (newClientKey) => {
        clientKey = newClientKey;
    };
    /**
     * Sets the authentication token for API requests
     * @param newToken - Your API token
     */
    const setToken = (newToken) => {
        token = newToken;
    };
    /**
     * Generates a random ID for order references
     * @returns Random alphanumeric ID
     */
    const generateRandomId = () => {
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    };
    /**
     * Creates a payment URL for the Inkress platform
     * @param options - Configuration options for the payment URL
     * @returns Generated payment URL
     */
    const createPaymentUrl = (options) => {
        validatePaymentOptions(options);
        const { username, total, currency_code = 'JMD', title = `Payment to ${username}`, reference_id = generateRandomId(), customer = {}, payment_link_id, } = options;
        const defaultCustomer = {
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
            customer: Object.assign(Object.assign({}, defaultCustomer), customer)
        };
        const orderToken = encodeJSONToB64(orderData);
        const baseUrlWithoutApi = baseUrl.replace('/api/v1', '');
        return `${baseUrlWithoutApi}/merchants/${encodeURIComponent(username)}/order?link_token=${payment_link_id || ''}&order_token=${orderToken}`;
    };
    /**
     * Initialize the Inkress module
     * @param initOptions - Initialization options
     */
    const init = ({ clientKey: newClientKey = '', token: newToken = '', mode = 'live' } = {}) => {
        baseUrl = mode === 'live' ? 'https://inkress.com/api/v1' : 'https://dev.inkress.com/api/v1';
        token = newToken;
        clientKey = newClientKey;
    };
    // Initialize with default values
    init();
    return {
        setClient,
        setToken,
        createPaymentUrl,
        generateRandomId,
        init
    };
})();
exports.default = Inkress;
