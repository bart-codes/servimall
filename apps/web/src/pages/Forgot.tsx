import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Field, Notice } from '../components/ui';

export default function Forgot() {
  const { user, resetPassword } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function sendCode(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/auth/forgot', { body: { phone } }); setStep('code'); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function reset(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await resetPassword(phone, code, password); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-extrabold">Reset your password</h1>
      {step === 'phone' ? (
        <form onSubmit={sendCode} className="card space-y-3">
          <Field label="Phone number" hint="We will text you a 6-digit code."><input className="input" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712345678" /></Field>
          {error && <Notice>{error}</Notice>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending...' : 'Send code'}</button>
        </form>
      ) : (
        <form onSubmit={reset} className="card space-y-3">
          <Notice kind="info">If an account exists for {phone}, a code is on its way. It expires in 10 minutes.</Notice>
          <Field label="6-digit code"><input className="input" inputMode="numeric" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" /></Field>
          <Field label="New password" hint="At least 8 characters."><input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
          {error && <Notice>{error}</Notice>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving...' : 'Set new password and sign in'}</button>
          <button type="button" className="text-sm underline" onClick={() => setStep('phone')}>Use a different number</button>
        </form>
      )}
      <p className="mt-3 text-sm"><Link className="underline" to="/login">Back to sign in</Link></p>
    </div>
  );
}
