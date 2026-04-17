'use client';
import Image from 'next/image';
import { useState } from 'react';
import { formatPrice } from '@/app/lib/format-price';
import AddToCartButton from './AddToCartButton';
import type { ProductProjection, ProductVariant } from '@commercetools/platform-sdk';

interface Props {
  product: ProductProjection;
  incompatible?: boolean;
}

function getAttr(variant: ProductVariant, name: string): unknown {
  return variant.attributes?.find((a) => a.name === name)?.value;
}

function getVariantPrice(variant: ProductVariant) {
  const price = variant.prices?.[0]?.value ?? variant.price?.value;
  return price ? { centAmount: price.centAmount, currencyCode: price.currencyCode } : null;
}

/** Returns the first image URL across all variants, preferring the selected one. */
function resolveImage(
  selected: ProductVariant,
  allVariants: ProductVariant[]
): string | null {
  // Prefer selected variant's own image
  if (selected.images?.[0]?.url) return selected.images[0].url;
  // Fall back to any variant that has an image
  for (const v of allVariants) {
    if (v.images?.[0]?.url) return v.images[0].url;
  }
  return null;
}

/** Label for a variant size button — uses serving-count attribute. */
function variantLabel(v: ProductVariant): string {
  const servingCount = getAttr(v, 'serving-count') as number | undefined;
  if (servingCount) return `${servingCount} capsules`;
  // pick-and-mix slots (box-content-count) as last resort
  const slotCost = getAttr(v, 'box-content-count') as number | undefined;
  if (slotCost) return `${slotCost} slot${slotCost !== 1 ? 's' : ''}`;
  return '';
}

export default function ProductCard({ product, incompatible = false }: Props) {
  const allVariants = [product.masterVariant, ...(product.variants ?? [])].filter(
    (v) => v.sku
  );

  // Default to first priced variant so BOX-* products are selected, not catalog BEV/POD refs
  const firstPricedVariant =
    allVariants.find((v) => (getVariantPrice(v)?.centAmount ?? 0) > 0) ?? allVariants[0];

  const [selectedVariant, setSelectedVariant] = useState(firstPricedVariant);

  const price = getVariantPrice(selectedVariant);
  const generation = (getAttr(selectedVariant, 'generation') as { key?: string } | undefined)?.key;
  const isNeo = generation === 'gen2';
  const isAdapterCompatible = generation === 'gen1.5';
  const isNeoLatte = generation === 'gen2-5';
  const imageUrl = resolveImage(selectedVariant, allVariants);
  const name =
    product.name['en-US'] ?? product.name['en-GB'] ?? product.name['en'] ?? 'Product';

  // Only show priced variants in the size selector
  const pricedVariants = allVariants.filter((v) => (getVariantPrice(v)?.centAmount ?? 0) > 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      {/* Product image */}
      <div className="relative h-44 bg-brand-red-light flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-contain p-3"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        ) : (
          <span className="text-brand-red font-bold text-base text-center px-4 leading-tight">
            {name}
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1 gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm leading-tight">{name}</h3>
          {(isNeo || isNeoLatte || isAdapterCompatible || incompatible) && (
            <div className="flex flex-wrap gap-1 mt-1">
              {isNeoLatte && (
                <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full">
                  NEO Latte
                </span>
              )}
              {isNeo && (
                <span className="text-xs bg-brand-red text-white px-2 py-0.5 rounded-full">
                  NEO
                </span>
              )}
              {isAdapterCompatible && (
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                  Neo and Neo Adapter
                </span>
              )}
              {incompatible && (
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                  Not compatible with your machine
                </span>
              )}
            </div>
          )}
        </div>

        {/* Size selector — only priced variants, labelled by serving-count */}
        {pricedVariants.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {pricedVariants.map((v) => {
              const label = variantLabel(v);
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariant(v)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    selectedVariant.id === v.id
                      ? 'border-brand-red bg-brand-red-light text-brand-red font-semibold'
                      : 'border-gray-300 text-gray-600 hover:border-brand-red'
                  }`}
                >
                  {label || v.sku}
                </button>
              );
            })}
          </div>
        )}

        {/* Single-variant serving count */}
        {pricedVariants.length === 1 && variantLabel(pricedVariants[0]) && (
          <p className="text-xs text-gray-500">{variantLabel(pricedVariants[0])}</p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="font-bold text-gray-900">
            {price ? formatPrice(price.centAmount, price.currencyCode) : '—'}
          </span>
          {selectedVariant.sku && price && price.centAmount > 0 && (
            <AddToCartButton sku={selectedVariant.sku} />
          )}
        </div>
      </div>
    </div>
  );
}
