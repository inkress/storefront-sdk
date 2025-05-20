"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckoutPage = void 0;
const react_1 = __importStar(require("react"));
const storefront_sdk_1 = __importDefault(require("@inkress/storefront-sdk"));
// Initialize the SDK
const inkress = new storefront_sdk_1.default({
    mode: 'test', // Use 'live' for production
    clientKey: 'your-client-key-here', // Optional
    token: 'your-api-token-here', // Optional
});
const PaymentButton = ({ amount, merchantUsername }) => {
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const handlePayment = () => {
        try {
            setIsLoading(true);
            setError(null);
            // Generate a payment URL
            const paymentUrl = inkress.createPaymentUrl({
                username: merchantUsername,
                total: amount, // Amount in cents
                currency_code: 'JMD',
                title: 'Product Purchase',
                customer: {
                    phone: '' // Required field, but can be empty for anonymous checkout
                }
            });
            // Redirect to the payment page
            window.location.href = paymentUrl;
        }
        catch (err) {
            setError(err.message || 'Failed to create payment URL');
            setIsLoading(false);
        }
    };
    return (<div>
      <button onClick={handlePayment} disabled={isLoading} style={{
            backgroundColor: '#4CAF50',
            color: 'white',
            padding: '10px 20px',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading ? 'not-allowed' : 'pointer'
        }}>
        {isLoading ? 'Processing...' : 'Pay with Inkress'}
      </button>
      
      {error && (<div style={{ color: 'red', marginTop: '10px' }}>
          Error: {error}
        </div>)}
    </div>);
};
// Example usage
const CheckoutPage = () => {
    return (<div>
      <h2>Checkout</h2>
      <p>Total: $25.00 USD</p>
      
      <PaymentButton amount={2500} merchantUsername="your-merchant-username"/>
    </div>);
};
exports.CheckoutPage = CheckoutPage;
exports.default = PaymentButton;
