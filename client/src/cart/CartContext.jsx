import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getCart } from '../api/cartApi.js';
import { useAuth } from '../auth/AuthContext.jsx';

const CartContext = createContext(null);
const emptyCart = { items: [] };

export function CartProvider({ children }) {
  const auth = useAuth();
  const [state, setState] = useState({ status: 'idle', ownerId: null, sessionRevision: null, data: emptyCart, error: null });
  const requestId = useRef(0);
  const currentUserId = auth.isAuthenticated ? auth.user.id : null;

  const refresh = useCallback(async ({ signal } = {}) => {
    if (!auth.isAuthenticated || !currentUserId) return null;
    const ownRequest = ++requestId.current;
    setState({ status: 'loading', ownerId: currentUserId, sessionRevision: auth.sessionRevision, data: emptyCart, error: null });
    try {
      const data = await getCart({ signal });
      if (ownRequest === requestId.current && !signal?.aborted) {
        setState({ status: data.items.length ? 'ready' : 'empty', ownerId: currentUserId, sessionRevision: auth.sessionRevision, data, error: null });
      }
      return data;
    } catch (error) {
      if (ownRequest === requestId.current && !signal?.aborted) {
        setState({ status: 'error', ownerId: currentUserId, sessionRevision: auth.sessionRevision, data: emptyCart, error });
      }
      return null;
    }
  }, [auth.isAuthenticated, auth.sessionRevision, currentUserId]);

  useEffect(() => {
    const ownRequest = ++requestId.current;
    if (!auth.isAuthenticated || !currentUserId || auth.isInitializing || auth.isSubmitting) {
      setState({ status: 'idle', ownerId: null, sessionRevision: null, data: emptyCart, error: null });
      return () => { requestId.current += 1; };
    }
    const controller = new AbortController();
    // The generation check remains necessary: abort cannot stop every adapter or completed response.
    void refresh({ signal: controller.signal });
    return () => {
      controller.abort();
      if (requestId.current === ownRequest) requestId.current += 1;
    };
  }, [auth.isAuthenticated, auth.isInitializing, auth.isSubmitting, auth.sessionRevision, currentUserId, refresh]);

  const belongsToCurrentUser = auth.isAuthenticated
    && state.ownerId === currentUserId
    && state.sessionRevision === auth.sessionRevision;
  const cart = belongsToCurrentUser ? state.data : emptyCart;
  const status = belongsToCurrentUser ? state.status : 'idle';
  const error = belongsToCurrentUser ? state.error : null;
  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.items.reduce((sum, item) => {
    const price = Number(item.product?.price);
    return sum + (Number.isFinite(price) && price >= 0 ? price * item.quantity : 0);
  }, 0);
  const value = useMemo(() => ({ cart, status, error, itemCount, total, refresh }), [cart, status, error, itemCount, total, refresh]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider.');
  return context;
}
