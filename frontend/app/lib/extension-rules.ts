/**
 * Mirror of service/src/rules.ts — keep in sync when changing compatibility logic.
 * Used by the frontend extension handler (/api/extension/cart-compatibility).
 */
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

function getGeneration(lineItem: LineItem): string | null {
  const gen = getAttr(lineItem.variant?.attributes ?? [], 'generation') as
    | { key: string }
    | undefined;
  return gen?.key ?? null;
}

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

  const compatible = new Set<string>();
  if (isGen1) {
    compatible.add('gen1');
    if (hasAdapter) compatible.add('gen1.5');
  }
  if (isGen2) {
    compatible.add('gen2');
    compatible.add('gen1.5');
  }
  if (isGen25) {
    compatible.add('gen2-5');
    compatible.add('gen2');
  }

  return capsuleItems.map((li) => {
    const gen = getGeneration(li)!;
    const name = getItemName(li);

    if (!customer) {
      return {
        lineItemId: li.id,
        warning:
          "You don't have a compatible machine for this product. " +
          'Please sign in to verify your machine compatibility.',
      };
    }

    if (compatible.size === 0) {
      return {
        lineItemId: li.id,
        warning:
          'No compatible machine found on your account. Please update your machine profile.',
      };
    }

    if (compatible.has(gen)) {
      return { lineItemId: li.id, warning: null };
    }

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

    return {
      lineItemId: li.id,
      warning: `${name} is designed for Gen1 machines and is not compatible with your NEO machine.`,
    };
  });
}

// ─── Exported: Custom box assignment ─────────────────────────────────────────

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

  const gen1Result = assignGroupToBoxes(gen1Boxes, gen1Selections, lineItems);
  if (gen1Result.addBoxAction) return gen1Result;

  const neoResult = assignGroupToBoxes(neoBoxes, neoSelections, lineItems);
  if (neoResult.addBoxAction) return neoResult;

  const gen25Result = assignGroupToBoxes(gen25Boxes, gen25Selections, lineItems);
  if (gen25Result.addBoxAction) return gen25Result;

  const merged = new Map<string, CustomBoxFieldValues>();
  gen1Result.fieldValuesByLineItemId.forEach((v, k) => merged.set(k, v));
  neoResult.fieldValuesByLineItemId.forEach((v, k) => merged.set(k, v));
  gen25Result.fieldValuesByLineItemId.forEach((v, k) => merged.set(k, v));
  return { fieldValuesByLineItemId: merged, addBoxAction: null };
}
