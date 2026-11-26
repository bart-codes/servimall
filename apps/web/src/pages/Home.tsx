import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, CATEGORY_LABELS, money, useLoad, type Business, type Category, type Region } from '../api';
import { Loading, Notice } from '../components/ui';

const CATEGORY_BLURB: Record<Category, string> = {
  'body-art': 'Tattoos by appointment',
  'home-services': 'Cleaning and waste disposal',
  food: 'Home-based catering',
  'farm-goods': 'Eggs, produce, mushroom grow kits',
  digital: 'Websites and graphic design',
};

export default function Home() {
  const regions = useLoad(() => api<Region[]>('/regions'), []);
  const region = regions.data?.[0];
  const [category, setCategory] = useState<Category | ''>('');
  const [q, setQ] = useState('');
  const shops = useLoad(
    () => (region ? api<Business[]>(`/businesses?region=${region._id}${category ? `&category=${category}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`) : Promise.resolve([])),
    [region?._id, category, q],
  );

  return (
    <div className="space-y-8">
      <section>
        <h1 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">
          Book local services. Order fresh goods. Pay with M-Pesa.
        </h1>
        {region && <p className="mt-2 text-ink/70">Now serving {region.name}.</p>}
      </section>

      <section aria-label="Directory">
        <h2 className="mb-2 text-lg font-bold">What do you need?</h2>
        <ul className="divide-y divide-mist rounded-lg border border-mist bg-white">
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
            <li key={c}>
              <button
                onClick={() => setCategory(category === c ? '' : c)}
                aria-pressed={category === c}
                className={`flex w-full items-baseline justify-between gap-4 px-4 py-3 text-left ${category === c ? 'bg-lake-soft' : 'hover:bg-paper'}`}
              >
                <span className="font-display text-xl font-bold">{CATEGORY_LABELS[c]}</span>
                <span className="text-sm text-ink/60">{CATEGORY_BLURB[c]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Shops">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{category ? CATEGORY_LABELS[category] : 'All shops'}</h2>
          <input className="input max-w-xs" type="search" placeholder="Search shops" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search shops" />
        </div>
        {(regions.error || shops.error) && <Notice>{regions.error || shops.error}</Notice>}
        {(regions.loading || shops.loading) && <Loading />}
        {!shops.loading && shops.data?.length === 0 && (
          <Notice kind="info">No shops here yet. {category && 'Try another category.'}</Notice>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {shops.data?.map((b) => (
            <Link key={b._id} to={`/shop/${b.slug}`} className="card block hover:border-lake">
              <h3 className="text-lg font-bold">{b.name}</h3>
              <p className="text-sm text-ink/60">{CATEGORY_LABELS[b.category]} in {b.town}</p>
              <p className="mt-2 line-clamp-2 text-sm">{b.description}</p>
              <p className="mt-3 flex justify-between text-sm font-semibold text-lake-dark">
                <span>{b.serviceCount ?? 0} {b.serviceCount === 1 ? 'item' : 'items'}{b.fromPrice != null && ` from ${money(b.fromPrice)}`}</span>
                {b.ratingCount > 0 && <span>{b.ratingAverage.toFixed(1)} stars ({b.ratingCount})</span>}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
