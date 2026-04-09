'use strict';

const NEO_MACHINE_SKU_PREFIX = 'MACH-NEO-';
const NEO_ADAPTER_SKU = 'neo-adapter';

function getAttr(attributes = [], name) {
  const found = attributes.find((a) => a.name === name);
  return found?.value;
}

function isNeoProduct(lineItem) {
  const generation = getAttr(lineItem.variant?.attributes ?? [], 'generation');
  return generation?.key === 'gen2';
}

function isAdapterCompatible(lineItem) {
  return getAttr(lineItem.variant?.attributes ?? [], 'adapter-compatible') === true;
}

function cartHasNeoMachine(lineItems) {
  return lineItems.some((li) => (li.variant?.sku ?? '').startsWith(NEO_MACHINE_SKU_PREFIX));
}

function cartHasNeoAdapter(lineItems) {
  return lineItems.some((li) => (li.variant?.sku ?? '') === NEO_ADAPTER_SKU);
}

/**
 * Main compatibility check. Returns an array of warning strings (empty = all OK).
 */
function checkCompatibility(cart, customer) {
  const lineItems = cart.lineItems ?? [];
  const neoItems = lineItems.filter(isNeoProduct);
  if (neoItems.length === 0) return [];

  if (cartHasNeoMachine(lineItems)) return [];

  const customFields = customer?.custom?.fields ?? {};
  const customerIsGen2 = customFields['is-gen2'] === true;
  const customerIsGen1 = customFields['is-gen1'] === true;
  const customerHasAdapter = customFields['has-neo-adapter'] === true;
  const adapterInCart = cartHasNeoAdapter(lineItems);

  if (customerIsGen2) return [];

  if (!customerIsGen2 && !customerIsGen1) {
    return [
      "You don't have a compatible machine for NEO products in your cart. " +
      "Please add a NEO machine or sign in to verify your machine compatibility.",
    ];
  }

  const hasAdapter = customerHasAdapter || adapterInCart;

  if (!hasAdapter) {
    return [
      "You don't have a compatible machine. NEO capsules require a NEO machine or the Neo Adapter accessory.",
    ];
  }

  const blockedItems = neoItems.filter((li) => !isAdapterCompatible(li));
  const okItems = neoItems.filter((li) => isAdapterCompatible(li));

  if (blockedItems.length > 0) {
    const blockedNames = blockedItems
      .map((li) => li.name?.['en-US'] ?? li.name?.['en'] ?? li.productKey ?? 'Unknown')
      .join(', ');

    if (okItems.length > 0) {
      return [
        `Partial compatibility: your Gen1 machine with the Neo Adapter can brew most NEO pods, ` +
        `but the following product(s) require a NEO machine: ${blockedNames}.`,
      ];
    }
    return [
      `Incompatible products: ${blockedNames} cannot be used with the Neo Adapter on a Gen1 machine. ` +
      `A NEO machine is required.`,
    ];
  }

  return [];
}

module.exports = { checkCompatibility };
