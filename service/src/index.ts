import * as crypto from 'crypto';
import express, {
  type Request,
  type Response,
} from 'express';
import type { Cart, Customer } from '@commercetools/platform-sdk';
import { apiRoot } from './client';
import { checkCompatibility, getTopThreeProductIds, type LineItemWarning } from './rules';

const EXTENSION_KEY = 'dg-cart-compatibility';
const CART_TYPE_KEY = 'cart-compatibility';
const WARNING_FIELD = 'compatibility-warning';
const TOP_THREE_FIELD = 'most-consumed-item';

const app = express();
app.use(express.json());

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: EXTENSION_KEY });
});

// ─── Extension endpoint ───────────────────────────────────────────────────────
app.post('/cart-compatibility', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers['authorization'] ?? '';
    const expected = `Bearer ${process.env.EXTENSION_SECRET ?? ''}`;

    // Timing-safe comparison — pad to same length to avoid length leakage
    const a = Buffer.alloc(Math.max(authHeader.length, expected.length), 0);
    const b = Buffer.alloc(Math.max(authHeader.length, expected.length), 0);
    Buffer.from(authHeader).copy(a);
    Buffer.from(expected).copy(b);

    if (!crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const cart = req.body?.resource?.obj as Cart | undefined;
    if (!cart) {
      res.status(200).end();
      return;
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
        // Customer not found or fetch failed — treat as anonymous
        customer = null;
      }
    }

    const lineItemWarnings = checkCompatibility(cart, customer);
    const topThreeProductIds = getTopThreeProductIds(customer);
    const actions = buildActions(cart, lineItemWarnings, topThreeProductIds);

    res.status(200).json({ actions });
  } catch (error) {
    // Soft failure — never block cart operations
    console.error(`[${EXTENSION_KEY}] Extension error:`, error);
    res.status(200).json({ actions: [] });
  }
});

function buildActions(
  cart: Cart,
  lineItemWarnings: LineItemWarning[],
  topThreeProductIds: Set<string>
): object[] {
  const warningMap = new Map(lineItemWarnings.map((w) => [w.lineItemId, w.warning]));

  return cart.lineItems.flatMap((lineItem): object[] => {
    const warning = warningMap.get(lineItem.id) ?? null;
    const mostConsumed = lineItem.productId ? topThreeProductIds.has(lineItem.productId) : false;

    const currentWarning = lineItem.custom?.fields?.[WARNING_FIELD] as string | null | undefined;
    const currentMostConsumed = lineItem.custom?.fields?.[TOP_THREE_FIELD] as boolean | undefined;
    const hasType = !!lineItem.custom?.type;

    // Skip if there is nothing to set or clear
    if (!warning && !mostConsumed && currentWarning == null && !currentMostConsumed) return [];

    if (!hasType) {
      // Set custom type and write whichever fields have values
      const fields: Record<string, unknown> = {};
      if (warning !== null) fields[WARNING_FIELD] = warning;
      if (mostConsumed) fields[TOP_THREE_FIELD] = true;
      if (Object.keys(fields).length === 0) return [];
      return [
        {
          action: 'setLineItemCustomType',
          lineItemId: lineItem.id,
          type: { key: CART_TYPE_KEY, typeId: 'type' },
          fields,
        },
      ];
    }

    // Type already set — update individual fields
    const actions: object[] = [];

    if (warning !== null) {
      actions.push({
        action: 'setLineItemCustomField',
        lineItemId: lineItem.id,
        name: WARNING_FIELD,
        value: warning,
      });
    } else if (currentWarning != null) {
      actions.push({
        action: 'setLineItemCustomField',
        lineItemId: lineItem.id,
        name: WARNING_FIELD,
        value: null,
      });
    }

    if (mostConsumed && !currentMostConsumed) {
      actions.push({
        action: 'setLineItemCustomField',
        lineItemId: lineItem.id,
        name: TOP_THREE_FIELD,
        value: true,
      });
    } else if (!mostConsumed && currentMostConsumed) {
      actions.push({
        action: 'setLineItemCustomField',
        lineItemId: lineItem.id,
        name: TOP_THREE_FIELD,
        value: null,
      });
    }

    return actions;
  });
}

const PORT = parseInt(process.env.PORT ?? '8080', 10);
app.listen(PORT, () => {
  console.log(`[${EXTENSION_KEY}] Listening on :${PORT}`);
});

export { app };
