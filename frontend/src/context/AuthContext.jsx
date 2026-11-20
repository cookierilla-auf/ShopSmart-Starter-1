/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';

// The browser never sees the session token: it lives in an HttpOnly cookie. This context only keeps
// the public profile that /api/auth/me returns, and the server decides what the customer may read.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    api.me()
      .then((data) => { if (active) setCustomer(data.customer); })
      .catch(() => { if (active) setCustomer(null); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  const login = useCallback(async (details) => { const data = await api.login(details); setCustomer(data.customer); return data.customer; }, []);
  const register = useCallback(async (details) => { const data = await api.register(details); setCustomer(data.customer); return data.customer; }, []);
  const logout = useCallback(async () => { try { await api.logout(); } finally { setCustomer(null); } }, []);

  const value = useMemo(() => ({ customer, checking, login, register, logout }), [customer, checking, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
