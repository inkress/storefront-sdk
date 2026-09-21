'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var fetch = require('cross-fetch');

const LIVE_API = 'https://api.inkress.com';
const SANDBOX_API = 'https://api-dev.inkress.com';
const LIVE_SITE = 'https://inkress.com';
const SANDBOX_SITE = 'https://dev.inkress.com';
class InkressApiError extends Error {
    constructor(message, status, details) {
        super(message);
        this.name = 'InkressApiError';
        this.status = status;
        this.details = details;
        if (details === null || details === void 0 ? void 0 : details.code) {
            this.code = details.code;
        }
    }
}
class HttpClient {
    constructor(config = {}) {
        this.config = HttpClient.resolveConfig(config);
    }
    static resolveConfig(config) {
        var _a, _b;
        const mode = config.mode || 'live';
        const endpoint = config.endpoint || (mode === 'sandbox' ? SANDBOX_API : LIVE_API);
        const siteUrl = config.siteUrl || (mode === 'sandbox' ? SANDBOX_SITE : LIVE_SITE);
        return {
            mode,
            endpoint,
            siteUrl,
            apiVersion: config.apiVersion || 'v1',
            merchantUsername: config.merchantUsername || '',
            authToken: config.authToken || '',
            timeout: (_a = config.timeout) !== null && _a !== void 0 ? _a : 30000,
            retries: (_b = config.retries) !== null && _b !== void 0 ? _b : 0,
            headers: config.headers || {},
        };
    }
    getBaseUrl() {
        return `${this.config.endpoint}/api/${this.config.apiVersion}`;
    }
    /** Public site origin (for hosted checkout URLs), not the API endpoint. */
    getSiteUrl() {
        return this.config.siteUrl;
    }
    getMerchantUsername() {
        return this.config.merchantUsername;
    }
    getHeaders(additionalHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...this.config.headers,
            ...additionalHeaders,
        };
        if (this.config.authToken) {
            headers['Authorization'] = `Bearer ${this.config.authToken}`;
        }
        if (this.config.merchantUsername) {
            headers['Client-Id'] = `m-${this.config.merchantUsername}`;
        }
        return headers;
    }
    async makeRequest(path, options = {}) {
        const url = `${this.getBaseUrl()}${path}`;
        const { method = 'GET', body, headers: requestHeaders, timeout } = options;
        const headers = this.getHeaders(requestHeaders);
        const requestTimeout = timeout !== null && timeout !== void 0 ? timeout : this.config.timeout;
        const requestInit = { method, headers };
        // Let FormData set its own multipart boundary; only JSON-encode plain bodies.
        if (body && method !== 'GET') {
            const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
            if (isFormData) {
                delete headers['Content-Type'];
                requestInit.body = body;
            }
            else {
                requestInit.body = typeof body === 'string' ? body : JSON.stringify(body);
            }
        }
        // Clear the timer once the race settles so it can't leak / fire late.
        let timer;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new InkressApiError('Request timeout', 0)), requestTimeout);
        });
        try {
            const response = await Promise.race([fetch(url, requestInit), timeoutPromise]);
            if (timer)
                clearTimeout(timer);
            if (!response.ok) {
                const errorText = await response.text();
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                }
                catch (_a) {
                    errorData = { message: errorText || `HTTP ${response.status}` };
                }
                throw new InkressApiError(errorData.message || errorData.reason || `HTTP ${response.status}`, response.status, errorData);
            }
            const responseText = await response.text();
            if (!responseText) {
                return { state: 'ok', result: undefined };
            }
            return JSON.parse(responseText);
        }
        catch (error) {
            if (timer)
                clearTimeout(timer);
            if (error instanceof InkressApiError) {
                throw error;
            }
            throw new InkressApiError(error instanceof Error ? error.message : 'Unknown error', 0, { error });
        }
    }
    async retryRequest(path, options = {}, retries = this.config.retries) {
        try {
            return await this.makeRequest(path, options);
        }
        catch (error) {
            if (retries > 0 && this.shouldRetry(error)) {
                await this.delay(1000 * (this.config.retries - retries + 1));
                return this.retryRequest(path, options, retries - 1);
            }
            throw error;
        }
    }
    shouldRetry(error) {
        if (error instanceof InkressApiError) {
            return error.status >= 500 || error.status === 0;
        }
        return false;
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async get(path, params, options) {
        let url = path;
        if (params) {
            const searchParams = new URLSearchParams();
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    searchParams.append(key, String(value));
                }
            });
            const queryString = searchParams.toString();
            if (queryString) {
                url += `?${queryString}`;
            }
        }
        return this.retryRequest(url, { ...options, method: 'GET' });
    }
    async post(path, body, options) {
        return this.retryRequest(path, { ...options, method: 'POST', body });
    }
    async put(path, body, options) {
        return this.retryRequest(path, { ...options, method: 'PUT', body });
    }
    async delete(path, options) {
        return this.retryRequest(path, { ...options, method: 'DELETE' });
    }
    async patch(path, body, options) {
        return this.retryRequest(path, { ...options, method: 'PATCH', body });
    }
    updateConfig(newConfig) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        // Re-resolve so a *mode change* recomputes derived endpoints, while a custom
        // endpoint/siteUrl already in effect is preserved unless overridden again
        // (and is NOT discarded when the caller passes the same mode explicitly).
        const modeChanged = newConfig.mode !== undefined && newConfig.mode !== this.config.mode;
        const merged = {
            mode: (_a = newConfig.mode) !== null && _a !== void 0 ? _a : this.config.mode,
            endpoint: (_b = newConfig.endpoint) !== null && _b !== void 0 ? _b : (modeChanged ? undefined : this.config.endpoint),
            siteUrl: (_c = newConfig.siteUrl) !== null && _c !== void 0 ? _c : (modeChanged ? undefined : this.config.siteUrl),
            apiVersion: (_d = newConfig.apiVersion) !== null && _d !== void 0 ? _d : this.config.apiVersion,
            merchantUsername: (_e = newConfig.merchantUsername) !== null && _e !== void 0 ? _e : this.config.merchantUsername,
            authToken: (_f = newConfig.authToken) !== null && _f !== void 0 ? _f : this.config.authToken,
            timeout: (_g = newConfig.timeout) !== null && _g !== void 0 ? _g : this.config.timeout,
            retries: (_h = newConfig.retries) !== null && _h !== void 0 ? _h : this.config.retries,
            headers: (_j = newConfig.headers) !== null && _j !== void 0 ? _j : this.config.headers,
        };
        this.config = HttpClient.resolveConfig(merged);
    }
    /** Current config with the auth token stripped. */
    getConfig() {
        const { authToken: _authToken, ...rest } = this.config;
        return rest;
    }
}

/**
 * Browser storage utility for cart, wishlist, and other persisted SDK data.
 *
 * SSR-safe: when `localStorage` is unavailable OR a write throws (e.g. Safari
 * private mode, quota/security errors) it transparently falls back to an
 * in-memory store, so a cart still works within a single runtime instead of
 * silently no-op'ing.
 *
 * The in-memory store is **per `StorageManager` instance** (not a module-level
 * singleton), so concurrent server-side requests that each construct their own
 * SDK never share cart/wishlist state.
 */
function localStorageAvailable() {
    try {
        return (typeof window !== 'undefined' &&
            typeof window.localStorage !== 'undefined' &&
            window.localStorage !== null &&
            typeof window.localStorage.getItem === 'function');
    }
    catch (_a) {
        return false;
    }
}
class BrowserStorage {
    constructor(key, prefix = 'inkress', memory) {
        this.key = key;
        this.prefix = prefix;
        this.memory = memory !== null && memory !== void 0 ? memory : new Map();
    }
    /** Update the namespace prefix (e.g. when the active merchant changes). */
    setPrefix(prefix) {
        this.prefix = prefix;
    }
    getStorageKey() {
        return `${this.prefix}:${this.key}`;
    }
    parse(raw) {
        if (raw === null || raw === undefined)
            return null;
        try {
            return JSON.parse(raw);
        }
        catch (_a) {
            return null;
        }
    }
    get() {
        var _a;
        const k = this.getStorageKey();
        if (localStorageAvailable()) {
            try {
                const raw = window.localStorage.getItem(k);
                if (raw !== null)
                    return this.parse(raw);
            }
            catch (error) {
                console.warn(`Error reading localStorage for key ${k}:`, error);
            }
        }
        // Fallback (and home for any write that couldn't reach localStorage).
        return this.parse((_a = this.memory.get(k)) !== null && _a !== void 0 ? _a : null);
    }
    set(value) {
        const k = this.getStorageKey();
        const raw = JSON.stringify(value);
        if (localStorageAvailable()) {
            try {
                window.localStorage.setItem(k, raw);
                this.memory.delete(k); // avoid split-brain: localStorage is source of truth
                return true;
            }
            catch (error) {
                console.warn(`localStorage write failed for ${k}, using in-memory fallback:`, error);
            }
        }
        this.memory.set(k, raw);
        return true;
    }
    remove() {
        const k = this.getStorageKey();
        if (localStorageAvailable()) {
            try {
                window.localStorage.removeItem(k);
            }
            catch (error) {
                console.warn(`Error removing localStorage for key ${k}:`, error);
            }
        }
        this.memory.delete(k);
        return true;
    }
    clear() {
        return this.remove();
    }
}
/**
 * Manages a family of namespaced storage instances under a shared prefix.
 *
 * Owns the in-memory fallback Map shared by the storages it creates, and tracks
 * those instances so the prefix can be re-pointed (e.g. on a merchant switch)
 * without invalidating references consumers already captured.
 *
 * Note: switching prefix orphans the previous prefix's keys rather than deleting
 * them — this is intentional so a per-merchant cart is restored if the merchant
 * is selected again. Call {@link clearAll} first if you want them gone.
 */
class StorageManager {
    constructor(prefix = 'inkress') {
        this.created = [];
        this.memory = new Map();
        this.prefix = prefix;
    }
    createStorage(key) {
        const storage = new BrowserStorage(key, this.prefix, this.memory);
        this.created.push(storage);
        return storage;
    }
    /** Re-point this manager and all storages it created at a new prefix. */
    setPrefix(prefix) {
        this.prefix = prefix;
        this.created.forEach((s) => s.setPrefix(prefix));
    }
    /** All fully-qualified keys under this prefix, across localStorage + memory. */
    qualifiedKeys() {
        const prefixPattern = `${this.prefix}:`;
        const set = new Set();
        if (localStorageAvailable()) {
            const ls = window.localStorage;
            for (let i = 0; i < ls.length; i++) {
                const k = ls.key(i);
                if (k !== null)
                    set.add(k);
            }
        }
        this.memory.forEach((_v, k) => set.add(k));
        return Array.from(set).filter((k) => k.startsWith(prefixPattern));
    }
    clearAll() {
        try {
            const usesLocal = localStorageAvailable();
            for (const k of this.qualifiedKeys()) {
                if (usesLocal) {
                    try {
                        window.localStorage.removeItem(k);
                    }
                    catch (_a) {
                        /* ignore individual removal errors */
                    }
                }
                this.memory.delete(k);
            }
            return true;
        }
        catch (error) {
            console.warn('Error clearing storage:', error);
            return false;
        }
    }
    getAllKeys() {
        const prefixLen = `${this.prefix}:`.length;
        try {
            return this.qualifiedKeys().map((k) => k.slice(prefixLen));
        }
        catch (error) {
            console.warn('Error reading storage keys:', error);
            return [];
        }
    }
}

/**
 * Simple event emitter for SDK events
 */
class EventEmitter {
    constructor() {
        this.events = new Map();
    }
    on(event, handler) {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event).add(handler);
        // Return unsubscribe function
        return () => this.off(event, handler);
    }
    off(event, handler) {
        const handlers = this.events.get(event);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.events.delete(event);
            }
        }
    }
    emit(event, data) {
        const handlers = this.events.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                }
                catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }
    once(event, handler) {
        const onceHandler = (data) => {
            handler(data);
            this.off(event, onceHandler);
        };
        this.on(event, onceHandler);
    }
    removeAllListeners(event) {
        if (event) {
            this.events.delete(event);
        }
        else {
            this.events.clear();
        }
    }
    listenerCount(event) {
        const handlers = this.events.get(event);
        return handlers ? handlers.size : 0;
    }
    eventNames() {
        return Array.from(this.events.keys());
    }
}

/**
 * Merchants resource for accessing public merchant information
 */
class MerchantsResource {
    constructor(client) {
        this.client = client;
    }
    /**
     * Get merchant public profile information
     */
    async getByUsername(merchantUsername) {
        return this.client.get('/public/m', { username: merchantUsername });
    }
    /**
     * Get merchant by domain
     */
    async getByDomain(domain) {
        return this.client.get('/public/m', { 'domain.cname': domain });
    }
    /**
     * Get merchant fee calculation
     */
    async getFees(merchantUsername) {
        return this.client.get(`/public/m/${merchantUsername}/fees`);
    }
    /**
     * Get merchant's public products
     */
    async getProducts(merchantUsername, params) {
        return this.client.get(`/public/m/${merchantUsername}/products`, params);
    }
    /**
     * Get merchant public tokens/keys
     */
    async getTokens(merchantUsername) {
        return this.client.get(`/public/m/${merchantUsername}/tokens`);
    }
    /**
     * Get merchant payment methods
     */
    async getPaymentMethods(merchantUsername) {
        return this.client.get(`/public/m/${merchantUsername}/payment_methods`);
    }
}

/** Product fields the API allows `group_by` faceting on (see product.ex). */
const PRODUCT_GROUP_BY_FIELDS = [
    'category_id',
    'currency_id',
    'status',
    'public',
    'unlimited',
];

const mappings = {
    "Access": {
        "view": 1,
        "list": 2,
        "create": 3,
        "update": 4,
        "delete": 5
    },
    "FeeStructure": {
        "merchant_absorb": 1,
        "customer_pay": 2
    },
    "Kind": {
        "order_online": 1,
        "order_payment_link": 1,
        "order_cart": 2,
        "order_subscription": 3,
        "order_invoice": 4,
        "order_offline": 5,
        "template_email": 1,
        "template_sms": 2,
        "template_receipt": 3,
        "password_account": 4,
        "password_otp": 5,
        "legal_request_account_removal": 6,
        "legal_request_account_report": 7,
        "notification_sale": 8,
        "notification_invite": 9,
        "notification_registration": 10,
        "notification_account": 11,
        "notification_report": 12,
        "notification_auth": 13,
        "notification_cart_reminder": 14,
        "notification_product_reminder": 15,
        "notification_purchase_confirmation": 16,
        "notification_shipping_confirmation": 17,
        "notification_delivery_confirmation": 18,
        "notification_feedback_request": 19,
        "notification_review_request": 20,
        "notification_platform_announcement": 21,
        "notification_organisation_announcement": 22,
        "notification_store_announcement": 23,
        "notification_organisation_suggestion": 24,
        "notification_store_suggestion": 25,
        "notification_organisation_referral": 26,
        "notification_store_referral": 27,
        "notification_organisation_upsell": 28,
        "notification_store_upsell": 29,
        "transaction_order": 30,
        "transaction_payout": 31,
        "transaction_manual": 32,
        "transaction_fee": 33,
        "token_login": 24,
        "token_api": 25,
        "token_sso": 32,
        "token_preset": 33,
        "user_address": 35,
        "merchant_address": 36,
        "organisation_address": 37,
        "role_preset": 26,
        "role_organisation": 27,
        "role_store": 28,
        "product_draft": 29,
        "product_published": 30,
        "product_archived": 31,
        "file_business_logo": 51,
        "file_business_document": 50,
        "file_payout_document": 71,
        "identity_email": 52,
        "identity_phone": 53,
        "billing_plan_subscription": 1,
        "billing_plan_payout": 2,
        "billing_subscription_manual_charge": 1,
        "billing_subscription_auto_charge": 2,
        "ledger_entry_credit": 1,
        "ledger_entry_debit": 2,
        "ledger_payout_standard": 1,
        "ledger_payout_early": 2,
        "ledger_payout_manual": 10,
        "fee_transaction_platform": 1,
        "fee_transaction_provider": 2,
        "fee_transaction_tax": 3,
        "fee_transaction_discount": 4,
        "fee_transaction_shipping": 5,
        "fee_transaction_processing": 6,
        "fee_transaction_subscription": 7,
        "fee_transaction_payout": 8,
        "fee_transaction_refund": 9,
        "fee_transaction_adjustment": 10,
        "fee_merchant_daily_limit": 11,
        "fee_merchant_weekly_limit": 12,
        "fee_merchant_monthly_limit": 13,
        "fee_merchant_single_limit": 14,
        "fee_merchant_withdrawal_limit": 15,
        "legal_request_document_submission": 1,
        "legal_request_bank_info_update": 2,
        "legal_request_limit_increase": 3,
        "payment_link_order": 1,
        "payment_link_invoice": 2
    },
    "Status": {
        "order_pending": 1,
        "order_error": 2,
        "order_failed": 2,
        "order_paid": 3,
        "order_partial": 32,
        "order_confirmed": 4,
        "order_cancelled": 5,
        "order_prepared": 6,
        "order_shipped": 7,
        "order_delivered": 8,
        "order_completed": 9,
        "order_returned": 10,
        "order_refunded": 11,
        "order_verifying": 12,
        "order_stale": 13,
        "order_archived": 14,
        "transaction_pending": 1,
        "transaction_authorized": 2,
        "transaction_hold": 3,
        "transaction_captured": 4,
        "transaction_voided": 5,
        "transaction_refunded": 6,
        "transaction_processed": 7,
        "transaction_processing": 8,
        "transaction_cancelled": 9,
        "transaction_failed": 10,
        "transaction_credit": 11,
        "transaction_debit": 12,
        "account_unverified": 20,
        "account_verified": 21,
        "account_in_review": 22,
        "account_approved": 23,
        "account_active": 24,
        "account_paused": 25,
        "account_restricted": 26,
        "account_suspended": 27,
        "account_banned": 28,
        "account_resigned": 29,
        "account_archived": 30,
        "email_outdated": 31,
        "identity_unverified": 32,
        "identity_verified": 33,
        "identity_in_review": 34,
        "identity_archived": 35,
        "identity_rejected": 36,
        "billing_subscription_pending": 1,
        "billing_subscription_active": 2,
        "billing_subscription_cancelled": 3,
        "billing_subscription_adhoc_charged": 4,
        "ledger_payout_pending": 1,
        "ledger_payout_processing": 2,
        "ledger_payout_processed": 3,
        "ledger_payout_rejected": 4,
        "ledger_entry_pending": 1,
        "ledger_entry_processing": 2,
        "ledger_entry_processed": 3,
        "billing_plan_active": 1,
        "billing_plan_draft": 2,
        "billing_plan_archived": 3,
        "post_draft": 1,
        "post_published": 2,
        "post_archived": 3,
        "product_draft": 1,
        "product_published": 2,
        "product_archived": 3,
        "legal_request_pending": 1,
        "legal_request_in_review": 2,
        "legal_request_approved": 3,
        "legal_request_rejected": 4,
        "financial_request_pending": 1,
        "financial_request_in_review": 2,
        "financial_request_approved": 3,
        "financial_request_rejected": 4
    }
};

// Translation utilities for converting between string representations and integer values
// Create reverse mappings for integer to string conversion
const createReverseMapping = (mapping) => {
    const reversed = {};
    for (const [key, value] of Object.entries(mapping)) {
        reversed[value] = key;
    }
    return reversed;
};
createReverseMapping(mappings.FeeStructure);
const reverseKind = createReverseMapping(mappings.Kind);
const reverseStatus = createReverseMapping(mappings.Status);
createReverseMapping(mappings.Access);
// Helper to find a key by value and prefix, useful when multiple keys map to the same value
const findKeyByValueAndPrefix = (mapping, value, prefix) => {
    for (const [key, val] of Object.entries(mapping)) {
        if (val === value && key.startsWith(prefix)) {
            return key;
        }
    }
    return undefined;
};
/**
 * Translation functions for Kinds with context-aware prefixing
 */
const KindTranslator = {
    /**
     * Convert string to integer for API calls
     */
    toInteger(key) {
        return mappings.Kind[key];
    },
    /**
     * Convert string to integer with context prefix
     */
    toIntegerWithContext(key, context) {
        // If key already has a context prefix, use as-is
        const fullKey = key.includes('_') ? key : `${context}_${key}`;
        if (mappings.Kind[fullKey] !== undefined) {
            return mappings.Kind[fullKey];
        }
        // Fallback: try the key as-is if it's a valid kind
        if (mappings.Kind[key] !== undefined) {
            return mappings.Kind[key];
        }
        throw new Error(`Unknown kind value: ${key} (tried with context: ${fullKey})`);
    },
    /**
     * Convert integer to string for user display
     */
    toString(value) {
        const key = reverseKind[value];
        if (!key) {
            throw new Error(`Unknown kind value: ${value}`);
        }
        return key;
    },
    /**
     * Convert integer to string and remove context prefix
     */
    toStringWithoutContext(value, context) {
        const prefix = `${context}_`;
        // Try to find a key that matches the value and starts with the prefix
        const contextKey = findKeyByValueAndPrefix(mappings.Kind, value, prefix);
        if (contextKey) {
            return contextKey.substring(prefix.length);
        }
        // Fallback to the global reverse mapping if no context-specific key is found
        const fullKey = this.toString(value);
        if (fullKey.startsWith(prefix)) {
            return fullKey.substring(prefix.length);
        }
        return fullKey;
    },
    /**
     * Get all available options as string keys
     */
    getOptions() {
        return Object.keys(mappings.Kind);
    },
    /**
     * Get options filtered by prefix (e.g., 'order_', 'product_')
     */
    getOptionsByPrefix(prefix) {
        return this.getOptions().filter(key => key.startsWith(prefix));
    },
    /**
     * Get options without context prefix for a specific context
     */
    getContextualOptions(context) {
        const prefix = `${context}_`;
        return this.getOptions()
            .filter(key => key.startsWith(prefix))
            .map(key => key.substring(prefix.length));
    }
};
/**
 * Translation functions for Statuses with context-aware prefixing
 */
const StatusTranslator = {
    /**
     * Convert string to integer for API calls
     */
    toInteger(key) {
        return mappings.Status[key];
    },
    /**
     * Convert string to integer with context prefix
     */
    toIntegerWithContext(key, context) {
        // If key already has the context prefix, use as-is
        const fullKey = key.includes('_') ? key : `${context}_${key}`;
        if (mappings.Status[fullKey] !== undefined) {
            return mappings.Status[fullKey];
        }
        // Fallback: try the key as-is if it's a valid status
        if (mappings.Status[key] !== undefined) {
            return mappings.Status[key];
        }
        throw new Error(`Unknown status value: ${key} (tried with context: ${fullKey})`);
    },
    /**
     * Convert integer to string for user display
     */
    toString(value) {
        const key = reverseStatus[value];
        if (!key) {
            throw new Error(`Unknown status value: ${value}`);
        }
        return key;
    },
    /**
     * Convert integer to string and remove context prefix
     */
    toStringWithoutContext(value, context) {
        const prefix = `${context}_`;
        // Try to find a key that matches the value and starts with the prefix
        const contextKey = findKeyByValueAndPrefix(mappings.Status, value, prefix);
        if (contextKey) {
            return contextKey.substring(prefix.length);
        }
        // Fallback to the global reverse mapping if no context-specific key is found
        const fullKey = this.toString(value);
        if (fullKey.startsWith(prefix)) {
            return fullKey.substring(prefix.length);
        }
        return fullKey;
    },
    /**
     * Get all available options as string keys
     */
    getOptions() {
        return Object.keys(mappings.Status);
    },
    /**
     * Get options filtered by prefix (e.g., 'order_', 'product_', 'account_')
     */
    getOptionsByPrefix(prefix) {
        return this.getOptions().filter(key => key.startsWith(prefix));
    },
    /**
     * Get options without context prefix for a specific context
     */
    getContextualOptions(context) {
        const prefix = `${context}_`;
        return this.getOptions()
            .filter(key => key.startsWith(prefix))
            .map(key => key.substring(prefix.length));
    }
};

/**
 * Type-Based Query System
 *
 * This module provides a clean, type-safe query API where users write intuitive queries
 * and the SDK automatically transforms them into the Elixir-compatible format.
 *
 * Features:
 * - Array values → _in suffix (id: [1,2,3] → id_in: [1,2,3])
 * - Range objects → _min/_max suffixes (age: {min: 18, max: 65} → age_min: 18, age_max: 65)
 * - String operations → contains. prefix (name: {contains: "john"} → "contains.name": "john")
 * - Date operations → before./after./on. prefixes
 * - JSON field operations → in_, not_, null_, not_null_ prefixes
 * - Direct values → equality check (no transformation)
 */
/**
 * Runtime validation for query parameters
 */
function validateQueryParams(query, fieldTypes) {
    const errors = [];
    if (!query || typeof query !== 'object') {
        return errors;
    }
    for (const [key, value] of Object.entries(query)) {
        // Skip special fields and undefined/null values
        if (isSpecialField(key) || value === undefined || value === null) {
            continue;
        }
        // Skip data field (JSON queries have their own validation)
        if (key === 'data') {
            continue;
        }
        const fieldType = fieldTypes === null || fieldTypes === void 0 ? void 0 : fieldTypes[key];
        // Validate based on field type
        if (fieldType) {
            const validationError = validateFieldValue(key, value, fieldType);
            if (validationError) {
                errors.push(validationError);
            }
        }
    }
    return errors;
}
/**
 * Validate a single field value against its expected type
 */
function validateFieldValue(fieldName, value, expectedType) {
    // Handle array values (for _in operations)
    if (Array.isArray(value)) {
        for (const item of value) {
            if (!isValueOfType(item, expectedType)) {
                return `Field "${fieldName}" array contains invalid type. Expected all items to be ${expectedType}, but found ${typeof item}`;
            }
        }
        return null;
    }
    // Handle range objects
    if (typeof value === 'object' && value !== null && ('min' in value || 'max' in value)) {
        if (expectedType !== 'number' && expectedType !== 'date' && expectedType !== 'string') {
            return `Field "${fieldName}" cannot use range queries. Range queries are only supported for number, date, and string fields.`;
        }
        if ('min' in value && value.min !== undefined && !isValueOfType(value.min, expectedType)) {
            return `Field "${fieldName}" range min value has wrong type. Expected ${expectedType}, got ${typeof value.min}`;
        }
        if ('max' in value && value.max !== undefined && !isValueOfType(value.max, expectedType)) {
            return `Field "${fieldName}" range max value has wrong type. Expected ${expectedType}, got ${typeof value.max}`;
        }
        return null;
    }
    // Handle string contains queries
    if (typeof value === 'object' && value !== null && 'contains' in value) {
        if (expectedType !== 'string') {
            return `Field "${fieldName}" cannot use contains queries. Contains queries are only supported for string fields.`;
        }
        if (typeof value.contains !== 'string') {
            return `Field "${fieldName}" contains value must be a string. Got ${typeof value.contains}`;
        }
        return null;
    }
    // Handle date queries
    if (typeof value === 'object' && value !== null && ('before' in value || 'after' in value || 'on' in value || 'min' in value || 'max' in value)) {
        if ('before' in value && value.before !== undefined && typeof value.before !== 'string') {
            return `Field "${fieldName}" before value must be a string. Got ${typeof value.before}`;
        }
        if ('after' in value && value.after !== undefined && typeof value.after !== 'string') {
            return `Field "${fieldName}" after value must be a string. Got ${typeof value.after}`;
        }
        if ('on' in value && value.on !== undefined && typeof value.on !== 'string') {
            return `Field "${fieldName}" on value must be a string. Got ${typeof value.on}`;
        }
        if ('min' in value && value.min !== undefined && typeof value.min !== 'string') {
            return `Field "${fieldName}" min value must be a string. Got ${typeof value.min}`;
        }
        if ('max' in value && value.max !== undefined && typeof value.max !== 'string') {
            return `Field "${fieldName}" max value must be a string. Got ${typeof value.max}`;
        }
        return null;
    }
    // Handle direct values
    if (!isValueOfType(value, expectedType)) {
        return `Field "${fieldName}" has wrong type. Expected ${expectedType}, got ${typeof value}`;
    }
    return null;
}
/**
 * Check if a value matches the expected type
 */
function isValueOfType(value, expectedType) {
    switch (expectedType) {
        case 'string':
            return typeof value === 'string';
        case 'number':
            return typeof value === 'number' && !isNaN(value);
        case 'boolean':
            return typeof value === 'boolean';
        case 'date':
            return value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)));
        case 'array':
            return Array.isArray(value);
        default:
            return true;
    }
}
/**
 * Transform a clean user query into Elixir-compatible format
 */
function transformQuery(query) {
    if (!query || typeof query !== 'object') {
        return {};
    }
    const result = {};
    for (const [key, value] of Object.entries(query)) {
        // Skip undefined/null values
        if (value === undefined || value === null) {
            continue;
        }
        // Pass through special fields unchanged
        if (isSpecialField(key)) {
            result[key] = value;
            continue;
        }
        // Handle data field specially for JSON queries
        if (key === 'data' && typeof value === 'object') {
            result.data = transformJsonQuery(value);
            continue;
        }
        // Transform based on value type
        const transformedValue = transformFieldValue(key, value);
        // Skip null values (e.g., from empty objects)
        if (transformedValue !== null) {
            result[key] = transformedValue;
        }
    }
    return result;
}
/**
 * Check if a field is a special field that should pass through unchanged
 */
function isSpecialField(key) {
    const specialFields = [
        'exclude', 'distinct', 'order_by', 'page', 'page_size', 'per_page',
        'limit', 'override_page', 'q', 'search', 'sort', 'order'
    ];
    return specialFields.includes(key);
}
/**
 * Transform a field value based on its type
 */
function transformFieldValue(key, value) {
    if (Array.isArray(value)) {
        // Array → add _in suffix
        return { [`${key}_in`]: value };
    }
    if (typeof value === 'object' && value !== null) {
        const transformedObject = {};
        // Handle range queries (min/max)
        if ('min' in value && value.min !== undefined) {
            transformedObject[`${key}_min`] = value.min;
        }
        if ('max' in value && value.max !== undefined) {
            transformedObject[`${key}_max`] = value.max;
        }
        // Handle range queries (gte/lte/gt/lt)
        if ('gte' in value && value.gte !== undefined) {
            transformedObject[`${key}_gte`] = value.gte;
        }
        if ('lte' in value && value.lte !== undefined) {
            transformedObject[`${key}_lte`] = value.lte;
        }
        if ('gt' in value && value.gt !== undefined) {
            transformedObject[`${key}_gt`] = value.gt;
        }
        if ('lt' in value && value.lt !== undefined) {
            transformedObject[`${key}_lt`] = value.lt;
        }
        // Handle string queries
        if ('contains' in value && value.contains !== undefined) {
            transformedObject[`contains.${key}`] = value.contains;
        }
        // Handle date queries
        if ('before' in value && value.before !== undefined) {
            transformedObject[`before.${key}`] = value.before;
        }
        if ('after' in value && value.after !== undefined) {
            transformedObject[`after.${key}`] = value.after;
        }
        if ('on' in value && value.on !== undefined) {
            transformedObject[`on.${key}`] = value.on;
        }
        // If we found any transformations, return them
        if (Object.keys(transformedObject).length > 0) {
            return transformedObject;
        }
        // Empty object with no transformation keys - return null to skip it
        if (Object.keys(value).length === 0) {
            return null;
        }
    }
    // Direct value → wrap for consistent structure that will be flattened later
    return { [key]: value };
}
/**
 * Transform JSON field queries with special operators
 */
function transformJsonQuery(data) {
    const result = {};
    for (const [key, value] of Object.entries(data)) {
        // Skip undefined/null values
        if (value === undefined || value === null) {
            continue;
        }
        // Nested paths (e.g., "settings->theme") stay as-is
        if (key.includes('->')) {
            result[key] = value;
            continue;
        }
        if (typeof value === 'object' && value !== null) {
            // Check if this is a JSON query operation (has special keys)
            const hasJsonQueryOps = 'in' in value || 'not' in value || 'null' in value ||
                'not_null' in value || 'min' in value || 'max' in value;
            if (hasJsonQueryOps) {
                // Transform JSON-specific operations
                if ('in' in value && value.in !== undefined) {
                    result[`in_${key}`] = value.in;
                }
                if ('not' in value && value.not !== undefined) {
                    result[`not_${key}`] = value.not;
                }
                if ('null' in value && value.null !== undefined) {
                    result[`null_${key}`] = value.null;
                }
                if ('not_null' in value && value.not_null !== undefined) {
                    result[`not_null_${key}`] = value.not_null;
                }
                if ('min' in value && value.min !== undefined) {
                    result[`${key}_min`] = value.min;
                }
                if ('max' in value && value.max !== undefined) {
                    result[`${key}_max`] = value.max;
                }
            }
            else {
                // Complex object without query operators - pass through as-is
                result[key] = value;
            }
        }
        else {
            // Direct value in JSON field
            result[key] = value;
        }
    }
    return result;
}
/**
 * Flatten the transformed query object for API consumption
 */
function flattenTransformedQuery(transformed) {
    const result = {};
    for (const [key, value] of Object.entries(transformed)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // If it's a transformation object with special keys, merge its properties
            if (hasTransformationKeys(value)) {
                Object.assign(result, value);
            }
            else if (isWrappedDirectValue(key, value)) {
                // Unwrap direct values like { id: { id: 5 } } → { id: 5 }
                result[key] = value[key];
            }
            else {
                // Regular object (like data field)
                result[key] = value;
            }
        }
        else {
            // Direct value or array
            result[key] = value;
        }
    }
    return result;
}
/**
 * Check if a value is a wrapped direct value (e.g., { id: { id: 5 } })
 * This happens when transformFieldValue wraps a direct value for consistency
 */
function isWrappedDirectValue(key, obj) {
    const keys = Object.keys(obj);
    return keys.length === 1 && keys[0] === key;
}
/**
 * Check if an object contains transformation keys
 */
function hasTransformationKeys(obj) {
    const keys = Object.keys(obj);
    return keys.some(key => key.includes('_min') ||
        key.includes('_max') ||
        key.includes('_gte') ||
        key.includes('_lte') ||
        key.includes('_gt') ||
        key.includes('_lt') ||
        key.includes('_in') ||
        key.includes('contains.') ||
        key.includes('before.') ||
        key.includes('after.') ||
        key.includes('on.'));
}
/**
 * Main function to transform and flatten a query in one step
 * Handles translation of contextual strings to integers before transformation
 */
function processQuery(query, fieldTypes, options = { validate: false }) {
    // Translate contextual strings to integers BEFORE validation and transformation
    const translatedQuery = { ...query };
    if (fieldTypes && options.context) {
        for (const [key, value] of Object.entries(translatedQuery)) {
            const fieldType = fieldTypes[key];
            // Skip special fields
            if (isSpecialField(key))
                continue;
            // Translate status fields (contextual strings to integers)
            if (key === 'status' && fieldType === 'number') {
                translatedQuery[key] = translateValue(value, StatusTranslator, options.context);
            }
            // Translate kind fields (contextual strings to integers)
            if (key === 'kind' && fieldType === 'number') {
                translatedQuery[key] = translateValue(value, KindTranslator, options.context);
            }
        }
    }
    // Transform AFTER translation so that range objects are properly handled
    const transformed = transformQuery(translatedQuery);
    const flattened = flattenTransformedQuery(transformed);
    // Runtime validation AFTER transformation if enabled and field types provided
    if (options.validate && fieldTypes) {
        const validationErrors = validateQueryParams(flattened, fieldTypes);
        if (validationErrors.length > 0) {
            console.warn(`Query validation warnings: ${validationErrors.join(', ')}`);
        }
    }
    return flattened;
}
/**
 * Helper to translate a value (string, array of strings, or object with strings)
 */
function translateValue(value, translator, context) {
    if (value === undefined || value === null) {
        return value;
    }
    // Handle arrays (for _in operations)
    if (Array.isArray(value)) {
        return value.map(item => {
            // If it's already a number, pass it through
            if (typeof item === 'number') {
                return item;
            }
            // If it's a string, it MUST be translatable
            if (typeof item === 'string') {
                return context
                    ? translator.toIntegerWithContext(item, context)
                    : translator.toInteger(item);
            }
            return item;
        });
    }
    // Handle range objects (e.g., { gte: 'paid', lte: 'confirmed' })
    if (typeof value === 'object' && value !== null) {
        const translated = {};
        for (const [k, v] of Object.entries(value)) {
            // If it's already a number, pass it through
            if (typeof v === 'number') {
                translated[k] = v;
            }
            // If it's a string, it MUST be translatable
            else if (typeof v === 'string') {
                translated[k] = context
                    ? translator.toIntegerWithContext(v, context)
                    : translator.toInteger(v);
            }
            else {
                translated[k] = v;
            }
        }
        return translated;
    }
    // Handle direct string values
    if (typeof value === 'string') {
        return context
            ? translator.toIntegerWithContext(value, context)
            : translator.toInteger(value);
    }
    // Already a number, pass through
    return value;
}
/**
 * Type-safe query builder for specific entity types
 */
class QueryBuilder {
    constructor(initialQuery) {
        this.query = {};
        if (initialQuery) {
            this.query = { ...initialQuery };
        }
    }
    /**
     * Add a field equality condition
     */
    where(field, value) {
        this.query[field] = value;
        return this;
    }
    /**
     * Add a field IN condition (array of values)
     */
    whereIn(field, values) {
        this.query[field] = values;
        return this;
    }
    /**
     * Add a range condition (min/max)
     */
    whereRange(field, min, max) {
        const range = {};
        if (min !== undefined)
            range.min = min;
        if (max !== undefined)
            range.max = max;
        this.query[field] = range;
        return this;
    }
    /**
     * Add a string contains condition
     */
    whereContains(field, value) {
        this.query[field] = { contains: value };
        return this;
    }
    /**
     * Add a date range condition
     */
    whereDateRange(field, after, before, on) {
        const dateQuery = {};
        if (after !== undefined)
            dateQuery.after = after;
        if (before !== undefined)
            dateQuery.before = before;
        if (on !== undefined)
            dateQuery.on = on;
        this.query[field] = dateQuery;
        return this;
    }
    /**
     * Add pagination
     */
    paginate(page, pageSize) {
        this.query.page = page;
        this.query.page_size = pageSize;
        return this;
    }
    /**
     * Add ordering
     */
    orderBy(field, direction = 'asc') {
        this.query.order_by = `${field} ${direction}`;
        return this;
    }
    /**
     * Add general search
     */
    search(term) {
        this.query.q = term;
        return this;
    }
    /**
     * Build and return the transformed query
     */
    build() {
        return processQuery(this.query);
    }
    /**
     * Get the raw query (before transformation)
     */
    getRawQuery() {
        return { ...this.query };
    }
}

// ============================================================================
// Fluent, type-safe query builders for the storefront's list-bearing resources.
// Ported from @inkress/admin-sdk and scoped to products, categories, orders,
// and reviews. Each builder extends the shared QueryBuilder<T> and resolves via
// a resource that implements Queryable.
// ============================================================================
/**
 * Product query builder.
 *
 * @example
 * const products = await sdk.products.createQueryBuilder()
 *   .whereStatus('published')
 *   .wherePriceRange(10, 100)
 *   .whereTitleContains('shirt')
 *   .wherePublic(true)
 *   .paginate(1, 20)
 *   .execute();
 */
class ProductQueryBuilder extends QueryBuilder {
    constructor(resource, initialQuery) {
        super(initialQuery);
        this.resource = resource;
    }
    execute() {
        return this.resource.query(this.getRawQuery());
    }
    whereStatus(status) {
        return Array.isArray(status) ? this.whereIn('status', status) : this.where('status', status);
    }
    wherePriceRange(min, max) {
        return this.whereRange('price', min, max);
    }
    whereTitleContains(value) {
        return this.whereContains('title', value);
    }
    wherePublic(isPublic) {
        return this.where('public', isPublic);
    }
    whereCategory(categoryId) {
        return Array.isArray(categoryId) ? this.whereIn('category_id', categoryId) : this.where('category_id', categoryId);
    }
    whereUnitsRemainingRange(min, max) {
        return this.whereRange('units_remaining', min, max);
    }
    whereUnlimited(isUnlimited) {
        return this.where('unlimited', isUnlimited);
    }
}
/**
 * Category query builder.
 *
 * @example
 * const cats = await sdk.categories.createQueryBuilder()
 *   .whereParent(7)
 *   .whereNameContains('apparel')
 *   .execute();
 */
class CategoryQueryBuilder extends QueryBuilder {
    constructor(resource, initialQuery) {
        super(initialQuery);
        this.resource = resource;
    }
    execute() {
        return this.resource.query(this.getRawQuery());
    }
    whereKind(kind) {
        return Array.isArray(kind) ? this.whereIn('kind', kind) : this.where('kind', kind);
    }
    whereNameContains(value) {
        return this.whereContains('name', value);
    }
    /** Filter to the children of a given parent category. */
    whereParent(parentId) {
        return Array.isArray(parentId) ? this.whereIn('parent_id', parentId) : this.where('parent_id', parentId);
    }
}
/**
 * Order query builder (customer-scoped; requires an auth token).
 *
 * @example
 * const orders = await sdk.orders.createQueryBuilder()
 *   .whereStatus('completed')
 *   .whereTotalRange(100, 1000)
 *   .orderBy('created_at', 'desc')
 *   .execute();
 */
class OrderQueryBuilder extends QueryBuilder {
    constructor(resource, initialQuery) {
        super(initialQuery);
        this.resource = resource;
    }
    execute() {
        return this.resource.query(this.getRawQuery());
    }
    whereStatus(status) {
        return Array.isArray(status) ? this.whereIn('status', status) : this.where('status', status);
    }
    whereKind(kind) {
        return Array.isArray(kind) ? this.whereIn('kind', kind) : this.where('kind', kind);
    }
    whereTotalRange(min, max) {
        return this.whereRange('total', min, max);
    }
    whereReferenceContains(value) {
        return this.whereContains('reference_id', value);
    }
    whereCreatedBetween(after, before) {
        return this.whereDateRange('created_at', after, before);
    }
}
/**
 * Review query builder.
 *
 * @example
 * const reviews = await sdk.reviews.createQueryBuilder()
 *   .whereProduct(123)
 *   .whereMinRating(4)
 *   .orderBy('created_at', 'desc')
 *   .execute();
 */
class ReviewQueryBuilder extends QueryBuilder {
    constructor(resource, initialQuery) {
        super(initialQuery);
        this.resource = resource;
    }
    execute() {
        return this.resource.query(this.getRawQuery());
    }
    /** Reviews are attached to a product via `parent_id`. */
    whereProduct(productId) {
        return Array.isArray(productId) ? this.whereIn('parent_id', productId) : this.where('parent_id', productId);
    }
    whereRating(rating) {
        return Array.isArray(rating) ? this.whereIn('rating', rating) : this.where('rating', rating);
    }
    whereMinRating(min) {
        return this.whereRange('rating', min, undefined);
    }
    whereCustomer(customerId) {
        return Array.isArray(customerId) ? this.whereIn('customer_id', customerId) : this.where('customer_id', customerId);
    }
}

/**
 * Pure helpers for product custom fields (variants/options/attributes), stock,
 * and faceted-search parsing. Kept free of the HTTP client so they are easy to
 * test and tree-shake; `ProductsResource` exposes thin wrappers over them.
 */
/**
 * Static product attributes/specs.
 *
 * Canonical read shape — the one `commerce-web`'s marketplace consumes — is
 * `product.data.attributes`. Falls back to deriving from a merged `custom_fields`
 * array (the merchant form's write payload) only when that isn't present.
 */
function getProductAttributes(product) {
    var _a;
    const data = ((_a = product.data) !== null && _a !== void 0 ? _a : {});
    if (Array.isArray(data.attributes)) {
        return data.attributes;
    }
    return mergedCustomFields(product).filter((f) => f.type !== 'options' && hasValue(f));
}
/**
 * Customer-fillable inputs (`options` choices + other prompts).
 *
 * Canonical read shape is `product.data.customer_inputs` (what the marketplace
 * reads). Falls back to deriving from a merged `custom_fields` array.
 */
function getProductCustomerInputs(product) {
    var _a;
    const data = ((_a = product.data) !== null && _a !== void 0 ? _a : {});
    if (Array.isArray(data.customer_inputs)) {
        return data.customer_inputs;
    }
    return mergedCustomFields(product).filter((f) => f.type === 'options' || !hasValue(f));
}
/**
 * All of a product's custom fields (attributes + customer inputs).
 *
 * Prefers the canonical marketplace shape (`data.attributes` +
 * `data.customer_inputs`); falls back to the write-payload `custom_fields` array.
 */
function getProductCustomFields(product) {
    var _a;
    const data = ((_a = product.data) !== null && _a !== void 0 ? _a : {});
    const attributes = Array.isArray(data.attributes) ? data.attributes : undefined;
    const customerInputs = Array.isArray(data.customer_inputs)
        ? data.customer_inputs
        : undefined;
    if (attributes || customerInputs) {
        return [...(attributes !== null && attributes !== void 0 ? attributes : []), ...(customerInputs !== null && customerInputs !== void 0 ? customerInputs : [])];
    }
    return mergedCustomFields(product);
}
function hasValue(field) {
    return field.value != null && field.value !== '';
}
/**
 * The merchant form's write payload: a single `custom_fields` array, found
 * top-level or under `data`. Used only as a fallback for records that carry the
 * write shape rather than the marketplace read shape.
 */
function mergedCustomFields(product) {
    var _a;
    if (Array.isArray(product.custom_fields)) {
        return product.custom_fields;
    }
    const data = ((_a = product.data) !== null && _a !== void 0 ? _a : {});
    if (Array.isArray(data.custom_fields)) {
        return data.custom_fields;
    }
    return [];
}
/**
 * Compute a product's unit price for a set of customer selections.
 *
 * Starts from `product.price` and adds: the chosen option's price for each
 * `type: 'options'` field, and the field's add-on `price` for each other input
 * the customer filled (`filled: true`). Unknown field names are ignored.
 */
function computeProductUnitPrice(product, selections = []) {
    var _a;
    const fields = getProductCustomFields(product);
    let total = product.price || 0;
    for (const selection of selections) {
        const field = fields.find((f) => f.name === selection.name);
        if (!field)
            continue;
        if (field.type === 'options') {
            const option = ((_a = field.options) !== null && _a !== void 0 ? _a : []).find((o) => o.label === selection.option);
            if (option)
                total += option.price || 0;
        }
        else if (selection.filled) {
            total += field.price || 0;
        }
    }
    return total;
}
/** Whether a product is purchasable: unlimited, or has remaining units. */
function isProductInStock(product) {
    var _a;
    return Boolean(product.unlimited) || ((_a = product.units_remaining) !== null && _a !== void 0 ? _a : 0) > 0;
}
/** Available units, or `null` when the product is unlimited. */
function getProductAvailableStock(product) {
    var _a;
    if (product.unlimited)
        return null;
    return (_a = product.units_remaining) !== null && _a !== void 0 ? _a : 0;
}
/** Derive a {@link ProductStock} snapshot from a product record. */
function toProductStock(product) {
    return {
        inStock: isProductInStock(product),
        unlimited: Boolean(product.unlimited),
        unitsRemaining: getProductAvailableStock(product),
    };
}
/**
 * Normalize one grouped-query row into a {@link FacetBucket}. Aggregate columns
 * come back named `"<column>_<fn>"` (e.g. `id_count`, `price_min`).
 */
function normalizeFacetRow(row, field) {
    var _a, _b, _c;
    const num = (v) => v == null || v === '' ? undefined : Number(v);
    return {
        field,
        value: (_a = row[field]) !== null && _a !== void 0 ? _a : null,
        count: Number((_c = (_b = row.id_count) !== null && _b !== void 0 ? _b : row.count) !== null && _c !== void 0 ? _c : 0),
        priceMin: num(row.price_min),
        priceMax: num(row.price_max),
        priceAvg: num(row.price_avg),
        unitsRemainingSum: num(row.units_remaining_sum),
        raw: row,
    };
}

// ============================================================================
// Per-resource query parameter & list-response types for the storefront SDK.
// Mirrors the @inkress/admin-sdk types/resources convention so the two SDKs
// share one query mental model.
// ============================================================================
const PRODUCT_FIELD_TYPES = {
    status: 'number',
    price: 'number',
    public: 'boolean',
    unlimited: 'boolean',
    category_id: 'number',
    units_remaining: 'number',
    title: 'string',
    created_at: 'date',
};
const ORDER_FIELD_TYPES = {
    kind: 'number',
    total: 'number',
    customer_id: 'number',
    reference_id: 'string',
    created_at: 'date',
};
const CATEGORY_FIELD_TYPES = {
    kind: 'number',
    parent_id: 'number',
    name: 'string',
};
const REVIEW_FIELD_TYPES = {
    parent_id: 'number',
    customer_id: 'number',
    rating: 'number',
    created_at: 'date',
};
/** Context strings used for contextual status/kind translation. */
const QUERY_CONTEXT = {
    product: 'product',
    order: 'order',
    category: 'category',
    review: 'review',
};

/**
 * Products resource for accessing product information.
 *
 * Two ways to list:
 *  - `search(params)` and the convenience helpers — simple param objects.
 *  - `query(params)` / `createQueryBuilder()` — the typed query system shared
 *    with @inkress/admin-sdk (range/contains/date filters + status translation).
 */
class ProductsResource {
    constructor(client) {
        this.client = client;
    }
    /**
     * Get a specific product by ID
     */
    async get(productId) {
        return this.client.get(`/products/${productId}`);
    }
    /**
     * Run a typed product query. Transforms range/contains/date filters and
     * translates contextual `status` strings (e.g. 'published') to API codes.
     *
     * @example await products.query({ status: 'published', price: { min: 20 }, page: 1 })
     */
    async query(params) {
        const processed = processQuery(params || {}, PRODUCT_FIELD_TYPES, { context: QUERY_CONTEXT.product });
        return this.client.get('/products', processed);
    }
    /** Start a fluent product query, e.g. `products.createQueryBuilder().whereStatus('published').execute()`. */
    createQueryBuilder(initialQuery) {
        return new ProductQueryBuilder(this, initialQuery);
    }
    /**
     * Search products with filters and pagination (simple param object).
     */
    async search(params) {
        return this.client.get('/products', params);
    }
    /**
     * Get products by category
     */
    async getByCategory(categoryId, params) {
        return this.search({ ...params, category_id: categoryId });
    }
    /**
     * Search products by query string
     */
    async searchByQuery(query, params) {
        return this.search({ ...params, q: query || (params === null || params === void 0 ? void 0 : params.search) || (params === null || params === void 0 ? void 0 : params.q) });
    }
    /**
     * Get products within a price range
     */
    async getByPriceRange(minPrice, maxPrice, params) {
        return this.search({ ...params, price_min: minPrice, price_max: maxPrice });
    }
    /**
     * Get only in-stock products
     */
    async getInStock(params) {
        return this.search({ ...params, units_remaining_min: 1 });
    }
    /**
     * Get featured/popular products (customize based on your API)
     */
    async getFeatured(params) {
        // This might need to be adjusted based on your API's featured products endpoint
        return this.search({ ...params, 'data.featured': true });
    }
    /**
     * Get recently added products
     */
    async getRecent(limit = 12, params) {
        return this.search({
            ...params,
            limit,
            sort: 'created_at',
            order: 'desc'
        });
    }
    // ---------------------------------------------------------------------------
    // Variants / options (read helpers — authored in the merchant product form)
    // ---------------------------------------------------------------------------
    /** All custom fields (variants/options/attributes) on a product. */
    getCustomFields(product) {
        return getProductCustomFields(product);
    }
    /** Static attributes/specs (fields with a value, non-`options`). */
    getAttributes(product) {
        return getProductAttributes(product);
    }
    /** Customer-fillable inputs (`options` fields or fields with no preset value). */
    getCustomerInputs(product) {
        return getProductCustomerInputs(product);
    }
    /**
     * Compute a product's unit price for the given customer selections
     * (base price + chosen option prices + add-on prices for filled inputs).
     */
    computeUnitPrice(product, selections = []) {
        return computeProductUnitPrice(product, selections);
    }
    // ---------------------------------------------------------------------------
    // Stock
    // ---------------------------------------------------------------------------
    /** Whether a product is purchasable (unlimited or has remaining units). */
    isInStock(product) {
        return isProductInStock(product);
    }
    /** Available units for a product, or `null` when unlimited. */
    getAvailableStock(product) {
        return getProductAvailableStock(product);
    }
    /**
     * Fetch a fresh stock snapshot by re-reading the product (there is no
     * dedicated stock endpoint). Use before checkout for an up-to-date count.
     */
    async checkStock(productId) {
        const response = await this.get(productId);
        return {
            state: response.state,
            result: response.result ? toProductStock(response.result) : undefined,
        };
    }
    // ---------------------------------------------------------------------------
    // Faceted search (server-side group_by)
    // ---------------------------------------------------------------------------
    /**
     * Faceted product search. Applies the given filters and groups results by one
     * or more whitelisted fields, returning per-group counts and price/stock
     * aggregates in a single request (`GET /products?...&group_by=...`).
     *
     * @example
     * // Category facet counts + price range for published products:
     * await products.facets({ status: 'published' }, { groupBy: 'category_id' });
     */
    async facets(filters, options) {
        var _a, _b;
        const groupBy = Array.isArray(options.groupBy)
            ? options.groupBy
            : [options.groupBy];
        const invalid = groupBy.filter((f) => !PRODUCT_GROUP_BY_FIELDS.includes(f));
        if (invalid.length > 0) {
            throw new Error(`Unsupported facet group_by field(s): ${invalid.join(', ')}. ` +
                `Allowed: ${PRODUCT_GROUP_BY_FIELDS.join(', ')}.`);
        }
        const processed = processQuery(filters || {}, PRODUCT_FIELD_TYPES, {
            context: QUERY_CONTEXT.product,
        });
        const response = await this.client.get('/products', {
            ...processed,
            group_by: groupBy.join(','),
        });
        const rows = (_b = (_a = response.result) === null || _a === void 0 ? void 0 : _a.entries) !== null && _b !== void 0 ? _b : [];
        return {
            state: response.state,
            result: rows.map((row) => normalizeFacetRow(row, groupBy[0])),
        };
    }
}

/**
 * Categories resource for managing product categories
 *
 * Categories provide a way to organize products into hierarchical groups.
 * They support nested structures through parent_id relationships and can
 * be filtered by various criteria including kind, name, and description.
 */
class CategoriesResource {
    constructor(client) {
        this.client = client;
    }
    /**
     * List categories with optional filtering and pagination
     *
     * @param params - Query parameters for filtering and pagination
     * @returns Promise resolving to paginated list of categories
     */
    async list(params) {
        return this.client.get('/categories', params);
    }
    /**
     * Run a typed category query (range/contains/date filters + pagination).
     *
     * @example await categories.query({ name: { contains: 'apparel' }, page: 1 })
     */
    async query(params) {
        const processed = processQuery(params || {}, CATEGORY_FIELD_TYPES, { context: QUERY_CONTEXT.category });
        return this.client.get('/categories', processed);
    }
    /** Start a fluent category query. */
    createQueryBuilder(initialQuery) {
        return new CategoryQueryBuilder(this, initialQuery);
    }
    /**
     * Get a specific category by ID
     *
     * @param id - The category ID
     * @returns Promise resolving to the category
     */
    async get(id) {
        return this.client.get(`/categories/${id}`);
    }
    /**
     * Create a new category (requires authentication)
     *
     * @param input - The category data to create
     * @returns Promise resolving to the created category
     */
    async create(input) {
        return this.client.post('/categories', input);
    }
    /**
     * Update an existing category (requires authentication)
     *
     * @param id - The category ID to update
     * @param input - The updated category data
     * @returns Promise resolving to the updated category
     */
    async update(id, input) {
        return this.client.put(`/categories/${id}`, input);
    }
    /**
     * Delete a category (requires authentication)
     *
     * @param id - The category ID to delete
     * @returns Promise resolving to void on successful deletion
     */
    async delete(id) {
        return this.client.delete(`/categories/${id}`);
    }
    // Convenience methods for common use cases
    /**
     * Search categories by name or description
     *
     * @param query - Search term to match against name and description
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of matching categories
     */
    async search(query, params) {
        return this.list({ ...params, q: query });
    }
    /**
     * Get categories by kind (type)
     *
     * @param kind - The category kind to filter by
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of categories of the specified kind
     */
    async getByKind(kind, params) {
        return this.list({ ...params, kind });
    }
    /**
     * Get child categories of a parent category
     *
     * @param parentId - The parent category ID
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of child categories
     */
    async getChildren(parentId, params) {
        return this.list({ ...params, parent_id: parentId });
    }
    /**
     * Get root categories (categories without a parent)
     *
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of root categories
     */
    async getRoots(params) {
        // Filter out parent_id to get only root categories
        const { parent_id: _parent_id, ...restParams } = params || {};
        return this.list(restParams);
    }
    /**
     * Create a subcategory under a parent category (requires authentication)
     *
     * @param parentId - The parent category ID
     * @param input - The category data (parent_id will be set automatically)
     * @returns Promise resolving to the created subcategory
     */
    async createSubcategory(parentId, input) {
        return this.create({ ...input, parent_id: parentId });
    }
    /**
     * Get the full category tree starting from root categories
     * Note: This makes multiple API calls to build the tree structure
     *
     * @param maxDepth - Maximum depth to traverse (default: 3)
     * @returns Promise resolving to a tree structure of categories
     */
    async getCategoryTree(maxDepth = 3) {
        try {
            // Get root categories
            const rootsResponse = await this.getRoots({ page_size: 100 });
            if (rootsResponse.state !== 'ok' || !rootsResponse.result) {
                return {
                    state: 'error',
                    result: undefined
                };
            }
            // Build tree recursively
            const tree = [];
            const rootCategories = rootsResponse.result.entries;
            for (const category of rootCategories) {
                const categoryWithChildren = await this.buildCategoryTree(category, maxDepth - 1);
                tree.push(categoryWithChildren);
            }
            return {
                state: 'ok',
                result: tree
            };
        }
        catch (error) {
            return {
                state: 'error',
                result: undefined
            };
        }
    }
    /**
     * Build category tree recursively (helper method)
     *
     * @private
     */
    async buildCategoryTree(category, depth) {
        const categoryTree = {
            ...category,
            children: []
        };
        if (depth > 0) {
            const childrenResponse = await this.getChildren(category.id, { page_size: 100 });
            if (childrenResponse.state === 'ok' && childrenResponse.result) {
                const children = childrenResponse.result.entries;
                for (const child of children) {
                    const childWithChildren = await this.buildCategoryTree(child, depth - 1);
                    categoryTree.children.push(childWithChildren);
                }
            }
        }
        return categoryTree;
    }
}
// CategoryTree is defined in ../types and re-exported from the package root.

/**
 * Auth resource for customer authentication and account management
 */
class AuthResource {
    constructor(client) {
        this.client = client;
    }
    /**
     * Register a new customer account
     */
    async register(customerData) {
        return this.client.post('/auth/register', customerData);
    }
    /**
     * Login a customer with email and password
     */
    async login(credentials) {
        return this.client.post('/auth/login', credentials);
    }
    /**
     * Logout the current customer
     */
    async logout() {
        return this.client.post('/auth/logout', {});
    }
    /**
     * Check whether the current auth token/session is still valid.
     *
     * Hits `GET /auth/valid`, which returns an empty `200` body when the session
     * is valid and `401` when it is not — it does NOT return the customer record.
     * Resolves `true`/`false` accordingly; non-401 errors (network, 5xx) propagate.
     */
    async validateToken() {
        try {
            await this.client.get('/auth/valid', {});
            return true;
        }
        catch (error) {
            if (error instanceof InkressApiError && error.status === 401) {
                return false;
            }
            throw error;
        }
    }
    /**
     * Fetch a customer profile by id (`GET /users/:id`).
     *
     * `customerId` is the `customer.id` returned by {@link login} / {@link register}.
     * Subject to the server's authorization rules for the `accounts.user` resource.
     */
    async getProfile(customerId) {
        return this.client.get(`/users/${customerId}`, {});
    }
    /**
     * Request password reset email
     */
    async requestPasswordReset(email) {
        return this.client.post('/auth/request_reset', { email });
    }
    /**
     * Reset password with token
     */
    async resetPassword(data) {
        return this.client.post('/auth/reset', data);
    }
    /**
     * Update a customer profile by id (`PUT /users/:id`).
     *
     * `customerId` is the `customer.id` from {@link login} / {@link register}.
     * Subject to the server's authorization rules for the `accounts.user` resource.
     */
    async updateProfile(customerId, updates) {
        return this.client.put(`/users/${customerId}`, updates);
    }
    /**
     * Change a customer's password (`PUT /users/:id` with the new password).
     *
     * The API sets the password directly and does not verify a current password,
     * so none is required. `customerId` is the `customer.id` from {@link login} /
     * {@link register}. Subject to server-side authorization.
     */
    async changePassword(customerId, newPassword) {
        return this.client.put(`/users/${customerId}`, { password: newPassword });
    }
}

/**
 * Orders resource for managing customer orders (requires an auth token for
 * customer-scoped reads).
 */
class OrdersResource {
    constructor(client) {
        this.client = client;
    }
    /**
     * Get customer's orders (requires authentication)
     */
    async list(params) {
        return this.client.get('/orders', params);
    }
    /**
     * Run a typed order query (range/contains/date filters; `kind` is translated
     * to API codes, `status` passes through as a string).
     *
     * @example await orders.query({ status: 'completed', total: { min: 100 }, page: 1 })
     */
    async query(params) {
        const processed = processQuery(params || {}, ORDER_FIELD_TYPES, { context: QUERY_CONTEXT.order });
        return this.client.get('/orders', processed);
    }
    /** Start a fluent order query. */
    createQueryBuilder(initialQuery) {
        return new OrderQueryBuilder(this, initialQuery);
    }
    /**
     * Get a specific order by ID (requires authentication)
     */
    async get(orderId) {
        return this.client.get(`/orders/${orderId}`, {});
    }
    /**
     * Create a new order
     */
    async create(orderData) {
        // Auto-generate reference_id if not provided
        const orderWithReference = {
            total: orderData.total || 0,
            ...orderData,
            reference_id: orderData.reference_id || `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };
        return this.client.post('/orders', orderWithReference);
    }
    /**
     * Get order by reference ID (searches by reference and returns single order like get response)
     */
    async getByReference(referenceId) {
        const response = await this.list({ reference_id: referenceId, page_size: 1 });
        if (response.state === 'ok' && response.result && response.result.entries.length > 0) {
            // Return the first order in the same format as get()
            return {
                state: response.state,
                result: response.result.entries[0]
            };
        }
        else {
            // Return not found response
            return {
                state: 'error',
                result: undefined
            };
        }
    }
    /**
     * Cancel an order by updating status to cancelled (requires authentication)
     */
    async cancel(orderId, reason) {
        return this.client.put(`/orders/${orderId}`, {
            status: 'cancelled',
            cancellation_reason: reason
        });
    }
    /**
     * Get recent orders (last 5 by default)
     */
    async getRecent(limit = 5) {
        return this.list({
            page_size: limit,
            sort: 'created_at',
            order: 'desc'
        });
    }
    /**
     * Get orders by status
     */
    async getByStatus(status, params) {
        return this.list({ ...params, status });
    }
}

/**
 * Cart resource for managing shopping cart with local storage and remote sync
 */
class CartResource {
    constructor(storage, eventEmitter, client) {
        this.storage = storage;
        this.eventEmitter = eventEmitter;
        this.client = client;
    }
    /** Wire the checkout resource so {@link checkout} can open a session. */
    setCheckout(checkout) {
        this.checkoutResource = checkout;
    }
    /**
     * Build the checkout-session input from the current cart line items.
     * Useful if you want to inspect/augment the payload before paying.
     *
     * `currency_code` defaults to the first item's product currency, falling back
     * to 'JMD' when absent. If the cart mixes currencies you MUST pass
     * `currency_code` explicitly — the subtotal is a plain numeric sum and is only
     * meaningful within a single currency.
     */
    buildCheckoutInput(options = {}) {
        var _a, _b;
        const cart = this.get();
        if (!options.currency_code) {
            const currencies = new Set(cart.items.map((i) => { var _a; return (_a = i.product.currency) === null || _a === void 0 ? void 0 : _a.code; }).filter(Boolean));
            if (currencies.size > 1) {
                throw new Error('Cart contains items in multiple currencies; pass currency_code explicitly to checkout().');
            }
        }
        const currency_code = options.currency_code || ((_b = (_a = cart.items[0]) === null || _a === void 0 ? void 0 : _a.product.currency) === null || _b === void 0 ? void 0 : _b.code) || 'JMD';
        return {
            kind: 'online',
            currency_code,
            total: cart.subtotal,
            title: options.title,
            reference_id: options.reference_id,
            customer: options.customer,
            data: options.data,
            products: cart.items.map((item) => ({ id: item.product.id, quantity: item.quantity })),
        };
    }
    /**
     * Start checkout for the current cart: builds the order payload from the line
     * items and opens a checkout session (returns the hosted-frame fields).
     * Emits `checkout:started`. Requires the SDK-wired checkout resource.
     */
    async checkout(options = {}) {
        if (!this.checkoutResource) {
            throw new Error('Checkout is not available on this cart. Use the cart from an InkressStorefrontSDK instance, or call setCheckout().');
        }
        const cart = this.get();
        if (cart.items.length === 0) {
            throw new Error('Cannot check out an empty cart.');
        }
        this.eventEmitter.emit('checkout:started', { cart });
        return this.checkoutResource.createSession(this.buildCheckoutInput(options));
    }
    /**
     * Get current cart
     */
    get() {
        const cart = this.storage.get();
        if (!cart) {
            return this.createEmptyCart();
        }
        return cart;
    }
    /**
     * Add product to cart
     */
    addItem(product, quantity = 1) {
        const cart = this.get();
        const existingItemIndex = cart.items.findIndex(item => item.product.id === product.id);
        if (existingItemIndex >= 0) {
            // Update existing item
            cart.items[existingItemIndex].quantity += quantity;
            cart.items[existingItemIndex].price = product.price; // Update price in case it changed
        }
        else {
            // Add new item
            const newItem = {
                id: this.generateItemId(),
                product,
                quantity,
                price: product.price,
            };
            cart.items.push(newItem);
        }
        const updatedCart = this.updateCartTotals(cart);
        this.storage.set(updatedCart);
        // Emit event
        this.eventEmitter.emit('cart:item:added', {
            item: cart.items[existingItemIndex >= 0 ? existingItemIndex : cart.items.length - 1],
            cart: updatedCart
        });
        return updatedCart;
    }
    /**
     * Remove product from cart by product ID
     */
    removeProduct(productId) {
        const cart = this.get();
        const itemToRemove = cart.items.find(item => item.product.id === productId);
        if (itemToRemove) {
            return this.removeItem(itemToRemove.id);
        }
        return cart;
    }
    /**
     * Update item quantity
     */
    updateItemQuantity(itemId, quantity) {
        if (quantity <= 0) {
            return this.removeItem(itemId);
        }
        const cart = this.get();
        const itemIndex = cart.items.findIndex(item => item.id === itemId);
        if (itemIndex >= 0) {
            cart.items[itemIndex].quantity = quantity;
            const updatedCart = this.updateCartTotals(cart);
            this.storage.set(updatedCart);
            // Emit event
            this.eventEmitter.emit('cart:item:updated', {
                item: cart.items[itemIndex],
                cart: updatedCart
            });
            return updatedCart;
        }
        return cart;
    }
    /**
     * Remove item from cart
     */
    removeItem(itemId) {
        const cart = this.get();
        const itemToRemove = cart.items.find(item => item.id === itemId);
        if (itemToRemove) {
            cart.items = cart.items.filter(item => item.id !== itemId);
            const updatedCart = this.updateCartTotals(cart);
            this.storage.set(updatedCart);
            // Emit event
            this.eventEmitter.emit('cart:item:removed', {
                itemId,
                cart: updatedCart
            });
            return updatedCart;
        }
        return cart;
    }
    /**
     * Clear all items from cart
     */
    clear() {
        const emptyCart = this.createEmptyCart();
        this.storage.set(emptyCart);
        // Emit event
        this.eventEmitter.emit('cart:cleared', {
            cart: emptyCart
        });
        return emptyCart;
    }
    /**
     * Get total number of items in cart
     */
    getItemCount() {
        const cart = this.get();
        return cart.items.reduce((total, item) => total + item.quantity, 0);
    }
    /**
     * Get unique item count (number of different products)
     */
    getUniqueItemCount() {
        const cart = this.get();
        return cart.items.length;
    }
    /**
     * Check if product is in cart
     */
    hasProduct(productId) {
        const cart = this.get();
        return cart.items.some(item => item.product.id === productId);
    }
    /**
     * Get specific item by product ID
     */
    getItem(productId) {
        const cart = this.get();
        return cart.items.find(item => item.product.id === productId);
    }
    /**
     * Check if cart is empty
     */
    isEmpty() {
        const cart = this.get();
        return cart.items.length === 0;
    }
    /**
     * Calculate cart subtotal
     */
    getSubtotal() {
        const cart = this.get();
        return cart.subtotal;
    }
    // Remote API methods for cart backup/sync
    /**
     * Sync local cart to remote server (requires authentication)
     */
    async syncToRemote() {
        const cart = this.get();
        // Convert local cart to remote format
        const cartData = {
            total: cart.subtotal,
            quantity: cart.total_items,
            items: cart.items.map(item => ({
                product_id: item.product.id,
                variant_id: item.product.id, // In Inkress the product is the buyable unit: variant_id == product id (no separate variant entity today).
                quantity: item.quantity,
                unit_price: item.price
            }))
        };
        // Create or update remote cart
        const remoteCart = await this.client.post('/carts', {
            session_id: this.generateSessionId(),
            data: cartData
        });
        return remoteCart;
    }
    /**
     * Load cart from remote server (requires authentication)
     */
    async loadFromRemote(cartId) {
        const remoteCart = await this.client.get(`/carts/${cartId}`, {});
        if (remoteCart.state === 'ok' && remoteCart.result) {
            // Convert remote cart to local format
            const localCart = {
                id: remoteCart.result.id,
                items: remoteCart.result.data.items.map((item) => ({
                    id: `item_${item.product_id}_${item.variant_id}`,
                    product: item.product, // TODO: Fetch product details if not included
                    quantity: item.quantity,
                    price: item.unit_price
                })),
                subtotal: remoteCart.result.data.total,
                total_items: remoteCart.result.data.quantity,
                created_at: remoteCart.result.created_at,
                updated_at: remoteCart.result.updated_at
            };
            // Save to local storage
            this.storage.set(localCart);
            return {
                state: 'ok',
                result: localCart
            };
        }
        return {
            state: 'error',
            result: undefined
        };
    }
    /**
     * List remote carts (requires authentication)
     */
    async listRemoteCarts(params) {
        return this.client.get('/carts', params);
    }
    /**
     * Update remote cart
     */
    async updateRemoteCart(cartId, input) {
        return this.client.put(`/carts/${cartId}`, input);
    }
    /**
     * Delete remote cart
     */
    async deleteRemoteCart(cartId) {
        return this.client.delete(`/carts/${cartId}`);
    }
    /**
     * Add item to remote cart by updating the cart data
     */
    async addItemToRemoteCart(cartId, productId, variantId, quantity, price) {
        // First get the current cart
        const currentCart = await this.client.get(`/carts/${cartId}`, {});
        if (currentCart.state === 'ok' && currentCart.result) {
            const cartData = currentCart.result.data;
            // Find existing item
            const existingItemIndex = cartData.items.findIndex((item) => item.product_id === productId && item.variant_id === variantId);
            if (existingItemIndex >= 0) {
                // Update existing item
                cartData.items[existingItemIndex].quantity += quantity;
                // Note: unit_price stays the same, total cart value is recalculated
            }
            else {
                // Add new item
                cartData.items.push({
                    product_id: productId,
                    variant_id: variantId,
                    quantity,
                    unit_price: price
                });
            }
            // Recalculate totals
            cartData.total = cartData.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
            cartData.quantity = cartData.items.reduce((sum, item) => sum + item.quantity, 0);
            // Update the cart
            return this.updateRemoteCart(cartId, {
                user_id: currentCart.result.user_id,
                session_id: currentCart.result.session_id,
                data: cartData
            });
        }
        return {
            state: 'error',
            result: undefined
        };
    }
    /**
     * Remove item from remote cart by updating the cart data
     */
    async removeItemFromRemoteCart(cartId, productId, variantId) {
        // First get the current cart
        const currentCart = await this.client.get(`/carts/${cartId}`, {});
        if (currentCart.state === 'ok' && currentCart.result) {
            const cartData = currentCart.result.data;
            // Remove the item
            cartData.items = cartData.items.filter((item) => !(item.product_id === productId && item.variant_id === variantId));
            // Recalculate totals
            cartData.total = cartData.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
            cartData.quantity = cartData.items.reduce((sum, item) => sum + item.quantity, 0);
            // Update the cart
            return this.updateRemoteCart(cartId, {
                user_id: currentCart.result.user_id,
                session_id: currentCart.result.session_id,
                data: cartData
            });
        }
        return {
            state: 'error',
            result: undefined
        };
    }
    /**
     * Update item quantity in remote cart
     */
    async updateItemQuantityInRemoteCart(cartId, productId, variantId, quantity) {
        if (quantity <= 0) {
            return this.removeItemFromRemoteCart(cartId, productId, variantId);
        }
        // First get the current cart
        const currentCart = await this.client.get(`/carts/${cartId}`, {});
        if (currentCart.state === 'ok' && currentCart.result) {
            const cartData = currentCart.result.data;
            // Find the item
            const itemIndex = cartData.items.findIndex((item) => item.product_id === productId && item.variant_id === variantId);
            if (itemIndex >= 0) {
                const item = cartData.items[itemIndex];
                // Update quantity (unit_price stays the same)
                item.quantity = quantity;
                // Recalculate totals
                cartData.total = cartData.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
                cartData.quantity = cartData.items.reduce((sum, item) => sum + item.quantity, 0);
                // Update the cart
                return this.updateRemoteCart(cartId, {
                    user_id: currentCart.result.user_id,
                    session_id: currentCart.result.session_id,
                    data: cartData
                });
            }
        }
        return {
            state: 'error',
            result: undefined
        };
    }
    /**
     * Create empty cart structure
     */
    createEmptyCart() {
        return {
            id: this.generateCartId(),
            items: [],
            subtotal: 0,
            total_items: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
    }
    /**
     * Update cart totals and metadata
     */
    updateCartTotals(cart) {
        cart.subtotal = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
        cart.total_items = cart.items.reduce((total, item) => total + item.quantity, 0);
        cart.updated_at = new Date().toISOString();
        return cart;
    }
    /**
     * Generate unique cart ID
     */
    generateCartId() {
        return `cart_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
    /**
     * Generate unique item ID
     */
    generateItemId() {
        return `item_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
    /**
     * Generate session ID for anonymous carts
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
}

/**
 * Wishlist resource for managing customer wishlist with remote and local storage
 */
class WishlistResource {
    constructor(storage, eventEmitter, generics, userId) {
        this.wishlistKind = 2; // Kind identifier for wishlist data
        this.storage = storage;
        this.eventEmitter = eventEmitter;
        this.generics = generics;
        this.userId = userId;
    }
    /**
     * Set (or clear, when called with no argument) the user ID used for remote
     * wishlist sync.
     */
    setUserId(userId) {
        this.userId = userId;
    }
    /**
     * Get current wishlist (tries remote first, falls back to local)
     */
    async get() {
        try {
            // Try to get from remote storage first
            const remoteWishlist = await this.getRemoteWishlist();
            if (remoteWishlist) {
                // Update local storage with remote data
                this.storage.set(remoteWishlist);
                return remoteWishlist;
            }
        }
        catch (error) {
            console.warn('Failed to fetch remote wishlist, using local storage:', error);
        }
        // Fall back to local storage
        const localWishlist = this.storage.get();
        if (!localWishlist) {
            return this.createEmptyWishlist();
        }
        return localWishlist;
    }
    /**
     * Get wishlist synchronously from local storage only
     */
    getLocal() {
        const wishlist = this.storage.get();
        if (!wishlist) {
            return this.createEmptyWishlist();
        }
        return wishlist;
    }
    /**
     * Add product to wishlist
     */
    async addItem(product) {
        const wishlist = await this.get();
        // Check if product is already in wishlist
        if (await this.hasProduct(product.id)) {
            return wishlist; // Already exists, no change
        }
        const newItem = {
            id: this.generateItemId(),
            product,
            added_at: new Date().toISOString(),
        };
        wishlist.items.push(newItem);
        const updatedWishlist = this.updateWishlistMeta(wishlist);
        // Save to both local and remote storage
        this.storage.set(updatedWishlist);
        await this.saveToRemote(updatedWishlist);
        this.eventEmitter.emit('wishlist:item:added', {
            item: newItem,
            wishlist: updatedWishlist
        });
        return updatedWishlist;
    }
    /**
     * Remove item from wishlist
     */
    async removeItem(itemId) {
        const wishlist = await this.get();
        wishlist.items = wishlist.items.filter(item => item.id !== itemId);
        const updatedWishlist = this.updateWishlistMeta(wishlist);
        // Save to both local and remote storage
        this.storage.set(updatedWishlist);
        await this.saveToRemote(updatedWishlist);
        this.eventEmitter.emit('wishlist:item:removed', {
            itemId,
            wishlist: updatedWishlist
        });
        return updatedWishlist;
    }
    /**
     * Remove product from wishlist (by product ID)
     */
    async removeProduct(productId) {
        const wishlist = await this.get();
        const itemToRemove = wishlist.items.find(item => item.product.id === productId);
        if (itemToRemove) {
            return this.removeItem(itemToRemove.id);
        }
        return wishlist;
    }
    /**
     * Toggle product in wishlist (add if not present, remove if present)
     */
    async toggleProduct(product) {
        if (await this.hasProduct(product.id)) {
            return {
                wishlist: await this.removeProduct(product.id),
                added: false
            };
        }
        else {
            return {
                wishlist: await this.addItem(product),
                added: true
            };
        }
    }
    /**
     * Clear entire wishlist
     */
    async clear() {
        const emptyWishlist = this.createEmptyWishlist();
        // Save to both local and remote storage
        this.storage.set(emptyWishlist);
        await this.saveToRemote(emptyWishlist);
        this.eventEmitter.emit('wishlist:cleared', { wishlist: emptyWishlist });
        return emptyWishlist;
    }
    /**
     * Check if product is in wishlist
     */
    async hasProduct(productId) {
        const wishlist = await this.get();
        return wishlist.items.some(item => item.product.id === productId);
    }
    /**
     * Get specific item by product ID
     */
    async getItem(productId) {
        const wishlist = await this.get();
        return wishlist.items.find(item => item.product.id === productId);
    }
    /**
     * Check if wishlist is empty
     */
    async isEmpty() {
        const wishlist = await this.get();
        return wishlist.items.length === 0;
    }
    /**
     * Get wishlist item count
     */
    async getItemCount() {
        const wishlist = await this.get();
        return wishlist.items.length;
    }
    /**
     * Get all products in wishlist
     */
    async getProducts() {
        const wishlist = await this.get();
        return wishlist.items.map(item => item.product);
    }
    /**
     * Sort wishlist items
     */
    async sort(compareFn) {
        const wishlist = await this.get();
        if (compareFn) {
            wishlist.items.sort(compareFn);
        }
        else {
            // Default sort by added_at (newest first)
            wishlist.items.sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime());
        }
        const updatedWishlist = this.updateWishlistMeta(wishlist);
        // Save to both local and remote storage
        this.storage.set(updatedWishlist);
        await this.saveToRemote(updatedWishlist);
        return updatedWishlist;
    }
    /**
     * Sort by product name
     */
    async sortByName(ascending = true) {
        return this.sort((a, b) => {
            const comparison = a.product.title.localeCompare(b.product.title);
            return ascending ? comparison : -comparison;
        });
    }
    /**
     * Sort by product price
     */
    async sortByPrice(ascending = true) {
        return this.sort((a, b) => {
            const comparison = a.product.price - b.product.price;
            return ascending ? comparison : -comparison;
        });
    }
    /**
     * Sort by date added
     */
    async sortByDateAdded(ascending = false) {
        return this.sort((a, b) => {
            const comparison = new Date(a.added_at).getTime() - new Date(b.added_at).getTime();
            return ascending ? comparison : -comparison;
        });
    }
    /**
     * Sync wishlist from remote storage
     */
    async syncFromRemote() {
        try {
            const remoteWishlist = await this.getRemoteWishlist();
            if (remoteWishlist) {
                this.storage.set(remoteWishlist);
                return remoteWishlist;
            }
        }
        catch (error) {
            console.warn('Failed to sync from remote:', error);
        }
        return this.getLocal();
    }
    /**
     * Force sync local wishlist to remote storage
     */
    async syncToRemote() {
        const localWishlist = this.getLocal();
        await this.saveToRemote(localWishlist);
    }
    // Synchronous methods for backward compatibility (local storage only)
    /**
     * Check if product is in wishlist (local storage only)
     */
    hasProductLocal(productId) {
        const wishlist = this.getLocal();
        return wishlist.items.some(item => item.product.id === productId);
    }
    /**
     * Get specific item by product ID (local storage only)
     */
    getItemLocal(productId) {
        const wishlist = this.getLocal();
        return wishlist.items.find(item => item.product.id === productId);
    }
    /**
     * Check if wishlist is empty (local storage only)
     */
    isEmptyLocal() {
        const wishlist = this.getLocal();
        return wishlist.items.length === 0;
    }
    /**
     * Get wishlist item count (local storage only)
     */
    getItemCountLocal() {
        const wishlist = this.getLocal();
        return wishlist.items.length;
    }
    /**
     * Get all products in wishlist (local storage only)
     */
    getProductsLocal() {
        const wishlist = this.getLocal();
        return wishlist.items.map(item => item.product);
    }
    /**
     * Get remote wishlist from the `/generics` key-value store.
     */
    async getRemoteWishlist() {
        if (!this.userId) {
            return null;
        }
        try {
            const response = await this.generics.getByKey(`wishlist_${this.userId}`);
            if (response.state === 'ok' && response.result) {
                return response.result.data;
            }
        }
        catch (error) {
            console.warn('Failed to fetch remote wishlist:', error);
        }
        return null;
    }
    /**
     * Save wishlist to the `/generics` key-value store (upsert by key).
     */
    async saveToRemote(wishlist) {
        if (!this.userId) {
            return;
        }
        try {
            await this.generics.createOrUpdate(`wishlist_${this.userId}`, this.wishlistKind, wishlist);
        }
        catch (error) {
            console.warn('Failed to save wishlist to remote:', error);
        }
    }
    /**
     * Create empty wishlist
     */
    createEmptyWishlist() {
        return {
            items: [],
            total_items: 0,
            updated_at: new Date().toISOString(),
        };
    }
    /**
     * Update wishlist metadata
     */
    updateWishlistMeta(wishlist) {
        wishlist.total_items = wishlist.items.length;
        wishlist.updated_at = new Date().toISOString();
        return wishlist;
    }
    /**
     * Generate unique item ID
     */
    generateItemId() {
        return `wishlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Low-level escape hatch for calling API endpoints the SDK does not wrap.
 *
 * Exposed as `sdk.generic`. This is a raw HTTP passthrough — YOU supply the
 * path and payload, and are responsible for the endpoint existing. For the
 * typed `/generics` key-value store (list/get/create/update/getByKey/…), use
 * `sdk.generics` ({@link GenericsResource}) instead.
 *
 * @example
 * // Call an endpoint the SDK doesn't have a dedicated resource for:
 * await sdk.generic.post('/some/custom/endpoint', { ... });
 */
class GenericResource {
    constructor(client) {
        this.client = client;
    }
    /**
     * Make a GET request to any endpoint
     */
    async get(path, params) {
        return this.client.get(path, params);
    }
    /**
     * Make a POST request to any endpoint
     */
    async post(path, data) {
        return this.client.post(path, data);
    }
    /**
     * Make a PUT request to any endpoint
     */
    async put(path, data) {
        return this.client.put(path, data);
    }
    /**
     * Make a DELETE request to any endpoint
     */
    async delete(path) {
        return this.client.delete(path);
    }
}

/**
 * Generics resource for managing key-value store entries on the server
 *
 * The generics API provides a flexible key-value store where you can:
 * - Store arbitrary JSON data with a unique key
 * - Categorize entries using the 'kind' field
 * - Query and filter entries by key or kind
 *
 * This is useful for storing configuration, settings, metadata, or any
 * structured data that doesn't fit into other specific resources.
 */
class GenericsResource {
    constructor(client) {
        this.client = client;
    }
    /**
     * List generics with optional filtering and pagination
     *
     * @param params - Query parameters for filtering and pagination
     * @returns Promise resolving to paginated list of generics
     */
    async list(params) {
        return this.client.get('/generics', params);
    }
    /**
     * Get a specific generic by ID
     *
     * @param id - The generic ID
     * @returns Promise resolving to the generic entry
     */
    async get(id) {
        return this.client.get(`/generics/${id}`, {});
    }
    /**
     * Create a new generic entry
     *
     * @param input - The generic data to create
     * @returns Promise resolving to the created generic
     */
    async create(input) {
        return this.client.post('/generics', input);
    }
    /**
     * Update an existing generic entry
     *
     * @param id - The generic ID to update
     * @param input - The updated generic data
     * @returns Promise resolving to the updated generic
     */
    async update(id, input) {
        return this.client.put(`/generics/${id}`, input);
    }
    /**
     * Delete a generic entry
     *
     * @param id - The generic ID to delete
     * @returns Promise resolving to void on successful deletion
     */
    async delete(id) {
        return this.client.delete(`/generics/${id}`);
    }
    // Convenience methods for common use cases
    /**
     * Get a generic by its key (searches through all generics)
     * Note: This may not be efficient for large datasets. Consider using list() with key filter instead.
     *
     * @param key - The key to search for
     * @returns Promise resolving to the first generic with matching key, or undefined if not found
     */
    async getByKey(key) {
        const response = await this.list({ key, page_size: 1 });
        if (response.state === 'ok' && response.result && response.result.entries.length > 0) {
            return {
                state: 'ok',
                result: response.result.entries[0]
            };
        }
        return {
            state: 'ok',
            result: undefined
        };
    }
    /**
     * Get all generics of a specific kind
     *
     * @param kind - The kind to filter by
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of generics of the specified kind
     */
    async getByKind(kind, params) {
        return this.list({ ...params, kind });
    }
    /**
     * Create or update a generic by key
     * If a generic with the given key exists, it will be updated; otherwise, a new one will be created.
     *
     * @param key - The key to create or update
     * @param kind - The kind category
     * @param data - The data to store
     * @returns Promise resolving to the created or updated generic
     */
    async createOrUpdate(key, kind, data) {
        // First try to find existing generic by key
        const existing = await this.getByKey(key);
        if (existing.state === 'ok' && existing.result) {
            // Update existing
            return this.update(existing.result.id, { key, kind, data });
        }
        else {
            // Create new
            return this.create({ key, kind, data });
        }
    }
    /**
     * Delete a generic by its key
     *
     * @param key - The key of the generic to delete
     * @returns Promise resolving to true if deleted, false if not found
     */
    async deleteByKey(key) {
        const existing = await this.getByKey(key);
        if (existing.state === 'ok' && existing.result) {
            const deleteResponse = await this.delete(existing.result.id);
            return {
                state: deleteResponse.state,
                result: deleteResponse.state === 'ok'
            };
        }
        return {
            state: 'ok',
            result: false
        };
    }
}

/**
 * Reviews resource for managing product reviews and ratings
 *
 * Reviews allow customers to rate and comment on products they've purchased.
 * This resource provides functionality for submitting, retrieving, and managing
 * product reviews with support for filtering, moderation, and statistics.
 */
class ReviewsResource {
    constructor(client) {
        this.client = client;
    }
    /**
     * List reviews with optional filtering and pagination
     *
     * @param params - Query parameters for filtering and pagination
     * @returns Promise resolving to paginated list of reviews
     */
    async list(params) {
        return this.client.get('/reviews', params);
    }
    /**
     * Run a typed review query (rating range/date filters + pagination).
     *
     * @example await reviews.query({ parent_id: 123, rating: { min: 4 }, page: 1 })
     */
    async query(params) {
        const processed = processQuery(params || {}, REVIEW_FIELD_TYPES, { context: QUERY_CONTEXT.review });
        return this.client.get('/reviews', processed);
    }
    /** Start a fluent review query, e.g. `reviews.createQueryBuilder().whereProduct(123).whereMinRating(4)`. */
    createQueryBuilder(initialQuery) {
        return new ReviewQueryBuilder(this, initialQuery);
    }
    /**
     * Get a specific review by ID
     *
     * @param id - The review ID
     * @returns Promise resolving to the review
     */
    async get(id) {
        return this.client.get(`/reviews/${id}`);
    }
    /**
     * Submit a new product review (requires authentication)
     *
     * @param input - The review data to create
     * @returns Promise resolving to the created review
     */
    async create(input) {
        return this.client.post('/reviews', input);
    }
    /**
     * Update an existing review (requires authentication)
     * Only the review author can update their own review
     *
     * @param id - The review ID to update
     * @param input - The updated review data
     * @returns Promise resolving to the updated review
     */
    async update(id, input) {
        return this.client.put(`/reviews/${id}`, input);
    }
    /**
     * Delete a review (requires authentication)
     * Only the review author can delete their own review
     *
     * @param id - The review ID to delete
     * @returns Promise resolving to void on successful deletion
     */
    async delete(id) {
        return this.client.delete(`/reviews/${id}`);
    }
    // Product-specific review methods
    /**
     * Get reviews for a specific product
     *
     * @param productId - The product ID
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of product reviews
     */
    async getByProduct(productId, params) {
        return this.list({ ...params, parent_id: productId });
    }
    /**
     * Get review statistics for a product
     *
     * @param productId - The product ID
     * @returns Promise resolving to review statistics
     */
    async getProductStats(productId) {
        return this.client.get(`/products/${productId}/reviews/stats`);
    }
    /**
     * Get reviews by a specific customer (requires authentication)
     *
     * @param customerId - The customer ID (optional, defaults to current authenticated customer)
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of customer reviews
     */
    async getByCustomer(customerId, params) {
        return this.list({ ...params, customer_id: customerId });
    }
    /**
     * Get reviews for a product filtered by rating
     *
     * @param productId - The product ID
     * @param rating - The rating to filter by (1-5)
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of reviews with specific rating
     */
    async getByProductAndRating(productId, rating, params) {
        return this.list({ ...params, parent_id: productId, rating });
    }
    /**
     * Get verified purchase reviews for a product
     *
     * @param productId - The product ID
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of verified purchase reviews
     */
    async getVerifiedReviews(productId, params) {
        // Note: The 'verified_purchase' field would need to be added to ReviewListParams if this functionality exists
        return this.list({ ...params, parent_id: productId });
    }
    /**
     * Search reviews by content
     *
     * @param query - Search term to match against review title and comment
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of matching reviews
     */
    async search(query, params) {
        return this.list({ ...params, q: query });
    }
    // Review moderation and management methods
    /**
     * Get most helpful reviews for a product
     *
     * @param productId - The product ID
     * @param params - Additional query parameters
     * @returns Promise resolving to list of most helpful reviews
     */
    async getTopRated(productId, params) {
        const response = await this.list({
            ...params,
            parent_id: productId,
            sort: 'helpful_count',
            order: 'desc',
            page_size: 10
        });
        return {
            ...response,
            result: response.result ? response.result.entries : []
        };
    }
    /**
     * Get bulk review statistics for multiple products
     *
     * @param productIds - Array of product IDs
     * @returns Promise resolving to record of product ID to review stats
     */
    async getBulkStats(productIds) {
        return this.client.post('/reviews/bulk-stats', { product_ids: productIds });
    }
}

/**
 * Shipping resource for managing delivery methods and shipping areas
 *
 * This resource provides functionality for managing shipping methods and
 * shipping areas based on the actual available API endpoints.
 * Only includes methods that correspond to real API routes.
 */
class ShippingResource {
    constructor(client) {
        this.client = client;
    }
    // Shipping Methods (based on /api/v1/shipping_methods)
    /**
     * List shipping methods with optional filtering and pagination
     *
     * @param params - Query parameters for filtering and pagination
     * @returns Promise resolving to paginated list of shipping methods
     */
    async listMethods(params) {
        return this.client.get('/shipping_methods', params);
    }
    /**
     * Get a specific shipping method by ID
     *
     * @param id - The shipping method ID
     * @returns Promise resolving to the shipping method
     */
    async getMethod(id) {
        return this.client.get(`/shipping_methods/${id}`);
    }
    /**
     * Create a new shipping method (requires authentication)
     *
     * @param input - The shipping method data to create
     * @returns Promise resolving to the created shipping method
     */
    async createMethod(input) {
        return this.client.post('/shipping_methods', input);
    }
    /**
     * Update an existing shipping method (requires authentication)
     *
     * @param id - The shipping method ID to update
     * @param input - The updated shipping method data
     * @returns Promise resolving to the updated shipping method
     */
    async updateMethod(id, input) {
        return this.client.put(`/shipping_methods/${id}`, input);
    }
    /**
     * Delete a shipping method (requires authentication)
     *
     * @param id - The shipping method ID to delete
     * @returns Promise resolving to void on successful deletion
     */
    async deleteMethod(id) {
        return this.client.delete(`/shipping_methods/${id}`);
    }
    // Shipping Areas (based on /api/v1/shipping_areas)
    /**
     * List shipping areas
     *
     * @param params - Query parameters for pagination
     * @returns Promise resolving to array of shipping areas
     */
    async listAreas(params) {
        return this.client.get('/shipping_areas', params);
    }
    /**
     * Get a specific shipping area by ID
     *
     * @param id - The shipping area ID
     * @returns Promise resolving to the shipping area
     */
    async getArea(id) {
        return this.client.get(`/shipping_areas/${id}`);
    }
    /**
     * Create a new shipping area (requires authentication)
     *
     * @param input - The shipping area data to create
     * @returns Promise resolving to the created shipping area
     */
    async createArea(input) {
        return this.client.post('/shipping_areas', input);
    }
    /**
     * Update an existing shipping area (requires authentication)
     *
     * @param id - The shipping area ID to update
     * @param input - The updated shipping area data
     * @returns Promise resolving to the updated shipping area
     */
    async updateArea(id, input) {
        return this.client.put(`/shipping_areas/${id}`, input);
    }
    /**
     * Delete a shipping area (requires authentication)
     *
     * @param id - The shipping area ID to delete
     * @returns Promise resolving to void on successful deletion
     */
    async deleteArea(id) {
        return this.client.delete(`/shipping_areas/${id}`);
    }
    // Convenience methods built on top of actual API endpoints
    /**
     * Get active shipping methods only
     *
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of active shipping methods
     */
    async getActiveMethods(params) {
        return this.listMethods({ ...params, status: 1 });
    }
    /**
     * Search shipping methods by name
     *
     * @param name - Name to search for
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of matching shipping methods
     */
    async searchMethodsByName(name, params) {
        return this.listMethods({ ...params, name });
    }
    /**
     * Get shipping methods within a price range
     * Note: Price filtering may need to be implemented on the API side
     *
     * @param maxPrice - Maximum price filter
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of shipping methods within price range
     */
    async getMethodsByMaxPrice(maxPrice, params) {
        // Note: Price filtering would need API support
        return this.listMethods({ ...params });
    }
    /**
     * Get shipping methods by estimated delivery days
     * Note: Estimated days filtering may need to be implemented on the API side
     *
     * @param estimatedDays - Estimated delivery days
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of shipping methods with specific delivery time
     */
    async getMethodsByDeliveryDays(estimatedDays, params) {
        // Note: Estimated days filtering would need API support
        return this.listMethods({ ...params });
    }
    /**
     * Get the cheapest shipping method
     *
     * @param params - Query parameters for filtering
     * @returns Promise resolving to the cheapest shipping method
     */
    async getCheapestMethod(params) {
        const methodsResponse = await this.listMethods(params);
        if (methodsResponse.state !== 'ok' || !methodsResponse.result || methodsResponse.result.entries.length === 0) {
            return {
                state: methodsResponse.state,
                result: null,
            };
        }
        const cheapestMethod = methodsResponse.result.entries.reduce((cheapest, current) => {
            // Note: Price comparison would need the price field to be available in ShippingMethod type
            // For now, return the first method as a fallback
            return cheapest;
        });
        return {
            state: 'ok',
            result: cheapestMethod,
        };
    }
    /**
     * Get the fastest shipping method (shortest estimated days)
     *
     * @param params - Query parameters for filtering
     * @returns Promise resolving to the fastest shipping method
     */
    async getFastestMethod(params) {
        const methodsResponse = await this.listMethods(params);
        if (methodsResponse.state !== 'ok' || !methodsResponse.result || methodsResponse.result.entries.length === 0) {
            return {
                state: methodsResponse.state,
                result: null,
            };
        }
        const fastestMethod = methodsResponse.result.entries.reduce((fastest, current) => {
            // Note: estimated_days comparison would need the field to be available in ShippingMethod type
            // For now, return the first method as a fallback
            return fastest;
        });
        return {
            state: 'ok',
            result: fastestMethod,
        };
    }
    /**
     * Find shipping areas that include a specific country
     *
     * @param countryCode - Country code to search for
     * @returns Promise resolving to shipping areas covering the country
     */
    async getAreasByCountry(countryCode) {
        const areasResponse = await this.listAreas();
        if (areasResponse.state !== 'ok' || !areasResponse.result) {
            return {
                state: areasResponse.state,
                result: [],
            };
        }
        const matchingAreas = areasResponse.result.entries.filter((area) => {
            // Note: countries field would need to be available in ShippingArea type for country filtering
            // For now, return all areas as a fallback
            return true;
        });
        return {
            state: 'ok',
            result: matchingAreas,
        };
    }
    /**
     * Get active shipping areas only
     *
     * @returns Promise resolving to active shipping areas
     */
    async getActiveAreas() {
        const areasResponse = await this.listAreas();
        if (areasResponse.state !== 'ok' || !areasResponse.result) {
            return {
                state: areasResponse.state,
                result: [],
            };
        }
        const activeAreas = areasResponse.result.entries.filter((area) => {
            // Note: status field would need to be available in ShippingArea type for status filtering
            // For now, return all areas as a fallback
            return true;
        });
        return {
            state: 'ok',
            result: activeAreas,
        };
    }
    /**
     * Check if shipping is available to a country
     *
     * @param countryCode - Country code to check
     * @returns Promise resolving to availability status
     */
    async isShippingAvailableToCountry(countryCode) {
        var _a;
        const areasResponse = await this.getAreasByCountry(countryCode);
        if (areasResponse.state !== 'ok') {
            return {
                state: 'error',
                result: {
                    available: false,
                    areas: [],
                },
            };
        }
        const activeAreas = ((_a = areasResponse.result) === null || _a === void 0 ? void 0 : _a.filter((area) => {
            // Note: status field would need to be available in ShippingArea type for status filtering
            // For now, return all areas as a fallback
            return true;
        })) || [];
        return {
            state: 'ok',
            result: {
                available: activeAreas.length > 0,
                areas: activeAreas,
            },
        };
    }
}

/**
 * Files resource for managing file uploads and media assets
 *
 * This resource provides functionality for:
 * - Uploading files (images, documents, etc.)
 * - Listing and searching uploaded files
 * - Getting file details and URLs
 * - Transforming images (resize, crop, format conversion)
 * - Managing file metadata and tags
 * - Deleting files
 */
class FilesResource {
    constructor(client) {
        this.client = client;
    }
    /**
     * List files with optional filtering and pagination
     *
     * @param params - Query parameters for filtering and pagination
     * @returns Promise resolving to paginated list of files
     */
    async list(params) {
        return this.client.get('/files', params);
    }
    /**
     * Get a specific file by ID
     *
     * @param id - The file ID
     * @returns Promise resolving to the file details
     */
    async get(id) {
        return this.client.get(`/files/${id}`);
    }
    /**
     * Upload a file
     *
     * @param file - The file to upload (File or Blob)
     * @param options - Upload options
     * @returns Promise resolving to the uploaded file details
     */
    async upload(file, options) {
        const formData = new FormData();
        // Add the file
        if (file instanceof File) {
            formData.append('file', file, (options === null || options === void 0 ? void 0 : options.filename) || file.name);
        }
        else {
            formData.append('file', file, (options === null || options === void 0 ? void 0 : options.filename) || 'upload');
        }
        // Add options as form fields
        if (options) {
            if (options.tags)
                formData.append('tags', options.tags.join(','));
            if (options.context)
                formData.append('context', JSON.stringify(options.context));
            if (options.metadata)
                formData.append('metadata', JSON.stringify(options.metadata));
            if (options.folder)
                formData.append('folder', options.folder);
            if (options.public_id)
                formData.append('public_id', options.public_id);
            if (options.overwrite !== undefined)
                formData.append('overwrite', String(options.overwrite));
            if (options.unique_filename !== undefined)
                formData.append('unique_filename', String(options.unique_filename));
            if (options.use_filename !== undefined)
                formData.append('use_filename', String(options.use_filename));
        }
        // The client strips Content-Type for FormData bodies so fetch can set the
        // multipart boundary itself — do not set it here.
        return this.client.post('/files/pubload', formData);
    }
    /**
     * Upload a file from a URL.
     *
     * There is no server-side "upload by URL" endpoint, so this fetches the
     * resource client-side and uploads the bytes through the same `/files/pubload`
     * path as {@link upload}.
     *
     * @param url - The URL of the file to fetch and upload
     * @param options - Upload options
     * @returns Promise resolving to the uploaded file details
     */
    async uploadFromUrl(url, options) {
        var _a;
        const response = await fetch(url);
        if (!response.ok) {
            throw new InkressApiError(`Failed to fetch file from URL (HTTP ${response.status})`, response.status);
        }
        const blob = await response.blob();
        const filename = (options === null || options === void 0 ? void 0 : options.filename) || ((_a = url.split('/').pop()) === null || _a === void 0 ? void 0 : _a.split('?')[0]) || 'upload';
        return this.upload(blob, { ...options, filename });
    }
    /**
     * Update file metadata
     *
     * @param id - The file ID
     * @param updates - The metadata updates
     * @returns Promise resolving to the updated file details
     */
    async update(id, updates) {
        return this.client.put(`/files/${id}`, updates);
    }
    /**
     * Delete a file
     *
     * @param id - The file ID
     * @returns Promise resolving to void on successful deletion
     */
    async delete(id) {
        return this.client.delete(`/files/${id}`);
    }
    /**
     * Get files by mime type
     *
     * @param mimeType - The mime type to filter by (e.g., 'image/jpeg', 'image/*', 'application/pdf')
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of files
     */
    async getByMimeType(mimeType, params) {
        return this.list({ ...params, mime_type: mimeType });
    }
    /**
     * Get image files only
     *
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of image files
     */
    async getImages(params) {
        return this.getByMimeType('image/*', params);
    }
    /**
     * Get document files only
     *
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of document files
     */
    async getDocuments(params) {
        return this.list({
            ...params,
            mime_type: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*'
        });
    }
    /**
     * Search files by filename or content
     *
     * @param query - Search term
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of matching files
     */
    async search(query, params) {
        return this.list({ ...params, search: query });
    }
    /**
     * Get files by tags
     *
     * @param tags - Tags to filter by (comma-separated string or array)
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of files with specified tags
     */
    async getByTags(tags, params) {
        const tagsString = Array.isArray(tags) ? tags.join(',') : tags;
        return this.list({ ...params, tags: tagsString });
    }
    /**
     * Get files within a size range
     *
     * @param minSize - Minimum file size in bytes
     * @param maxSize - Maximum file size in bytes
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of files within size range
     */
    async getBySizeRange(minSize, maxSize, params) {
        return this.list({ ...params, min_size: minSize, max_size: maxSize });
    }
    // Image transformation utilities
    /**
     * Generate a transformed image URL
     *
     * @param file - The file object or file URL
     * @param transforms - Transformation options
     * @returns The transformed image URL
     */
    getTransformedUrl(file, transforms) {
        const baseUrl = typeof file === 'string' ? file : file.url;
        if (!transforms || Object.keys(transforms).length === 0) {
            return baseUrl;
        }
        // Build transformation parameters
        const params = new URLSearchParams();
        if (transforms.width)
            params.append('w', transforms.width.toString());
        if (transforms.height)
            params.append('h', transforms.height.toString());
        if (transforms.crop)
            params.append('c', transforms.crop);
        if (transforms.gravity)
            params.append('g', transforms.gravity);
        if (transforms.quality)
            params.append('q', transforms.quality.toString());
        if (transforms.format)
            params.append('f', transforms.format);
        if (transforms.fetch_format)
            params.append('f_auto', transforms.fetch_format);
        if (transforms.opacity)
            params.append('o', transforms.opacity.toString());
        if (transforms.radius)
            params.append('r', transforms.radius.toString());
        if (transforms.background)
            params.append('b', transforms.background);
        if (transforms.effect)
            params.append('e', transforms.effect);
        if (transforms.dpr)
            params.append('dpr', transforms.dpr.toString());
        if (transforms.flags && transforms.flags.length > 0) {
            params.append('fl', transforms.flags.join('.'));
        }
        // Add transformation parameters to URL
        const separator = baseUrl.includes('?') ? '&' : '?';
        return `${baseUrl}${separator}${params.toString()}`;
    }
    /**
     * Generate a resized image URL
     *
     * @param file - The file object or file URL
     * @param width - Desired width
     * @param height - Desired height (optional)
     * @param crop - Crop mode (default: 'scale')
     * @returns The resized image URL
     */
    getResizedUrl(file, width, height, crop = 'scale') {
        return this.getTransformedUrl(file, { width, height, crop });
    }
    /**
     * Generate a thumbnail URL
     *
     * @param file - The file object or file URL
     * @param size - Thumbnail size (will be used for both width and height)
     * @returns The thumbnail URL
     */
    getThumbnailUrl(file, size = 150) {
        return this.getTransformedUrl(file, {
            width: size,
            height: size,
            crop: 'thumb',
            gravity: 'auto'
        });
    }
    /**
     * Generate an optimized image URL (auto format and quality)
     *
     * @param file - The file object or file URL
     * @param width - Desired width (optional)
     * @param height - Desired height (optional)
     * @returns The optimized image URL
     */
    getOptimizedUrl(file, width, height) {
        return this.getTransformedUrl(file, {
            width,
            height,
            format: 'auto',
            fetch_format: 'auto',
            quality: 'auto',
            flags: ['progressive']
        });
    }
}

/**
 * Isomorphic payment helpers shared by the checkout resource and the legacy
 * `Inkress` shim. No DOM or Node-only globals are referenced directly so the
 * same code runs in the browser and on the server (Remix/RR7 loaders).
 */
/**
 * Encode an arbitrary JSON-serialisable value to a base64 string. Works in the
 * browser (btoa) and on the server (Buffer) without statically referencing
 * Node globals (so bundlers targeting the browser don't choke).
 */
function getBuffer() {
    // Referenced directly (no eval / new Function) so it is CSP-safe in the
    // browser; bundlers targeting the browser see `typeof Buffer === 'undefined'`
    // at runtime and the btoa/atob path is taken instead.
    return typeof Buffer !== 'undefined' ? Buffer : null;
}
function encodeJSONToB64(data) {
    const jsonStr = JSON.stringify(data);
    const buf = getBuffer();
    if (buf) {
        return buf.from(jsonStr, 'utf-8').toString('base64');
    }
    // Browser. unescape(encodeURIComponent(...)) makes btoa UTF-8 safe.
    return btoa(unescape(encodeURIComponent(jsonStr)));
}
/**
 * Decode a base64 order token back into its JSON value. Mainly used by tests
 * and consumers that want to inspect a token they generated.
 */
function decodeB64ToJSON(token) {
    const buf = getBuffer();
    if (buf) {
        return JSON.parse(buf.from(token, 'base64').toString('utf-8'));
    }
    return JSON.parse(decodeURIComponent(escape(atob(token))));
}
/** Generate a random alphanumeric reference id. */
function generateRandomId() {
    return (Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15));
}
/** Throw if the minimum fields required to build a payment URL are missing. */
function validatePaymentOptions(options) {
    if (!options || !options.username) {
        throw new Error('Merchant username is required');
    }
    const { total } = options;
    if (total === undefined || total === null || isNaN(Number(total)) || Number(total) <= 0) {
        throw new Error('A valid positive total amount is required');
    }
}
/**
 * Build a hosted-order payment URL for a merchant storefront.
 *
 * @param options  payment details (username + total required)
 * @param siteBaseUrl  the public site origin, e.g. `https://inkress.com`
 *                     (NOT the API endpoint). The order page lives at
 *                     `/merchants/:username/order`.
 */
function buildPaymentUrl(options, siteBaseUrl) {
    validatePaymentOptions(options);
    const { username, total, currency_code = 'JMD', title = `Payment to ${username}`, reference_id = generateRandomId(), customer = {}, payment_link_id, } = options;
    const orderData = {
        total: Number(total),
        currency_code,
        title,
        reference_id,
        customer: {
            first_name: '',
            last_name: '',
            email: '',
            phone: '',
            ...customer,
        },
    };
    const base = siteBaseUrl.replace(/\/+$/, '');
    // URLSearchParams percent-encodes the base64 token (which contains +, /, =)
    // and omits link_token entirely when no payment link is supplied.
    const params = new URLSearchParams({ order_token: encodeJSONToB64(orderData) });
    if (payment_link_id) {
        params.set('link_token', payment_link_id);
    }
    return `${base}/merchants/${encodeURIComponent(username)}/order?${params.toString()}`;
}

/**
 * Checkout resource — the storefront money path.
 *
 * Two ways to take payment:
 *  - `createPaymentUrl()` — a hosted-order URL the customer opens (no card data
 *    ever touches the SDK).
 *  - `createSession()` / `getSession()` — a checkout session that returns a
 *    hosted-payment `frame_url` (PowerTranz SPI). Settlement and the strict 3DS
 *    gate live server-side; the SDK only *initiates*.
 */
class CheckoutResource {
    constructor(client) {
        this.client = client;
    }
    /**
     * Build a hosted-order payment URL. `username` defaults to the SDK's
     * configured merchant; the site origin is derived from `mode`.
     *
     * @example
     * const url = sdk.checkout.createPaymentUrl({ total: 49.99, title: 'Order #1' });
     * sdk.checkout.redirectToCheckout(url);
     */
    createPaymentUrl(options) {
        const username = options.username || this.client.getMerchantUsername();
        if (!username) {
            throw new Error('A merchant username is required (set merchantUsername on the SDK or pass options.username)');
        }
        return buildPaymentUrl({ ...options, username }, this.client.getSiteUrl());
    }
    /**
     * Open a checkout session. Returns the hosted-frame fields (`frame_url`,
     * `redirect_data`) used to complete payment.
     */
    async createSession(input) {
        const body = { kind: 'online', ...input };
        return this.client.post('/checkout/sessions', body);
    }
    /** Fetch a checkout session's current state. */
    async getSession(sessionId) {
        return this.client.get(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
    }
    /** Cancel a checkout session. */
    async cancelSession(sessionId) {
        return this.client.delete(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
    }
    // ──────────────────────────────────────────────────────────────────────────
    // Order-first money path
    //
    // The discount-preserving, 3DS-hardened path the LIVE /checkouts/:id page uses:
    //   invoice(uid) → fees()/validateDiscount() quote → createOrder() → then the
    //   PowerTranz sequence checkoutIntent → chargeCard → complete3ds against the
    //   NEW order's own payment-link uid. Prefer this over createSession(), which
    //   cannot apply discounts server-side today. Money amounts are in major units.
    // ──────────────────────────────────────────────────────────────────────────
    /**
     * Load the invoice/order behind a payment-link uid (the `/checkouts/:id` token).
     * The payload is under `data`, embedding `order` and `merchant`.
     */
    async invoice(uid) {
        return this.publicRead(this.client.post(`/payments/link/${encodeURIComponent(uid)}`));
    }
    /**
     * Quote merchant fees for a cart total (display + discount-inclusive). Payload
     * under `data`. Lenient on a bad `discount_code` (prices it at 0 rather than
     * failing) — use {@link validateDiscount} to check a code. `username` defaults
     * to the SDK's configured merchant.
     */
    async fees(params, username) {
        const u = this.requireUsername(username);
        return this.publicRead(this.client.get(`/public/m/${encodeURIComponent(u)}/fees`, params));
    }
    /**
     * Validate + quote a discount code (server-authoritative — the client sends the
     * code, never a price). Both acceptance and rejection resolve with HTTP 200;
     * branch on `data.valid`, not on a thrown error (a rejected quote carries a
     * {@link DiscountRejectReason} in `data.reason`). Pass `params.products` for a
     * product-scoped code. Rate-limited per (IP, merchant): a 429 throws
     * {@link InkressApiError}. `username` defaults to the configured merchant.
     *
     * The quote is ADVISORY: order creation re-resolves and re-checks the code under
     * a lock, so a code that quotes valid can still be refused by {@link createOrder}
     * if a usage cap fills in between — always handle a rejection there too.
     */
    async validateDiscount(params, username) {
        const u = this.requireUsername(username);
        const path = `/public/m/${encodeURIComponent(u)}/discount`;
        // A products[] can't be querystring-encoded, so a product-scoped quote POSTs a
        // JSON body; an order-level quote GETs (matching the live checkout).
        const request = params.products && params.products.length > 0
            ? this.client.post(path, params)
            : this.client.get(path, params);
        return this.publicRead(request);
    }
    /**
     * Fetch the merchant's public keys. `data[0].public_key` is the bearer token
     * that authorizes {@link createOrder} — set it via `sdk.setAuthToken(...)`
     * before creating the order.
     */
    async merchantTokens(username) {
        const u = this.requireUsername(username);
        return this.publicRead(this.client.get(`/public/m/${encodeURIComponent(u)}/tokens`));
    }
    /**
     * Create an order (order-first path). Requires the merchant public key as the
     * SDK auth token (see {@link merchantTokens}). The server re-prices, re-resolves
     * the discount (under a lock), and re-validates shipping. On success
     * `result.payment_urls` carries the hosted payment-link urls used to drive the
     * card/3DS flow. A `discount_code` that passed {@link validateDiscount} can still
     * be refused here if a usage cap filled in between — surface `state:'error'` with
     * the `data` message rather than assuming the discount held.
     */
    async createOrder(input) {
        return this.client.post('/orders', this.toOrderArgs(input));
    }
    /**
     * Begin the PowerTranz card flow for a fresh order's payment-link uid (strip a
     * trailing `/fac` off `result.payment_urls.short_link` to get the uid). Returns
     * a server-signed intent (amount + sig) under `data` that the hosted card iframe
     * uses as the authoritative charge amount.
     */
    async checkoutIntent(uid, input = {}) {
        return this.publicRead(this.client.post(`/payments/link/${encodeURIComponent(uid)}/checkout-intent`, input));
    }
    /**
     * Charge the tokenized card (`card_ref` minted by the hosted iframe) against a
     * payment-link uid. If a 3DS challenge is issued, settle it with {@link complete3ds}
     * once the ACS result is stored server-side.
     */
    async chargeCard(uid, input) {
        return this.client.post(`/payments/link/${encodeURIComponent(uid)}/charge-card`, input);
    }
    /**
     * Settle a 3DS challenge for a payment-link uid, keyed by `spi_token`. The
     * server runs a fail-closed strength gate (authentication Y + CAVV present)
     * before settling and marking the order paid.
     */
    async complete3ds(uid, input) {
        return this.client.post(`/payments/link/${encodeURIComponent(uid)}/complete-3ds`, input);
    }
    /** Resolve the merchant username: explicit arg, else the SDK's configured merchant. */
    requireUsername(username) {
        const u = username || this.client.getMerchantUsername();
        if (!u) {
            throw new Error('A merchant username is required (set merchantUsername on the SDK or pass it to this method).');
        }
        return u;
    }
    /** Reshape a client response into the `data`-envelope {@link PublicDataResponse}. */
    async publicRead(promise) {
        const res = await promise;
        return { state: res.state, data: res.data, result: res.result };
    }
    /** Flatten {@link CreateOrderInput} to the backend's allow-listed, dot-keyed body. */
    toOrderArgs(input) {
        var _a, _b;
        const args = {
            reference_id: input.reference_id,
            kind: (_a = input.kind) !== null && _a !== void 0 ? _a : 'online',
            currency_code: input.currency_code,
            'customer.first_name': input.customer.first_name,
            'customer.last_name': input.customer.last_name,
            'customer.email': input.customer.email,
            products: input.products,
        };
        if (input.customer.phone)
            args['customer.phone'] = input.customer.phone;
        if (input.note)
            args['data.note'] = input.note;
        if (input.total != null)
            args['total'] = input.total;
        if (input.method_id)
            args['method_id'] = input.method_id;
        if (input.payment_link_id != null)
            args['payment_link_id'] = input.payment_link_id;
        if (input.discount_code)
            args['discount_code'] = input.discount_code;
        if (input.fulfillment_total != null)
            args['fulfillment_total'] = input.fulfillment_total;
        if (input.fulfillment_type === 'delivery' && input.shipping_address) {
            const a = input.shipping_address;
            args['data.fulfillment_type'] = 'delivery';
            args['data.shipping_address.country'] = a.country;
            args['data.shipping_address.state'] = a.state;
            args['data.shipping_address.street'] = a.street;
            if (a.postal_code)
                args['data.shipping_address.postal_code'] = a.postal_code;
            if (a.town)
                args['data.shipping_address.town'] = a.town;
            if (a.city)
                args['data.shipping_address.city'] = a.city;
            if (input.fulfillment_total != null)
                args['data.fulfillment_total'] = input.fulfillment_total;
        }
        else if (input.fulfillment_type === 'pickup') {
            args['data.fulfillment_type'] = 'pickup';
            if (input.pickup_location)
                args['data.pickup_location'] = input.pickup_location;
        }
        for (const [key, value] of Object.entries((_b = input.meta_data) !== null && _b !== void 0 ? _b : {})) {
            args[`meta_data.${key}`] = value;
        }
        return args;
    }
    /**
     * Redirect the browser to a hosted-checkout target. Accepts a URL string or a
     * created-session object (uses its `frame_url`). No-ops with a warning under
     * SSR (no `window`), so it is safe to call from isomorphic code.
     *
     * @returns true if a redirect was issued, false under SSR.
     */
    redirectToCheckout(target) {
        const url = typeof target === 'string' ? target : target === null || target === void 0 ? void 0 : target.frame_url;
        if (!url) {
            throw new Error('redirectToCheckout: no URL (or frame_url) to redirect to');
        }
        // Guard against javascript:/data: and other non-navigational schemes — this
        // is a public method and the URL may originate from caller-controlled input.
        if (!/^(https?:\/\/|\/)/i.test(url)) {
            throw new Error('redirectToCheckout: URL must be an absolute http(s) URL or a root-relative path');
        }
        if (typeof window === 'undefined' || !window.location) {
            console.warn('redirectToCheckout called in a non-browser environment; skipping redirect.');
            return false;
        }
        window.location.assign(url);
        return true;
    }
}

/**
 * Addresses resource — a customer's saved addresses (`/addresses`).
 *
 * Addresses are owned polymorphically via `kind` (owner type) + `kind_id`
 * (owner id). For a storefront customer, `kind_id` is their customer id; use
 * {@link AddressesResource.listForCustomer} to scope to one customer.
 */
class AddressesResource {
    constructor(client) {
        this.client = client;
    }
    /** List addresses (optionally filtered). */
    async list(params) {
        return this.client.get('/addresses', params);
    }
    /** List a single customer's saved addresses. */
    async listForCustomer(customerId, params) {
        return this.list({ ...params, kind_id: customerId });
    }
    /** Get an address by id. */
    async get(id) {
        return this.client.get(`/addresses/${id}`);
    }
    /** Create a new address. */
    async create(input) {
        return this.client.post('/addresses', input);
    }
    /** Update an existing address. */
    async update(id, input) {
        return this.client.put(`/addresses/${id}`, input);
    }
    /** Delete an address. */
    async delete(id) {
        return this.client.delete(`/addresses/${id}`);
    }
}

/**
 * Main Inkress Storefront SDK class
 *
 * @example
 * ```typescript
 * import { InkressStorefrontSDK } from '@inkress/storefront-sdk';
 *
 * // Basic initialization
 * const inkress = new InkressStorefrontSDK({
 *   merchantUsername: 'your-merchant-username'
 * });
 *
 * // With custom configuration
 * const inkress = new InkressStorefrontSDK({
 *   endpoint: 'https://api.inkress.com',
 *   merchantUsername: 'your-merchant-username',
 *   authToken: 'customer-auth-token', // For authenticated requests
 * });
 *
 * // Get merchant info
 * const merchant = await inkress.merchants.getByUsername('merchant-username');
 *
 * // Search products
 * const products = await inkress.products.search({ q: 'electronics' });
 *
 * // Browse categories
 * const categories = await inkress.categories.list();
 * const categoryTree = await inkress.categories.getCategoryTree();
 *
 * // Add to cart
 * inkress.cart.addItem(product, 2);
 *
 * // Submit a product review
 * await inkress.reviews.create({
 *   parent_id: 123,
 *   rating: 5,
 *   body: 'Great product! Exactly what I was looking for.'
 * });
 *
 * // Get product reviews
 * const reviews = await inkress.reviews.getByProduct(123);
 *
 * // Get available shipping methods
 * const methods = await inkress.shipping.listMethods();
 *
 * // Find cheapest shipping option
 * const cheapest = await inkress.shipping.getCheapestMethod();
 *
 * // Store custom data using generics
 * await inkress.generics.create({
 *   key: 'user-preferences',
 *   kind: 1,
 *   data: { theme: 'dark', language: 'en' }
 * });
 *
 * // Upload and manage files
 * const fileInput = document.querySelector('input[type="file"]');
 * const uploadResult = await inkress.files.upload(fileInput.files[0], {
 *   tags: ['product-image'],
 *   folder: 'products'
 * });
 *
 * // Get optimized image URL
 * const optimizedUrl = inkress.files.getOptimizedUrl(uploadResult.result.file, 800, 600);
 *
 * // Listen to cart events
 * inkress.on('cart:item:added', ({ item, cart }) => {
 *   console.log('Item added to cart:', item);
 * });
 * ```
 */
class InkressStorefrontSDK {
    constructor(config = {}) {
        // Event system delegation
        /**
         * Listen to SDK events
         */
        this.on = (...args) => this.eventEmitter.on(...args);
        /**
         * Remove event listener
         */
        this.off = (...args) => this.eventEmitter.off(...args);
        /**
         * Listen to event once
         */
        this.once = (...args) => this.eventEmitter.once(...args);
        /**
         * Emit an event (mainly for internal use)
         */
        this.emit = (...args) => this.eventEmitter.emit(...args);
        /**
         * Remove all event listeners
         */
        this.removeAllListeners = (...args) => this.eventEmitter.removeAllListeners(...args);
        // Initialize core components
        this.client = new HttpClient(config);
        this.storageManager = new StorageManager(config.merchantUsername ? `inkress-${config.merchantUsername}` : 'inkress');
        this.eventEmitter = new EventEmitter();
        // Initialize resources
        this.merchants = new MerchantsResource(this.client);
        this.products = new ProductsResource(this.client);
        this.categories = new CategoriesResource(this.client);
        this.auth = new AuthResource(this.client);
        this.orders = new OrdersResource(this.client);
        this.reviews = new ReviewsResource(this.client);
        this.shipping = new ShippingResource(this.client);
        this.files = new FilesResource(this.client);
        this.checkout = new CheckoutResource(this.client);
        this.addresses = new AddressesResource(this.client);
        // Initialize cart and wishlist with storage, events, and client
        this.cart = new CartResource(this.storageManager.createStorage('cart'), this.eventEmitter, this.client);
        // Let cart.checkout() open a session via the checkout resource.
        this.cart.setCheckout(this.checkout);
        this.generic = new GenericResource(this.client);
        this.generics = new GenericsResource(this.client);
        // Wishlist persists remotely through the typed `/generics` store.
        this.wishlist = new WishlistResource(this.storageManager.createStorage('wishlist'), this.eventEmitter, this.generics);
    }
    /**
     * Update SDK configuration
     */
    updateConfig(newConfig) {
        this.client.updateConfig(newConfig);
        // Re-point the per-merchant storage namespace if the merchant changed. This
        // updates the existing storage instances in place, so the cart/wishlist
        // resource references consumers already hold remain valid. The customer
        // (wishlist) user id is cleared, since it belonged to the previous context.
        if (newConfig.merchantUsername) {
            this.storageManager.setPrefix(`inkress-${newConfig.merchantUsername}`);
            this.wishlist.setUserId(undefined);
        }
    }
    /**
     * Set authentication token for customer-specific requests
     */
    setAuthToken(token) {
        this.updateConfig({ authToken: token });
    }
    /**
     * Clear authentication token
     */
    clearAuthToken() {
        this.updateConfig({ authToken: '' });
    }
    /**
     * Set user ID for remote storage features (like wishlist sync)
     */
    setUserId(userId) {
        this.wishlist.setUserId(userId);
    }
    /**
     * Set merchant username
     */
    setMerchant(username) {
        this.updateConfig({ merchantUsername: username });
    }
    /**
     * Get current configuration (without sensitive data)
     */
    getConfig() {
        return this.client.getConfig();
    }
    // Utility methods
    /**
     * Clear all local storage data (cart, wishlist, etc.)
     */
    clearLocalData() {
        return this.storageManager.clearAll();
    }
    /**
     * Get all local storage keys
     */
    getLocalStorageKeys() {
        return this.storageManager.getAllKeys();
    }
    /**
     * Initialize for a specific merchant (convenience method)
     */
    static forMerchant(merchantUsername, config = {}) {
        return new InkressStorefrontSDK({
            ...config,
            merchantUsername
        });
    }
    /**
     * Create SDK instance with authentication
     */
    static withAuth(authToken, config = {}) {
        return new InkressStorefrontSDK({
            ...config,
            authToken
        });
    }
    /**
     * Create SDK instance for specific merchant with authentication
     */
    static forMerchantWithAuth(merchantUsername, authToken, config = {}) {
        return new InkressStorefrontSDK({
            ...config,
            merchantUsername,
            authToken
        });
    }
}
// ---------------------------------------------------------------------------
// Back-compat shim
// ---------------------------------------------------------------------------
/**
 * Legacy v0.0.1 `Inkress` class. Preserved so existing `createPaymentUrl`
 * users keep working after upgrading. Prefer {@link InkressStorefrontSDK} and
 * its checkout resource for new code.
 *
 * @deprecated Use {@link InkressStorefrontSDK}.
 */
class Inkress {
    constructor({ clientKey = '', token = '', mode = 'live', } = {}) {
        this.clientKey = clientKey;
        this.token = token;
        this.siteBaseUrl = mode === 'live' ? 'https://inkress.com' : 'https://dev.inkress.com';
    }
    setClient(clientKey) {
        this.clientKey = clientKey;
    }
    setToken(token) {
        this.token = token;
    }
    generateRandomId() {
        return generateRandomId();
    }
    createPaymentUrl(options) {
        return buildPaymentUrl(options, this.siteBaseUrl);
    }
}

exports.AddressesResource = AddressesResource;
exports.CATEGORY_FIELD_TYPES = CATEGORY_FIELD_TYPES;
exports.CategoryQueryBuilder = CategoryQueryBuilder;
exports.CheckoutResource = CheckoutResource;
exports.Inkress = Inkress;
exports.InkressApiError = InkressApiError;
exports.InkressStorefrontSDK = InkressStorefrontSDK;
exports.ORDER_FIELD_TYPES = ORDER_FIELD_TYPES;
exports.OrderQueryBuilder = OrderQueryBuilder;
exports.PRODUCT_FIELD_TYPES = PRODUCT_FIELD_TYPES;
exports.PRODUCT_GROUP_BY_FIELDS = PRODUCT_GROUP_BY_FIELDS;
exports.ProductQueryBuilder = ProductQueryBuilder;
exports.QUERY_CONTEXT = QUERY_CONTEXT;
exports.QueryBuilder = QueryBuilder;
exports.REVIEW_FIELD_TYPES = REVIEW_FIELD_TYPES;
exports.ReviewQueryBuilder = ReviewQueryBuilder;
exports.buildPaymentUrl = buildPaymentUrl;
exports.computeProductUnitPrice = computeProductUnitPrice;
exports.decodeB64ToJSON = decodeB64ToJSON;
exports.default = InkressStorefrontSDK;
exports.encodeJSONToB64 = encodeJSONToB64;
exports.generateRandomId = generateRandomId;
exports.getProductAttributes = getProductAttributes;
exports.getProductAvailableStock = getProductAvailableStock;
exports.getProductCustomFields = getProductCustomFields;
exports.getProductCustomerInputs = getProductCustomerInputs;
exports.isProductInStock = isProductInStock;
exports.normalizeFacetRow = normalizeFacetRow;
exports.processQuery = processQuery;
exports.toProductStock = toProductStock;
exports.validatePaymentOptions = validatePaymentOptions;
//# sourceMappingURL=index.cjs.map
