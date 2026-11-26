import { useState } from 'react';
import { api, fmtDateTime, money, useLoad, type Dispute, type Payout, type Review } from '../api';
import { Badge, Field, Loading, Notice } from '../components/ui';

// ------------------------------------------------------------------ payouts
export function Payouts() {
  const { data, error, loading, reload } = useLoad(() => api<Payout[]>('/admin/payouts'), []);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  async function generate() {
    setErr(''); setMsg('');
    try { const r = await api<{ created: number }>('/admin/payouts/generate', { body: {} }); setMsg(r.created ? `${r.created} payout${r.created === 1 ? '' : 's'} created.` : 'Nothing is ready to pay out yet.'); void reload(); }
    catch (e) { setErr((e as Error).message); }
  }
  async function paid(p: Payout) {
    setErr('');
    try { await api(`/admin/payouts/${p._id}/paid`, { body: { mpesaReference: refs[p._id] ?? '' } }); void reload(); } catch (e) { setErr((e as Error).message); }
  }
  if (loading) return <Loading />;
  const pending = data?.filter((p) => p.status === 'pending') ?? [];
  const done = data?.filter((p) => p.status === 'paid') ?? [];
  return (
    <div className="space-y-4">
      <Notice kind="info">Create payouts for completed bookings that are past the hold period and not disputed. Pay each shop by M-Pesa, then enter the M-Pesa reference.</Notice>
      <button className="btn-primary" onClick={generate}>Create payouts now</button>
      {(error || err) && <Notice>{error || err}</Notice>}
      {msg && <Notice kind="ok">{msg}</Notice>}
      <h3 className="text-lg font-bold">To pay</h3>
      {pending.length === 0 && <p className="text-sm text-ink/60">None.</p>}
      {pending.map((p) => (
        <div key={p._id} className="card space-y-2">
          <p className="font-semibold">{p.business?.name}: pay {money(p.net)} to {p.business?.phone}</p>
          <p className="text-sm text-ink/70">{p.bookingCount} bookings up to {p.periodEnd} · gross {money(p.gross)} · platform fee {money(p.commission)}</p>
          <div className="flex flex-wrap gap-2">
            <input aria-label="M-Pesa reference" className="input max-w-xs" placeholder="M-Pesa reference, for example QGH12ABC3D" value={refs[p._id] ?? ''} onChange={(e) => setRefs({ ...refs, [p._id]: e.target.value })} />
            <button className="btn-primary" disabled={(refs[p._id] ?? '').trim().length < 6} onClick={() => paid(p)}>Mark as paid</button>
          </div>
        </div>
      ))}
      <h3 className="text-lg font-bold">Paid</h3>
      {done.length === 0 && <p className="text-sm text-ink/60">None yet.</p>}
      {done.map((p) => <div key={p._id} className="card text-sm"><span className="font-semibold">{p.business?.name}</span> · {money(p.net)} · {p.mpesaReference} · {p.paidAt ? fmtDateTime(p.paidAt) : ''}</div>)}
    </div>
  );
}

// ------------------------------------------------------------------ disputes
function Resolve({ d, onDone }: { d: Dispute; onDone: () => void }) {
  const maxRefund = d.booking ? d.booking.amountPaid - d.booking.refundDue : 0;
  const [resolution, setResolution] = useState('');
  const [refund, setRefund] = useState(0);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try { await api(`/admin/disputes/${d._id}/resolve`, { body: { resolution, refundAmount: refund } }); onDone(); } catch (err) { setError((err as Error).message); }
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-2 border-t border-mist pt-3">
      <Field label="Decision (the customer is sent this by SMS)"><textarea className="input" rows={2} required minLength={3} maxLength={300} value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
      <Field label={`Refund to the customer (KES, up to ${maxRefund})`}><input className="input max-w-xs" type="number" min={0} max={maxRefund} value={refund} onChange={(e) => setRefund(Number(e.target.value) || 0)} /></Field>
      {error && <Notice>{error}</Notice>}
      <button className="btn-primary">Resolve</button>
    </form>
  );
}

export function Disputes() {
  const { data, error, loading, reload } = useLoad(() => api<Dispute[]>('/admin/disputes?status=open'), []);
  const [open, setOpen] = useState('');
  if (loading) return <Loading />;
  return (
    <div className="space-y-3">
      {error && <Notice>{error}</Notice>}
      {data?.length === 0 && <Notice kind="ok">No open problems.</Notice>}
      {data?.map((d) => (
        <div key={d._id} className="card">
          <p className="font-semibold">{d.booking?.serviceName} <span className="font-normal text-ink/60">({d.booking?.reference}) · {d.business?.name}</span></p>
          <p className="text-sm">{d.customer?.name} · <a className="underline" href={`tel:+${d.customer?.phone}`}>{d.customer?.phone}</a> · paid {money(d.booking?.amountPaid ?? 0)}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{d.reason}</p>
          <p className="text-xs text-ink/60">Reported {fmtDateTime(d.createdAt)}</p>
          <button className="btn-ghost mt-2" onClick={() => setOpen(open === d._id ? '' : d._id)}>{open === d._id ? 'Close' : 'Resolve'}</button>
          {open === d._id && <Resolve d={d} onDone={() => { setOpen(''); void reload(); }} />}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ review moderation
export function Reviews() {
  const { data, error, loading, reload } = useLoad(() => api<Review[]>('/admin/reviews'), []);
  const [err, setErr] = useState('');
  if (loading) return <Loading />;
  async function set(r: Review, status: 'visible' | 'hidden') {
    try { await api(`/admin/reviews/${r._id}/visibility`, { body: { status } }); void reload(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="space-y-2">
      {(error || err) && <Notice>{error || err}</Notice>}
      {data?.length === 0 && <Notice kind="info">No reviews yet.</Notice>}
      {data?.map((r) => (
        <div key={r._id} className="card flex flex-wrap items-start justify-between gap-2 text-sm">
          <div><p className="font-semibold">{r.business?.name}: {r.rating} out of 5 <span className="font-normal text-ink/60">by {r.customer?.name}</span></p>{r.comment && <p>{r.comment}</p>}{r.ownerReply && <p className="text-ink/70">Shop reply: {r.ownerReply}</p>}</div>
          <button className={r.status === 'visible' ? 'btn-danger' : 'btn-ghost'} onClick={() => set(r, r.status === 'visible' ? 'hidden' : 'visible')}>{r.status === 'visible' ? 'Hide' : 'Show again'}</button>
        </div>
      ))}
    </div>
  );
}
