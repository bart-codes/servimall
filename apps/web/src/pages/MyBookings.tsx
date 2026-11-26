import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDateTime, money, useLoad, WINDOWS, type Booking, type Quote, type WindowKey } from '../api';
import { useAuth } from '../auth';
import Reschedule from '../components/Reschedule';
import { Badge, Field, Loading, Notice } from '../components/ui';

function when(b: Booking) {
  if (b.slotStart) return fmtDateTime(b.slotStart);
  if (b.projectDeadline) return `Due ${b.projectDeadline}`;
  const w = b.delivery?.windowKey ? WINDOWS[b.delivery.windowKey as WindowKey]?.label : '';
  return `${b.delivery?.windowDate ?? ''} ${w}`.trim();
}

function ReviewForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  return (
    <form className="mt-3 space-y-2 border-t border-mist pt-3" onSubmit={async (e) => {
      e.preventDefault();
      try { await api(`/bookings/${id}/review`, { body: { rating, comment } }); onDone(); } catch (err) { setError((err as Error).message); }
    }}>
      <label className="block text-sm font-medium">Rating
        <select className="input mt-1" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} out of 5</option>)}
        </select>
      </label>
      <textarea className="input" rows={2} placeholder="How was it? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <Notice>{error}</Notice>}
      <button className="btn-primary">Submit review</button>
    </form>
  );
}

function DisputeForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  return (
    <form className="mt-3 space-y-2 border-t border-mist pt-3" onSubmit={async (e) => {
      e.preventDefault();
      try { await api(`/bookings/${id}/dispute`, { body: { reason } }); onDone(); } catch (err) { setError((err as Error).message); }
    }}>
      <Field label="What went wrong?" hint="We will review it and contact you. The shop is not paid for this booking until it is resolved."><textarea className="input" rows={3} required minLength={10} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {error && <Notice>{error}</Notice>}
      <button className="btn-primary">Report the problem</button>
    </form>
  );
}

function Quotes() {
  const { user } = useAuth();
  const { data, error, reload } = useLoad(() => api<Quote[]>('/quotes/mine'), []);
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  if (!data?.length) return error ? <Notice>{error}</Notice> : null;

  async function accept(q: Quote) {
    setMsg(''); setErr('');
    try {
      const r = await api<{ paymentError?: string }>(`/quotes/${q._id}/accept`, { body: { phone } });
      setMsg(r.paymentError ?? 'Check your phone and enter your M-Pesa PIN to pay the deposit. Your booking appears above once payment is confirmed.');
      void reload();
    } catch (e) { setErr((e as Error).message); }
  }
  async function decline(q: Quote) {
    try { await api(`/quotes/${q._id}/decline`, { body: {} }); void reload(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">My quote requests</h2>
      {msg && <Notice kind="info">{msg}</Notice>}
      {err && <Notice>{err}</Notice>}
      {data.map((q) => (
        <div key={q._id} className="card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{q.serviceName} <span className="font-normal text-ink/60">· {q.business?.name}</span></p>
              <p className="mt-1 line-clamp-2 text-sm text-ink/70">{q.brief}</p>
            </div>
            <Badge status={q.status === 'offered' ? 'pending_payment' : q.status === 'accepted' ? 'confirmed' : q.status === 'requested' ? 'pending_payment' : 'expired'} />
          </div>
          <p className="mt-1 text-sm capitalize text-ink/60">{q.status === 'requested' ? 'Waiting for the shop to reply' : q.status}</p>
          {q.status === 'offered' && q.priceOffered != null && (
            <div className="mt-3 space-y-2 rounded-md bg-lake-soft p-3 text-sm">
              <p className="font-semibold">Offer: {money(q.priceOffered)}{q.deadline ? `, ready by ${q.deadline}` : ''}</p>
              {q.note && <p>{q.note}</p>}
              {q.offerExpiresAt && <p className="text-ink/70">Valid until {fmtDateTime(q.offerExpiresAt)}</p>}
              <Field label="M-Pesa number for the deposit"><input className="input max-w-xs" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
              <div className="flex gap-2"><button className="btn-sun" onClick={() => accept(q)}>Accept and pay deposit</button><button className="btn-ghost" onClick={() => decline(q)}>Decline</button></div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

export default function MyBookings() {
  const { data, error, loading, reload } = useLoad(() => api<Booking[]>('/bookings/mine'), []);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [panel, setPanel] = useState<{ id: string; kind: 'review' | 'dispute' | 'move' } | null>(null);

  async function cancel(b: Booking) {
    if (!window.confirm(`Cancel ${b.serviceName}?`)) return;
    setErr(''); setMsg('');
    try {
      const r = await api<{ refundDue: number }>(`/bookings/${b._id}/cancel`, { body: {} });
      setMsg(r.refundDue > 0 ? `Cancelled. A refund of ${money(r.refundDue)} will be sent to your M-Pesa number.` : 'Cancelled. No payment was taken, or it is not refundable under the shop policy.');
      void reload();
    } catch (e) { setErr((e as Error).message); }
  }
  const toggle = (id: string, kind: 'review' | 'dispute' | 'move') => setPanel(panel?.id === id && panel.kind === kind ? null : { id, kind });
  const canMove = (b: Booking) => b.kind === 'service' && b.status === 'confirmed' && !!b.slotStart && (b.rescheduleCount ?? 0) < 1 && new Date(b.slotStart).getTime() - Date.now() >= 24 * 3600e3;
  const canReport = (b: Booking) => ['confirmed', 'completed', 'no_show', 'cancelled_by_shop'].includes(b.status) && !b.disputed;

  if (loading) return <Loading />;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">My bookings</h1>
      {(error || err) && <Notice>{error || err}</Notice>}
      {msg && <Notice kind="ok">{msg}</Notice>}
      {data?.length === 0 && <Notice kind="info">Nothing here yet. <Link className="underline" to="/">Find a shop</Link>.</Notice>}
      <ul className="space-y-3">
        {data?.map((b) => (
          <li key={b._id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{b.kind === 'goods' ? `${b.quantity} x ` : ''}{b.serviceName}</h2>
                <p className="text-sm text-ink/70">{b.business?.name} · {when(b)}</p>
                <p className="text-sm">Reference {b.reference} · Total {money(b.total)} · Paid {money(b.amountPaid)}</p>
                {b.delivery && b.status === 'confirmed' && <p className="text-sm">Order status: <Badge status={b.delivery.status} /></p>}
                {b.refundDue > 0 && <p className="text-sm text-ink/70">{b.refundedAt ? 'Refund sent' : `Refund of ${money(b.refundDue)} pending`}</p>}
                {b.disputed && <p className="text-sm text-ink/70">Problem reported. We will contact you.</p>}
              </div>
              <Badge status={b.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {canMove(b) && <button className="btn-ghost" onClick={() => toggle(b._id, 'move')}>Change time</button>}
              {['pending_payment', 'confirmed'].includes(b.status) && <button className="btn-danger" onClick={() => cancel(b)}>Cancel</button>}
              {b.status === 'completed' && <button className="btn-ghost" onClick={() => toggle(b._id, 'review')}>Leave a review</button>}
              {canReport(b) && <button className="btn-ghost" onClick={() => toggle(b._id, 'dispute')}>Report a problem</button>}
              {b.business?.whatsapp && <a className="btn-ghost" href={`https://wa.me/${b.business.whatsapp}`} target="_blank" rel="noreferrer">Message the shop</a>}
            </div>
            {panel?.id === b._id && panel.kind === 'review' && <ReviewForm id={b._id} onDone={() => { setPanel(null); setMsg('Thanks for your review.'); }} />}
            {panel?.id === b._id && panel.kind === 'dispute' && <DisputeForm id={b._id} onDone={() => { setPanel(null); setMsg('Thanks. We received your report and will contact you.'); void reload(); }} />}
            {panel?.id === b._id && panel.kind === 'move' && <Reschedule booking={b} onDone={() => { setPanel(null); setMsg('Your booking was moved. The shop has been told.'); void reload(); }} />}
          </li>
        ))}
      </ul>
      <Quotes />
    </div>
  );
}
