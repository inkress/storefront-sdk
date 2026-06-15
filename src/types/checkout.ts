// ============================================================================
// Checkout / money-path types. The session shapes mirror @inkress/admin-sdk's
// checkout-sessions so the two SDKs describe the same payment objects.
// ============================================================================

import type { Address } from '../types';

export interface CheckoutCustomer {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

/** Order data used to open a checkout session (same shape as order creation). */
export interface CreateCheckoutSessionInput {
  /** Auto-generated when omitted. */
  reference_id?: string;
  /** 'online' | 'cart' | ... — defaults to 'online' for hosted checkout. */
  kind?: string;
  total?: number;
  currency_code: string;
  customer?: CheckoutCustomer;
  products?: Array<{ id: number; quantity: number; [key: string]: any }>;
  method_id?: string;
  title?: string;
  data?: {
    shipping_address?: Address;
    fulfillment_type?: 'delivery' | 'pickup';
    pickup_location?: string;
  };
  payment_link_id?: string;
}

export interface CheckoutSessionFeeMapping {
  charged_party: number;
  computed_value: number;
  currency: string;
  fee_id: number;
  group: number;
  is_compounded: boolean;
  recipient_merchant_id: number;
  sequence: number;
  unit: number;
  value: number;
}

export interface CheckoutSessionFees {
  after_tax_fee_total: number;
  before_tax_fee_total: number;
  customer_total: number;
  discount_total: number;
  fee_ids: number[];
  fee_mappings: CheckoutSessionFeeMapping[];
  merchant_total: number;
  platform_total: number;
  provider_total: number;
  shipping_total: number;
  sub_total: number;
  tax_total: number;
}

export interface CheckoutSessionTotals {
  sub_total: number;
  customer_total: number;
  merchant_total: number;
  platform_total: number;
  provider_total: number;
  shipping_total: number;
  tax_total: number;
  discount_total: number;
  before_tax_fee_total: number;
  after_tax_fee_total: number;
}

export interface CheckoutSessionCurrency {
  code: string;
  id: number;
}

export interface CheckoutSessionCustomer {
  id: number | null;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
}

export type CheckoutSessionStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'completed'
  | 'cancelled'
  | 'expired';

/** Response from creating a checkout session — carries the hosted-frame fields. */
export interface CreateCheckoutSessionResponseData {
  session_id: string;
  reference_id: string;
  status: string;
  order_id: string;
  currency: string;
  currency_code: string;
  created_at: string;
  payment_initiated_at: string;
  completed_at: string | null;
  expires: number;
  totals: CheckoutSessionTotals;
  customer: CheckoutSessionCustomer;
  title: string;
  products: any[];
  /** URL of the hosted payment frame to embed or redirect to. */
  frame_url: string;
  /** Provider redirect payload (PowerTranz SPI), when applicable. */
  redirect_data: string;
  spi_token: string;
  transaction_id: string;
  amount: number;
  transaction_type: string | null;
  three_d_secure: any | null;
  is_subscription: boolean;
}

/** Response from fetching an existing checkout session. */
export interface CheckoutSession {
  status: CheckoutSessionStatus;
  title: string;
  currency: CheckoutSessionCurrency;
  customer: CheckoutSessionCustomer;
  session_id: string;
  order_id: number | null;
  reference_id: string;
  fees: CheckoutSessionFees;
  products: any[];
  created_at: string;
  completed_at: string | null;
  payment_initiated_at: string | null;
}

export interface DeleteCheckoutSessionResponseData {
  status: 'cancelled';
  session_id: string;
}
