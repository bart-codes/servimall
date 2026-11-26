import { useEffect, useState } from 'react';
import {
  api, CATEGORY_LABELS, fmtDateTime, money, useLoad, WINDOWS,
  type Booking, type Business, type Category, type Region, type Service, type WindowKey,
} from '../api';
import DeliveryButtons from '../components/DeliveryButtons';
import ImageUpload from '../components/ImageUpload';
import Reschedule from '../components/Reschedule';
import { EarningsTab, QuotesTab, ReviewsTab } from './ownerTabs';
import { Badge, Field, Loading, Notice, Tabs } from '../components/ui';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
interface Availability { weeklyHours: { day: number; open: string; close: string }[]; daysOff: { from: string; to: string; reason?: string }[]; slotIntervalMinutes: number }
interface Detail { business: Business; services: Service[]; availability: Availability | null }

// ------------------------------------------------------------------ create / edit a shop
function ShopForm({ regions, initial, onSaved }: { regions: Region[]; initial?: Business; onSaved: () => void }) {
  const [f, setF] = useState({
    name: initial?.name ?? '', category: (initial?.category ?? 'body-art') as Category, description: initial?.description ?? '',
    phone: initial?.phone ?? '', whatsapp: initial?.whatsapp ?? '', town: initial?.town ?? '', address: initial?.address ?? '',
    concurrentCapacity: initial?.concurrentCapacity ?? 1, regionId: initial?.regionId ?? regions[0]?._id ?? '', logoUrl: initial?.logoUrl ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | number) => setF({ ...f, [k]: v });
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const body = { ...f, whatsapp: f.whatsapp || undefined, address: f.address || undefined, logoUrl: f.logoUrl || undefined };
      if (initial) { const { regionId: _r, ...rest } = body; await api(`/owner/businesses/${initial._id}`, { method: 'PUT', body: rest }); }
      else await api('/owner/businesses', { body });
      onSaved();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="card grid gap-3 sm:grid-cols-2">
      <Field label="Shop name"><input className="input" required value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Category">
        <select className="input" value={f.category} onChange={(e) => set('category', e.target.value)}>
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
      </Field>
      <div className="sm:col-span-2"><Field label="Description"><textarea className="input" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field></div>
      <Field label="Shop phone"><input className="input" required value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      <Field label="WhatsApp number (optional)"><input className="input" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} /></Field>
      <Field label="Town"><input className="input" required value={f.town} onChange={(e) => set('town', e.target.value)} /></Field>
      <Field label="Address (optional)"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
      <div className="sm:col-span-2"><span className="mb-1 block text-sm font-medium">Logo (optional)</span><ImageUpload label="Upload a logo" value={f.logoUrl ? [f.logoUrl] : []} onChange={(u) => set('logoUrl', u[0] ?? '')} /></div>
      <Field label="Customers served at the same time" hint="1 for a solo provider. More if you have a team."><input className="input" type="number" min={1} max={20} value={f.concurrentCapacity} onChange={(e) => set('concurrentCapacity', Number(e.target.value) || 1)} /></Field>
      {!initial && regions.length > 1 && (
        <Field label="Region"><select className="input" value={f.regionId} onChange={(e) => set('regionId', e.target.value)}>{regions.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</select></Field>
      )}
      <div className="space-y-2 sm:col-span-2">
        {error && <Notice>{error}</Notice>}
        <button className="btn-primary" disabled={busy}>{initial ? 'Save changes' : 'Create shop'}</button>
        {!initial && <p className="text-xs text-ink/60">New shops are reviewed before they appear in the mall.</p>}
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ services
const blank = { name: '', description: '', kind: 'service', price: 0, priceType: 'fixed', durationMinutes: 60, depositType: 'none', depositValue: 0,
  locationOptions: ['at_shop'] as string[], leadTimeHours: 2, fulfilmentOptions: ['delivery', 'pickup'] as string[], unit: '', stockQuantity: 0, deliveryCutoffHour: 18, photos: [] as string[], active: true };

function Toggle({ list, value, label, onChange }: { list: string[]; value: string; label: string; onChange: (l: string[]) => void }) {
  return (
    <label className="mr-4 inline-flex items-center gap-1 text-sm">
      <input type="checkbox" checked={list.includes(value)} onChange={(e) => onChange(e.target.checked ? [...list, value] : list.filter((x) => x !== value))} /> {label}
    </label>
  );
}

function ServicesTab({ detail, reload }: { detail: Detail; reload: () => void }) {
  const [f, setF] = useState<typeof blank>(blank);
  const [editing, setEditing] = useState('');
  const [error, setError] = useState('');
  const goods = f.kind === 'goods';
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF({ ...f, [k]: v });
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const body = goods
      ? { ...f, locationOptions: [], durationMinutes: 60, depositType: 'none', depositValue: 0 }
      : { ...f, fulfilmentOptions: [], unit: undefined, stockQuantity: undefined };
    try {
      if (editing) await api(`/owner/services/${editing}`, { method: 'PUT', body });
      else await api(`/owner/businesses/${detail.business._id}/services`, { body });
      setF(blank); setEditing(''); reload();
    } catch (err) { setError((err as Error).message); }
  }
  function edit(s: Service) {
    setEditing(s._id);
    setF({ ...blank, ...s, unit: s.unit ?? '', stockQuantity: s.stockQuantity ?? 0, photos: s.photos ?? [] } as typeof blank);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  return (
    <div className="space-y-6">
      <form onSubmit={save} className="card grid gap-3 sm:grid-cols-2">
        <h3 className="text-lg font-bold sm:col-span-2">{editing ? 'Edit item' : 'Add an item'}</h3>
        <Field label="Type"><select className="input" value={f.kind} onChange={(e) => set('kind', e.target.value)} disabled={!!editing}><option value="service">Service (booked for a time)</option><option value="goods">Goods (eggs, produce, kits)</option></select></Field>
        <Field label="Name"><input className="input" required value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="Description"><textarea className="input" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field></div>
        <Field label="Price (KES)"><input className="input" type="number" min={0} value={f.price} onChange={(e) => set('price', Number(e.target.value) || 0)} /></Field>
        <Field label="Price type"><select className="input" value={f.priceType} onChange={(e) => set('priceType', e.target.value)}><option value="fixed">Fixed price</option><option value="from">From this price</option><option value="quote">By quote (customers message you)</option></select></Field>
        {!goods ? (
          <>
            <Field label="Duration (minutes)"><input className="input" type="number" min={15} step={15} value={f.durationMinutes} onChange={(e) => set('durationMinutes', Number(e.target.value) || 60)} /></Field>
            <Field label="Notice needed (hours)"><input className="input" type="number" min={0} value={f.leadTimeHours} onChange={(e) => set('leadTimeHours', Number(e.target.value) || 0)} /></Field>
            <Field label="Deposit"><select className="input" value={f.depositType} onChange={(e) => set('depositType', e.target.value)}><option value="none">No deposit</option><option value="fixed">Fixed amount</option><option value="percent">Percentage</option></select></Field>
            {f.depositType !== 'none' && <Field label={f.depositType === 'percent' ? 'Deposit (%)' : 'Deposit (KES)'}><input className="input" type="number" min={0} value={f.depositValue} onChange={(e) => set('depositValue', Number(e.target.value) || 0)} /></Field>}
            <div className="sm:col-span-2"><span className="mb-1 block text-sm font-medium">Where it happens</span>
              <Toggle list={f.locationOptions} value="at_shop" label="At the shop" onChange={(l) => set('locationOptions', l)} />
              <Toggle list={f.locationOptions} value="at_customer" label="At the customer's address" onChange={(l) => set('locationOptions', l)} />
              <Toggle list={f.locationOptions} value="online" label="Online" onChange={(l) => set('locationOptions', l)} /></div>
          </>
        ) : (
          <>
            <Field label="Unit" hint="For example tray, kg, kit."><input className="input" value={f.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
            <Field label="Stock"><input className="input" type="number" min={0} value={f.stockQuantity} onChange={(e) => set('stockQuantity', Number(e.target.value) || 0)} /></Field>
            <Field label="Order cut-off hour (0 to 23)" hint="Orders after this hour move to the next day."><input className="input" type="number" min={0} max={23} value={f.deliveryCutoffHour} onChange={(e) => set('deliveryCutoffHour', Number(e.target.value) || 0)} /></Field>
            <div><span className="mb-1 block text-sm font-medium">How customers get it</span>
              <Toggle list={f.fulfilmentOptions} value="delivery" label="Delivery" onChange={(l) => set('fulfilmentOptions', l)} />
              <Toggle list={f.fulfilmentOptions} value="pickup" label="Pickup" onChange={(l) => set('fulfilmentOptions', l)} /></div>
          </>
        )}
        <div className="sm:col-span-2"><span className="mb-1 block text-sm font-medium">Photos (up to 4)</span><ImageUpload label="Add a photo" max={4} value={f.photos} onChange={(u) => set('photos', u)} /></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Visible to customers</label>
        <div className="space-y-2 sm:col-span-2">
          {error && <Notice>{error}</Notice>}
          <div className="flex gap-2"><button className="btn-primary">{editing ? 'Save item' : 'Add item'}</button>{editing && <button type="button" className="btn-ghost" onClick={() => { setEditing(''); setF(blank); }}>Cancel</button>}</div>
        </div>
      </form>
      <ul className="space-y-2">
        {detail.services.map((s) => (
          <li key={s._id} className="card flex flex-wrap items-center justify-between gap-2">
            <div><p className="font-semibold">{s.name} {!s.active && <span className="text-sm text-ink/60">(hidden)</span>}</p>
              <p className="text-sm text-ink/70">{money(s.price)} · {s.kind === 'goods' ? `${s.stockQuantity ?? 0} ${s.unit ?? ''} in stock` : `${s.durationMinutes} min`}</p></div>
            <button className="btn-ghost" onClick={() => edit(s)}>Edit</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ opening hours
function HoursTab({ detail, reload }: { detail: Detail; reload: () => void }) {
  const initial = detail.availability;
  const [days, setDays] = useState(() => DAY_NAMES.map((_, d) => {
    const h = initial?.weeklyHours.find((x) => x.day === d);
    return { on: !!h, open: h?.open ?? '09:00', close: h?.close ?? '17:00' };
  }));
  const [interval, setIntervalMin] = useState(initial?.slotIntervalMinutes ?? 30);
  const [off, setOff] = useState(initial?.daysOff ?? []);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  async function save() {
    setMsg(''); setError('');
    try {
      await api(`/owner/businesses/${detail.business._id}/availability`, { method: 'PUT', body: {
        weeklyHours: days.flatMap((d, day) => (d.on ? [{ day, open: d.open, close: d.close }] : [])), daysOff: off, slotIntervalMinutes: interval } });
      setMsg('Hours saved.'); reload();
    } catch (e) { setError((e as Error).message); }
  }
  return (
    <div className="card space-y-3">
      {DAY_NAMES.map((n, d) => (
        <div key={n} className="flex flex-wrap items-center gap-3">
          <label className="flex w-32 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={days[d].on} onChange={(e) => setDays(days.map((x, i) => (i === d ? { ...x, on: e.target.checked } : x)))} />{n}</label>
          {days[d].on ? (<>
            <input aria-label={`${n} opens`} className="input w-32" type="time" value={days[d].open} onChange={(e) => setDays(days.map((x, i) => (i === d ? { ...x, open: e.target.value } : x)))} />
            <span className="text-sm">to</span>
            <input aria-label={`${n} closes`} className="input w-32" type="time" value={days[d].close} onChange={(e) => setDays(days.map((x, i) => (i === d ? { ...x, close: e.target.value } : x)))} />
          </>) : <span className="text-sm text-ink/60">Closed</span>}
        </div>
      ))}
      <Field label="Booking times are offered every"><select className="input w-40" value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))}>{[15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select></Field>
      <div>
        <span className="mb-1 block text-sm font-medium">Days off</span>
        {off.map((o, i) => <p key={i} className="text-sm">{o.from} to {o.to} <button className="ml-2 underline" onClick={() => setOff(off.filter((_, j) => j !== i))}>Remove</button></p>)}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input aria-label="Day off from" className="input w-40" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input aria-label="Day off to" className="input w-40" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn-ghost" disabled={!from || !to || to < from} onClick={() => { setOff([...off, { from, to }]); setFrom(''); setTo(''); }}>Add day off</button>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}{msg && <Notice kind="ok">{msg}</Notice>}
      <button className="btn-primary" onClick={save}>Save hours</button>
    </div>
  );
}

// ------------------------------------------------------------------ bookings
function BookingsTab({ businessId }: { businessId: string }) {
  const { data, error, loading, reload } = useLoad(() => api<Booking[]>(`/owner/bookings?businessId=${businessId}`), [businessId]);
  const [err, setErr] = useState('');
  const [moving, setMoving] = useState('');
  async function setStatus(b: Booking, status: string) {
    if (status === 'cancelled_by_shop' && !window.confirm('Cancel this booking? The customer will be refunded.')) return;
    setErr('');
    try { await api(`/owner/bookings/${b._id}/status`, { body: { status } }); void reload(); } catch (e) { setErr((e as Error).message); }
  }
  if (loading) return <Loading />;
  return (
    <div className="space-y-3">
      {(error || err) && <Notice>{error || err}</Notice>}
      {data?.length === 0 && <Notice kind="info">No bookings yet.</Notice>}
      {data?.map((b) => (
        <div key={b._id} className="card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{b.kind === 'goods' ? `${b.quantity} x ` : ''}{b.serviceName} <span className="font-normal text-ink/60">({b.reference})</span></p>
              <p className="text-sm">{b.customer?.name} · <a className="underline" href={`tel:+${b.customer?.phone}`}>{b.customer?.phone}</a></p>
              <p className="text-sm text-ink/70">{b.slotStart ? fmtDateTime(b.slotStart) : b.projectDeadline ? `Due ${b.projectDeadline}` : `${b.delivery?.windowDate ?? ''} ${b.delivery?.windowKey ? WINDOWS[b.delivery.windowKey as WindowKey]?.label : ''}`}{b.customerAddress ? ` · ${b.customerAddress}` : ''}</p>
              <p className="text-sm">Total {money(b.total)} · Paid {money(b.amountPaid)}{b.fulfilment ? ` · ${b.fulfilment}` : ''}</p>
              {b.delivery && b.status === 'confirmed' && <p className="text-sm">Order: <Badge status={b.delivery.status} /></p>}
            </div>
            <Badge status={b.status} />
          </div>
          {b.kind === 'service' && b.status === 'confirmed' && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => setStatus(b, 'completed')}>Mark completed</button>
              <button className="btn-ghost" onClick={() => setStatus(b, 'no_show')}>No-show</button>
              {b.slotStart && <button className="btn-ghost" onClick={() => setMoving(moving === b._id ? '' : b._id)}>Change time</button>}
              <button className="btn-danger" onClick={() => setStatus(b, 'cancelled_by_shop')}>Cancel</button>
            </div>
          )}
          {moving === b._id && <Reschedule shop booking={b} onDone={() => { setMoving(''); void reload(); }} />}
          {b.kind === 'goods' && b.status === 'confirmed' && (
            <>
              <DeliveryButtons booking={b} base="/owner" onDone={() => void reload()} />
              <button className="btn-danger mt-2" onClick={() => setStatus(b, 'cancelled_by_shop')}>Cancel order</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function Owner() {
  const shops = useLoad(() => api<Business[]>('/owner/businesses'), []);
  const regions = useLoad(() => api<Region[]>('/regions'), []);
  const [sel, setSel] = useState('');
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<'bookings' | 'quotes' | 'services' | 'hours' | 'reviews' | 'earnings' | 'details'>('bookings');

  useEffect(() => { if (!sel && shops.data?.[0]) setSel(shops.data[0]._id); }, [shops.data, sel]);
  const detail = useLoad(() => (sel ? api<Detail>(`/owner/businesses/${sel}`) : Promise.resolve(null)), [sel]);

  if (shops.loading || regions.loading) return <Loading />;
  const showForm = adding || shops.data?.length === 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">My shops</h1>
        <div className="flex gap-2">
          {!!shops.data?.length && !showForm && (
            <select aria-label="Choose a shop" className="input w-auto" value={sel} onChange={(e) => setSel(e.target.value)}>{shops.data.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select>
          )}
          <button className="btn-ghost" onClick={() => setAdding(!adding)}>{showForm && shops.data?.length ? 'Back' : 'Add a shop'}</button>
        </div>
      </div>
      {(shops.error || regions.error) && <Notice>{shops.error || regions.error}</Notice>}
      {showForm ? (
        <ShopForm regions={regions.data ?? []} onSaved={() => { setAdding(false); void shops.reload(); }} />
      ) : (
        detail.data && (
          <>
            {detail.data.business.status !== 'active' && <Notice kind="info">This shop is {detail.data.business.status === 'pending' ? 'waiting for approval' : 'suspended'}, so customers cannot see it yet.</Notice>}
            <Tabs tabs={[{ id: 'bookings', label: 'Bookings and orders' }, { id: 'quotes', label: 'Quotes' }, { id: 'services', label: 'Services and goods' }, { id: 'hours', label: 'Opening hours' }, { id: 'reviews', label: 'Reviews' }, { id: 'earnings', label: 'Earnings' }, { id: 'details', label: 'Shop details' }]} value={tab} onChange={setTab} />
            {tab === 'bookings' && <BookingsTab businessId={sel} />}
            {tab === 'quotes' && <QuotesTab businessId={sel} />}
            {tab === 'reviews' && <ReviewsTab businessId={sel} />}
            {tab === 'earnings' && <EarningsTab businessId={sel} />}
            {tab === 'services' && <ServicesTab detail={detail.data} reload={detail.reload} />}
            {tab === 'hours' && <HoursTab key={sel} detail={detail.data} reload={detail.reload} />}
            {tab === 'details' && <ShopForm key={sel} regions={regions.data ?? []} initial={detail.data.business} onSaved={() => { void detail.reload(); void shops.reload(); }} />}
          </>
        )
      )}
    </div>
  );
}
