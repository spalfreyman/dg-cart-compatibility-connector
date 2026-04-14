import type { Cart, Customer, LineItem } from '@commercetools/platform-sdk';
import { checkCompatibility, buildCustomBoxAssignments } from '../src/rules';

// ─── Shared helpers ───────────────────────────────────────────────────────────

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

// ─── Custom box helpers ───────────────────────────────────────────────────────

function makeCustomBoxLineItem(
  id: string,
  capsuleLimit: number,
  addedAt: string,
  quantity: number = 1
): LineItem {
  return {
    id,
    productId: 'prod-custom-box-gen1-50',
    productType: { typeId: 'product-type', id: 'pt-custom-box' },
    name: { 'en-US': `Custom Box (${capsuleLimit} caps)` },
    variant: {
      id: 1,
      sku: 'CUSTOM-BOX-GEN1-50',
      attributes: [
        { name: 'capsule-limit', value: capsuleLimit },
        { name: 'generation', value: { key: 'gen1', label: 'Gen1' } },
      ],
    },
    price: {
      id: 'price-box',
      value: { type: 'centPrecision', currencyCode: 'EUR', centAmount: 100, fractionDigits: 2 },
    },
    quantity,
    discountedPricePerQuantity: [],
    perMethodTaxRate: [],
    addedAt,
    lastModifiedAt: addedAt,
    state: [],
    priceMode: 'Platform',
    lineItemMode: 'Standard',
    totalPrice: { type: 'centPrecision', currencyCode: 'EUR', centAmount: 100, fractionDigits: 2 },
  } as unknown as LineItem;
}

function makePickAndMixSelection(
  id: string,
  sku: string,
  boxContentCount: number,
  quantity: number = 1
): LineItem {
  return {
    id,
    productId: `prod-${sku}`,
    productType: { typeId: 'product-type', id: 'pt-box' },
    name: { 'en-US': sku },
    variant: {
      id: 1,
      sku,
      attributes: [
        { name: 'box-type', value: { key: 'pick-and-mix', label: 'Pick and Mix' } },
        { name: 'box-content-count', value: boxContentCount },
        { name: 'generation', value: { key: 'gen1', label: 'Gen1' } },
      ],
    },
    price: {
      id: 'price-sel',
      value: { type: 'centPrecision', currencyCode: 'EUR', centAmount: 799, fractionDigits: 2 },
    },
    quantity,
    discountedPricePerQuantity: [],
    perMethodTaxRate: [],
    addedAt: '2024-01-02T00:00:00.000Z',
    lastModifiedAt: '2024-01-02T00:00:00.000Z',
    state: [],
    priceMode: 'Platform',
    lineItemMode: 'Standard',
    totalPrice: { type: 'centPrecision', currencyCode: 'EUR', centAmount: 799, fractionDigits: 2 },
  } as unknown as LineItem;
}

// ─── checkCompatibility tests ─────────────────────────────────────────────────

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

// ─── buildCustomBoxAssignments tests ─────────────────────────────────────────

describe('buildCustomBoxAssignments', () => {
  describe('no selections in cart', () => {
    it('returns empty result when cart has only a custom box and no selections', () => {
      const box = makeCustomBoxLineItem('box-1', 50, '2024-01-01T00:00:00.000Z');
      const result = buildCustomBoxAssignments(makeCart([box]));
      expect(result.fieldValuesByLineItemId.size).toBe(0);
      expect(result.addBoxAction).toBeNull();
    });

    it('returns empty result for a completely empty cart', () => {
      const result = buildCustomBoxAssignments(makeCart());
      expect(result.fieldValuesByLineItemId.size).toBe(0);
      expect(result.addBoxAction).toBeNull();
    });

    it('returns empty result when there are selections but no custom box at all', () => {
      const sel = makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 5);
      const result = buildCustomBoxAssignments(makeCart([sel]));
      // No box to assign to → empty (addBoxAction is null because there's no firstBox to reference)
      expect(result.addBoxAction).toBeNull();
    });
  });

  describe('single custom box, single-pod selections', () => {
    it('assigns a single selection to the box and sets capsule total', () => {
      const box = makeCustomBoxLineItem('box-1', 50, '2024-01-01T00:00:00.000Z');
      const sel = makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 5);
      const result = buildCustomBoxAssignments(makeCart([box, sel]));

      expect(result.addBoxAction).toBeNull();
      expect(result.fieldValuesByLineItemId.get('sel-1')?.assignedBoxId).toBe('box-1');
      expect(result.fieldValuesByLineItemId.get('box-1')?.boxSelectionIds).toEqual(['sel-1']);
      expect(result.fieldValuesByLineItemId.get('box-1')?.boxCapsuleTotal).toBe(5);
    });

    it('assigns multiple selections to the same box when they all fit', () => {
      const box = makeCustomBoxLineItem('box-1', 50, '2024-01-01T00:00:00.000Z');
      const sel1 = makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 20);
      const sel2 = makePickAndMixSelection('sel-2', 'BOX-GEN1-LUNGO-FORTE-16', 1, 10);
      const result = buildCustomBoxAssignments(makeCart([box, sel1, sel2]));

      expect(result.addBoxAction).toBeNull();
      const boxFields = result.fieldValuesByLineItemId.get('box-1');
      expect(boxFields?.boxSelectionIds).toHaveLength(2);
      expect(boxFields?.boxSelectionIds).toContain('sel-1');
      expect(boxFields?.boxSelectionIds).toContain('sel-2');
      expect(boxFields?.boxCapsuleTotal).toBe(30);
    });

    it('fills exactly to the capsule limit without triggering addBoxAction', () => {
      const box = makeCustomBoxLineItem('box-1', 10, '2024-01-01T00:00:00.000Z');
      const sel = makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 10);
      const result = buildCustomBoxAssignments(makeCart([box, sel]));

      expect(result.addBoxAction).toBeNull();
      expect(result.fieldValuesByLineItemId.get('box-1')?.boxCapsuleTotal).toBe(10);
    });
  });

  describe('dual-pod selections (box-content-count: 2)', () => {
    it('counts dual-pod slots as 2 per unit', () => {
      const box = makeCustomBoxLineItem('box-1', 50, '2024-01-01T00:00:00.000Z');
      const sel = makePickAndMixSelection('sel-1', 'BOX-GEN1-LATTE-MACCHIATO-8', 2, 10);
      const result = buildCustomBoxAssignments(makeCart([box, sel]));

      expect(result.addBoxAction).toBeNull();
      expect(result.fieldValuesByLineItemId.get('box-1')?.boxCapsuleTotal).toBe(20);
    });

    it('handles mixed single-pod and dual-pod selections correctly', () => {
      const box = makeCustomBoxLineItem('box-1', 50, '2024-01-01T00:00:00.000Z');
      const esp = makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 20); // 20 slots
      const lat = makePickAndMixSelection('sel-2', 'BOX-GEN1-LATTE-MACCHIATO-8', 2, 10); // 20 slots
      const lun = makePickAndMixSelection('sel-3', 'BOX-GEN1-LUNGO-FORTE-16', 1, 10);   // 10 slots
      const result = buildCustomBoxAssignments(makeCart([box, esp, lat, lun]));

      expect(result.addBoxAction).toBeNull();
      expect(result.fieldValuesByLineItemId.get('box-1')?.boxCapsuleTotal).toBe(50);
      expect(result.fieldValuesByLineItemId.get('box-1')?.boxSelectionIds).toHaveLength(3);
    });
  });

  describe('overflow — requesting a new box', () => {
    it('returns an addLineItem action when a selection would overflow the only box', () => {
      const box = makeCustomBoxLineItem('box-1', 10, '2024-01-01T00:00:00.000Z');
      const sel1 = makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 10); // fills box
      const sel2 = makePickAndMixSelection('sel-2', 'BOX-GEN1-LUNGO-FORTE-16', 1, 1);     // overflows
      const result = buildCustomBoxAssignments(makeCart([box, sel1, sel2]));

      expect(result.addBoxAction).not.toBeNull();
      expect((result.addBoxAction as Record<string, unknown>).action).toBe('addLineItem');
      expect((result.addBoxAction as Record<string, unknown>).sku).toBe('CUSTOM-BOX-GEN1-50');
    });

    it('returns only the addLineItem action on overflow (no field-setting actions)', () => {
      const box = makeCustomBoxLineItem('box-1', 5, '2024-01-01T00:00:00.000Z');
      const sel = makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 10); // 10 > 5
      const result = buildCustomBoxAssignments(makeCart([box, sel]));

      expect(result.addBoxAction).not.toBeNull();
      expect(result.fieldValuesByLineItemId.size).toBe(0);
    });

    it('does not overflow when a selection fits exactly in remaining capacity', () => {
      const box = makeCustomBoxLineItem('box-1', 50, '2024-01-01T00:00:00.000Z');
      const sel1 = makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 40);
      const sel2 = makePickAndMixSelection('sel-2', 'BOX-GEN1-LUNGO-FORTE-16', 1, 10); // 40+10=50 exact
      const result = buildCustomBoxAssignments(makeCart([box, sel1, sel2]));

      expect(result.addBoxAction).toBeNull();
      expect(result.fieldValuesByLineItemId.get('box-1')?.boxCapsuleTotal).toBe(50);
    });
  });

  describe('multiple custom boxes (spill-over)', () => {
    it('spills selections to the second box when first is full', () => {
      const box1 = makeCustomBoxLineItem('box-1', 10, '2024-01-01T00:00:00.000Z');
      const box2 = makeCustomBoxLineItem('box-2', 10, '2024-01-02T00:00:00.000Z');
      const sel1 = makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 10); // fills box1
      const sel2 = makePickAndMixSelection('sel-2', 'BOX-GEN1-LUNGO-FORTE-16', 1, 5);     // goes to box2
      const result = buildCustomBoxAssignments(makeCart([box1, box2, sel1, sel2]));

      expect(result.addBoxAction).toBeNull();
      expect(result.fieldValuesByLineItemId.get('sel-1')?.assignedBoxId).toBe('box-1');
      expect(result.fieldValuesByLineItemId.get('sel-2')?.assignedBoxId).toBe('box-2');
      expect(result.fieldValuesByLineItemId.get('box-1')?.boxCapsuleTotal).toBe(10);
      expect(result.fieldValuesByLineItemId.get('box-2')?.boxCapsuleTotal).toBe(5);
    });

    it('fills boxes in addedAt order regardless of lineItems array order', () => {
      // boxNewer appears first in the array but has a later addedAt → should be filled second
      const boxNewer = makeCustomBoxLineItem('box-newer', 10, '2024-01-03T00:00:00.000Z');
      const boxOlder = makeCustomBoxLineItem('box-older', 10, '2024-01-01T00:00:00.000Z');
      const sel = makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 5);
      const result = buildCustomBoxAssignments(makeCart([boxNewer, boxOlder, sel]));

      expect(result.fieldValuesByLineItemId.get('sel-1')?.assignedBoxId).toBe('box-older');
    });
  });

  describe('no-op when values are already current', () => {
    it('emits no actions when assigned IDs and totals already match custom fields', () => {
      const box = {
        ...makeCustomBoxLineItem('box-1', 50, '2024-01-01T00:00:00.000Z'),
        custom: {
          type: { typeId: 'type', id: 'type-1' },
          fields: {
            'box-selection-ids': ['sel-1'],
            'box-capsule-total': 5,
          },
        },
      } as unknown as LineItem;
      const sel = {
        ...makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 5),
        custom: {
          type: { typeId: 'type', id: 'type-1' },
          fields: { 'assigned-box-line-item-id': 'box-1' },
        },
      } as unknown as LineItem;
      const result = buildCustomBoxAssignments(makeCart([box, sel]));

      expect(result.fieldValuesByLineItemId.size).toBe(0);
      expect(result.addBoxAction).toBeNull();
    });

    it('emits actions only for changed fields when one field drifts', () => {
      // Box has correct selection IDs but stale capsule total
      const box = {
        ...makeCustomBoxLineItem('box-1', 50, '2024-01-01T00:00:00.000Z'),
        custom: {
          type: { typeId: 'type', id: 'type-1' },
          fields: {
            'box-selection-ids': ['sel-1'],
            'box-capsule-total': 99, // stale — actual is 5
          },
        },
      } as unknown as LineItem;
      const sel = {
        ...makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 5),
        custom: {
          type: { typeId: 'type', id: 'type-1' },
          fields: { 'assigned-box-line-item-id': 'box-1' },
        },
      } as unknown as LineItem;
      const result = buildCustomBoxAssignments(makeCart([box, sel]));

      const boxFields = result.fieldValuesByLineItemId.get('box-1');
      expect(boxFields?.boxCapsuleTotal).toBe(5);
      // Selection assignment is unchanged → no entry for sel-1
      expect(result.fieldValuesByLineItemId.has('sel-1')).toBe(false);
    });
  });

  describe('qty > 1 custom box — overflow recovery after addLineItem increments quantity', () => {
    it('treats a qty=2 custom box as having doubled capacity (100 slots)', () => {
      // Simulates the state AFTER overflow: the extension returned addLineItem,
      // which incremented the custom box qty from 1 to 2.
      // Capacity = 50 × 2 = 100; total selections = 60 → all fit, no addBoxAction.
      const box = makeCustomBoxLineItem('box-1', 50, '2024-01-01T00:00:00.000Z', 2);
      const esp = makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 30); // 30 slots
      const lat = makePickAndMixSelection('sel-2', 'BOX-GEN1-LATTE-MACCHIATO-8', 2, 10); // 20 slots
      const lun = makePickAndMixSelection('sel-3', 'BOX-GEN1-LUNGO-FORTE-16', 1, 10);   // 10 slots
      const result = buildCustomBoxAssignments(makeCart([box, esp, lat, lun]));

      expect(result.addBoxAction).toBeNull();
      expect(result.fieldValuesByLineItemId.get('box-1')?.boxCapsuleTotal).toBe(60);
      expect(result.fieldValuesByLineItemId.get('box-1')?.boxSelectionIds).toHaveLength(3);
      expect(result.fieldValuesByLineItemId.get('sel-1')?.assignedBoxId).toBe('box-1');
      expect(result.fieldValuesByLineItemId.get('sel-2')?.assignedBoxId).toBe('box-1');
      expect(result.fieldValuesByLineItemId.get('sel-3')?.assignedBoxId).toBe('box-1');
    });

    it('still returns addBoxAction when selections exceed doubled capacity', () => {
      const box = makeCustomBoxLineItem('box-1', 50, '2024-01-01T00:00:00.000Z', 2); // 100 slots
      const sel1 = makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 60); // 60 slots
      const sel2 = makePickAndMixSelection('sel-2', 'BOX-GEN1-LUNGO-FORTE-16', 1, 50);     // 50 → total 110 > 100
      const result = buildCustomBoxAssignments(makeCart([box, sel1, sel2]));

      expect(result.addBoxAction).not.toBeNull();
      expect(result.fieldValuesByLineItemId.size).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('returns addBoxAction when selection cost exceeds single-unit box capacity', () => {
      // qty 60 × 1-slot capsule = 60 slots; single box (qty=1) has limit 50 → overflow.
      // On the next extension call, addLineItem makes qty=2 → capacity=100 → all fit.
      const box = makeCustomBoxLineItem('box-1', 50, '2024-01-01T00:00:00.000Z');
      const sel = makePickAndMixSelection('sel-1', 'BOX-GEN1-ESPRESSO-MILANO-16', 1, 60);
      const result = buildCustomBoxAssignments(makeCart([box, sel]));

      expect((result.addBoxAction as Record<string, unknown> | null)?.action ?? null).toBe('addLineItem');
    });

    it('getBoxContentCount defaults to 1 for a selection without the attribute', () => {
      // A line item without box-content-count — treated as 1-slot capsule
      const box = makeCustomBoxLineItem('box-1', 50, '2024-01-01T00:00:00.000Z');
      const selNoCount = {
        ...makePickAndMixSelection('sel-1', 'BOX-GEN1-UNKNOWN', 1, 5),
        variant: {
          id: 1,
          sku: 'BOX-GEN1-UNKNOWN',
          // box-type present so isPickAndMixSelection returns true, but no box-content-count
          attributes: [
            { name: 'box-type', value: { key: 'pick-and-mix', label: 'Pick and Mix' } },
          ],
        },
      } as unknown as LineItem;
      const result = buildCustomBoxAssignments(makeCart([box, selNoCount]));

      // default box-content-count of 1, qty 5 → 5 slots
      expect(result.fieldValuesByLineItemId.get('box-1')?.boxCapsuleTotal).toBe(5);
    });
  });
});
