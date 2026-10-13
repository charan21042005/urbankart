import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import PageContainer from '../components/layout/PageContainer.jsx';
import { formatPrice } from '../components/catalog/ProductCard.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCart } from '../cart/CartContext.jsx';
import { reconcileCheckout, submitCheckout } from '../api/checkoutApi.js';

function storageKey(userId) {
  return `urbankart.checkout.pending.${userId}`;
}

function readPendingKey(userId) {
  try { return sessionStorage.getItem(storageKey(userId)); } catch { return null; }
}

function savePendingKey(userId, key) {
  try { sessionStorage.setItem(storageKey(userId), key); return true; } catch { return false; }
}

function isAmbiguous(error) {
  return !error?.response || error.response.status >= 500;
}

export default function CheckoutPage() {
  const auth = useAuth();
  const cart = useCart();
  const lock = useRef(false);
  const [attemptKey, setAttemptKey] = useState(null);
  const [state, setState] = useState({ kind: 'ready', message: '' });

  useEffect(() => { document.title = 'Checkout | UrbanKart'; }, []);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.user?.id) return;
    const existing = readPendingKey(auth.user.id);
    setAttemptKey(existing);
    if (!existing) return;
    let active = true;
    setState({ kind: 'checking', message: 'Checking the result of your last checkout attempt…' });
    reconcileCheckout(existing).then((result) => {
      if (!active) return;
      if (result?.status === 'success' && result.order?._id) {
        setState({ kind: 'success', order: result.order });
        void cart.refresh();
      } else {
        setState({ kind: 'uncertain', message: 'The order is not confirmed yet. You can check again or retry this same checkout attempt.' });
      }
    }).catch((error) => {
      if (!active) return;
      setState({ kind: 'uncertain', message: error.response?.status === 404
        ? 'No committed order is visible yet. Keep this attempt key and retry safely, or check again.'
        : 'The order status could not be confirmed. Check again before deciding what to do.' });
    });
    return () => { active = false; };
  }, [auth.isAuthenticated, auth.user?.id]);

  const checkAgain = useCallback(async () => {
    if (!attemptKey || lock.current) return;
    lock.current = true;
    setState({ kind: 'checking', message: 'Checking the saved checkout attempt…' });
    try {
      const result = await reconcileCheckout(attemptKey);
      if (result?.status === 'success' && result.order?._id) {
        setState({ kind: 'success', order: result.order });
        await cart.refresh();
      } else {
        setState({ kind: 'uncertain', message: 'The order is not confirmed yet. You can retry this same attempt safely.' });
      }
    } catch (error) {
      setState({ kind: 'uncertain', message: error.response?.status === 404
        ? 'No committed order is visible yet. You can retry this same attempt safely.'
        : 'The order status could not be confirmed. Check again before deciding what to do.' });
    } finally { lock.current = false; }
  }, [attemptKey, cart.refresh]);

  const placeOrder = useCallback(async () => {
    if (!auth.isAuthenticated || lock.current) return;
    lock.current = true;
    let key = attemptKey;
    if (!key) {
      if (!globalThis.crypto?.randomUUID) {
        setState({ kind: 'error', message: 'This browser cannot securely create a checkout key. Update your browser before continuing.' });
        lock.current = false;
        return;
      }
      key = globalThis.crypto.randomUUID();
      if (!savePendingKey(auth.user.id, key)) {
        setState({ kind: 'error', message: 'This browser could not save the checkout attempt safely. Enable session storage and try again.' });
        lock.current = false;
        return;
      }
      setAttemptKey(key);
    }
    setState({ kind: 'submitting', message: 'Confirming your order…' });
    try {
      const result = await submitCheckout(key);
      if (result?.status !== 'success' || !result.order?._id) throw new Error('The server response did not confirm an order.');
      setState({ kind: 'success', order: result.order });
      await cart.refresh();
    } catch (error) {
      if (isAmbiguous(error)) {
        setState({ kind: 'checking', message: 'The response was uncertain. Checking the same checkout attempt…' });
        try {
          const result = await reconcileCheckout(key);
          if (result?.status === 'success' && result.order?._id) {
            setState({ kind: 'success', order: result.order });
            await cart.refresh();
          } else {
            setState({ kind: 'uncertain', message: 'The order is not confirmed yet. Check again or retry with the same attempt key.' });
          }
        } catch (lookupError) {
          setState({ kind: 'uncertain', message: lookupError.response?.status === 404
            ? 'No committed order is visible yet. Check again or retry with the same attempt key.'
            : 'The order status could not be confirmed. Check again before deciding what to do.' });
        }
      } else {
        setState({ kind: error.response?.status === 409 ? 'conflict' : 'error', message: error.response?.data?.message || 'Checkout could not be completed.' });
      }
    } finally { lock.current = false; }
  }, [auth.isAuthenticated, auth.user?.id, attemptKey, cart.refresh]);

  if (!auth.isAuthenticated) return <PageContainer className="route-state">
    <p className="eyebrow">A secure checkout</p><h1>Sign in to continue.</h1>
    <p>Your cart and order status are available only to your account.</p>
    <Link className="button button--dark" to="/login" state={{ from: '/checkout' }}>Sign in</Link>
  </PageContainer>;

  if (state.kind === 'success') {
    const order = state.order;
    const startAnotherCheckout = () => {
      try { sessionStorage.removeItem(storageKey(auth.user.id)); } catch { /* in-memory state still remains safe */ }
      setAttemptKey(null);
      setState({ kind: 'ready', message: '' });
    };
    return <PageContainer className="checkout-page checkout-result">
      <p className="eyebrow"><span className="eyebrow__rule" /> Order confirmed</p>
      <h1>Your order is recorded.</h1>
      <p>Order reference <strong>{order._id}</strong></p>
      <div className="checkout-order-lines">{order.items?.map((item, index) => <p key={`${item.productId}-${index}`}><span>{item.nameAtPurchase} · {item.qty}</span><strong>{formatPrice(item.priceAtPurchase * item.qty)}</strong></p>)}</div>
      <p className="checkout-confirmed-total">Server-confirmed total <strong>{formatPrice(order.totalAmount)}</strong></p>
      <p>Payment and delivery are not handled by this project.</p>
      <Link className="button button--dark" to="/">Continue browsing</Link>
      <button className="button checkout-new-attempt" type="button" onClick={startAnotherCheckout}>Start another checkout</button>
    </PageContainer>;
  }

  const busy = ['submitting', 'checking'].includes(state.kind);
  const cartReady = ['ready', 'empty'].includes(cart.status);
  const canSubmit = cartReady && cart.cart.items.length > 0 && !busy && !['error', 'conflict'].includes(state.kind);

  return <PageContainer className="checkout-page">
    <div className="catalog-heading"><div><p className="eyebrow"><span className="eyebrow__rule" /> Final review</p><h1>Checkout</h1></div><Link to="/cart">Back to cart</Link></div>
    {cart.status === 'loading' || cart.status === 'idle' ? <p aria-busy="true">Loading your current cart…</p>
      : cart.status === 'error' ? <div role="alert" className="form-error"><p>Your cart could not be loaded. Refresh it before checkout.</p><button type="button" className="button" onClick={() => cart.refresh()}>Refresh cart</button></div>
        : !cart.cart.items.length ? <div className="route-state"><h2>Your cart is empty.</h2><Link to="/">Browse the collection</Link></div>
          : <div className="checkout-layout">
            <section aria-labelledby="checkout-items-title"><h2 id="checkout-items-title">Your selection</h2><ul className="checkout-items">{cart.cart.items.map((item) => <li key={item.productId}><span>{item.product?.name || 'Unavailable product'} <small>× {item.quantity}</small></span><strong>{formatPrice((Number(item.product?.price) || 0) * item.quantity)}</strong></li>)}</ul></section>
            <aside className="cart-summary"><p className="eyebrow">Review before placing</p><h2>Estimated subtotal</h2><p className="cart-summary__total">{formatPrice(cart.total)}</p><p>The server recalculates prices and stock. This preview is not the confirmed order total. Currency is not specified by the API.</p>
              {state.message && <p className={state.kind === 'conflict' || state.kind === 'error' ? 'form-error' : 'checkout-notice'} role={state.kind === 'conflict' || state.kind === 'error' ? 'alert' : 'status'}>{state.message}</p>}
              {state.kind === 'uncertain' && <button className="button" type="button" disabled={busy} onClick={checkAgain}>Check order status</button>}
              {state.kind === 'conflict' && <Link className="button" to="/cart">Review cart</Link>}
              {['uncertain', 'ready', 'submitting'].includes(state.kind) && <button className="button button--dark" type="button" disabled={!canSubmit} onClick={placeOrder}>{state.kind === 'submitting' ? 'Placing order…' : state.kind === 'uncertain' ? 'Retry same checkout attempt' : 'Place order'}</button>}
              {state.kind === 'submitting' && <p aria-live="polite">Confirming with the server…</p>}
              {state.kind === 'checking' && <p aria-live="polite">{state.message}</p>}
              <p className="cart-summary__note">No payment or shipping details are collected.</p>
            </aside>
          </div>}
  </PageContainer>;
}
