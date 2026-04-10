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
    it('returns no warnings for a cart with only Gen1 products', () => {
      const cart = makeCart([makeLineItem('BOX-GEN1-ESPRESSO-10', 'gen1', false)]);
      expect(checkCompatibility(cart, makeCustomer({ isGen1: true }))).toEqual([]);
    });

    it('returns no warnings for an empty cart', () => {
      expect(checkCompatibility(makeCart(), null)).toEqual([]);
    });
  });

  describe('Gen2 customer', () => {
    it('returns no warnings for any NEO product', () => {
      const cart = makeCart([makeLineItem('BOX-NEO-ESPRESSO-8')]);
      expect(checkCompatibility(cart, makeCustomer({ isGen2: true }))).toEqual([]);
    });
  });

  describe('NEO machine in cart resolves compatibility', () => {
    it('returns no warnings even for Gen1 customer when NEO machine is in cart', () => {
      const cart = makeCart([makeLineItem('BOX-NEO-ESPRESSO-8'), makeNeoMachine()]);
      expect(checkCompatibility(cart, makeCustomer({ isGen1: true }))).toEqual([]);
    });
  });

  describe('Gen1 customer, no adapter', () => {
    it('warns that no compatible machine exists', () => {
      const cart = makeCart([makeLineItem('BOX-NEO-ESPRESSO-8')]);
      const warnings = checkCompatibility(cart, makeCustomer({ isGen1: true }));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/compatible machine/i);
      expect(warnings[0]).toMatch(/Neo Adapter/i);
    });
  });

  describe('Gen1 customer with Neo Adapter on profile', () => {
    it('returns no warnings for adapter-compatible pods', () => {
      const cart = makeCart([makeLineItem('BOX-NEO-ESPRESSO-8', 'gen2', true)]);
      expect(
        checkCompatibility(cart, makeCustomer({ isGen1: true, hasAdapter: true }))
      ).toEqual([]);
    });

    it('warns for non-adapter-compatible pods (e.g. NEO Americano)', () => {
      const cart = makeCart([makeLineItem('BOX-NEO-AMERICANO-8', 'gen2', false)]);
      const warnings = checkCompatibility(
        cart,
        makeCustomer({ isGen1: true, hasAdapter: true })
      );
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/NEO machine is required/i);
    });

    it('warns partial compatibility when both adapter-OK and blocked pods are in cart', () => {
      const cart = makeCart([
        makeLineItem('BOX-NEO-ESPRESSO-8', 'gen2', true),
        makeLineItem('BOX-NEO-AMERICANO-8', 'gen2', false),
      ]);
      const warnings = checkCompatibility(
        cart,
        makeCustomer({ isGen1: true, hasAdapter: true })
      );
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/Partial compatibility/i);
    });
  });

  describe('Neo Adapter in cart resolves partial compatibility', () => {
    it('returns no warnings for adapter-compatible pods when adapter is in cart', () => {
      const cart = makeCart([
        makeLineItem('BOX-NEO-ESPRESSO-8', 'gen2', true),
        makeNeoAdapter(),
      ]);
      expect(checkCompatibility(cart, makeCustomer({ isGen1: true }))).toEqual([]);
    });

    it('still warns for non-adapter-compatible pods even when adapter is in cart', () => {
      const cart = makeCart([
        makeLineItem('BOX-NEO-AMERICANO-8', 'gen2', false),
        makeNeoAdapter(),
      ]);
      const warnings = checkCompatibility(cart, makeCustomer({ isGen1: true }));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/NEO machine is required/i);
    });
  });

  describe('anonymous / no customer', () => {
    it('warns when no customer profile is available', () => {
      const cart = makeCart([makeLineItem('BOX-NEO-ESPRESSO-8')]);
      const warnings = checkCompatibility(cart, null);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/sign in/i);
    });
  });
});
