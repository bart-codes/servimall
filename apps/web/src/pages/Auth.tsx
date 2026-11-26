import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Field, Notice } from '../components/ui';

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register } = useAuth();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;
  const isRegister = mode === 'register';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isRegister) await register({ name, phone, password });
      else await login(phone, password);
      nav(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-extrabold">{isRegister ? 'Create your account' : 'Sign in'}</h1>
      <form onSubmit={submit} className="card space-y-3">
        {isRegister && <Field label="Your name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} /></Field>}
        <Field label="Phone number"><input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712345678" autoComplete="tel" required /></Field>
        <Field label="Password" hint={isRegister ? 'At least 8 characters.' : undefined}>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} required minLength={isRegister ? 8 : 1} />
        </Field>
        {isRegister && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            <span>I agree to the <Link className="underline" to="/terms" target="_blank">terms of use</Link>.</span>
          </label>
        )}
        {error && <Notice>{error}</Notice>}
        <button className="btn-primary w-full" disabled={busy || (isRegister && !accept)}>{busy ? 'Please wait...' : isRegister ? 'Create account' : 'Sign in'}</button>
      </form>
      {!isRegister && <p className="mt-3 text-sm"><Link className="font-semibold underline" to="/forgot">Forgot your password?</Link></p>}
      <p className="mt-3 text-sm">
        {isRegister ? <>Already have an account? <Link className="font-semibold underline" to="/login" state={{ from }}>Sign in</Link></> : <>New here? <Link className="font-semibold underline" to="/register" state={{ from }}>Create an account</Link></>}
      </p>
    </div>
  );
}
