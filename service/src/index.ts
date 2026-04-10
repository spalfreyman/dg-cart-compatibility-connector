import * as crypto from 'crypto';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import type { Cart, Customer } from '@commercetools/platform-sdk';
import { apiRoot } from './client';
import { checkCompatibility } from './rules';

const EXTENSION_KEY = 'dg-cart-compatibility';
const CART_TYPE_KEY = 'cart-compatibility';
const WARNING_FIELD = 'compatibility-warnings';

const app = express();
app.use(express.json());

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: EXTENSION_KEY });
});

// ─── Extension endpoint ───────────────────────────────────────────────────────
app.post(
  '/cart-compatibility',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers['authorization'] ?? '';
      const expected = `Bearer ${process.env.EXTENSION_SECRET ?? ''}`;

      // Timing-safe comparison — pad to same length to avoid length leakage
      const a = Buffer.alloc(
        Math.max(authHeader.length, expected.length),
        0
      );
      const b = Buffer.alloc(
        Math.max(authHeader.length, expected.length),
        0
      );
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

      const warnings = checkCompatibility(cart, customer);
      const actions = buildActions(cart, warnings);

      res.status(200).json({ actions });
    } catch (error) {
      // Soft failure — never block cart operations
      console.error(`[${EXTENSION_KEY}] Extension error:`, error);
      res.status(200).json({ actions: [] });
      next;
    }
  }
);

function buildActions(
  cart: Cart,
  warnings: string[]
): object[] {
  const hasType = cart.custom?.fields?.[WARNING_FIELD] !== undefined;

  if (!hasType) {
    return [
      {
        action: 'setCustomType',
        type: { key: CART_TYPE_KEY, typeId: 'type' },
        fields: { [WARNING_FIELD]: warnings },
      },
    ];
  }

  return [
    {
      action: 'setCustomField',
      name: WARNING_FIELD,
      value: warnings,
    },
  ];
}

const PORT = parseInt(process.env.PORT ?? '8080', 10);
app.listen(PORT, () => {
  console.log(`[${EXTENSION_KEY}] Listening on :${PORT}`);
});

export { app };
