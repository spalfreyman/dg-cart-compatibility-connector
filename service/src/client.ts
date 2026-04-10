import {
  ClientBuilder,
  type AuthMiddlewareOptions,
  type HttpMiddlewareOptions,
} from '@commercetools/sdk-client-v2';
import { createApiBuilderFromCtpClient } from '@commercetools/platform-sdk';

const {
  CTP_PROJECT_KEY = '',
  CTP_CLIENT_ID = '',
  CTP_CLIENT_SECRET = '',
  CTP_AUTH_URL = '',
  CTP_API_URL = '',
  CTP_SCOPE = '',
} = process.env;

const authMiddlewareOptions: AuthMiddlewareOptions = {
  host: CTP_AUTH_URL,
  projectKey: CTP_PROJECT_KEY,
  credentials: {
    clientId: CTP_CLIENT_ID,
    clientSecret: CTP_CLIENT_SECRET,
  },
  scopes: [CTP_SCOPE],
};

const httpMiddlewareOptions: HttpMiddlewareOptions = {
  host: CTP_API_URL,
};

export const apiRoot = createApiBuilderFromCtpClient(
  new ClientBuilder()
    .withProjectKey(CTP_PROJECT_KEY)
    .withClientCredentialsFlow(authMiddlewareOptions)
    .withHttpMiddleware(httpMiddlewareOptions)
    .build()
).withProjectKey({ projectKey: CTP_PROJECT_KEY });
