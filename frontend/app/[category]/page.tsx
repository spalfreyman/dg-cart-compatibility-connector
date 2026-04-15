import { notFound } from 'next/navigation';
import { apiRoot } from '@/app/lib/ctp-client';
import ProductCard from '@/app/components/product/ProductCard';
import { CATEGORIES } from '@/app/lib/constants';
import { getCustomerId } from '@/app/lib/cookies';
import type { ProductProjection } from '@commercetools/platform-sdk';

interface Props {
  params: Promise<{ category: string }>;
}

async function getCustomerCompatibleGens(customerId: string | undefined): Promise<Set<string>> {
  if (!customerId) return new Set();
  try {
    const res = await apiRoot.customers().withId({ ID: customerId }).get().execute();
    const fields = res.body.custom?.fields ?? {};
    const gens = new Set<string>();
    if (fields['is-gen1'] === true) {
      gens.add('gen1');
      if (fields['has-neo-adapter'] === true) gens.add('gen1.5');
    }
    if (fields['is-gen2'] === true) {
      gens.add('gen2');
      gens.add('gen1.5');
    }
    return gens;
  } catch {
    return new Set();
  }
}

async function getProductsByCategory(categorySlug: string): Promise<ProductProjection[]> {
  const catRes = await apiRoot
    .categories()
    .get({ queryArgs: { where: `slug(en-US="${categorySlug}")`, limit: 1 } })
    .execute();

  const cat = catRes.body.results[0];
  if (!cat) return [];

  const res = await apiRoot
    .productProjections()
    .get({
      queryArgs: {
        where: `categories(id="${cat.id}")`,
        limit: 50,
        staged: false,
      },
    })
    .execute();

  return res.body.results;
}

export default async function CategoryPage({ params }: Props) {
  const { category } = await params;

  const label = CATEGORIES[category];
  if (!label) notFound();

  const [allProducts, customerId] = await Promise.all([
    getProductsByCategory(category),
    getCustomerId(),
  ]);

  // Only show BOX products (priced variants only — filters out BEV/POD catalog refs)
  const products = allProducts.filter((p) => {
    const allVariants = [p.masterVariant, ...(p.variants ?? [])];
    return allVariants.some((v) => (v.prices?.[0]?.value.centAmount ?? 0) > 0);
  });

  // Only evaluate compatibility when logged in
  const loggedIn = Boolean(customerId);
  const compatibleGens = loggedIn
    ? await getCustomerCompatibleGens(customerId)
    : new Set<string>();

  function isIncompatible(product: ProductProjection): boolean {
    if (!loggedIn) return false;
    const gen = (
      product.masterVariant.attributes?.find((a) => a.name === 'generation')?.value as
        | { key?: string }
        | undefined
    )?.key ?? null;
    if (!gen) return false;
    // If the customer has no machines configured at all, flag everything
    if (compatibleGens.size === 0) return true;
    return !compatibleGens.has(gen);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{label}</h1>
      <p className="text-gray-500 text-sm mb-8">{products.length} products</p>

      {products.length === 0 ? (
        <p className="text-gray-500">No products found in this category.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} incompatible={isIncompatible(p)} />
          ))}
        </div>
      )}
    </div>
  );
}
