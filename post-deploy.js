/**
 * postDeploy script — runs once after Connect deploys the service.
 *
 * Responsibilities:
 *  1. Create (or update) the `dg-cart-compatibility` API Extension in CT,
 *     pointing at the URL Connect provisioned via CONNECT_SERVICE_URL.
 *  2. Create the `cart-compatibility` Custom Type (if it doesn't exist),
 *     which the extension writes warnings to.
 *
 * Environment variables available (injected by Connect):
 *   CONNECT_SERVICE_URL  — the base URL of the deployed service
 *   All variables declared in connect.yaml standardConfiguration / securedConfiguration
 */

'use strict';

const { createApiRoot } = require('../ct-client');

const EXTENSION_KEY = 'dg-cart-compatibility';
const CART_TYPE_KEY = 'cart-compatibility';

async function run() {
  const serviceUrl = process.env.CONNECT_SERVICE_URL;
  const secret = process.env.EXTENSION_SECRET;

  if (!serviceUrl) throw new Error('CONNECT_SERVICE_URL is not set');
  if (!secret) throw new Error('EXTENSION_SECRET is not set');

  const api = createApiRoot();

  await ensureExtension(api, serviceUrl, secret);
  await ensureCartCompatibilityType(api);

  console.log('[post-deploy] ✅ Done');
}

async function ensureExtension(api, serviceUrl, secret) {
  const extensionUrl = `${serviceUrl}/cart-compatibility`;
  const destination = {
    type: 'HTTP',
    url: extensionUrl,
    authentication: {
      type: 'AuthorizationHeader',
      headerValue: `Bearer ${secret}`,
    },
  };

  let existing = null;
  try {
    existing = await api.extensions().withKey({ key: EXTENSION_KEY }).get().execute();
  } catch (e) {
    if (e.statusCode !== 404) throw e;
  }

  if (existing) {
    await api
      .extensions()
      .withKey({ key: EXTENSION_KEY })
      .post({
        body: {
          version: existing.body.version,
          actions: [{ action: 'changeDestination', destination }],
        },
      })
      .execute();
    console.log(`[post-deploy] Extension updated → ${extensionUrl}`);
  } else {
    await api
      .extensions()
      .post({
        body: {
          key: EXTENSION_KEY,
          destination,
          triggers: [{ resourceTypeId: 'cart', actions: ['Create', 'Update'] }],
          timeoutInMs: 5000,
        },
      })
      .execute();
    console.log(`[post-deploy] Extension created → ${extensionUrl}`);
  }
}

async function ensureCartCompatibilityType(api) {
  let existing = null;
  try {
    existing = await api.types().withKey({ key: CART_TYPE_KEY }).get().execute();
  } catch (e) {
    if (e.statusCode !== 404) throw e;
  }

  if (existing) {
    console.log(`[post-deploy] Custom Type '${CART_TYPE_KEY}' already exists — skipping`);
    return;
  }

  await api.types().post({
    body: {
      key: CART_TYPE_KEY,
      name: { 'en-US': 'Cart Compatibility', 'de-DE': 'Warenkorb-Kompatibilität' },
      resourceTypeIds: ['order', 'cart'],
      fieldDefinitions: [
        {
          name: 'compatibility-warnings',
          label: {
            'en-US': 'Compatibility Warnings',
            'de-DE': 'Kompatibilitätswarnungen',
          },
          required: false,
          type: { name: 'Set', elementType: { name: 'String' } },
        },
      ],
    },
  }).execute();

  console.log(`[post-deploy] Custom Type '${CART_TYPE_KEY}' created`);
}

run().catch((err) => {
  console.error('[post-deploy] ❌ Failed:', err.message ?? err);
  process.exit(1);
});
