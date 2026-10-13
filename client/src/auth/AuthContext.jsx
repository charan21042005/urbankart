import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { login as loginRequest, register as registerRequest } from '../api/authApi.js';
import { clearAccessToken, getTokenRevision, setAccessToken } from '../api/tokenStore.js';
import { subscribeToSessionInvalidation } from '../api/sessionEvents.js';

const AuthContext = createContext(null);

function readAuthResponse(payload) {
  const user = payload?.user;
  if (payload?.status !== 'success' || typeof payload?.token !== 'string' || !payload.token
      || !user || typeof user.id !== 'string' || typeof user.name !== 'string' || typeof user.email !== 'string') {
    throw new Error('The server returned an unexpected authentication response.');
  }
  return { token: payload.token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ status: 'initializing', user: null, error: null, sessionRevision: getTokenRevision() });
  const actionLock = useRef(false);

  useEffect(() => {
    // A memory-only token cannot survive a page reload, so initialization never trusts a stored string.
    clearAccessToken();
    setAuth((current) => current.status === 'initializing'
      ? { ...current, status: 'unauthenticated', sessionRevision: getTokenRevision() }
      : current);
    return subscribeToSessionInvalidation(({ invalidatedRevision, nextRevision }) => {
      setAuth((current) => current.sessionRevision === invalidatedRevision
        ? { status: 'unauthenticated', user: null, error: null, sessionRevision: nextRevision }
        : current);
    });
  }, []);

  const authenticate = useCallback(async (request) => {
    if (actionLock.current) return false;
    actionLock.current = true;
    setAuth((current) => ({ ...current, status: 'submitting', error: null }));
    try {
      const result = readAuthResponse(await request());
      const sessionRevision = setAccessToken(result.token);
      setAuth({ status: 'authenticated', user: result.user, error: null, sessionRevision });
      return true;
    } catch (error) {
      setAuth((current) => ({ ...current, status: current.user ? 'authenticated' : 'unauthenticated', error }));
      return false;
    } finally {
      actionLock.current = false;
    }
  }, []);

  const login = useCallback((credentials) => authenticate(() => loginRequest(credentials)), [authenticate]);
  const register = useCallback((details) => authenticate(() => registerRequest(details)), [authenticate]);
  const logout = useCallback(() => {
    clearAccessToken();
    setAuth({ status: 'unauthenticated', user: null, error: null, sessionRevision: getTokenRevision() });
  }, []);
  const clearError = useCallback(() => setAuth((current) => ({ ...current, error: null })), []);

  const value = useMemo(() => ({
    ...auth,
    isAuthenticated: auth.status === 'authenticated' && Boolean(auth.user),
    isInitializing: auth.status === 'initializing',
    isSubmitting: auth.status === 'submitting',
    login, register, logout, clearError
  }), [auth, login, register, logout, clearError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider.');
  return context;
}
