import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import type { Cart, Customer } from '@commercetools/platform-sdk';
import { apiRoot } from '@/app/lib/ctp-client';
import {
  checkCompatibility,
  getTopThreeProductIds,
  buildCustomBoxAssignments,
  CART_TYPE_KEY,
  BOX_SELECTION_IDS_FIELD,
  BOX_CAPSULE_TOTAL_FIELD,
  ASSIGNED_BOX_FIELD,
  type LineItemWarning,
  type CustomBoxResult,
} from '@/app/lib/extension-rules';

const WARNING_FIELD = 'compatibility-warning';
const TOP_THREE_FIELD = 'most-consumed-item';

export async function POST(request: NextRequest) {
  try {
    // Timing-safe auth check
    const authHeader = request.headers.get('authorization') ?? '';
    const expected = `Bearer ${process.env.EXTENSION_SECRET ?? ''}`;
    const maxLen = Math.max(authHeader.length, expected.length);
    const a = Buffer.alloc(maxLen, 0);
    const b = Buffer.alloc(maxLen, 0);
    Buffer.from(authHeader).copy(a);
    Buffer.from(expected).copy(b);
    if (!crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const cart = body?.resource?.obj as Cart | undefined;
    if (!cart) {
      return NextResponse.json({ actions: [] });
    }

    let customer: Customer | null = null;
    if (cart.customerId) {
      try {
        const result = await apiRoot
          .customers()
          .withId({ ID: cart.customerId })
          .get()
          .execute();
        customer = result.body;
      } catch {
        customer = null;
      }
    }

    const lineItemWarnings = checkCompatibility(cart, customer);
    const topThreeProductIds = getTopThreeProductIds(customer);
    const customBoxResult = buildCustomBoxAssignments(cart);
    const actions = buildActions(cart, lineItemWarnings, topThreeProductIds, customBoxResult);

    return NextResponse.json({ actions });
  } catch (error) {
    console.error('[extension/cart-compatibility]', error);
    // Soft failure — never block cart operations
    return NextResponse.json({ actions: [] });
  }
}

function buildActions(
  cart: Cart,
  lineItemWarnings: LineItemWarning[],
  topThreeProductIds: Set<string>,
  customBoxResult: CustomBoxResult
): object[] {
  if (customBoxResult.addBoxAction) {
    return [customBoxResult.addBoxAction];
  }

  const warningMap = new Map(lineItemWarnings.map((w) => [w.lineItemId, w.warning]));
  const { fieldValuesByLineItemId } = customBoxResult;

  return cart.lineItems.flatMap((lineItem): object[] => {
    const warning = warningMap.get(lineItem.id) ?? null;
    const mostConsumed = lineItem.productId ? topThreeProductIds.has(lineItem.productId) : false;
    const boxFields = fieldValuesByLineItemId.get(lineItem.id);

    const currentWarning = lineItem.custom?.fields?.[WARNING_FIELD] as string | null | undefined;
    const currentMostConsumed = lineItem.custom?.fields?.[TOP_THREE_FIELD] as boolean | undefined;
    const hasType = !!lineItem.custom?.type;

    const newSelectionIds = boxFields?.boxSelectionIds;
    const newCapsuleTotal = boxFields?.boxCapsuleTotal;
    const newAssignedBoxId = boxFields?.assignedBoxId;

    const selectionIdsChanged = newSelectionIds !== undefined;
    const capsuleTotalChanged = newCapsuleTotal !== undefined;
    const assignedBoxIdChanged = newAssignedBoxId !== undefined;

    const hasAnyChange =
      warning !== null ||
      mostConsumed ||
      currentWarning != null ||
      currentMostConsumed ||
      selectionIdsChanged ||
      capsuleTotalChanged ||
      assignedBoxIdChanged;

    if (!hasAnyChange) return [];

    if (!hasType) {
      const fields: Record<string, unknown> = {};
      if (warning !== null) fields[WARNING_FIELD] = warning;
      if (mostConsumed) fields[TOP_THREE_FIELD] = true;
      if (newSelectionIds !== undefined) fields[BOX_SELECTION_IDS_FIELD] = newSelectionIds;
      if (newCapsuleTotal !== undefined) fields[BOX_CAPSULE_TOTAL_FIELD] = newCapsuleTotal;
      if (newAssignedBoxId != null) fields[ASSIGNED_BOX_FIELD] = newAssignedBoxId;
      if (Object.keys(fields).length === 0) return [];
      return [{
        action: 'setLineItemCustomType',
        lineItemId: lineItem.id,
        type: { key: CART_TYPE_KEY, typeId: 'type' },
        fields,
      }];
    }

    const actions: object[] = [];

    if (warning !== null) {
      actions.push({ action: 'setLineItemCustomField', lineItemId: lineItem.id, name: WARNING_FIELD, value: warning });
    } else if (currentWarning != null) {
      actions.push({ action: 'setLineItemCustomField', lineItemId: lineItem.id, name: WARNING_FIELD, value: null });
    }

    if (mostConsumed && !currentMostConsumed) {
      actions.push({ action: 'setLineItemCustomField', lineItemId: lineItem.id, name: TOP_THREE_FIELD, value: true });
    } else if (!mostConsumed && currentMostConsumed) {
      actions.push({ action: 'setLineItemCustomField', lineItemId: lineItem.id, name: TOP_THREE_FIELD, value: null });
    }

    if (selectionIdsChanged) {
      actions.push({ action: 'setLineItemCustomField', lineItemId: lineItem.id, name: BOX_SELECTION_IDS_FIELD, value: newSelectionIds });
    }
    if (capsuleTotalChanged) {
      actions.push({ action: 'setLineItemCustomField', lineItemId: lineItem.id, name: BOX_CAPSULE_TOTAL_FIELD, value: newCapsuleTotal });
    }
    if (assignedBoxIdChanged) {
      actions.push({ action: 'setLineItemCustomField', lineItemId: lineItem.id, name: ASSIGNED_BOX_FIELD, value: newAssignedBoxId ?? null });
    }

    return actions;
  });
}
