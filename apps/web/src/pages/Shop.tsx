import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, CATEGORY_LABELS, money, thumb, useLoad, type Business, type Service } from '../api';
import BookingPanel from '../components/BookingPanel';
import QuoteForm from '../components/QuoteForm';
import { Loading, Notice } from '../components/ui';

interface ShopData {
  business: Business;
  whatsappUrl: string | null;
  services: Service[];
  weeklyHours: { day: number; open: string; close: string }[];
  reviews: { id: string; rating: number; comment: string; name: string; ownerReply?: string }[];
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function priceLabel(s: Service) {
  if (s.priceType === 'quote') return 'Price on request';
  return `${s.priceType === 'from' ? 'From ' : ''}${money(s.price)}${s.kind === 'goods' && s.unit ? ` per ${s.unit}` : ''}`;
}

export default function Shop() {
  const { slug = '' } = useParams();
  const { data, error, loading } = useLoad(() => api<ShopData>(`/businesses/${slug}`), [slug]);
  const [open, setOpen] = useState('');

  if (loading) return <Loading />;
  if (error || !data) return <Notice>{error || 'Shop not found'}</Notice>;
  const { business: b, services } = data;

  return (
    <div className="space-y-6">
      <header>
        {b.logoUrl && <img src={thumb(b.logoUrl, 160, 160)} alt="" className="mb-3 h-20 w-20 rounded-lg border border-mist object-cover" />}
        <p className="text-sm text-ink/60">{CATEGORY_LABELS[b.category]} in {b.town}</p>
        <h1 className="text-3xl font-extrabold">{b.name}</h1>
        <p className="mt-2 max-w-2xl">{b.description}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {data.whatsappUrl && <a className="btn-ghost" href={data.whatsappUrl} target="_blank" rel="noreferrer">Message on WhatsApp</a>}
          <a className="btn-ghost" href={`tel:+${b.phone}`}>Call the shop</a>
          {b.ratingCount > 0 && <span className="self-center font-semibold">{b.ratingAverage.toFixed(1)} stars from {b.ratingCount} reviews</span>}
        </div>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-bold">What you can book or order</h2>
        {services.length === 0 && <Notice kind="info">This shop has not listed anything yet.</Notice>}
        <ul className="space-y-3">
          {services.map((s) => {
            const soldOut = s.kind === 'goods' && (s.stockQuantity ?? 0) < 1;
            return (
              <li key={s._id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    {s.photos?.[0] && <img src={thumb(s.photos[0], 320, 220)} alt="" className="mb-2 h-28 w-40 rounded-md border border-mist object-cover" loading="lazy" />}
                    <h3 className="text-lg font-bold">{s.name}</h3>
                    <p className="text-sm text-ink/70">{s.description}</p>
                    <p className="mt-1 text-sm font-semibold text-lake-dark">
                      {priceLabel(s)}
                      {s.kind === 'service' && ` · ${s.durationMinutes >= 60 ? `${Math.round((s.durationMinutes / 60) * 10) / 10} h` : `${s.durationMinutes} min`}`}
                    </p>
                  </div>
                  {s.priceType === 'quote' ? (
                    <button className="btn-primary" aria-expanded={open === s._id} onClick={() => setOpen(open === s._id ? '' : s._id)}>{open === s._id ? 'Close' : 'Ask for a quote'}</button>
                  ) : soldOut ? (
                    <span className="rounded bg-brick/10 px-2 py-1 text-sm font-semibold text-brick">Sold out</span>
                  ) : (
                    <button className="btn-primary" aria-expanded={open === s._id} onClick={() => setOpen(open === s._id ? '' : s._id)}>
                      {open === s._id ? 'Close' : s.kind === 'goods' ? 'Order' : 'Book'}
                    </button>
                  )}
                </div>
                {open === s._id && (s.priceType === 'quote' ? <QuoteForm service={s} /> : <BookingPanel service={s} business={b} />)}
              </li>
            );
          })}
        </ul>
      </section>

      {data.weeklyHours.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">Opening hours</h2>
          <ul className="text-sm">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const h = data.weeklyHours.filter((x) => x.day === d);
              return <li key={d}>{DAYS[d]}: {h.length ? h.map((x) => `${x.open} to ${x.close}`).join(', ') : 'Closed'}</li>;
            })}
          </ul>
        </section>
      )}

      {data.reviews.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">Reviews</h2>
          <ul className="space-y-2">
            {data.reviews.map((r) => (
              <li key={r.id} className="card text-sm">
                <p className="font-semibold">{r.name}: {r.rating} out of 5</p>
                {r.comment && <p>{r.comment}</p>}
                {r.ownerReply && <p className="mt-1 border-l-2 border-lake pl-2 text-ink/80">Reply from the shop: {r.ownerReply}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
