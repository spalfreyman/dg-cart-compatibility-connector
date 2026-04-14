/**
 * postDeploy — runs after Connect successfully deploys the service.
 * CONNECT_SERVICE_URL is the full public URL including the endpoint path.
 */
'use strict';

const { apiRoot } = require('../dist/client');

const EXTENSION_KEY = 'dg-cart-compatibility';
const CART_TYPE_KEY = 'cart-compatibility';

async function run() {
  const serviceUrl = process.env.CONNECT_SERVICE_URL;
  const secret = process.env.EXTENSION_SECRET;

  if (!serviceUrl) throw new Error('CONNECT_SERVICE_URL is not set');
  if (!secret) throw new Error('EXTENSION_SECRET is not set');

  await ensureExtension(serviceUrl, secret);
  await ensureCartCompatibilityType();

  console.log('[post-deploy] Done');
}

async function ensureExtension(serviceUrl, secret) {
  const destination = {
    type: 'HTTP',
    url: serviceUrl,
    authentication: {
      type: 'AuthorizationHeader',
      headerValue: `Bearer ${secret}`,
    },
  };

  const triggers = [
    { resourceTypeId: 'cart', actions: ['Create', 'Update'] },
  ];

  try {
    const existing = await apiRoot
      .extensions()
      .withKey({ key: EXTENSION_KEY })
      .get()
      .execute();

    await apiRoot
      .extensions()
      .withKey({ key: EXTENSION_KEY })
      .post({
        body: {
          version: existing.body.version,
          actions: [{ action: 'changeDestination', destination }],
        },
      })
      .execute();

    console.log(`[post-deploy] Extension updated → ${serviceUrl}`);
  } catch (err) {
    if (err.statusCode !== 404) throw err;

    await apiRoot
      .extensions()
      .post({
        body: {
          key: EXTENSION_KEY,
          destination,
          triggers,
          timeoutInMs: 5000,
        },
      })
      .execute();

    console.log(`[post-deploy] Extension created → ${serviceUrl}`);
  }
}

async function ensureCartCompatibilityType() {
  try {
    await apiRoot.types().withKey({ key: CART_TYPE_KEY }).get().execute();
    console.log(`[post-deploy] Custom Type '${CART_TYPE_KEY}' already exists — skipping`);
    return;
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }

  await apiRoot
    .types()
    .post({
      body: {
        key: CART_TYPE_KEY,
        name: { 'en-US': 'Cart Compatibility' },
        resourceTypeIds: ['line-item'],
        fieldDefinitions: [
          {
            name: 'compatibility-warning',
            label: { 'en-US': 'Compatibility Warning' },
            required: false,
            type: { name: 'String' },
          },
        ],
      },
    })
    .execute();

  console.log(`[post-deploy] Custom Type '${CART_TYPE_KEY}' created`);
}

run().catch((err) => {
  console.error('[post-deploy] Failed:', err.message);
  process.exit(1);
});
