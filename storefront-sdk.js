/**
 * Inkress payment processing library
 * Provides functions for creating orders, generating payment URLs, and handling webhooks
 * Browser-compatible version using module pattern
 */
(function(global) {
    /**
     * Encodes a JSON object to base64
     * @param data - Object to encode
     * @returns Base64-encoded string
     */
    const encodeJSONToB64 = (data) => {
        try {
            const jsonStr = JSON.stringify(data);
            return btoa(unescape(encodeURIComponent(jsonStr)));
        } catch (error) {
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
     * Inkress payment processing module
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
            const { 
                username, 
                total, 
                currency_code = 'JMD', 
                title = `Payment to ${username}`, 
                reference_id = generateRandomId(), 
                customer = {}, 
                payment_link_id 
            } = options;

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
                customer: { ...defaultCustomer, ...customer }
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

        /**
         * Decodes a base64-encoded JSON string
         * @param encoded - Base64-encoded JSON string
         * @returns Decoded JSON object or undefined if decoding fails
         */
        const decodeB64JSON = (encoded) => {
            try {
                const jsonStr = decodeURIComponent(escape(atob(encoded)));
                return JSON.parse(jsonStr);
            } catch (error) {
                console.error('Error decoding base64 JSON:', error);
                return undefined;
            }
        };

        /**
         * Creates an order via the Inkress API
         * @param order - OrderPlacementRequest details
         * @returns Promise resolving to API response or null if request fails
         */
        const createOrder = async (order) => {
            const url = `${baseUrl}/api/v1`;
            const headers = {
                'Content-Type': 'application/json',
                'Client-Key': clientKey,
                'Authorization': `Bearer ${token}`,
            };
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(order)
                });
                const jsonData = await response.json();
                return jsonData;
            } catch (error) {
                console.error('Error creating order:', error);
                return null;
            }
        };

        // Initialize with default values
        init();

        // Public API
        return {
            setClient,
            setToken,
            createPaymentUrl,
            generateRandomId,
            init,
            decodeB64JSON,
            createOrder
        };
    })();

    // Export to global scope for browser
    global.Inkress = Inkress;

    // Support ES modules
    if (typeof exports === 'object' && typeof module !== 'undefined') {
        module.exports = Inkress;
    } else if (typeof define === 'function' && define.amd) {
        // AMD support
        define([], function() {
            return Inkress;
        });
    }

})(typeof window !== 'undefined' ? window : this);