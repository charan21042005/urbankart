import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { addCartItem, clearCart as clearCartRequest, getCart, removeCartItem, setCartItemQuantity } from '../api/cartApi.js';
import { useAuth } from '../auth/AuthContext.jsx';

const CartContext = createContext(null);
const emptyCart = { items: [] };

function isUncertainMutation(error) {
  return ['network', 'timeout', 'server'].includes(error?.kind);
}

function uncertainMutationError() {
  return Object.assign(
    new Error('The cart change could not be confirmed. Refresh your cart before trying again.'),
    { uncertain: true }
  );
}

export function CartProvider({ children }) {
  // Global cart state is scoped to the authenticated user and supplies the
  // header, product details, cart page, and checkout with server-confirmed data.
  const auth = useAuth();
  const [state, setState] = useState({ status: 'idle', ownerId: null, sessionRevision: null, data: emptyCart, error: null });
  const requestId = useRef(0);
  const mutationLock = useRef(false);
  const uncertainMutation = useRef(false);
  const [mutationState, setMutationState] = useState({ busy: false, error: null });
  const currentUserId = auth.isAuthenticated ? auth.user.id : null;

  const refresh = useCallback(async ({ signal } = {}) => {
    if (!auth.isAuthenticated || !currentUserId) return null;
    const ownRequest = ++requestId.current;
    setState({ status: 'loading', ownerId: currentUserId, sessionRevision: auth.sessionRevision, data: emptyCart, error: null });
    try {
      const data = await getCart({ signal });
      if (ownRequest === requestId.current && !signal?.aborted) {
        setState({ status: data.items.length ? 'ready' : 'empty', ownerId: currentUserId, sessionRevision: auth.sessionRevision, data, error: null });
        uncertainMutation.current = false;
        setMutationState({ busy: false, error: null });
      }
      return data;
    } catch (error) {
      if (ownRequest === requestId.current && !signal?.aborted) {
        setState({ status: 'error', ownerId: currentUserId, sessionRevision: auth.sessionRevision, data: emptyCart, error });
      }
      return null;
    }
  }, [auth.isAuthenticated, auth.sessionRevision, currentUserId]);

  const mutate = useCallback(async (request) => {
    if (!auth.isAuthenticated || !currentUserId) return { ok: false, error: new Error('Sign in before updating your cart.') };
    if (uncertainMutation.current) return { ok: false, error: mutationState.error, uncertain: true };
    if (mutationLock.current) return { ok: false, error: new Error('A cart update is already in progress.') };
    mutationLock.current = true;
    setMutationState({ busy: true, error: null });
    try {
      await request();
      const refreshed = await refresh();
      if (!refreshed) {
        const error = uncertainMutationError();
        uncertainMutation.current = true;
        setMutationState({ busy: false, error });
        return { ok: false, error, uncertain: true };
      }
      setMutationState({ busy: false, error: null });
      return { ok: true, error: null };
    } catch (error) {
      const uncertain = isUncertainMutation(error);
      const reportedError = uncertain ? uncertainMutationError() : error;
      uncertainMutation.current = uncertain;
      setMutationState({ busy: false, error: reportedError });
      return { ok: false, error: reportedError, uncertain };
    } finally {
      mutationLock.current = false;
      setMutationState((current) => ({ ...current, busy: false }));
    }
  }, [auth.isAuthenticated, currentUserId, refresh]);

  const addItem = useCallback((productId, quantity = 1) => mutate(() => addCartItem(productId, quantity)), [mutate]);
  const updateItem = useCallback((productId, quantity) => mutate(() => setCartItemQuantity(productId, quantity)), [mutate]);
  const removeItem = useCallback((productId) => mutate(() => removeCartItem(productId)), [mutate]);
  const clearCartAction = useCallback(() => mutate(() => clearCartRequest()), [mutate]);
  const clearMutationError = useCallback(() => setMutationState((current) => ({ ...current, error: null })), []);

  useEffect(() => {
    // Re-read the current user's cart when auth/session state changes, and
    // abort stale requests so a prior account cannot populate the next cart.
    const ownRequest = ++requestId.current;
    if (!auth.isAuthenticated || !currentUserId || auth.isInitializing || auth.isSubmitting) {
      setState({ status: 'idle', ownerId: null, sessionRevision: null, data: emptyCart, error: null });
      if (!auth.isAuthenticated || !currentUserId) {
        uncertainMutation.current = false;
        setMutationState({ busy: false, error: null });
      }
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
  const value = useMemo(() => ({
    cart, status, error, itemCount, total, refresh,
    isMutating: mutationState.busy,
    mutationError: mutationState.error,
    addItem, updateItem, removeItem, clearCart: clearCartAction, clearMutationError
  }), [cart, status, error, itemCount, total, refresh, mutationState, addItem, updateItem, removeItem, clearCartAction, clearMutationError]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider.');
  return context;
}
