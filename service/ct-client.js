'use strict';

const { ClientBuilder } = require('@commercetools/sdk-client-v2');
const { createApiBuilderFromCtpClient } = require('@commercetools/platform-sdk');

/**
 * Build a commercetools API root from environment variables.
 * Used by both the extension handler (runtime) and the deploy scripts.
 */
function createApiRoot() {
  const {
    CT_PROJECT_KEY,
    CT_CLIENT_ID,
    CT_CLIENT_SECRET,
    CT_AUTH_URL,
    CT_API_URL,
    CT_SCOPE,
  } = process.env;

  const authMiddlewareOptions = {
    host: CT_AUTH_URL,
    projectKey: CT_PROJECT_KEY,
    credentials: {
      clientId: CT_CLIENT_ID,
      clientSecret: CT_CLIENT_SECRET,
    },
    scopes: [CT_SCOPE],
  };

  const client = new ClientBuilder()
    .withProjectKey(CT_PROJECT_KEY)
    .withClientCredentialsFlow(authMiddlewareOptions)
    .withHttpMiddleware({ host: CT_API_URL })
    .build();

  return createApiBuilderFromCtpClient(client).withProjectKey({
    projectKey: CT_PROJECT_KEY,
  });
}

/**
 * Lightweight token + customer fetch for use inside the extension handler.
 * Avoids SDK overhead in the hot path; uses plain fetch with a simple in-memory cache.
 */
let _tokenCache = null;

async function getAccessToken() {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now) return _tokenCache.token;

  const { CT_CLIENT_ID, CT_CLIENT_SECRET, CT_AUTH_URL, CT_PROJECT_KEY, CT_SCOPE } = process.env;
  const credentials = Buffer.from(`${CT_CLIENT_ID}:${CT_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(
    `${CT_AUTH_URL}/oauth/token?grant_type=client_credentials&scope=${CT_SCOPE}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  if (!res.ok) throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  _tokenCache = { token: data.access_token, expiresAt: now + (data.expires_in - 60) * 1000 };
  return _tokenCache.token;
}

async function fetchCustomer(customerId) {
  const { CT_API_URL, CT_PROJECT_KEY } = process.env;
  const token = await getAccessToken();
  const res = await fetch(`${CT_API_URL}/${CT_PROJECT_KEY}/customers/${customerId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Customer fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

module.exports = { createApiRoot, fetchCustomer };
