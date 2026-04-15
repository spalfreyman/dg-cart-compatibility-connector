import type { Cart, Customer, LineItem } from '@commercetools/platform-sdk';

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

// ─── Compatibility helpers ────────────────────────────────────────────────────

/**
 * Returns the generation key ('gen1', 'gen1.5', 'gen2') from a line item, or null.
 */
function getGeneration(lineItem: LineItem): string | null {
  const gen = getAttr(lineItem.variant?.attributes ?? [], 'generation') as
    | { key: string }
    | undefined;
  return gen?.key ?? null;
}

/**
 * Returns true for items that need compatibility checking — capsule boxes
 * (have box-type or capsule-limit attribute) with a generation assigned.
 * Machines, adapters, and untyped products are excluded.
 */
function isCapsuleItem(lineItem: LineItem): boolean {
  const attrs = lineItem.variant?.attributes ?? [];
  const hasBoxType = attrs.some((a) => a.name === 'box-type');
  const hasCapsuleLimit = attrs.some((a) => a.name === 'capsule-limit');
  return (hasBoxType || hasCapsuleLimit) && getGeneration(lineItem) !== null;
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
  const limitPerUnit =
    (getAttr(lineItem.variant?.attributes ?? [], 'capsule-limit') as
      | number
      | undefined) ?? 0;
  return limitPerUnit * lineItem.quantity;
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

// ─── Exported: Compatibility check ───────────────────────────────────────────

/**
 * Compatibility rules (per customer machine profile):
 *   is-gen1 = true                         → can buy generation=gen1
 *   is-gen2 = true                         → can buy generation=gen2, gen1.5
 *   is-gen1 = true  +  has-neo-adapter     → can also buy generation=gen1.5
 *   is-gen2-latte = true                   → can buy generation=gen2-5, gen2 ONLY
 *
 * Returns one entry per capsule line item (box-type or capsule-limit present).
 * warning=null means compatible and clears any stale warning.
 * Returns [] if the cart contains no capsule items.
 */
export function checkCompatibility(
  cart: Cart,
  customer: Customer | null
): LineItemWarning[] {
  const lineItems = cart.lineItems ?? [];
  const capsuleItems = lineItems.filter(isCapsuleItem);

  if (capsuleItems.length === 0) return [];

  const fields = (customer?.custom?.fields ?? {}) as Record<string, unknown>;
  const isGen1 = fields['is-gen1'] === true;
  const isGen2 = fields['is-gen2'] === true;
  const isGen25 = fields['is-gen2-latte'] === true;
  const profileHasAdapter = fields['has-neo-adapter'] === true;
  const adapterInCart = cartHasNeoAdapter(lineItems);
  const hasAdapter = profileHasAdapter || adapterInCart;

  // Build the set of compatible generation keys for this customer
  const compatible = new Set<string>();
  if (isGen1) {
    compatible.add('gen1');
    if (hasAdapter) compatible.add('gen1.5');
  }
  if (isGen2) {
    compatible.add('gen2');
    compatible.add('gen1.5'); // gen2 machines are backwards-compatible with gen1.5 capsules
  }
  if (isGen25) {
    compatible.add('gen2-5');
    compatible.add('gen2'); // gen2.5 machines are backwards-compatible with gen2 capsules
    // NOT gen1.5 — gen2.5 machines do not support gen1.5 capsules
  }

  return capsuleItems.map((li) => {
    const gen = getGeneration(li)!;
    const name = getItemName(li);

    // Anonymous — cannot verify machine
    if (!customer) {
      return {
        lineItemId: li.id,
        warning:
          "You don't have a compatible machine for this product. " +
          'Please sign in to verify your machine compatibility.',
      };
    }

    // Logged in but no machine on profile
    if (compatible.size === 0) {
      return {
        lineItemId: li.id,
        warning:
          'No compatible machine found on your account. Please update your machine profile.',
      };
    }

    // Compatible — clear any stale warning
    if (compatible.has(gen)) {
      return { lineItemId: li.id, warning: null };
    }

    // Incompatible — specific messages per generation mismatch
    if (gen === 'gen2-5') {
      return {
        lineItemId: li.id,
        warning: `${name} requires a NEO Latte (Gen 2.5) machine.`,
      };
    }

    if (gen === 'gen2') {
      return {
        lineItemId: li.id,
        warning: `${name} requires a NEO machine and is not compatible with your Gen1 machine.`,
      };
    }

    if (gen === 'gen1.5') {
      if (isGen25) {
        return {
          lineItemId: li.id,
          warning: `${name} is not compatible with your NEO Latte machine.`,
        };
      }
      return {
        lineItemId: li.id,
        warning: `${name} requires the Neo Adapter accessory on a Gen1 machine.`,
      };
    }

    // gen1 product — not compatible with NEO or NEO Latte machine
    return {
      lineItemId: li.id,
      warning: `${name} is designed for Gen1 machines and is not compatible with your NEO machine.`,
    };
  });
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
/**
 * Runs the greedy fill algorithm for a single generation group of boxes and
 * selections. Boxes and selections must already be filtered to the same
 * generation before calling.
 */
function assignGroupToBoxes(
  boxes: LineItem[],
  selections: LineItem[],
  allLineItems: LineItem[]
): CustomBoxResult {
  const emptyResult: CustomBoxResult = {
    fieldValuesByLineItemId: new Map(),
    addBoxAction: null,
  };

  if (selections.length === 0) return emptyResult;

  const sortedBoxes = [...boxes].sort(
    (a, b) =>
      new Date(a.addedAt ?? 0).getTime() - new Date(b.addedAt ?? 0).getTime()
  );

  const boxAssignments = new Map<string, string[]>(
    sortedBoxes.map((b) => [b.id, []])
  );
  const selectionBoxMap = new Map<string, string>();

  let currentBoxIndex = 0;
  let runningTotal = 0;

  for (const selection of selections) {
    const cost = selection.quantity * getBoxContentCount(selection);

    while (currentBoxIndex < sortedBoxes.length) {
      const box = sortedBoxes[currentBoxIndex];
      const limit = getCapsuleLimit(box);
      if (runningTotal + cost <= limit) break;
      currentBoxIndex++;
      runningTotal = 0;
    }

    if (currentBoxIndex >= sortedBoxes.length) {
      const firstBox = sortedBoxes[0];
      if (!firstBox) return emptyResult;
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

  const fieldValuesByLineItemId = new Map<string, CustomBoxFieldValues>();

  for (const box of sortedBoxes) {
    const assignedIds = boxAssignments.get(box.id) ?? [];
    const capsuleTotal = assignedIds.reduce((sum, selId) => {
      const sel = allLineItems.find((li) => li.id === selId)!;
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

export function buildCustomBoxAssignments(cart: Cart): CustomBoxResult {
  const lineItems = cart.lineItems ?? [];

  const allCustomBoxes = lineItems.filter(isCustomBox);
  const allSelections = lineItems.filter(isPickAndMixSelection);

  const emptyResult: CustomBoxResult = {
    fieldValuesByLineItemId: new Map(),
    addBoxAction: null,
  };

  if (allSelections.length === 0) return emptyResult;

  // Split by generation group:
  //   gen1  — classic capsules (null-generation items default here)
  //   neo   — gen2 and gen1.5 capsules (NEO machine / NEO machine + adapter)
  //   gen25 — gen2-5 capsules (NEO Latte / Gen 2.5 machine only)
  const isNeoGen = (gen: string | null) => gen === 'gen2' || gen === 'gen1.5';
  const isGen25Gen = (gen: string | null) => gen === 'gen2-5';

  const gen1Boxes = allCustomBoxes.filter(
    (b) => !isNeoGen(getGeneration(b)) && !isGen25Gen(getGeneration(b))
  );
  const neoBoxes = allCustomBoxes.filter((b) => isNeoGen(getGeneration(b)));
  const gen25Boxes = allCustomBoxes.filter((b) => isGen25Gen(getGeneration(b)));

  const gen1Selections = allSelections.filter(
    (s) => !isNeoGen(getGeneration(s)) && !isGen25Gen(getGeneration(s))
  );
  const neoSelections = allSelections.filter((s) => isNeoGen(getGeneration(s)));
  const gen25Selections = allSelections.filter((s) => isGen25Gen(getGeneration(s)));

  // Process each generation group; return immediately if a new box is needed
  const gen1Result = assignGroupToBoxes(gen1Boxes, gen1Selections, lineItems);
  if (gen1Result.addBoxAction) return gen1Result;

  const neoResult = assignGroupToBoxes(neoBoxes, neoSelections, lineItems);
  if (neoResult.addBoxAction) return neoResult;

  const gen25Result = assignGroupToBoxes(gen25Boxes, gen25Selections, lineItems);
  if (gen25Result.addBoxAction) return gen25Result;

  // Merge field-value maps from all groups
  const merged = new Map<string, CustomBoxFieldValues>([
    ...gen1Result.fieldValuesByLineItemId,
    ...neoResult.fieldValuesByLineItemId,
    ...gen25Result.fieldValuesByLineItemId,
  ]);
  return { fieldValuesByLineItemId: merged, addBoxAction: null };
}
