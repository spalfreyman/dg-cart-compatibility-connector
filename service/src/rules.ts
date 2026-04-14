import type { Cart, Customer, LineItem } from '@commercetools/platform-sdk';

const NEO_MACHINE_SKU_PREFIX = 'MACH-NEO-';
const NEO_ADAPTER_SKU = 'neo-adapter';

// ─── Custom type / field name constants ──────────────────────────────────────
export const CART_TYPE_KEY = 'cart-compatibility';
export const BOX_SELECTION_IDS_FIELD = 'box-selection-ids';
export const BOX_CAPSULE_TOTAL_FIELD = 'box-capsule-total';
export const ASSIGNED_BOX_FIELD = 'assigned-box-line-item-id';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface LineItemWarning {
  lineItemId: string;
  warning: string | null;
}

export interface CustomBoxFieldValues {
  boxSelectionIds?: string[];
  boxCapsuleTotal?: number;
  assignedBoxId?: string | null;
}

export interface CustomBoxResult {
  fieldValuesByLineItemId: Map<string, CustomBoxFieldValues>;
  addBoxAction: object | null;
}

// ─── Shared attribute helper ──────────────────────────────────────────────────

function getAttr(
  attributes: { name: string; value: unknown }[] = [],
  name: string
): unknown {
  return attributes.find((a) => a.name === name)?.value;
}

// ─── NEO compatibility helpers ────────────────────────────────────────────────

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

// ─── Custom box helpers ───────────────────────────────────────────────────────

function isCustomBox(lineItem: LineItem): boolean {
  return getAttr(lineItem.variant?.attributes ?? [], 'capsule-limit') !== undefined;
}

function isPickAndMixSelection(lineItem: LineItem): boolean {
  const bt = getAttr(lineItem.variant?.attributes ?? [], 'box-type') as
    | { key: string }
    | undefined;
  return bt?.key === 'pick-and-mix';
}

function getBoxContentCount(lineItem: LineItem): number {
  return (
    (getAttr(lineItem.variant?.attributes ?? [], 'box-content-count') as
      | number
      | undefined) ?? 1
  );
}

function getCapsuleLimit(lineItem: LineItem): number {
  return (
    (getAttr(lineItem.variant?.attributes ?? [], 'capsule-limit') as
      | number
      | undefined) ?? 0
  );
}

// ─── Exported: Top-Three lookup ───────────────────────────────────────────────

/**
 * Returns the set of product IDs in the customer's Top-Three field.
 */
export function getTopThreeProductIds(customer: Customer | null): Set<string> {
  if (!customer?.custom?.fields?.['Top-Three']) return new Set();
  const refs = customer.custom.fields['Top-Three'] as Array<{ id: string }>;
  return new Set(refs.map((ref) => ref.id));
}

// ─── Exported: NEO compatibility check ───────────────────────────────────────

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

// ─── Exported: Custom box assignment ─────────────────────────────────────────

/**
 * Assigns pick-and-mix selection line items to custom box line items.
 *
 * Each custom box has a capsule-limit. Selections are assigned greedily
 * oldest-box-first. When a selection won't fit in any existing box, an
 * addLineItem action is returned so the caller can add another box; field
 * assignments are deferred to the next extension call.
 *
 * Returns empty result (no actions, no addBoxAction) when there are no
 * pick-and-mix selections in the cart.
 */
export function buildCustomBoxAssignments(cart: Cart): CustomBoxResult {
  const lineItems = cart.lineItems ?? [];

  const customBoxes = lineItems.filter(isCustomBox);
  const selections = lineItems.filter(isPickAndMixSelection);

  const emptyResult: CustomBoxResult = {
    fieldValuesByLineItemId: new Map(),
    addBoxAction: null,
  };

  if (selections.length === 0) return emptyResult;

  // Sort boxes oldest-first (fill order)
  const sortedBoxes = [...customBoxes].sort(
    (a, b) =>
      new Date(a.addedAt ?? 0).getTime() - new Date(b.addedAt ?? 0).getTime()
  );

  // boxAssignments: box lineItem.id → assigned selection lineItem IDs
  const boxAssignments = new Map<string, string[]>(
    sortedBoxes.map((b) => [b.id, []])
  );
  // selectionBoxMap: selection lineItem.id → assigned box lineItem.id
  const selectionBoxMap = new Map<string, string>();

  let currentBoxIndex = 0;
  let runningTotal = 0;

  for (const selection of selections) {
    const cost = selection.quantity * getBoxContentCount(selection);

    // Advance past full boxes
    while (currentBoxIndex < sortedBoxes.length) {
      const box = sortedBoxes[currentBoxIndex];
      const limit = getCapsuleLimit(box);
      if (runningTotal + cost <= limit) break;
      currentBoxIndex++;
      runningTotal = 0;
    }

    if (currentBoxIndex >= sortedBoxes.length) {
      // No box has capacity — request another be added (same product/variant as first box)
      const firstBox = sortedBoxes[0];
      if (!firstBox) return emptyResult; // no custom box in cart at all
      return {
        fieldValuesByLineItemId: new Map(),
        addBoxAction: {
          action: 'addLineItem',
          sku: firstBox.variant?.sku,
          quantity: 1,
        },
      };
    }

    const currentBox = sortedBoxes[currentBoxIndex];
    boxAssignments.get(currentBox.id)!.push(selection.id);
    selectionBoxMap.set(selection.id, currentBox.id);
    runningTotal += cost;
  }

  // Build per-line-item field value diffs
  const fieldValuesByLineItemId = new Map<string, CustomBoxFieldValues>();

  for (const box of sortedBoxes) {
    const assignedIds = boxAssignments.get(box.id) ?? [];
    const capsuleTotal = assignedIds.reduce((sum, selId) => {
      const sel = lineItems.find((li) => li.id === selId)!;
      return sum + sel.quantity * getBoxContentCount(sel);
    }, 0);

    const currentSelectionIds = (
      box.custom?.fields?.[BOX_SELECTION_IDS_FIELD] as string[] | undefined
    ) ?? [];
    const currentCapsuleTotal =
      (box.custom?.fields?.[BOX_CAPSULE_TOTAL_FIELD] as number | undefined) ?? 0;

    const selectionIdsChanged =
      JSON.stringify([...assignedIds].sort()) !==
      JSON.stringify([...currentSelectionIds].sort());
    const capsuleTotalChanged = capsuleTotal !== currentCapsuleTotal;

    if (selectionIdsChanged || capsuleTotalChanged) {
      const vals: CustomBoxFieldValues = {};
      if (selectionIdsChanged) vals.boxSelectionIds = assignedIds;
      if (capsuleTotalChanged) vals.boxCapsuleTotal = capsuleTotal;
      fieldValuesByLineItemId.set(box.id, vals);
    }
  }

  for (const selection of selections) {
    const assignedBoxId = selectionBoxMap.get(selection.id) ?? null;
    const currentBoxId =
      (selection.custom?.fields?.[ASSIGNED_BOX_FIELD] as string | undefined) ??
      null;

    if (assignedBoxId !== currentBoxId) {
      fieldValuesByLineItemId.set(selection.id, { assignedBoxId });
    }
  }

  return { fieldValuesByLineItemId, addBoxAction: null };
}
