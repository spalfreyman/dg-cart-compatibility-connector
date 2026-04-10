import type { Cart, Customer, LineItem } from '@commercetools/platform-sdk';

const NEO_MACHINE_SKU_PREFIX = 'MACH-NEO-';
const NEO_ADAPTER_SKU = 'neo-adapter';

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
 * Evaluate cart compatibility against the customer profile.
 * Returns an array of warning strings — empty means fully compatible.
 */
export function checkCompatibility(
  cart: Cart,
  customer: Customer | null
): string[] {
  const lineItems = cart.lineItems ?? [];
  const neoItems = lineItems.filter(isNeoProduct);

  if (neoItems.length === 0) return [];
  if (cartHasNeoMachine(lineItems)) return [];

  const fields = (customer?.custom?.fields ?? {}) as Record<string, unknown>;
  const isGen2 = fields['is-gen2'] === true;
  const isGen1 = fields['is-gen1'] === true;
  const profileHasAdapter = fields['has-neo-adapter'] === true;
  const adapterInCart = cartHasNeoAdapter(lineItems);

  if (isGen2) return [];

  if (!isGen1 && !isGen2) {
    return [
      "You don't have a compatible machine for NEO products in your cart. " +
        'Please add a NEO machine or sign in to verify your machine compatibility.',
    ];
  }

  const hasAdapter = profileHasAdapter || adapterInCart;

  if (!hasAdapter) {
    return [
      "You don't have a compatible machine. NEO capsules require a NEO machine or the Neo Adapter accessory.",
    ];
  }

  const blockedItems = neoItems.filter((li) => !isAdapterCompatible(li));
  const okItems = neoItems.filter((li) => isAdapterCompatible(li));

  if (blockedItems.length === 0) return [];

  const blockedNames = blockedItems.map(getItemName).join(', ');

  if (okItems.length > 0) {
    return [
      `Partial compatibility: your Gen1 machine with the Neo Adapter can brew most NEO pods, ` +
        `but the following product(s) require a NEO machine: ${blockedNames}.`,
    ];
  }

  return [
    `Incompatible products: ${blockedNames} cannot be used with the Neo Adapter on a Gen1 machine. ` +
      'A NEO machine is required.',
  ];
}
