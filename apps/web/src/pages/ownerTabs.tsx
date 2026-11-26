import { useState } from 'react';
import { api, fmtDateTime, money, todayEat, useLoad, type Payout, type Quote, type Review } from '../api';
import { Badge, Field, Loading, Notice } from '../components/ui';

// ------------------------------------------------------------------ quotes
function OfferForm({ quote, onDone }: { quote: Quote; onDone: () => void }) {
  const [price, setPrice] = useState(quote.priceOffered ?? 0);
  const [deadline, setDeadline] = useState(quote.deadline ?? '');
  const [note, setNote] = useState(quote.note ?? '');
  const [error, setError] = useState('');
  async function send(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try { await api(`/owner/quotes/${quote._id}/offer`, { body: { priceOffered: price, deadline, note: note || undefined } }); onDone(); }
    catch (err) { setError((err as Error).message); }
  }
  return (
    <form onSubmit={send} className="mt-3 grid gap-3 border-t border-mist pt-3 sm:grid-cols-3">
      <Field label="Price (KES)"><input className="input" type="number" min={1} required value={price || ''} onChange={(e) => setPrice(Number(e.target.value) || 0)} /></Field>
      <Field label="Ready by"><input className="input" type="date" min={todayEat()} required value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
      <div className="sm:col-span-3"><Field label="Note to the customer (optional)"><textarea className="input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
      <div className="space-y-2 sm:col-span-3">
        {error && <Notice>{error}</Notice>}
        <button className="btn-primary">{quote.status === 'offered' ? 'Update offer' : 'Send offer'}</button>
        <p className="text-xs text-ink/60">The customer has 7 days to accept. They pay your deposit when they accept.</p>
      </div>
    </form>
  );
}

export function QuotesTab({ businessId }: { businessId: string }) {
  const { data, error, loading, reload } = useLoad(() => api<Quote[]>(`/owner/quotes?businessId=${businessId}`), [businessId]);
  const [open, setOpen] = useState('');
  const [err, setErr] = useState('');
  if (loading) return <Loading />;
  async function decline(q: Quote) {
    if (!window.confirm('Decline this request?')) return;
    try { await api(`/owner/quotes/${q._id}/decline`, { body: {} }); void reload(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="space-y-3">
      {(error || err) && <Notice>{error || err}</Notice>}
      {data?.length === 0 && <Notice kind="info">No quote requests yet. Mark an item as "By quote" in Services and goods to receive them.</Notice>}
      {data?.map((q) => (
        <div key={q._id} className="card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{q.serviceName}</p>
              <p className="text-sm">{q.customer?.name} · <a className="underline" href={`tel:+${q.contactPhone}`}>{q.contactPhone}</a>{q.preferredDate ? ` · wants it by ${q.preferredDate}` : ''}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{q.brief}</p>
              {q.priceOffered != null && <p className="mt-2 text-sm font-semibold">Offered {money(q.priceOffered)}, ready by {q.deadline}</p>}
            </div>
            <Badge status={q.status === 'accepted' ? 'confirmed' : q.status === 'declined' || q.status === 'expired' ? 'expired' : 'pending_payment'} />
          </div>
          <p className="mt-1 text-sm capitalize text-ink/60">{q.status}</p>
          {['requested', 'offered'].includes(q.status) && (
            <div className="mt-2 flex gap-2">
              <button className="btn-primary" onClick={() => setOpen(open === q._id ? '' : q._id)}>{q.status === 'offered' ? 'Change offer' : 'Make an offer'}</button>
              <button className="btn-danger" onClick={() => decline(q)}>Decline</button>
            </div>
          )}
          {open === q._id && <OfferForm quote={q} onDone={() => { setOpen(''); void reload(); }} />}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ reviews
export function ReviewsTab({ businessId }: { businessId: string }) {
  const { data, error, loading, reload } = useLoad(() => api<Review[]>(`/owner/reviews?businessId=${businessId}`), [businessId]);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  if (loading) return <Loading />;
  return (
    <div className="space-y-3">
      {(error || err) && <Notice>{error || err}</Notice>}
      {data?.length === 0 && <Notice kind="info">No reviews yet.</Notice>}
      {data?.map((r) => (
        <div key={r._id} className="card text-sm">
          <p className="font-semibold">{r.customerName}: {r.rating} out of 5 {r.status === 'hidden' && <span className="font-normal text-ink/60">(hidden by the platform)</span>}</p>
          {r.comment && <p>{r.comment}</p>}
          <p className="text-ink/60">{fmtDateTime(r.createdAt)}</p>
          {r.ownerReply ? <p className="mt-2 border-l-2 border-lake pl-2">Your reply: {r.ownerReply}</p> : (
            <form className="mt-2 flex flex-wrap gap-2" onSubmit={async (e) => {
              e.preventDefault();
              try { await api(`/owner/reviews/${r._id}/reply`, { body: { reply: reply[r._id] ?? '' } }); void reload(); } catch (x) { setErr((x as Error).message); }
            }}>
              <input aria-label="Reply" className="input flex-1" maxLength={500} placeholder="Write a public reply" value={reply[r._id] ?? ''} onChange={(e) => setReply({ ...reply, [r._id]: e.target.value })} />
              <button className="btn-ghost" disabled={!(reply[r._id] ?? '').trim()}>Reply</button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ earnings
interface Earnings { commissionRate: number; confirmedPaid: number; confirmedCount: number; awaitingPayout: number; awaitingCount: number; payouts: Payout[] }

export function EarningsTab({ businessId }: { businessId: string }) {
  const { data, error, loading } = useLoad(() => api<Earnings>(`/owner/earnings?businessId=${businessId}`), [businessId]);
  if (loading) return <Loading />;
  if (error || !data) return <Notice>{error || 'Could not load earnings'}</Notice>;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card"><p className="text-sm text-ink/60">Paid by customers, not completed yet</p><p className="text-2xl font-bold">{money(data.confirmedPaid)}</p><p className="text-sm">{data.confirmedCount} confirmed {data.confirmedCount === 1 ? 'booking' : 'bookings'}</p></div>
        <div className="card"><p className="text-sm text-ink/60">Completed, waiting for payout</p><p className="text-2xl font-bold">{money(data.awaitingPayout)}</p><p className="text-sm">{data.awaitingCount} completed. Platform fee {Math.round(data.commissionRate * 100)}%.</p></div>
      </div>
      <h3 className="text-lg font-bold">Payouts</h3>
      {data.payouts.length === 0 && <Notice kind="info">No payouts yet. Completed bookings are paid out after a short hold so problems can be reported.</Notice>}
      <ul className="space-y-2">
        {data.payouts.map((p) => (
          <li key={p._id} className="card flex flex-wrap items-center justify-between gap-2 text-sm">
            <div><p className="font-semibold">{money(p.net)} for {p.bookingCount} {p.bookingCount === 1 ? 'booking' : 'bookings'}</p><p className="text-ink/70">Up to {p.periodEnd} · fee {money(p.commission)}{p.mpesaReference ? ` · M-Pesa ${p.mpesaReference}` : ''}</p></div>
            <Badge status={p.status === 'paid' ? 'confirmed' : 'pending_payment'} />
          </li>
        ))}
      </ul>
    </div>
  );
}
