import { useState } from 'react';
import { api, type Booking } from '../api';
import { Notice } from './ui';

const NEXT: Record<string, { to: string; label: string }[]> = {
  confirmed: [{ to: 'packed', label: 'Mark packed' }],
  packed: [{ to: 'out_for_delivery', label: 'Out for delivery' }, { to: 'delivered', label: 'Mark delivered / collected' }],
  out_for_delivery: [{ to: 'delivered', label: 'Mark delivered' }, { to: 'failed', label: 'Delivery failed' }],
  failed: [{ to: 'out_for_delivery', label: 'Try again' }],
};

/** Moves a goods order through packed, out for delivery, delivered. `base` is /owner or /admin. */
export default function DeliveryButtons({ booking, base, onDone }: { booking: Booking; base: '/owner' | '/admin'; onDone: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (booking.kind !== 'goods' || booking.status !== 'confirmed' || !booking.delivery) return null;
  const options = NEXT[booking.delivery.status] ?? [];
  async function go(status: string) {
    setBusy(true); setError('');
    try { await api(`${base}/bookings/${booking._id}/delivery`, { body: { status } }); onDone(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => <button key={o.to} className={o.to === 'failed' ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={() => go(o.to)}>{o.label}</button>)}
      </div>
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
