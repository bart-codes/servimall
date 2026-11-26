import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokenStore } from './api';

export interface User { id: string; name: string; phone: string; email?: string; role: 'customer' | 'owner' | 'admin' }
interface Ctx {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (b: { name: string; phone: string; password: string; email?: string }) => Promise<void>;
  logout: () => void;
  resetPassword: (phone: string, code: string, password: string) => Promise<void>;
}
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  useEffect(() => {
    if (!tokenStore.get()) return;
    api<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    const r = await api<{ token: string; user: User }>('/auth/login', { body: { phone, password } });
    tokenStore.set(r.token);
    setUser(r.user);
  }, []);
  const register = useCallback(async (b: { name: string; phone: string; password: string; email?: string }) => {
    const r = await api<{ token: string; user: User }>('/auth/register', { body: { ...b, acceptTerms: true } });
    tokenStore.set(r.token);
    setUser(r.user);
  }, []);
  const resetPassword = useCallback(async (phone: string, code: string, password: string) => {
    const r = await api<{ token: string; user: User }>('/auth/reset', { body: { phone, code, password } });
    tokenStore.set(r.token);
    setUser(r.user);
  }, []);
  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout, resetPassword }), [user, loading, login, register, logout, resetPassword]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth must be used inside AuthProvider');
  return c;
}
