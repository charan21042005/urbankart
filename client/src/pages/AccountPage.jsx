import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import PageContainer from '../components/layout/PageContainer.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatPrice } from '../components/catalog/ProductCard.jsx';
import { getMyOrders } from '../api/userApi.js';

export default function AccountPage() {
  const auth = useAuth();
  const [name, setName] = useState(auth.user?.name || '');
  const [profileMessage, setProfileMessage] = useState('');
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [orders, setOrders] = useState({ status: 'loading', data: null, error: '' });

  useEffect(() => { setName(auth.user?.name || ''); }, [auth.user?.name]);
  useEffect(() => {
    if (!auth.isAuthenticated) return undefined;
    const controller = new AbortController();
    setOrders({ status: 'loading', data: null, error: '' });
    getMyOrders({ page, signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setOrders({ status: 'ready', data, error: '' }); })
      .catch((error) => { if (!controller.signal.aborted) setOrders({ status: 'error', data: null, error: error.message }); });
    return () => controller.abort();
  }, [auth.isAuthenticated, page, attempt]);

  useEffect(() => { document.title = 'My account | UrbanKart'; }, []);

  if (!auth.isAuthenticated) return <PageContainer className="account-page route-state">
    <p className="eyebrow">Your UrbanKart account</p><h1>Sign in to see your account.</h1>
    <p>Your profile and order history are private to your account.</p>
    <Link className="button button--dark" to="/login" state={{ from: '/account' }}>Sign in</Link>
    <p>New here? <Link to="/register" state={{ from: '/account' }}>Create an account</Link></p>
  </PageContainer>;

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileMessage('');
    try {
      await auth.updateProfile(name);
      setProfileMessage('Your profile name has been updated.');
    } catch (error) { setProfileMessage(error.message); }
  };

  return <PageContainer className="account-page">
    <p className="eyebrow">Account</p><h1>Hello, {auth.user.name}</h1>
    <section className="account-panel" aria-labelledby="account-profile-heading">
      <h2 id="account-profile-heading">Profile</h2>
      <form className="account-profile-form" onSubmit={saveProfile}>
        <label>Name<input value={name} maxLength="100" required onChange={(event) => setName(event.target.value)} /></label>
        <label>Email<input value={auth.user.email} readOnly /></label>
        <button type="submit" className="button button--dark" disabled={!name.trim() || name.trim() === auth.user.name}>Save name</button>
      </form>
      {profileMessage && <p role="status">{profileMessage}</p>}
    </section>
    <section className="account-panel" aria-labelledby="account-orders-heading">
      <div className="account-section-heading"><div><p className="eyebrow">Your purchases</p><h2 id="account-orders-heading">Order history</h2></div><Link to="/">Continue shopping</Link></div>
      {orders.status === 'loading' && <p role="status" aria-busy="true">Loading your orders…</p>}
      {orders.status === 'error' && <div role="alert"><p>{orders.error}</p><button type="button" className="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button></div>}
      {orders.status === 'ready' && orders.data.orders.length === 0 && <div className="account-empty"><p>No orders yet. Choose an in-stock item from the collection and checkout to see it here.</p><Link className="button" to="/">Browse available products</Link></div>}
      {orders.status === 'ready' && orders.data.orders.length > 0 && <>
        <p>{orders.data.total} order{orders.data.total === 1 ? '' : 's'}</p>
        <div className="account-orders">{orders.data.orders.map((order) => <article className="account-order" key={order._id}>
          <div><strong>{order.status}</strong><time dateTime={order.orderDate}>{new Date(order.orderDate).toLocaleString()}</time></div>
          <ul>{order.items.map((item, index) => <li key={`${item.productId}-${index}`}>{item.nameAtPurchase} · {item.qty} × {formatPrice(item.priceAtPurchase)}</li>)}</ul>
          <p>Order total <strong>{formatPrice(order.totalAmount)}</strong></p>
        </article>)}</div>
        {orders.data.totalPages > 1 && <nav className="admin-pager" aria-label="Order history pages"><button className="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {orders.data.totalPages}</span><button className="button" disabled={page >= orders.data.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></nav>}
      </>}
    </section>
  </PageContainer>;
}
