import type { Cart, Customer, LineItem } from '@commercetools/platform-sdk';

const NEO_MACHINE_SKU_PREFIX = 'MACH-NEO-';
const NEO_ADAPTER_SKU = 'neo-adapter';

export interface LineItemWarning {
  lineItemId: string;
  warning: string | null;
}

function getAttr(
  attributes: { name: string; value: unknown }[] = [],
  name: string
): unknown {
  return attributes.find((a) => a.name === name)?.value;
}

function isNeoProduct(lineItem: LineItem): boolean {
  const attrs = lineItem.variant?.attributes ?? [];
  const generation = getAttr(attrs, 'generation') as
    | { key: string }
    | undefined;
  return generation?.key === 'gen2';
}

function isAdapterCompatible(lineItem: LineItem): boolean {
  const attrs = lineItem.variant?.attributes ?? [];
  return getAttr(attrs, 'adapter-compatible') === true;
}

function cartHasNeoMachine(lineItems: LineItem[]): boolean {
  return lineItems.some((li) =>
    (li.variant?.sku ?? '').startsWith(NEO_MACHINE_SKU_PREFIX)
  );
}

function cartHasNeoAdapter(lineItems: LineItem[]): boolean {
  return lineItems.some((li) => (li.variant?.sku ?? '') === NEO_ADAPTER_SKU);
}

function getItemName(li: LineItem): string {
  return (
    li.name?.['en-US'] ??
    li.name?.['en'] ??
    li.productKey ??
    'Unknown product'
  );
}

/**
 * Evaluate per-line-item compatibility against the customer profile.
 * Returns one entry per NEO line item — warning=null means compatible (clears any stale warning).
 * Returns [] if cart has no NEO products.
 */
export function checkCompatibility(
  cart: Cart,
  customer: Customer | null
): LineItemWarning[] {
  const lineItems = cart.lineItems ?? [];
  const neoItems = lineItems.filter(isNeoProduct);

  if (neoItems.length === 0) return [];

  if (cartHasNeoMachine(lineItems)) {
    return neoItems.map((li) => ({ lineItemId: li.id, warning: null }));
  }

  const fields = (customer?.custom?.fields ?? {}) as Record<string, unknown>;
  const isGen2 = fields['is-gen2'] === true;
  const isGen1 = fields['is-gen1'] === true;
  const profileHasAdapter = fields['has-neo-adapter'] === true;
  const adapterInCart = cartHasNeoAdapter(lineItems);

  if (isGen2) {
    return neoItems.map((li) => ({ lineItemId: li.id, warning: null }));
  }

  if (!isGen1) {
    return neoItems.map((li) => ({
      lineItemId: li.id,
      warning:
        "You don't have a compatible machine for this product. " +
        'Please sign in to verify your machine compatibility.',
    }));
  }

  const hasAdapter = profileHasAdapter || adapterInCart;

  if (!hasAdapter) {
    return neoItems.map((li) => ({
      lineItemId: li.id,
      warning:
        "You don't have a compatible machine. NEO capsules require a NEO machine or the Neo Adapter accessory.",
    }));
  }

  return neoItems.map((li) => ({
    lineItemId: li.id,
    warning: isAdapterCompatible(li)
      ? null
      : `${getItemName(li)} cannot be used with the Neo Adapter on a Gen1 machine. A NEO machine is required.`,
  }));
}
