import { useEffect, useState } from 'react';
import { api, addDaysStr, fmtDateTime, fmtTime, todayEat, type Booking } from '../api';
import { Field, Notice } from './ui';

/** Pick a new open time for a booked service. `shop` uses the shop endpoint (no 24 hour or once-only limit). */
export default function Reschedule({ booking, shop, onDone }: { booking: Booking; shop?: boolean; onDone: () => void }) {
  const [date, setDate] = useState(todayEat());
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSlots(null); setSlot('');
    api<{ slots: string[] }>(`/services/${booking.serviceId}/slots?date=${date}`).then((r) => setSlots(r.slots)).catch((e) => setError((e as Error).message));
  }, [date, booking.serviceId]);

  async function save() {
    setBusy(true); setError('');
    try { await api(`${shop ? '/owner' : ''}/bookings/${booking._id}/reschedule`, { body: { slotStart: slot } }); onDone(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-mist pt-3">
      {booking.slotStart && <p className="text-sm">Currently {fmtDateTime(booking.slotStart)}.{!shop && ' You can reschedule once, at least 24 hours before the start.'}</p>}
      <Field label="New date"><input className="input w-48" type="date" min={todayEat()} max={addDaysStr(todayEat(), 90)} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      {slots === null ? <p className="text-sm text-ink/60">Checking open times...</p> : slots.length === 0 ? <p className="text-sm text-ink/60">No open times on this day.</p> : (
        <div className="flex flex-wrap gap-2">
          {slots.map((s) => (
            <button key={s} type="button" aria-pressed={slot === s} onClick={() => setSlot(s)}
              className={`rounded-md border px-3 py-1.5 text-sm ${slot === s ? 'border-lake bg-lake text-white' : 'border-mist bg-white hover:bg-lake-soft'}`}>{fmtTime(s)}</button>
          ))}
        </div>
      )}
      {error && <Notice>{error}</Notice>}
      <button className="btn-primary" disabled={!slot || busy} onClick={save}>{busy ? 'Saving...' : 'Move my booking'}</button>
    </div>
  );
}
