'use client';
import Image from 'next/image';
import { useEffect, useState, useCallback } from 'react';
import { formatPrice } from '@/app/lib/format-price';
import { useCartStore } from '@/app/store/use-cart-store';
import { CAPSULE_LIMIT, PICK_AND_MIX_BOX_SKU, PICK_AND_MIX_BOX_NEO_SKU, PICK_AND_MIX_BOX_GEN25_SKU } from '@/app/lib/constants';
import type { MachineProfile } from '@/app/store/use-cart-store';
import type { ProductProjection, ProductVariant } from '@commercetools/platform-sdk';

interface BeverageSelection {
  sku: string;
  quantity: number;
  capsulesPerServing: number; // box-content-count
  name: string;
  price: number;
  currency: string;
  generation: 'gen1' | 'gen2' | 'gen1.5' | 'gen2-5';
  imageUrl: string | null;
}

function getAttr(variant: ProductVariant, name: string): unknown {
  return variant.attributes?.find((a) => a.name === name)?.value;
}

function getVariantPrice(variant: ProductVariant) {
  const price = variant.prices?.[0]?.value ?? variant.price?.value;
  return price
    ? { centAmount: price.centAmount, currencyCode: price.currencyCode }
    : { centAmount: 0, currencyCode: 'EUR' };
}

function capsuleLabel(count: number) {
  return count === 1 ? '1 capsule per serving' : `${count} capsules per serving`;
}

function BeverageCard({
  product,
  selection,
  capsulesLeft,
  onAdjust,
  beverageImageUrl,
}: {
  product: ProductProjection;
  selection: BeverageSelection | undefined;
  capsulesLeft: number;
  onAdjust: (delta: number) => void;
  beverageImageUrl?: string;
}) {
  const variant = product.masterVariant;
  const capsulesPerServing =
    (getAttr(variant, 'box-content-count') as number | undefined) ?? 1;
  const { centAmount, currencyCode } = getVariantPrice(variant);
  const qty = selection?.quantity ?? 0;
  const imageUrl = beverageImageUrl ?? variant.images?.[0]?.url ?? null;
  const name =
    product.name['en-GB'] ??
    product.name['en-US'] ??
    product.name['en'] ??
    variant.sku!;

  const canAdd = capsulesLeft >= capsulesPerServing;
  const canAdd5 = capsulesLeft >= capsulesPerServing * 5;
  const canAdd10 = capsulesLeft >= capsulesPerServing * 10;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col gap-2">
      <div className="relative h-24 bg-brand-red-light rounded-lg overflow-hidden flex items-center justify-center">
        {imageUrl ? (
          <Image src={imageUrl} alt={name} fill className="object-contain p-2" sizes="200px" />
        ) : (
          <span className="text-brand-red font-semibold text-sm text-center px-2">{name}</span>
        )}
      </div>

      <p className="font-semibold text-gray-900 text-sm leading-tight">{name}</p>
      <p className="text-xs text-gray-500">{capsuleLabel(capsulesPerServing)}</p>
      <p className="text-xs font-medium text-gray-700">
        {formatPrice(centAmount, currencyCode)} / serving
      </p>

      <div className="flex flex-col gap-1.5 mt-auto">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAdjust(-1)}
            disabled={qty === 0}
            className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:border-brand-red disabled:opacity-30"
          >
            −
          </button>
          <span className="w-6 text-center font-semibold text-sm">{qty}</span>
          <button
            onClick={() => onAdjust(1)}
            disabled={!canAdd}
            className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:border-brand-red disabled:opacity-30"
          >
            +
          </button>
          {qty > 0 && (
            <span className="text-xs text-brand-red font-medium ml-1">
              {qty * capsulesPerServing} caps
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => onAdjust(5)}
            disabled={!canAdd5}
            className="flex-1 text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:border-brand-red disabled:opacity-30 transition-colors"
          >
            +5
          </button>
          <button
            onClick={() => onAdjust(10)}
            disabled={!canAdd10}
            className="flex-1 text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:border-brand-red disabled:opacity-30 transition-colors"
          >
            +10
          </button>
          {qty >= 5 && (
            <button
              onClick={() => onAdjust(-5)}
              className="flex-1 text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:border-brand-red transition-colors"
            >
              −5
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BoxSummary({
  label,
  capsulesUsed,
  selections,
  boxSkuLabel,
}: {
  label: string;
  capsulesUsed: number;
  selections: BeverageSelection[];
  boxSkuLabel: string;
}) {
  const capsulesLeft = CAPSULE_LIMIT - capsulesUsed;
  const pct = Math.min(100, (capsulesUsed / CAPSULE_LIMIT) * 100);
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</span>
        <span className="text-xs text-gray-400">{boxSkuLabel}</span>
      </div>
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{capsulesUsed} / {CAPSULE_LIMIT} capsules</span>
        <span className={capsulesLeft === 0 ? 'text-green-600 font-semibold' : 'text-gray-400'}>
          {capsulesLeft === 0 ? 'Full!' : `${capsulesLeft} left`}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden mb-2">
        <div
          className="bg-brand-red h-2.5 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {selections.length > 0 && (
        <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
          {selections.map((s) => (
            <div key={s.sku} className="flex justify-between text-xs text-gray-600">
              <span className="truncate pr-2">{s.name}</span>
              <span className="shrink-0 text-gray-400">
                ×{s.quantity} ({s.quantity * s.capsulesPerServing} caps)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PickAndMixBuilder({ machineProfile }: { machineProfile: MachineProfile | null }) {
  const [products, setProducts] = useState<ProductProjection[]>([]);
  const [beverageImages, setBeverageImages] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<Map<string, BeverageSelection>>(new Map());
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState(false);
  const [message, setMessage] = useState('');
  const { isLoggedIn, incrementCart } = useCartStore();

  // Determine which generation sections to show based on the user's machines.
  // Falls back to showing all if not logged in or no machine configured.
  const hasAnyMachine =
    machineProfile && (machineProfile.isGen1 || machineProfile.isGen2 || machineProfile.isGen25);
  const showGen1 = !hasAnyMachine || machineProfile!.isGen1;
  const showNeo =
    !hasAnyMachine ||
    machineProfile!.isGen2 ||
    (machineProfile!.isGen1 && machineProfile!.hasAdapter) ||
    machineProfile!.isGen25;
  const showGen25 = !hasAnyMachine || machineProfile!.isGen25;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/products/pick-and-mix');
      const data = await res.json();
      setProducts(data.products ?? []);
      setBeverageImages(data.beverageImages ?? {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const gen1Products = products.filter((p) => {
    const gen = (getAttr(p.masterVariant, 'generation') as { key?: string } | undefined)?.key;
    return gen === 'gen1';
  });

  // NEO section includes gen2, gen1.5, and gen2-5 — all share one box
  const neoProducts = products.filter((p) => {
    const gen = (getAttr(p.masterVariant, 'generation') as { key?: string } | undefined)?.key;
    return gen === 'gen2' || gen === 'gen1.5' || gen === 'gen2-5';
  });

  const gen1Selections = Array.from(selections.values()).filter(
    (s) => s.generation === 'gen1'
  );
  const neoSelections = Array.from(selections.values()).filter(
    (s) => s.generation === 'gen2' || s.generation === 'gen1.5' || s.generation === 'gen2-5'
  );

  const gen1CapsulesUsed = gen1Selections.reduce(
    (sum, s) => sum + s.quantity * s.capsulesPerServing,
    0
  );
  const neoCapsulesUsed = neoSelections.reduce(
    (sum, s) => sum + s.quantity * s.capsulesPerServing,
    0
  );

  function adjustQuantity(product: ProductProjection, delta: number) {
    const variant = product.masterVariant;
    const sku = variant.sku!;
    const capsulesPerServing =
      (getAttr(variant, 'box-content-count') as number | undefined) ?? 1;
    const generation = (
      (getAttr(variant, 'generation') as { key?: string } | undefined)?.key ?? 'gen1'
    ) as BeverageSelection['generation'];
    const capsulesUsed =
      generation === 'gen1' ? gen1CapsulesUsed : neoCapsulesUsed;
    const name =
      product.name['en-GB'] ??
      product.name['en-US'] ??
      product.name['en'] ??
      sku;
    const { centAmount, currencyCode } = getVariantPrice(variant);

    setSelections((prev) => {
      const updated = new Map(prev);
      const current = updated.get(sku);
      const currentQty = current?.quantity ?? 0;
      const newQty = currentQty + delta;

      if (newQty <= 0) {
        updated.delete(sku);
        return updated;
      }

      const currentCost = currentQty * capsulesPerServing;
      const newCost = newQty * capsulesPerServing;
      const projected = capsulesUsed - currentCost + newCost;
      if (projected > CAPSULE_LIMIT) return prev;

      updated.set(sku, {
        sku,
        quantity: newQty,
        capsulesPerServing,
        name,
        price: centAmount,
        currency: currencyCode,
        generation,
        imageUrl: variant.images?.[0]?.url ?? null,
      });
      return updated;
    });
  }

  async function addAllToCart() {
    const hasGen1 = gen1Selections.length > 0;
    const hasNeo = neoSelections.length > 0;
    if (!hasGen1 && !hasNeo) return;

    setAddingToCart(true);
    try {
      if (hasGen1) {
        await fetch('/api/cart/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku: PICK_AND_MIX_BOX_SKU, quantity: 1 }),
        });
        for (const sel of gen1Selections) {
          await fetch('/api/cart/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku: sel.sku, quantity: sel.quantity }),
          });
        }
      }
      if (hasNeo) {
        await fetch('/api/cart/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku: PICK_AND_MIX_BOX_NEO_SKU, quantity: 1 }),
        });
        for (const sel of neoSelections) {
          await fetch('/api/cart/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku: sel.sku, quantity: sel.quantity }),
          });
        }
      }

      const totalQty =
        (hasGen1 ? 1 : 0) +
        gen1Selections.reduce((s, sel) => s + sel.quantity, 0) +
        (hasNeo ? 1 : 0) +
        neoSelections.reduce((s, sel) => s + sel.quantity, 0);

      incrementCart(totalQty);
      setSelections(new Map());
      setMessage('Added to cart!');
      setTimeout(() => setMessage(''), 4000);
    } finally {
      setAddingToCart(false);
    }
  }

  async function saveMix() {
    if (!isLoggedIn || selections.size === 0) return;
    const lineItems = Array.from(selections.values()).map((s) => ({
      sku: s.sku,
      quantity: s.quantity,
    }));
    const res = await fetch('/api/shopping-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `My Mix ${new Date().toLocaleDateString()}`,
        lineItems,
      }),
    });
    if (res.ok) {
      setMessage('Mix saved!');
      setTimeout(() => setMessage(''), 3000);
    }
  }

  const hasAnySelection = gen1Selections.length > 0 || neoSelections.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-start gap-8">
        {/* Left: product sections */}
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Pick &amp; Mix</h1>
          <p className="text-gray-500 text-sm mb-8">
            Build your perfect 50-capsule box. Each serving uses 1 or 2 capsules depending on the
            drink.
          </p>

          {loading ? (
            <p className="text-gray-500">Loading beverages…</p>
          ) : (
            <div className="flex flex-col gap-10">
              {/* Gen1 section */}
              {showGen1 && gen1Products.length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Classic (Gen1)</h2>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {gen1CapsulesUsed}/{CAPSULE_LIMIT} capsules
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {gen1Products.map((product) => (
                      <BeverageCard
                        key={product.id}
                        product={product}
                        selection={selections.get(product.masterVariant.sku!)}
                        capsulesLeft={CAPSULE_LIMIT - gen1CapsulesUsed}
                        onAdjust={(delta) => adjustQuantity(product, delta)}
                        beverageImageUrl={beverageImages[product.id]}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* NEO section — gen2, gen1.5, and gen2-5 all share one box */}
              {showNeo && neoProducts.length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-xl font-bold text-gray-800">NEO</h2>
                    <span className="text-xs bg-brand-red text-white px-2 py-0.5 rounded-full">
                      NEO Machine
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {neoCapsulesUsed}/{CAPSULE_LIMIT} capsules
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {neoProducts.map((product) => (
                      <BeverageCard
                        key={product.id}
                        product={product}
                        selection={selections.get(product.masterVariant.sku!)}
                        capsulesLeft={CAPSULE_LIMIT - neoCapsulesUsed}
                        onAdjust={(delta) => adjustQuantity(product, delta)}
                        beverageImageUrl={beverageImages[product.id]}
                      />
                    ))}
                  </div>
                </section>
              )}

              {!(showGen1 && gen1Products.length > 0) &&
                !(showNeo && neoProducts.length > 0) && (
                <p className="text-gray-500">No Pick &amp; Mix beverages found.</p>
              )}
            </div>
          )}
        </div>

        {/* Right: box summary + actions */}
        <div className="md:w-72 shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sticky top-4">
            <h2 className="font-bold text-gray-900 mb-4">Your Mix</h2>

            {!hasAnySelection ? (
              <p className="text-sm text-gray-400 text-center py-4">
                Select beverages from the grid to build your box
              </p>
            ) : (
              <div className="flex flex-col gap-4 mb-4">
                {gen1Selections.length > 0 && (
                  <BoxSummary
                    label="Classic Box"
                    capsulesUsed={gen1CapsulesUsed}
                    selections={gen1Selections}
                    boxSkuLabel="CUSTOM-BOX-GEN1-50"
                  />
                )}
                {neoSelections.length > 0 && (
                  <BoxSummary
                    label="NEO Box"
                    capsulesUsed={neoCapsulesUsed}
                    selections={neoSelections}
                    boxSkuLabel="CUSTOM-BOX-NEO-50"
                  />
                )}
              </div>
            )}

            {message && (
              <p className="text-sm text-green-700 bg-green-50 rounded p-2 mb-3">{message}</p>
            )}

            <button
              onClick={addAllToCart}
              disabled={!hasAnySelection || addingToCart}
              className="w-full bg-brand-red text-white py-2.5 rounded-lg font-semibold hover:bg-brand-red-dark disabled:opacity-50 transition-colors mb-2"
            >
              {addingToCart ? 'Adding…' : 'Add Box to Cart'}
            </button>

            {isLoggedIn && (
              <button
                onClick={saveMix}
                disabled={!hasAnySelection}
                className="w-full border border-brand-red text-brand-red py-2.5 rounded-lg font-semibold hover:bg-brand-red-light disabled:opacity-50 transition-colors text-sm"
              >
                Save Mix
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
