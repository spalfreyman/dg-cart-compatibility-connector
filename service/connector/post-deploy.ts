/**
 * postDeploy — runs after Connect successfully deploys the service.
 *
 * CONNECT_SERVICE_URL is the full public URL of this application including
 * the endpoint path (e.g. https://service-xyz.europe-west1.gcp.commercetools.app/cart-compatibility).
 * Use it directly as the extension destination URL.
 */

import { apiRoot } from '../src/client';

const EXTENSION_KEY = 'dg-cart-compatibility';
const CART_TYPE_KEY = 'cart-compatibility';

async function run(): Promise<void> {
  const serviceUrl = process.env.CONNECT_SERVICE_URL;
  const secret = process.env.EXTENSION_SECRET;

  if (!serviceUrl) throw new Error('CONNECT_SERVICE_URL is not set');
  if (!secret) throw new Error('EXTENSION_SECRET is not set');

  await ensureExtension(serviceUrl, secret);
  await ensureCartCompatibilityType();

  console.log('[post-deploy] Done');
}

async function ensureExtension(
  serviceUrl: string,
  secret: string
): Promise<void> {
  const destination = {
    type: 'HTTP' as const,
    url: serviceUrl,
    authentication: {
      type: 'AuthorizationHeader' as const,
      headerValue: `Bearer ${secret}`,
    },
  };

  const triggers = [
    { resourceTypeId: 'cart' as const, actions: ['Create', 'Update'] as const },
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
  } catch (err: unknown) {
    const error = err as { statusCode?: number };
    if (error.statusCode !== 404) throw err;

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

async function ensureCartCompatibilityType(): Promise<void> {
  try {
    await apiRoot.types().withKey({ key: CART_TYPE_KEY }).get().execute();
    console.log(
      `[post-deploy] Custom Type '${CART_TYPE_KEY}' already exists — skipping`
    );
    return;
  } catch (err: unknown) {
    const error = err as { statusCode?: number };
    if (error.statusCode !== 404) throw err;
  }

  await apiRoot
    .types()
    .post({
      body: {
        key: CART_TYPE_KEY,
        name: {
          'en-US': 'Cart Compatibility',
          'de-DE': 'Warenkorb-Kompatibilität',
        },
        resourceTypeIds: ['order', 'cart'],
        fieldDefinitions: [
          {
            name: 'compatibility-warnings',
            label: {
              'en-US': 'Compatibility Warnings',
              'de-DE': 'Kompatibilitätswarnungen',
            },
            required: false,
            type: {
              name: 'Set',
              elementType: { name: 'String' },
            },
          },
        ],
      },
    })
    .execute();

  console.log(`[post-deploy] Custom Type '${CART_TYPE_KEY}' created`);
}

run().catch((err: Error) => {
  console.error('[post-deploy] Failed:', err.message);
  process.exit(1);
});
