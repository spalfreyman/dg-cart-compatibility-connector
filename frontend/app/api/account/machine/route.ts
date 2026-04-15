import { NextRequest, NextResponse } from 'next/server';
import { apiRoot } from '@/app/lib/ctp-client';
import { getCustomerId } from '@/app/lib/cookies';

export async function GET() {
  const customerId = await getCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  try {
    const res = await apiRoot.customers().withId({ ID: customerId }).get().execute();
    const fields = res.body.custom?.fields ?? {};
    return NextResponse.json({
      isGen1: fields['is-gen1'] === true,
      isGen2: fields['is-gen2'] === true,
      hasAdapter: fields['has-neo-adapter'] === true,
      isGen25: fields['is-gen2-latte'] === true,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const customerId = await getCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  const { isGen1, isGen2, hasAdapter, isGen25 } = await request.json();

  try {
    const custRes = await apiRoot.customers().withId({ ID: customerId }).get().execute();
    const customer = custRes.body;

    await apiRoot
      .customers()
      .withId({ ID: customerId })
      .post({
        body: {
          version: customer.version,
          actions: [
            { action: 'setCustomField', name: 'is-gen1', value: Boolean(isGen1) },
            { action: 'setCustomField', name: 'is-gen2', value: Boolean(isGen2) },
            { action: 'setCustomField', name: 'has-neo-adapter', value: Boolean(hasAdapter) },
            { action: 'setCustomField', name: 'is-gen2-latte', value: Boolean(isGen25) },
          ],
        },
      })
      .execute();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/account/machine]', err);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
