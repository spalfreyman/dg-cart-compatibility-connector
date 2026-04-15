// Custom field names — mirror service/src/rules.ts
export const WARNING_FIELD = 'compatibility-warning';
export const TOP_THREE_FIELD = 'Top-Three';
export const BOX_SELECTION_IDS_FIELD = 'box-selection-ids';
export const BOX_CAPSULE_TOTAL_FIELD = 'box-capsule-total';
export const ASSIGNED_BOX_FIELD = 'assigned-box-line-item-id';
export const CART_TYPE_KEY = 'cart-compatibility';

// Pick & Mix
export const PICK_AND_MIX_BOX_SKU = 'CUSTOM-BOX-GEN1-50';
export const PICK_AND_MIX_BOX_NEO_SKU = 'CUSTOM-BOX-NEO-50';
export const PICK_AND_MIX_BOX_GEN25_SKU = 'CUSTOM-BOX-GEN25-50';
export const CAPSULE_LIMIT = 50;

// Category slugs (CTP en-US) → display labels
export const CATEGORIES: Record<string, string> = {
  'gen1-coffees': 'Espresso & Lungo',
  'gen1-cappuccinos': 'Cappuccino & Latte',
  'gen1-chocolate': 'Hot Chocolate',
  'gen1-starbucks': 'Starbucks',
  'neo-espresso': 'NEO Espresso',
  'neo-lungo': 'NEO Lungo',
};

// Cookie names
export const COOKIE_CART_ID = 'dg_cart_id';
export const COOKIE_CUSTOMER_TOKEN = 'dg_customer_token';
export const COOKIE_CUSTOMER_ID = 'dg_customer_id';
export const COOKIE_CUSTOMER_EMAIL = 'dg_customer_email';
