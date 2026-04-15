import { NextRequest, NextResponse } from 'next/server';
import { apiRoot } from '@/app/lib/ctp-client';
import {
  COOKIE_CART_ID,
  COOKIE_CUSTOMER_TOKEN,
  COOKIE_CUSTOMER_ID,
  COOKIE_CUSTOMER_EMAIL,
} from '@/app/lib/constants';

const COOKIE_OPTS = {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 30, // 30 days
  path: '/',
  sameSite: 'lax' as const,
};

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const {
    CTP_AUTH_URL = '',
    CTP_PROJECT_KEY = '',
    CTP_CLIENT_ID = '',
    CTP_CLIENT_SECRET = '',
    CTP_SCOPE = '',
  } = process.env;

  try {
    // 1. Password grant flow
    const tokenRes = await fetch(
      `${CTP_AUTH_URL}/oauth/${CTP_PROJECT_KEY}/customers/token`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${CTP_CLIENT_ID}:${CTP_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'password',
          username: email,
          password,
          scope: CTP_SCOPE,
        }),
      }
    );

    if (!tokenRes.ok) {
      const err = await tokenRes.json();
      return NextResponse.json(
        { error: err.message || 'Invalid credentials' },
        { status: 401 }
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken: string = tokenData.access_token;

    // 2. Fetch customer profile
    const customerRes = await apiRoot
      .customers()
      .get({ queryArgs: { where: `email="${email}"`, limit: 1 } })
      .execute();

    const customer = customerRes.body.results[0];
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // 3. Associate anonymous cart with customer (if any)
    // If the merge fails (e.g. extension timeout), clear the cart cookie so the
    // next cart fetch creates a fresh customer-linked cart rather than continuing
    // to show the anonymous cart with stale "please sign in" warnings.
    const anonCartId = request.cookies.get(COOKIE_CART_ID)?.value;
    let cartMerged = false;
    if (anonCartId) {
      try {
        const cartRes = await apiRoot.carts().withId({ ID: anonCartId }).get().execute();
        const cart = cartRes.body;
        if (!cart.customerId) {
          await apiRoot
            .carts()
            .withId({ ID: anonCartId })
            .post({
              body: {
                version: cart.version,
                actions: [{ action: 'setCustomerId', customerId: customer.id }],
              },
            })
            .execute();
          cartMerged = true;
        } else if (cart.customerId === customer.id) {
          cartMerged = true; // already linked to this customer
        }
      } catch {
        // merge failed — cart cookie will be cleared below so a fresh one is created
      }
    }

    const response = NextResponse.json({
      email: customer.email,
      firstName: customer.firstName,
      customerId: customer.id,
    });

    response.cookies.set(COOKIE_CUSTOMER_TOKEN, accessToken, COOKIE_OPTS);
    response.cookies.set(COOKIE_CUSTOMER_ID, customer.id, COOKIE_OPTS);
    response.cookies.set(COOKIE_CUSTOMER_EMAIL, customer.email, COOKIE_OPTS);
    // If the anonymous cart couldn't be merged, clear the cart cookie so the next
    // cart fetch creates a fresh cart linked to the customer account.
    if (!cartMerged && anonCartId) {
      response.cookies.delete(COOKIE_CART_ID);
    }

    return response;
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
