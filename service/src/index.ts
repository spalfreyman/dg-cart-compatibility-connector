import * as crypto from 'crypto';
import express, {
  type Request,
  type Response,
} from 'express';
import type { Cart, Customer } from '@commercetools/platform-sdk';
import { apiRoot } from './client';
import { checkCompatibility, type LineItemWarning } from './rules';

const EXTENSION_KEY = 'dg-cart-compatibility';
const CART_TYPE_KEY = 'cart-compatibility';
const WARNING_FIELD = 'compatibility-warning';

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
    const actions = buildActions(cart, lineItemWarnings);

    res.status(200).json({ actions });
  } catch (error) {
    // Soft failure — never block cart operations
    console.error(`[${EXTENSION_KEY}] Extension error:`, error);
    res.status(200).json({ actions: [] });
  }
});

function buildActions(cart: Cart, lineItemWarnings: LineItemWarning[]): object[] {
  return lineItemWarnings.flatMap(({ lineItemId, warning }): object[] => {
    const lineItem = cart.lineItems.find((li) => li.id === lineItemId);
    if (!lineItem) return [];

    if (warning !== null) {
      if (!lineItem.custom?.type) {
        return [
          {
            action: 'setLineItemCustomType',
            lineItemId,
            type: { key: CART_TYPE_KEY, typeId: 'type' },
            fields: { [WARNING_FIELD]: warning },
          },
        ];
      }
      return [
        {
          action: 'setLineItemCustomField',
          lineItemId,
          name: WARNING_FIELD,
          value: warning,
        },
      ];
    }

    // warning is null — only clear if the field actually has a value
    if (lineItem.custom?.fields?.[WARNING_FIELD] != null) {
      return [
        {
          action: 'setLineItemCustomField',
          lineItemId,
          name: WARNING_FIELD,
          value: null,
        },
      ];
    }

    return [];
  });
}

const PORT = parseInt(process.env.PORT ?? '8080', 10);
app.listen(PORT, () => {
  console.log(`[${EXTENSION_KEY}] Listening on :${PORT}`);
});

export { app };
