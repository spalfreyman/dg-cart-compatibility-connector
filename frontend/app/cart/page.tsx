'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { formatPrice } from '@/app/lib/format-price';
import CompatibilityWarning from '@/app/components/cart/CompatibilityWarning';
import VoucherInput from '@/app/components/cart/VoucherInput';
import { useCartStore } from '@/app/store/use-cart-store';
import { WARNING_FIELD, BOX_SELECTION_IDS_FIELD, BOX_CAPSULE_TOTAL_FIELD } from '@/app/lib/constants';
import type { Cart, LineItem } from '@commercetools/platform-sdk';

// ─── Line-item classifiers ────────────────────────────────────────────────────

function isCustomBox(li: LineItem): boolean {
  return (li.variant?.attributes ?? []).some((a) => a.name === 'capsule-limit');
}

function isPickAndMixSelection(li: LineItem): boolean {
  return (li.variant?.attributes ?? []).some(
    (a) => a.name === 'box-type' && (a.value as { key?: string })?.key === 'pick-and-mix'
  );
}

function getAttr(li: LineItem, name: string): unknown {
  return (li.variant?.attributes ?? []).find((a) => a.name === name)?.value;
}

function getBoxGen(li: LineItem): string | null {
  const g = getAttr(li, 'generation') as { key?: string } | undefined;
  return g?.key ?? null;
}

function getCapsulesPerServing(li: LineItem): number {
  return (getAttr(li, 'box-content-count') as number | undefined) ?? 1;
}

function getName(li: LineItem): string {
  return li.name?.['en-GB'] ?? li.name?.['en'] ?? li.name?.['en-US'] ?? 'Product';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PickAndMixBoxCard({
  box,
  assignedSelections,
  currency,
  onRemoveBox,
  isLoggedIn,
}: {
  box: LineItem;
  assignedSelections: LineItem[];
  currency: string;
  onRemoveBox: (ids: string[]) => Promise<void>;
  isLoggedIn: boolean;
}) {
  const [removing, setRemoving] = useState(false);
  const boxGen = getBoxGen(box);
  const isNeo = boxGen === 'gen2' || boxGen === 'gen1.5';
  const capsuleTotal =
    (box.custom?.fields?.[BOX_CAPSULE_TOTAL_FIELD] as number | undefined) ?? 0;
  const limit = (getAttr(box, 'capsule-limit') as number | undefined) ?? 50;

  async function handleRemove() {
    setRemoving(true);
    const ids = [box.id, ...assignedSelections.map((s) => s.id)];
    await onRemoveBox(ids);
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Box header */}
      <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-gray-900">
              {isNeo ? 'NEO Custom Mix Box' : 'Classic Custom Mix Box'}
            </h3>
            {isNeo && (
              <span className="text-xs bg-brand-red text-white px-2 py-0.5 rounded-full">NEO</span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {capsuleTotal}/{limit} capsules · {assignedSelections.length} beverage
            {assignedSelections.length !== 1 ? 's' : ''}
          </p>
          {/* Capsule fill bar */}
          <div className="w-48 bg-gray-200 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-brand-red h-1.5 rounded-full"
              style={{ width: `${Math.min(100, (capsuleTotal / limit) * 100)}%` }}
            />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="font-bold text-gray-900">
            {formatPrice(box.totalPrice?.centAmount ?? 0, currency)}
          </span>
          <button
            onClick={handleRemove}
            disabled={removing}
            className="text-xs text-red-500 hover:underline disabled:opacity-40"
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>

      {/* Selections inside the box */}
      {assignedSelections.length > 0 && (
        <div className="divide-y divide-gray-50">
          {assignedSelections.map((sel) => {
            const capsulesPerServing = getCapsulesPerServing(sel);
            const totalCapsules = sel.quantity * capsulesPerServing;
            const selTotal = sel.totalPrice?.centAmount ?? 0;
            const warning = isLoggedIn
              ? (sel.custom?.fields?.[WARNING_FIELD] as string | undefined)
              : undefined;

            return (
              <div key={sel.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{getName(sel)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      ×{sel.quantity} serving{sel.quantity !== 1 ? 's' : ''} ·{' '}
                      <span className="text-gray-600 font-medium">{totalCapsules} capsule{totalCapsules !== 1 ? 's' : ''}</span>
                      {capsulesPerServing > 1 && (
                        <span className="text-gray-400"> ({capsulesPerServing} per serving)</span>
                      )}
                    </p>
                    {warning && <CompatibilityWarning warning={warning} />}
                  </div>
                  <span className="text-sm text-gray-600 shrink-0">
                    {formatPrice(selTotal, currency)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {assignedSelections.length === 0 && (
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400 italic">
            Selections being assigned — refresh in a moment.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main cart page ───────────────────────────────────────────────────────────

export default function CartPage() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const setCartCount = useCartStore((s) => s.setCartCount);
  const isLoggedIn = useCartStore((s) => s.isLoggedIn);

  const fetchCart = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cart');
      const data = await res.json();
      setCart(data.cart);
      const count = (data.cart?.lineItems ?? []).reduce(
        (s: number, li: LineItem) => s + li.quantity,
        0
      );
      setCartCount(count);
    } finally {
      setLoading(false);
    }
  }, [setCartCount]);

  async function recalculate() {
    setRecalculating(true);
    try {
      const res = await fetch('/api/cart/recalculate', { method: 'POST' });
      const data = await res.json();
      if (data.cart) {
        setCart(data.cart);
        const count = data.cart.lineItems.reduce(
          (s: number, li: LineItem) => s + li.quantity,
          0
        );
        setCartCount(count);
      }
    } finally {
      setRecalculating(false);
    }
  }

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  async function removeItem(lineItemId: string) {
    const res = await fetch('/api/cart/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineItemId }),
    });
    const data = await res.json();
    if (data.cart) {
      setCart(data.cart);
      const count = data.cart.lineItems.reduce(
        (s: number, li: LineItem) => s + li.quantity,
        0
      );
      setCartCount(count);
    }
  }

  async function removeGroup(ids: string[]) {
    let updatedCart = cart;
    for (const id of ids) {
      const res = await fetch('/api/cart/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItemId: id }),
      });
      const data = await res.json();
      if (data.cart) updatedCart = data.cart;
    }
    if (updatedCart) {
      setCart(updatedCart);
      const count = (updatedCart.lineItems ?? []).reduce(
        (s: number, li: LineItem) => s + li.quantity,
        0
      );
      setCartCount(count);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">
        Loading cart…
      </div>
    );
  }

  const lineItems = cart?.lineItems ?? [];

  // Classify line items
  const customBoxes = lineItems.filter(isCustomBox);
  const pickAndMixSelections = lineItems.filter(isPickAndMixSelection);
  const regularItems = lineItems.filter(
    (li) => !isCustomBox(li) && !isPickAndMixSelection(li)
  );

  // Map box id → its assigned selections (using the box's box-selection-ids field)
  function getAssignedSelections(box: LineItem): LineItem[] {
    const ids = (box.custom?.fields?.[BOX_SELECTION_IDS_FIELD] as string[] | undefined) ?? [];
    if (ids.length > 0) {
      return ids
        .map((id) => lineItems.find((li) => li.id === id))
        .filter((li): li is LineItem => !!li);
    }
    // Fallback: selections that reference this box
    return pickAndMixSelections.filter(
      (s) => (s.custom?.fields?.['assigned-box-line-item-id'] as string | undefined) === box.id
    );
  }

  const hasWarnings = regularItems.some((li) => li.custom?.fields?.[WARNING_FIELD]);

  const subtotal = lineItems.reduce(
    (sum, li) => sum + (li.totalPrice?.centAmount ?? 0),
    0
  );
  const currency = lineItems[0]?.totalPrice?.currencyCode ?? 'EUR';
  const discountCodes = cart?.discountCodes ?? [];
  const totalDiscount =
    cart?.discountOnTotalPrice?.discountedAmount?.centAmount ?? 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Your Cart</h1>
        <button
          onClick={recalculate}
          disabled={recalculating || lineItems.length === 0}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-red disabled:opacity-40 transition-colors"
          title="Recalculate prices and discounts"
        >
          <svg
            className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {recalculating ? 'Recalculating…' : 'Refresh prices'}
        </button>
      </div>

      {lineItems.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-6">Your cart is empty.</p>
          <Link
            href="/"
            className="bg-brand-red text-white px-8 py-3 rounded-full font-semibold hover:bg-brand-red-dark transition-colors"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Anonymous compatibility prompt */}
          {!isLoggedIn && hasWarnings && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <svg
                className="h-5 w-5 text-amber-500 mt-0.5 shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1">
                <p className="font-semibold text-amber-800 text-sm">
                  Check machine compatibility
                </p>
                <p className="text-amber-700 text-xs mt-0.5">
                  Sign in to verify these products are compatible with your machine.
                </p>
              </div>
              <Link
                href="/account/login"
                className="shrink-0 text-sm bg-amber-600 text-white px-4 py-1.5 rounded-full font-semibold hover:bg-amber-700 transition-colors"
              >
                Sign in
              </Link>
            </div>
          )}

          {/* Pick & Mix boxes — grouped with their selections */}
          {customBoxes.map((box) => (
            <PickAndMixBoxCard
              key={box.id}
              box={box}
              assignedSelections={getAssignedSelections(box)}
              currency={currency}
              onRemoveBox={removeGroup}
              isLoggedIn={isLoggedIn}
            />
          ))}

          {/* Unassigned selections (edge case: extension hasn't run yet) */}
          {pickAndMixSelections
            .filter(
              (s) =>
                !(s.custom?.fields?.['assigned-box-line-item-id'] as string | undefined) &&
                !customBoxes.some((b) => {
                  const ids = b.custom?.fields?.[BOX_SELECTION_IDS_FIELD] as string[] | undefined;
                  return ids?.includes(s.id);
                })
            )
            .map((s) => (
              <div key={s.id} className="bg-white rounded-xl p-4 shadow-sm border border-amber-100">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{getName(s)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      ×{s.quantity} servings · {s.quantity * getCapsulesPerServing(s)} capsules
                    </p>
                    <p className="text-xs text-amber-600 mt-1">Awaiting box assignment…</p>
                  </div>
                  <button
                    onClick={() => removeItem(s.id)}
                    className="text-xs text-red-500 hover:underline shrink-0"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

          {/* Regular items */}
          {regularItems.length > 0 && (
            <div className="flex flex-col gap-4">
              {regularItems.map((li) => {
                const warning = li.custom?.fields?.[WARNING_FIELD] as string | undefined;
                const isFave = li.custom?.fields?.['most-consumed-item'] === true;
                const discountedTotal = li.totalPrice?.centAmount ?? 0;
                const originalTotal = (li.price?.value?.centAmount ?? 0) * li.quantity;
                const hasLineDiscount = discountedTotal < originalTotal;

                return (
                  <div
                    key={li.id}
                    className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">{getName(li)}</h3>
                          {isFave && (
                            <span title="Favourite product" className="text-amber-500 text-sm">
                              ⭐
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">SKU: {li.variant?.sku}</p>
                        <p className="text-sm text-gray-600 mt-1">Qty: {li.quantity}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {hasLineDiscount ? (
                          <>
                            <span className="text-xs text-gray-400 line-through">
                              {formatPrice(originalTotal, currency)}
                            </span>
                            <span className="font-bold text-green-700">
                              {formatPrice(discountedTotal, currency)}
                            </span>
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                              −{formatPrice(originalTotal - discountedTotal, currency)}
                            </span>
                          </>
                        ) : (
                          <span className="font-bold text-gray-900">
                            {formatPrice(discountedTotal, currency)}
                          </span>
                        )}
                        <button
                          onClick={() => removeItem(li.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {isLoggedIn && warning && (
                      <div className="mt-3">
                        <CompatibilityWarning warning={warning} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Voucher */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            {discountCodes.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {discountCodes.map((dc, i) => (
                  <span
                    key={i}
                    className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium"
                  >
                    {typeof dc.discountCode === 'object' && 'id' in dc.discountCode
                      ? '✓ Discount applied'
                      : '✓ Voucher'}
                  </span>
                ))}
              </div>
            )}
            <VoucherInput onApplied={(updated) => setCart(updated as Cart)} />
          </div>

          {/* Summary */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal, currency)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-700 mb-2">
                <span>Discount</span>
                <span>−{formatPrice(totalDiscount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg mt-3 pt-3 border-t border-gray-100">
              <span>Total</span>
              <span>{formatPrice(subtotal - totalDiscount, currency)}</span>
            </div>
          </div>

          {/* Checkout */}
          <button
            onClick={() => alert('Demo: checkout would proceed here.')}
            className="w-full bg-brand-red text-white py-4 rounded-xl font-bold text-lg hover:bg-brand-red-dark transition-colors"
          >
            Proceed to Checkout
          </button>
        </div>
      )}
    </div>
  );
}
