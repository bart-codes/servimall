import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, addDaysStr, todayEat, type Service } from '../api';
import { useAuth } from '../auth';
import { Field, Notice } from './ui';

export default function QuoteForm({ service }: { service: Service }) {
  const { user } = useAuth();
  const [brief, setBrief] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!user) return <p className="mt-3 text-sm"><Link className="font-semibold text-lake-dark underline" to="/login" state={{ from: location.pathname }}>Sign in</Link> to ask for a quote.</p>;
  if (sent) return <div className="mt-3"><Notice kind="ok">Request sent. You will get an SMS when the shop replies, and the offer will appear under <Link className="underline" to="/bookings">My bookings</Link>.</Notice></div>;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/quotes', { body: { serviceId: service._id, brief, preferredDate: preferredDate || undefined, phone } }); setSent(true); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border-t border-mist pt-3">
      <Field label="What do you need?" hint="Describe the job, size, style or anything the shop should know."><textarea className="input" rows={4} required minLength={10} maxLength={2000} value={brief} onChange={(e) => setBrief(e.target.value)} /></Field>
      <Field label="Date you need it by (optional)"><input className="input w-48" type="date" min={todayEat()} max={addDaysStr(todayEat(), 365)} value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} /></Field>
      <Field label="Your phone number" hint="The shop's reply is sent here."><input className="input" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      {error && <Notice>{error}</Notice>}
      <button className="btn-primary" disabled={busy}>{busy ? 'Sending...' : 'Send request'}</button>
    </form>
  );
}
