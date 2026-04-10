/**
 * preUndeploy — runs before Connect removes the deployment.
 * Deletes the CT Extension so CT stops calling the endpoint.
 */
'use strict';

const { apiRoot } = require('../dist/client');

const EXTENSION_KEY = 'dg-cart-compatibility';

async function run() {
  try {
    const existing = await apiRoot
      .extensions()
      .withKey({ key: EXTENSION_KEY })
      .get()
      .execute();

    await apiRoot
      .extensions()
      .withKey({ key: EXTENSION_KEY })
      .delete({ queryArgs: { version: existing.body.version } })
      .execute();

    console.log(`[pre-undeploy] Extension '${EXTENSION_KEY}' deleted`);
  } catch (err) {
    if (err.statusCode === 404) {
      console.log(`[pre-undeploy] Extension '${EXTENSION_KEY}' not found — nothing to remove`);
      return;
    }
    throw err;
  }
}

run().catch((err) => {
  console.error('[pre-undeploy] Failed:', err.message);
  process.exit(1);
});
