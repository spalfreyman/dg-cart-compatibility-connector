# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A **commercetools Connect Extension Service** for Nescafé Dolce Gusto cart compatibility validation. It runs as a webhook extension — commercetools sends cart Create/Update events to the service, which checks whether the customer's machine is compatible with NEO (Gen2) coffee products in their cart, and returns actions to set a `compatibility-warnings` custom field on the cart.

## Commands

All commands run from the `service/` directory:

```bash
npm run build          # Compile TypeScript to dist/
npm run start          # Run compiled service
npm run dev            # Run with ts-node (no compile step)
npm test               # Run Jest test suite
npm test -- --testPathPattern=rules  # Run a single test file
```

Connector lifecycle scripts (run against a live commercetools project):
```bash
npm run connector:post-deploy    # Register Extension + create Custom Type
npm run connector:pre-undeploy   # Delete Extension
```

## Architecture

**Three source files in `service/src/`:**

- **`index.ts`** — Express app. Exposes `/health` and `/cart-compatibility`. Validates `Authorization: Bearer <EXTENSION_SECRET>` using timing-safe comparison. Calls `checkCompatibility()`, then builds commercetools actions to set the `compatibility-warnings` custom field (and creates the custom type on the cart if not yet present).

- **`client.ts`** — Configures the commercetools SDK client from env vars and exports an `apiRoot` for use in the extension handler.

- **`rules.ts`** — Core business logic. `checkCompatibility(cart, customer)` returns an array of warning strings (empty = compatible). Three scenarios:
  1. Gen2 customer → always compatible
  2. Gen1 customer with adapter → partial compatibility (some NEO products blocked)
  3. Gen1 customer without adapter → all NEO products blocked
  4. Anonymous user with NEO products → warn to sign in

**Connector scripts in `service/connector/`** are plain JS that import from `dist/` — they run post-build via commercetools Connect's lifecycle hooks. The post-deploy script creates both the `cart-compatibility-extension` HTTP Extension and the `cart-compatibility` Custom Type. Pre-undeploy deletes the Extension.

## Required Environment Variables

```
CTP_PROJECT_KEY
CTP_CLIENT_ID
CTP_CLIENT_SECRET
CTP_AUTH_URL
CTP_API_URL
CTP_SCOPE
EXTENSION_SECRET     # Bearer token commercetools uses to call this service
PORT                 # Default: 8080
```

Copy `.env.example` to `.env` for local development.

## Deployment

Defined in `connect.yaml` at the repo root. The Connect platform builds and deploys the `service/` application. Post-deploy and pre-undeploy hooks compile TypeScript first (`npm install && npm run build`), then run the connector scripts.
