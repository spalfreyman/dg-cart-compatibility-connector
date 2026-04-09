'use strict';

const express = require('express');
const { checkCompatibility } = require('./rules');
const { fetchCustomer } = require('./ct-client');

const app = express();
app.use(express.json());

const EXTENSION_KEY = 'dg-cart-compatibility';
const CART_TYPE_KEY = 'cart-compatibility';
const FIELD_NAME = 'compatibility-warnings';

app.get('/health', (_req, res) => res.json({ status: 'ok', service: EXTENSION_KEY }));

app.post('/cart-compatibility', async (req, res) => {
  const authHeader = req.headers['authorization'] ?? '';
  if (authHeader !== `Bearer ${process.env.EXTENSION_SECRET}`) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const cart = req.body?.resource?.obj;
    if (!cart) return res.status(200).end();

    let customer = null;
    if (cart.customerId) {
      customer = await fetchCustomer(cart.customerId);
    }

    const warnings = checkCompatibility(cart, customer);
    const actions = buildActions(cart, warnings);

    return res.status(200).json({ actions });
  } catch (err) {
    console.error('[dg-cart-compat] Extension error:', err);
    // Soft failure — never block cart operations
    return res.status(200).json({ actions: [] });
  }
});

function buildActions(cart, warnings) {
  const hasType = cart.custom?.fields?.[FIELD_NAME] !== undefined;

  if (!hasType) {
    return [{
      action: 'setCustomType',
      type: { key: CART_TYPE_KEY, typeId: 'type' },
      fields: { [FIELD_NAME]: warnings },
    }];
  }

  return [{
    action: 'setCustomField',
    name: FIELD_NAME,
    value: warnings,
  }];
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[dg-cart-compat] Listening on :${PORT}`);
});

module.exports = { app };
