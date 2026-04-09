# DG Cart Compatibility Connector

UC3 — Cart Compatibility Extension for Nescafé Dolce Gusto (`dg_testbed`), packaged as a **commercetools Connect** `service` application.

## How it works

Fires on every cart `Create` / `Update`. Checks whether a customer's machine profile is compatible with any NEO (gen2) products in the cart, then writes a `compatibility-warnings` Set field back onto the cart for the storefront to display.

See [`service/rules.js`](service/rules.js) for the full decision matrix.

---

## Prerequisites

| Requirement | Detail |
|---|---|
| Node.js | ≥ 20 |
| GitHub account | Repo must be public, or grant `connect-mu` read access if private |
| CT organisation | Must have Connect access enabled |
| CT API Client | Scopes: `manage_extensions manage_types manage_project` |

---

## Repository structure

```
dg-cart-compatibility-connector/
├── connect.yaml              ← Connect config (required at root)
└── service/                  ← Matches deployAs[0].name in connect.yaml
    ├── index.js              ← Express HTTP handler
    ├── rules.js              ← Compatibility logic
    ├── ct-client.js          ← CT SDK client + lightweight token cache
    ├── package.json
    ├── connector/
    │   ├── post-deploy.js    ← Registers CT Extension after deploy
    │   └── pre-undeploy.js   ← Deletes CT Extension before undeploy
    └── tests/
        └── rules.test.js
```

---

## Deployment steps

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "chore: initial Connect package"
git remote add origin https://github.com/YOUR_ORG/dg-cart-compatibility-connector.git
git push -u origin main

# Create a release tag (Connect requires a tag to reference)
git tag v1.0.0
git push origin v1.0.0
```

If the repo is private, grant read access to the `connect-mu` GitHub machine user.

### Step 2 — Create a ConnectorStaged (via Merchant Center)

1. Open **Merchant Center → Connect → Organization Connectors**
2. Click **Create Connector**
3. Fill in:
   - **Name:** DG Cart Compatibility
   - **Repository URL:** `https://github.com/YOUR_ORG/dg-cart-compatibility-connector`
   - **Tag:** `v1.0.0`
   - **Integration type:** `other`
   - **Supported regions:** `europe-west1.gcp`
4. Save

Or via the Connect API:

```bash
curl -s -X POST "https://connect.europe-west1.gcp.commercetools.com/connectors/drafts" \
  -H "Authorization: Bearer $CONNECT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "dg-cart-compatibility",
    "name": "DG Cart Compatibility",
    "description": "UC3 cart compatibility rules for Nescafé Dolce Gusto",
    "integrationTypes": ["other"],
    "creator": { "email": "YOUR_EMAIL" },
    "repository": {
      "url": "https://github.com/YOUR_ORG/dg-cart-compatibility-connector",
      "tag": "v1.0.0"
    },
    "supportedRegions": ["europe-west1.gcp"]
  }'
```

### Step 3 — Request Preview

In Merchant Center, open the Connector and click **Request Preview**. Connect runs security validation (SAST, SCA, image scan). Check the preview report — fix any flagged issues and repeat.

### Step 4 — Deploy (Preview or Production)

Once `isPreviewable` = `true`, click **Deploy on Preview** (sandbox) or **Deploy on Production**.

Set the configuration values when prompted:

| Key | Value |
|---|---|
| `CT_PROJECT_KEY` | `dg_testbed` |
| `CT_AUTH_URL` | `https://auth.europe-west1.gcp.commercetools.com` |
| `CT_API_URL` | `https://api.europe-west1.gcp.commercetools.com` |
| `CT_SCOPE` | `manage_project:dg_testbed` |
| `CT_CLIENT_ID` | *(your API client ID)* |
| `CT_CLIENT_SECRET` | *(your API client secret)* |
| `EXTENSION_SECRET` | *(any strong random string)* |

Connect will:
1. Build and host the service
2. Run `postDeploy` → registers the CT Extension with the actual deployed URL
3. Create the `cart-compatibility` Custom Type if it doesn't exist

### Step 5 — Verify

```bash
# The extension should now appear in dg_testbed
curl -s "https://api.europe-west1.gcp.commercetools.com/dg_testbed/extensions/key=dg-cart-compatibility" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep '"url"'
```

The URL should be a `*.commercetools.app` address — the one Connect assigned.

---

## Local development

```bash
cd service
cp ../.env.example .env  # fill in values
npm install
npm start
```

Test with curl:

```bash
curl -s -X POST http://localhost:8080/cart-compatibility \
  -H "Authorization: Bearer YOUR_EXTENSION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": {
      "obj": {
        "customerId": "087bea1d-983f-4da7-8215-1e8189c9d2ad",
        "lineItems": [
          {
            "variant": {
              "sku": "BOX-NEO-ESPRESSO-8",
              "attributes": [
                { "name": "generation", "value": { "key": "gen2" } },
                { "name": "adapter-compatible", "value": true }
              ]
            },
            "name": { "en-US": "NEO Espresso Capsules" },
            "productKey": "box-neo-espresso"
          }
        ]
      }
    }
  }'
```

Run tests:

```bash
npm test
```

---

## Updating the Connector

1. Make code changes
2. Commit and push a new tag: `git tag v1.0.1 && git push origin v1.0.1`
3. In Merchant Center, open the Connector → update the Repository tag → click **Request Preview** again
4. Once previewable, redeploy
