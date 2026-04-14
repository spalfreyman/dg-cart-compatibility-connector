/**
 * postDeploy — runs after Connect successfully deploys the service.
 * CONNECT_SERVICE_URL is the full public URL including the endpoint path.
 */
'use strict';

const { apiRoot } = require('../dist/client');

const EXTENSION_KEY = 'dg-cart-compatibility';
const CART_TYPE_KEY = 'cart-compatibility';
const CUSTOM_BOX_PRODUCT_TYPE_KEY = 'product-type-custom-box';

async function run() {
  const serviceUrl = process.env.CONNECT_SERVICE_URL;
  const secret = process.env.EXTENSION_SECRET;

  if (!serviceUrl) throw new Error('CONNECT_SERVICE_URL is not set');
  if (!secret) throw new Error('EXTENSION_SECRET is not set');

  await ensureExtension(serviceUrl, secret);
  await ensureCartCompatibilityType();
  await ensureCustomBoxProductType();

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

const FIELD_DEFS = [
  {
    name: 'compatibility-warning',
    label: { 'en-US': 'Compatibility Warning' },
    required: false,
    type: { name: 'String' },
  },
  {
    name: 'most-consumed-item',
    label: { 'en-US': 'Most Consumed Item' },
    required: false,
    type: { name: 'Boolean' },
  },
  {
    name: 'box-selection-ids',
    label: { 'en-US': 'Box Selection IDs' },
    required: false,
    type: { name: 'Set', elementType: { name: 'String' } },
  },
  {
    name: 'box-capsule-total',
    label: { 'en-US': 'Box Capsule Total' },
    required: false,
    type: { name: 'Number' },
  },
  {
    name: 'assigned-box-line-item-id',
    label: { 'en-US': 'Assigned Box Line Item ID' },
    required: false,
    type: { name: 'String' },
  },
];

async function ensureCartCompatibilityType() {
  let existing;
  try {
    const result = await apiRoot.types().withKey({ key: CART_TYPE_KEY }).get().execute();
    existing = result.body;
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }

  if (!existing) {
    await apiRoot
      .types()
      .post({
        body: {
          key: CART_TYPE_KEY,
          name: { 'en-US': 'Cart Compatibility' },
          resourceTypeIds: ['line-item'],
          fieldDefinitions: FIELD_DEFS,
        },
      })
      .execute();
    console.log(`[post-deploy] Custom Type '${CART_TYPE_KEY}' created`);
    return;
  }

  // Type exists — add any missing fields
  const existingNames = new Set((existing.fieldDefinitions ?? []).map((f) => f.name));
  const missing = FIELD_DEFS.filter((f) => !existingNames.has(f.name));

  if (missing.length === 0) {
    console.log(`[post-deploy] Custom Type '${CART_TYPE_KEY}' already up-to-date`);
    return;
  }

  let version = existing.version;
  for (const fieldDef of missing) {
    const updated = await apiRoot
      .types()
      .withKey({ key: CART_TYPE_KEY })
      .post({
        body: {
          version,
          actions: [{ action: 'addFieldDefinition', fieldDefinition: fieldDef }],
        },
      })
      .execute();
    version = updated.body.version;
    console.log(`[post-deploy] Added field '${fieldDef.name}' to '${CART_TYPE_KEY}'`);
  }
}

async function ensureCustomBoxProductType() {
  let existing;
  try {
    const result = await apiRoot
      .productTypes()
      .withKey({ key: CUSTOM_BOX_PRODUCT_TYPE_KEY })
      .get()
      .execute();
    existing = result.body;
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }

  if (existing) {
    console.log(`[post-deploy] Product Type '${CUSTOM_BOX_PRODUCT_TYPE_KEY}' already exists`);
    return;
  }

  await apiRoot
    .productTypes()
    .post({
      body: {
        key: CUSTOM_BOX_PRODUCT_TYPE_KEY,
        name: 'Custom Box',
        description:
          'Purchasable custom box allowing customers to fill capsule slots from pick-and-mix selections',
        attributes: [
          {
            name: 'capsule-limit',
            label: { 'en-US': 'Capsule Limit' },
            isRequired: true,
            type: { name: 'Number' },
            attributeConstraint: 'SameForAll',
            isSearchable: false,
          },
          {
            name: 'generation',
            label: { 'en-US': 'Generation' },
            isRequired: true,
            type: {
              name: 'Enum',
              values: [
                { key: 'gen1', label: 'Gen1' },
                { key: 'gen2', label: 'Gen2' },
              ],
            },
            attributeConstraint: 'SameForAll',
            isSearchable: true,
          },
        ],
      },
    })
    .execute();

  console.log(`[post-deploy] Product Type '${CUSTOM_BOX_PRODUCT_TYPE_KEY}' created`);
}

run().catch((err) => {
  console.error('[post-deploy] Failed:', err.message);
  process.exit(1);
});
