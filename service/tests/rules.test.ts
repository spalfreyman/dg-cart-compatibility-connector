import type { Cart, Customer, LineItem } from '@commercetools/platform-sdk';
import { checkCompatibility } from '../src/rules';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLineItem(
  sku: string,
  generationKey: string = 'gen2',
  adapterCompatible: boolean = true
): LineItem {
  return {
    id: `li-${sku}`,
    productId: `prod-${sku}`,
    productType: { typeId: 'product-type', id: 'pt-1' },
    name: { 'en-US': sku },
    variant: {
      id: 1,
      sku,
      attributes: [
        {
          name: 'generation',
          value: { key: generationKey, label: generationKey },
        },
        { name: 'adapter-compatible', value: adapterCompatible },
      ],
    },
    price: {
      id: 'price-1',
      value: { type: 'centPrecision', currencyCode: 'EUR', centAmount: 799, fractionDigits: 2 },
    },
    quantity: 1,
    discountedPricePerQuantity: [],
    perMethodTaxRate: [],
    addedAt: '2024-01-01T00:00:00.000Z',
    lastModifiedAt: '2024-01-01T00:00:00.000Z',
    state: [],
    priceMode: 'Platform',
    lineItemMode: 'Standard',
    totalPrice: { type: 'centPrecision', currencyCode: 'EUR', centAmount: 799, fractionDigits: 2 },
  } as unknown as LineItem;
}

function makeNeoMachine(): LineItem {
  return makeLineItem('MACH-NEO-BLACK-220V', 'gen2', false);
}

function makeNeoAdapter(): LineItem {
  return makeLineItem(NEO_ADAPTER_SKU, 'gen1', false);
}

const NEO_ADAPTER_SKU = 'neo-adapter';

function makeCart(lineItems: LineItem[] = []): Cart {
  return {
    id: 'cart-1',
    version: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    lastModifiedAt: '2024-01-01T00:00:00.000Z',
    lineItems,
    customLineItems: [],
    cartState: 'Active',
    taxMode: 'Disabled',
    taxRoundingMode: 'HalfEven',
    taxCalculationMode: 'LineItemLevel',
    inventoryMode: 'None',
    itemShippingAddresses: [],
    discountCodes: [],
    directDiscounts: [],
    refusedGifts: [],
    origin: 'Customer',
    shippingMode: 'Single',
    shipping: [],
    totalPrice: { type: 'centPrecision', currencyCode: 'EUR', centAmount: 0, fractionDigits: 2 },
  } as unknown as Cart;
}

function makeCustomer(opts: {
  isGen1?: boolean;
  isGen2?: boolean;
  hasAdapter?: boolean;
} = {}): Customer {
  return {
    id: 'cust-1',
    version: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    lastModifiedAt: '2024-01-01T00:00:00.000Z',
    email: 'test@test.com',
    isEmailVerified: true,
    addresses: [],
    authenticationMode: 'Password',
    custom: {
      type: { typeId: 'type', id: 'type-1' },
      fields: {
        'is-gen1': opts.isGen1 ?? false,
        'is-gen2': opts.isGen2 ?? false,
        'has-neo-adapter': opts.hasAdapter ?? false,
      },
    },
  } as unknown as Customer;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('checkCompatibility', () => {
  describe('no NEO products in cart', () => {
    it('returns no entries for a cart with only Gen1 products', () => {
      const cart = makeCart([makeLineItem('BOX-GEN1-ESPRESSO-10', 'gen1', false)]);
      expect(checkCompatibility(cart, makeCustomer({ isGen1: true }))).toEqual([]);
    });

    it('returns no entries for an empty cart', () => {
      expect(checkCompatibility(makeCart(), null)).toEqual([]);
    });
  });

  describe('Gen2 customer', () => {
    it('returns compatible (null warning) for NEO products', () => {
      const cart = makeCart([makeLineItem('BOX-NEO-ESPRESSO-8')]);
      const result = checkCompatibility(cart, makeCustomer({ isGen2: true }));
      expect(result).toHaveLength(1);
      expect(result[0].warning).toBeNull();
    });
  });

  describe('NEO machine in cart resolves compatibility', () => {
    it('returns compatible (null warning) for all NEO items when NEO machine is in cart', () => {
      const cart = makeCart([makeLineItem('BOX-NEO-ESPRESSO-8'), makeNeoMachine()]);
      const result = checkCompatibility(cart, makeCustomer({ isGen1: true }));
      expect(result.every((r) => r.warning === null)).toBe(true);
    });
  });

  describe('Gen1 customer, no adapter', () => {
    it('warns on all NEO line items', () => {
      const cart = makeCart([makeLineItem('BOX-NEO-ESPRESSO-8')]);
      const result = checkCompatibility(cart, makeCustomer({ isGen1: true }));
      expect(result).toHaveLength(1);
      expect(result[0].warning).toMatch(/compatible machine/i);
      expect(result[0].warning).toMatch(/Neo Adapter/i);
    });
  });

  describe('Gen1 customer with Neo Adapter on profile', () => {
    it('returns compatible (null warning) for adapter-compatible pods', () => {
      const cart = makeCart([makeLineItem('BOX-NEO-ESPRESSO-8', 'gen2', true)]);
      const result = checkCompatibility(cart, makeCustomer({ isGen1: true, hasAdapter: true }));
      expect(result).toHaveLength(1);
      expect(result[0].warning).toBeNull();
    });

    it('warns for non-adapter-compatible pods (e.g. NEO Americano)', () => {
      const cart = makeCart([makeLineItem('BOX-NEO-AMERICANO-8', 'gen2', false)]);
      const result = checkCompatibility(cart, makeCustomer({ isGen1: true, hasAdapter: true }));
      expect(result).toHaveLength(1);
      expect(result[0].warning).toMatch(/NEO machine is required/i);
    });

    it('returns per-item results when adapter-OK and blocked pods are mixed in cart', () => {
      const cart = makeCart([
        makeLineItem('BOX-NEO-ESPRESSO-8', 'gen2', true),
        makeLineItem('BOX-NEO-AMERICANO-8', 'gen2', false),
      ]);
      const result = checkCompatibility(cart, makeCustomer({ isGen1: true, hasAdapter: true }));
      expect(result).toHaveLength(2);
      const espresso = result.find((r) => r.lineItemId === 'li-BOX-NEO-ESPRESSO-8');
      const americano = result.find((r) => r.lineItemId === 'li-BOX-NEO-AMERICANO-8');
      expect(espresso?.warning).toBeNull();
      expect(americano?.warning).toMatch(/NEO machine is required/i);
    });
  });

  describe('Neo Adapter in cart resolves partial compatibility', () => {
    it('returns compatible (null warning) for adapter-compatible pods when adapter is in cart', () => {
      const cart = makeCart([
        makeLineItem('BOX-NEO-ESPRESSO-8', 'gen2', true),
        makeNeoAdapter(),
      ]);
      const result = checkCompatibility(cart, makeCustomer({ isGen1: true }));
      expect(result).toHaveLength(1); // adapter is gen1, not counted as NEO product
      expect(result[0].warning).toBeNull();
    });

    it('still warns for non-adapter-compatible pods even when adapter is in cart', () => {
      const cart = makeCart([
        makeLineItem('BOX-NEO-AMERICANO-8', 'gen2', false),
        makeNeoAdapter(),
      ]);
      const result = checkCompatibility(cart, makeCustomer({ isGen1: true }));
      expect(result).toHaveLength(1);
      expect(result[0].warning).toMatch(/NEO machine is required/i);
    });
  });

  describe('anonymous / no customer', () => {
    it('warns to sign in for all NEO line items', () => {
      const cart = makeCart([makeLineItem('BOX-NEO-ESPRESSO-8')]);
      const result = checkCompatibility(cart, null);
      expect(result).toHaveLength(1);
      expect(result[0].warning).toMatch(/sign in/i);
    });
  });
});
