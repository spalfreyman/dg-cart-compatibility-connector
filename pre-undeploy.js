/**
 * preUndeploy script — runs before Connect removes the deployment.
 *
 * Removes the `dg-cart-compatibility` API Extension from CT so that
 * CT stops calling the (soon-to-be-gone) endpoint.
 * The cart-compatibility Custom Type is left in place to preserve
 * any existing warning data on carts.
 */

'use strict';

const { createApiRoot } = require('../ct-client');

const EXTENSION_KEY = 'dg-cart-compatibility';

async function run() {
  const api = createApiRoot();

  let existing = null;
  try {
    existing = await api.extensions().withKey({ key: EXTENSION_KEY }).get().execute();
  } catch (e) {
    if (e.statusCode === 404) {
      console.log(`[pre-undeploy] Extension '${EXTENSION_KEY}' not found — nothing to remove`);
      return;
    }
    throw e;
  }

  await api
    .extensions()
    .withKey({ key: EXTENSION_KEY })
    .delete({ queryArgs: { version: existing.body.version } })
    .execute();

  console.log(`[pre-undeploy] ✅ Extension '${EXTENSION_KEY}' deleted`);
}

run().catch((err) => {
  console.error('[pre-undeploy] ❌ Failed:', err.message ?? err);
  process.exit(1);
});
