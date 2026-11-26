import { useState } from 'react';
import { api, money, todayEat, useLoad, WINDOWS, type Booking, type Business, type Region, type WindowKey, type Zone } from '../api';
import DeliveryButtons from '../components/DeliveryButtons';
import { Badge, Field, Loading, Notice, Tabs } from '../components/ui';
import { Disputes, Payouts, Reviews } from './adminTabs';

type AdminShop = Omit<Business, 'regionId'> & { regionId: string; ownerId?: { name: string; phone: string } };
type DeliveryRow = Booking & { business?: { name: string }; delivery?: Booking['delivery'] & { zoneId?: { name: string } } };

function Shops() {
  const { data, error, loading, reload } = useLoad(() => api<AdminShop[]>('/admin/businesses'), []);
  const [err, setErr] = useState('');
  async function setStatus(id: string, status: string) {
    setErr('');
    try { await api(`/admin/businesses/${id}/status`, { body: { status } }); void reload(); } catch (e) { setErr((e as Error).message); }
  }
  if (loading) return <Loading />;
  return (
    <div className="space-y-2">
      {(error || err) && <Notice>{error || err}</Notice>}
      {data?.map((s) => (
        <div key={s._id} className="card flex flex-wrap items-center justify-between gap-2">
          <div><p className="font-semibold">{s.name} <Badge status={s.status === 'active' ? 'confirmed' : s.status === 'pending' ? 'pending_payment' : 'expired'} /> <span className="text-sm font-normal text-ink/60">{s.status}</span></p>
            <p className="text-sm text-ink/70">{s.town} · owner {s.ownerId?.name} {s.ownerId?.phone}</p></div>
          <div className="flex gap-2">
            {s.status !== 'active' && <button className="btn-primary" onClick={() => setStatus(s._id, 'active')}>Approve</button>}
            {s.status === 'active' && <button className="btn-danger" onClick={() => setStatus(s._id, 'suspended')}>Suspend</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Deliveries() {
  const [date, setDate] = useState(todayEat());
  const { data, error, loading, reload } = useLoad(() => api<DeliveryRow[]>(`/admin/deliveries?date=${date}`), [date]);
  return (
    <div className="space-y-3">
      <Field label="Day"><input className="input w-48" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      {error && <Notice>{error}</Notice>}
      {loading && <Loading />}
      {data?.length === 0 && <Notice kind="info">No orders for this day.</Notice>}
      {data?.map((b) => (
        <div key={b._id} className="card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{b.quantity} x {b.serviceName} <span className="font-normal text-ink/60">({b.reference}) · {b.business?.name}</span></p>
              <p className="text-sm">{b.delivery?.windowKey ? WINDOWS[b.delivery.windowKey as WindowKey]?.label : ''} · {b.fulfilment === 'pickup' ? 'Pickup' : `Deliver to ${b.customerAddress} (${b.delivery?.zoneId?.name ?? 'area'})`}</p>
              <p className="text-sm">{b.customer?.name} · <a className="underline" href={`tel:+${b.customer?.phone}`}>{b.customer?.phone}</a> · Total {money(b.total)}, paid {money(b.amountPaid)}</p>
            </div>
            <Badge status={b.status === 'completed' ? 'delivered' : b.delivery?.status ?? b.status} />
          </div>
          <DeliveryButtons booking={b} base="/admin" onDone={() => void reload()} />
        </div>
      ))}
    </div>
  );
}

function Zones() {
  const zones = useLoad(() => api<Zone[]>('/admin/zones'), []);
  const regions = useLoad(() => api<Region[]>('/admin/regions'), []);
  const [name, setName] = useState('');
  const [fee, setFee] = useState(100);
  const [free, setFree] = useState('');
  const [error, setError] = useState('');
  async function add(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try {
      await api('/admin/zones', { body: { regionId: regions.data?.[0]?._id, name, fee, freeDeliveryOver: free ? Number(free) : undefined } });
      setName(''); setFree(''); void zones.reload();
    } catch (err) { setError((err as Error).message); }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card grid gap-3 sm:grid-cols-4">
        <Field label="Area name"><input className="input" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Delivery fee (KES)"><input className="input" type="number" min={0} value={fee} onChange={(e) => setFee(Number(e.target.value) || 0)} /></Field>
        <Field label="Free over (KES, optional)"><input className="input" type="number" min={0} value={free} onChange={(e) => setFree(e.target.value)} /></Field>
        <div className="self-end"><button className="btn-primary w-full">Add area</button></div>
        {error && <div className="sm:col-span-4"><Notice>{error}</Notice></div>}
      </form>
      {zones.data?.map((z) => <div key={z._id} className="card text-sm"><span className="font-semibold">{z.name}</span> · fee {money(z.fee)}{z.freeDeliveryOver ? ` · free over ${money(z.freeDeliveryOver)}` : ''}</div>)}
    </div>
  );
}

function Refunds() {
  const { data, error, loading, reload } = useLoad(() => api<Booking[]>('/admin/refunds'), []);
  const [err, setErr] = useState('');
  if (loading) return <Loading />;
  return (
    <div className="space-y-3">
      <Notice kind="info">Send each refund by M-Pesa to the customer's number, then mark it as refunded.</Notice>
      {(error || err) && <Notice>{error || err}</Notice>}
      {data?.length === 0 && <Notice kind="ok">No refunds waiting.</Notice>}
      {data?.map((b) => (
        <div key={b._id} className="card flex flex-wrap items-center justify-between gap-2">
          <div><p className="font-semibold">{money(b.refundDue)} to {b.customer?.name} ({b.customer?.phone})</p><p className="text-sm text-ink/70">{b.serviceName} · {b.reference} · {b.status.replace(/_/g, ' ')}</p></div>
          <button className="btn-primary" onClick={async () => { try { await api(`/admin/bookings/${b._id}/refunded`, { body: {} }); void reload(); } catch (e) { setErr((e as Error).message); } }}>Mark as refunded</button>
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState<'deliveries' | 'shops' | 'zones' | 'refunds' | 'payouts' | 'disputes' | 'reviews'>('deliveries');
  return (
    <div>
      <h1 className="mb-3 text-2xl font-extrabold">Admin</h1>
      <Tabs tabs={[{ id: 'deliveries', label: 'Deliveries' }, { id: 'shops', label: 'Shops' }, { id: 'zones', label: 'Delivery areas' }, { id: 'refunds', label: 'Refunds' }, { id: 'payouts', label: 'Payouts' }, { id: 'disputes', label: 'Problems' }, { id: 'reviews', label: 'Reviews' }]} value={tab} onChange={setTab} />
      {tab === 'deliveries' && <Deliveries />}
      {tab === 'shops' && <Shops />}
      {tab === 'zones' && <Zones />}
      {tab === 'refunds' && <Refunds />}
      {tab === 'payouts' && <Payouts />}
      {tab === 'disputes' && <Disputes />}
      {tab === 'reviews' && <Reviews />}
    </div>
  );
}
