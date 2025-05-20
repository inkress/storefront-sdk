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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServerSideProps = void 0;
exports.default = CheckoutPage;
// Example of using Inkress SDK in a Next.js application
const react_1 = __importStar(require("react"));
const storefront_sdk_1 = __importDefault(require("@inkress/storefront-sdk"));
// Server-side initialization of the SDK for API calls
const getServerSideProps = () => __awaiter(void 0, void 0, void 0, function* () {
    // You can use the SDK server-side for data fetching if needed
    const serverSideInkress = new storefront_sdk_1.default({
        mode: process.env.NODE_ENV === 'production' ? 'live' : 'test',
        token: process.env.INKRESS_API_TOKEN,
        clientKey: process.env.INKRESS_CLIENT_KEY,
    });
    // Example product data (in real app, fetch from database or API)
    return {
        props: {
            productName: 'Premium Subscription',
            productPrice: 2500, // $25.00 in cents
            merchantUsername: process.env.INKRESS_MERCHANT_USERNAME || 'your-merchant-username',
        },
    };
});
exports.getServerSideProps = getServerSideProps;
// Client-side component with Inkress integration
function CheckoutPage({ productName, productPrice, merchantUsername }) {
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    // Initialize the client-side SDK instance
    // In production code, you might want to memoize this
    const inkress = new storefront_sdk_1.default({
        mode: process.env.NODE_ENV === 'production' ? 'live' : 'test',
        clientKey: process.env.NEXT_PUBLIC_INKRESS_CLIENT_KEY,
    });
    const handlePayment = () => {
        try {
            setIsLoading(true);
            // Create the payment URL with the SDK
            const paymentUrl = inkress.createPaymentUrl({
                username: merchantUsername,
                total: productPrice,
                title: `Payment for ${productName}`,
                reference_id: `order-${Date.now()}`,
                customer: {
                    phone: '' // Required field, can be empty for anonymous checkout
                }
            });
            // Redirect to the payment page
            window.location.href = paymentUrl;
        }
        catch (error) {
            console.error('Payment creation failed:', error);
            setIsLoading(false);
        }
    };
    return (<div className="checkout-container">
      <h1>Checkout</h1>
      
      <div className="product-details">
        <h2>{productName}</h2>
        <p className="price">${(productPrice / 100).toFixed(2)}</p>
      </div>
      
      <button onClick={handlePayment} disabled={isLoading} className="payment-button">
        {isLoading ? 'Processing...' : 'Pay with Inkress'}
      </button>
      
      <style jsx>{`
        .checkout-container {
          max-width: 500px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
            Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        }
        .product-details {
          margin-bottom: 20px;
          padding: 15px;
          border: 1px solid #eaeaea;
          border-radius: 5px;
        }
        .price {
          font-size: 24px;
          font-weight: bold;
          color: #333;
        }
        .payment-button {
          display: block;
          width: 100%;
          padding: 12px;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 16px;
          cursor: pointer;
        }
        .payment-button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
      `}</style>
    </div>);
}
