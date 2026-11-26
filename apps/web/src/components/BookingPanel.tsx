import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  api, ApiError, addDaysStr, earliestDelivery, fmtDateTime, fmtTime, money, todayEat, WINDOWS, windowsFor,
  type Booking, type Business, type Service, type WindowKey, type Zone,
} from '../api';
import { useAuth } from '../auth';
import { Field, Notice } from './ui';

const LOCATION_LABEL = { at_shop: 'At the shop', at_customer: 'At my address', online: 'Online' } as const;

function estimate(svc: Service, qty: number, zone?: Zone) {
  const subtotal = svc.price * (svc.kind === 'goods' ? qty : 1);
  const fee = zone ? (zone.freeDeliveryOver != null && subtotal >= zone.freeDeliveryOver ? 0 : zone.fee) : 0;
  const total = subtotal + fee;
  const deposit =
    svc.kind === 'goods' ? total
    : svc.depositType === 'fixed' ? Math.min(svc.depositValue, total)
    : svc.depositType === 'percent' ? Math.ceil((total * svc.depositValue) / 100) : 0;
  return { subtotal, fee, total, deposit };
}

export default function BookingPanel({ service: svc, business }: { service: Service; business: Business }) {
  const { user } = useAuth();
  const location = useLocation();
  const goods = svc.kind === 'goods';

  const [date, setDate] = useState(todayEat());
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState('');
  const [locationType, setLocationType] = useState(svc.locationOptions[0] ?? 'at_shop');
  const [fulfilment, setFulfilment] = useState(svc.fulfilmentOptions[0] ?? 'pickup');
  const [qty, setQty] = useState(1);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState('');
  const firstDate = useMemo(() => earliestDelivery(svc.deliveryCutoffHour), [svc.deliveryCutoffHour]);
  const [windowDate, setWindowDate] = useState(firstDate);
  const [windowKey, setWindowKey] = useState<WindowKey | ''>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [payError, setPayError] = useState('');
  const poll = useRef<number>();

  // open slots for the chosen day (services)
  useEffect(() => {
    if (goods) return;
    setSlots(null);
    setSlot('');
    api<{ slots: string[] }>(`/services/${svc._id}/slots?date=${date}`)
      .then((r) => setSlots(r.slots))
      .catch((e) => setError((e as Error).message));
  }, [date, goods, svc._id]);

  // delivery zones (goods)
  useEffect(() => {
    if (!goods) return;
    api<Zone[]>(`/delivery-zones?region=${svc.regionId}`).then((z) => { setZones(z); if (z[0]) setZoneId(z[0]._id); }).catch(() => undefined);
  }, [goods, svc.regionId]);

  // after submitting: poll until the payment settles
  useEffect(() => {
    if (!booking || booking.status !== 'pending_payment') return;
    const started = Date.now();
    poll.current = window.setInterval(async () => {
      try {
        const r = await api<{ booking: Booking }>(`/bookings/${booking._id}`);
        if (r.booking.status !== 'pending_payment' || Date.now() - started > 11 * 60e3) {
          setBooking(r.booking);
          window.clearInterval(poll.current);
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => window.clearInterval(poll.current);
  }, [booking]);

  if (!user) {
    return (
      <p className="mt-3 text-sm">
        <Link className="font-semibold text-lake-dark underline" to="/login" state={{ from: location.pathname }}>Sign in</Link> or{' '}
        <Link className="font-semibold text-lake-dark underline" to="/register" state={{ from: location.pathname }}>create an account</Link> to book.
      </p>
    );
  }

  const zone = zones.find((z) => z._id === zoneId);
  const cost = estimate(svc, qty, fulfilment === 'delivery' ? zone : undefined);
  const windows = windowsFor(windowDate);

  async function submit() {
    setError('');
    setPayError('');
    setBusy(true);
    try {
      const body = goods
        ? { serviceId: svc._id, quantity: qty, fulfilment, address: fulfilment === 'delivery' ? address : undefined,
            zoneId: fulfilment === 'delivery' ? zoneId : undefined, windowDate, windowKey: windowKey || undefined, notes: notes || undefined, phone }
        : { serviceId: svc._id, slotStart: slot, locationType, address: locationType === 'at_customer' ? address : undefined, notes: notes || undefined, phone };
      const r = await api<{ booking: Booking; paymentError?: string }>('/bookings', { body });
      setBooking(r.booking);
      if (r.paymentError) setPayError(r.paymentError);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function retryPay() {
    if (!booking) return;
    setPayError('');
    try {
      await api(`/bookings/${booking._id}/pay`, { body: { phone } });
      setBooking({ ...booking });
    } catch (e) {
      setPayError((e as Error).message);
    }
  }

  // ---- result states
  if (booking) {
    if (booking.status === 'confirmed' || booking.status === 'completed') {
      return (
        <div className="mt-3 space-y-2">
          <Notice kind="ok">Booking confirmed. Reference {booking.reference}. We sent you an SMS.</Notice>
          <p className="text-sm">Paid {money(booking.amountPaid)} of {money(booking.total)}.{' '}
            <Link className="font-semibold text-lake-dark underline" to="/bookings">View my bookings</Link></p>
        </div>
      );
    }
    if (booking.status === 'pending_payment') {
      return (
        <div className="mt-3 space-y-2">
          {payError ? <Notice>{payError}</Notice> : <Notice kind="info">Check your phone and enter your M-Pesa PIN to pay {money(booking.depositDue - booking.amountPaid)}. Your spot is held for a few minutes.</Notice>}
          <button className="btn-ghost" onClick={retryPay}>Send the M-Pesa prompt again</button>
        </div>
      );
    }
    return <div className="mt-3"><Notice>This booking was not completed ({booking.status.replace(/_/g, ' ')}). Please try again.</Notice></div>;
  }

  const canSubmit = goods
    ? !!windowKey && (fulfilment === 'pickup' || (!!zoneId && address.trim().length >= 5)) && phone.length >= 10
    : !!slot && (locationType !== 'at_customer' || address.trim().length >= 5) && phone.length >= 10;

  return (
    <form className="mt-3 space-y-3 border-t border-mist pt-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {!goods && (
        <>
          <Field label="Date">
            <input className="input" type="date" min={todayEat()} max={addDaysStr(todayEat(), 90)} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div>
            <span className="mb-1 block text-sm font-medium">Time</span>
            {slots === null ? <p className="text-sm text-ink/60">Checking open times...</p>
              : slots.length === 0 ? <p className="text-sm text-ink/60">No open times on this day. Try another date.</p>
              : (
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <button type="button" key={s} onClick={() => setSlot(s)} aria-pressed={slot === s}
                      className={`rounded-md border px-3 py-1.5 text-sm ${slot === s ? 'border-lake bg-lake text-white' : 'border-mist bg-white hover:bg-lake-soft'}`}>
                      {fmtTime(s)}
                    </button>
                  ))}
                </div>
              )}
          </div>
          {svc.locationOptions.length > 1 && (
            <Field label="Where">
              <select className="input" value={locationType} onChange={(e) => setLocationType(e.target.value as typeof locationType)}>
                {svc.locationOptions.map((l) => <option key={l} value={l}>{LOCATION_LABEL[l]}</option>)}
              </select>
            </Field>
          )}
          {locationType === 'at_customer' && (
            <Field label="Your address"><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Estate, street, landmark" /></Field>
          )}
        </>
      )}

      {goods && (
        <>
          <Field label={`Quantity${svc.unit ? ` (${svc.unit})` : ''}`} hint={svc.stockQuantity != null ? `${svc.stockQuantity} left` : undefined}>
            <input className="input" type="number" min={1} max={Math.min(50, svc.stockQuantity ?? 50)} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
          </Field>
          {svc.fulfilmentOptions.length > 1 && (
            <Field label="How do you want it?">
              <select className="input" value={fulfilment} onChange={(e) => setFulfilment(e.target.value as typeof fulfilment)}>
                {svc.fulfilmentOptions.map((f) => <option key={f} value={f}>{f === 'delivery' ? 'Delivered to me' : 'I will pick it up'}</option>)}
              </select>
            </Field>
          )}
          {fulfilment === 'delivery' && (
            <>
              <Field label="Delivery area">
                <select className="input" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                  {zones.map((z) => <option key={z._id} value={z._id}>{z.name} ({money(z.fee)}{z.freeDeliveryOver ? `, free over ${money(z.freeDeliveryOver)}` : ''})</option>)}
                </select>
              </Field>
              <Field label="Delivery address"><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Estate, street, landmark" /></Field>
            </>
          )}
          <Field label={fulfilment === 'delivery' ? 'Delivery day' : 'Pickup day'} hint={`Orders after ${svc.deliveryCutoffHour}:00 move to the next day.`}>
            <input className="input" type="date" min={firstDate} max={addDaysStr(todayEat(), 14)} value={windowDate} onChange={(e) => { setWindowDate(e.target.value); setWindowKey(''); }} />
          </Field>
          <div>
            <span className="mb-1 block text-sm font-medium">Time window</span>
            {windows.length === 0 ? <p className="text-sm text-ink/60">No windows left today. Choose another day.</p> : (
              <div className="flex flex-wrap gap-2">
                {windows.map((k) => (
                  <button type="button" key={k} onClick={() => setWindowKey(k)} aria-pressed={windowKey === k}
                    className={`rounded-md border px-3 py-1.5 text-sm ${windowKey === k ? 'border-lake bg-lake text-white' : 'border-mist bg-white hover:bg-lake-soft'}`}>
                    {WINDOWS[k].label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <Field label="Notes for the shop (optional)"><textarea className="input" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Field label="M-Pesa number" hint="You will get a payment prompt on this number."><input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712345678" /></Field>

      <div className="rounded-md bg-lake-soft p-3 text-sm">
        {goods && cost.fee > 0 && <p>Delivery: {money(cost.fee)}</p>}
        <p className="font-semibold">Total {money(cost.total)}</p>
        <p>{cost.deposit > 0 ? `Pay now: ${money(cost.deposit)}${goods ? '' : ' deposit'}` : 'No payment needed now.'}</p>
        {!goods && slot && <p className="text-ink/70">{fmtDateTime(slot)}</p>}
      </div>

      {error && <Notice>{error}</Notice>}
      <button className="btn-sun w-full" disabled={!canSubmit || busy}>
        {busy ? 'Working...' : cost.deposit > 0 ? `Pay ${money(cost.deposit)} with M-Pesa` : 'Confirm booking'}
      </button>
      <p className="text-xs text-ink/60">Booking with {business.name}. By paying you agree to the <Link className="underline" to="/terms">terms of use</Link>.</p>
    </form>
  );
}
