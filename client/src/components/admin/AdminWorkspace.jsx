import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  createAdminProduct, deleteAdminProduct, getAdminOrder, getAdminOrders, getAdminOverview,
  getAdminProducts, getAdminReviews, getAdminUser, getAdminUserCart, getAdminUsers, updateAdminProduct
} from '../../api/adminApi.js';

const SECTIONS = [
  { label: 'Overview', path: '/admin' },
  { label: 'Users & carts', path: '/admin/customers' },
  { label: 'Orders', path: '/admin/orders' },
  { label: 'Products', path: '/admin/products' },
  { label: 'Reviews', path: '/admin/reviews' },
  { label: 'Analytics', path: '/admin/analytics' }
];
const EMPTY_PRODUCT = { name: '', description: '', category: '', price: '', stock: '0' };

function StateMessage({ state, retry }) {
  if (state.status === 'loading') return <p role="status" aria-busy="true">Loading records from MongoDB…</p>;
  if (state.status === 'error') return <div role="alert"><p>{state.error}</p><button type="button" className="button" onClick={retry}>Try again</button></div>;
  return null;
}

function Pager({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  return <nav className="admin-pager" aria-label="Admin table pages">
    <button type="button" className="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
    <span>Page {page} of {totalPages}</span>
    <button type="button" className="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</button>
  </nav>;
}

function ProductFields({ value, onChange }) {
  const update = (field) => (event) => onChange({ ...value, [field]: event.target.value });
  return <>
    <label>Name<input required maxLength="300" value={value.name} onChange={update('name')} /></label>
    <label>Category<input required maxLength="120" value={value.category} onChange={update('category')} /></label>
    <label>Description<textarea maxLength="20000" value={value.description || ''} onChange={update('description')} /></label>
    <label>Price<input required type="number" min="0" step="0.01" value={value.price} onChange={update('price')} /></label>
    <label>Stock<input required type="number" min="0" step="1" value={value.stock} onChange={update('stock')} /></label>
  </>;
}

export default function AdminWorkspace({ section, analytics }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading', data: null, error: '' });
  const [selectedCart, setSelectedCart] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [editingProduct, setEditingProduct] = useState(null);

  useEffect(() => { setPage(1); setSelectedCart(null); setSelectedOrder(null); setSelectedUser(null); setMessage(''); }, [section, search]);
  useEffect(() => {
    if (section === 'Analytics') return undefined;
    const controller = new AbortController();
    setState({ status: 'loading', data: null, error: '', section });
    const request = section === 'Overview' ? getAdminOverview({ signal: controller.signal })
      : section === 'Users & carts' ? getAdminUsers({ page, search, signal: controller.signal })
        : section === 'Orders' ? getAdminOrders({ page, signal: controller.signal })
          : section === 'Products' ? getAdminProducts({ page, search, signal: controller.signal })
            : getAdminReviews({ page, signal: controller.signal });
    request.then((data) => { if (!controller.signal.aborted) setState({ status: 'ready', data, error: '', section }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ status: 'error', data: null, error: error.message, section }); });
    return () => controller.abort();
  }, [section, page, search, attempt]);

  const refresh = () => setAttempt((value) => value + 1);
  const sectionState = state.section === section ? state : { status: 'loading', data: null, error: '' };
  const run = async (operation, success) => {
    setMessage('');
    try { await operation(); setMessage(success); refresh(); return true; }
    catch (error) { setMessage(error.message); return false; }
  };

  let content = null;
  if (section === 'Overview' && sectionState.status === 'ready') {
    const metrics = sectionState.data;
    content = <>
      <div className="admin-metrics">{[
        ['Products', metrics.productCount], ['Active accounts', metrics.activeUserCount], ['Orders', metrics.orderCount],
        ['Reviews', metrics.reviewCount], ['Average rating', metrics.averageReviewRating === null ? 'No ratings' : `${metrics.averageReviewRating.toFixed(2)} / 5`],
        ['Active carts', `${metrics.activeCartCount} · ${metrics.cartItemCount} items`]
      ].map(([label, value]) => <article className="admin-metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <h3>Largest catalogue categories</h3><ul className="admin-compact-list">{metrics.categoryCounts.map((item) => <li key={item.category}>{item.category}<span>{item.count.toLocaleString()}</span></li>)}</ul>
      <h3>Order statuses</h3><ul className="admin-compact-list">{metrics.orderStatusBreakdown.length ? metrics.orderStatusBreakdown.map((item) => <li key={item.status}>{item.status}<span>{item.count}</span></li>) : <li>No order records yet.</li>}</ul>
    </>;
  } else if (section === 'Users & carts' && sectionState.status === 'ready') {
    content = <>
      <p>{sectionState.data.total} customer account{sectionState.data.total === 1 ? '' : 's'}</p>
      <label className="admin-search">Search customers<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" /></label>
      {sectionState.data.users.length > 0 ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Registered</th><th>Details</th><th>Current cart</th></tr></thead><tbody>
        {sectionState.data.users.map((user) => <tr key={user._id}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td><td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Date unavailable'}</td>
          <td><button type="button" className="text-link" onClick={() => getAdminUser(user._id).then(setSelectedUser).catch((error) => setMessage(error.message))}>Inspect account</button></td>
          <td><button type="button" className="text-link" onClick={() => getAdminUserCart(user._id).then(setSelectedCart).catch((error) => setMessage(error.message))}>Inspect cart</button></td></tr>)}
      </tbody></table></div> : <div className="admin-empty"><h3>No matching customers</h3><p>Try a different name or email search.</p><button type="button" className="button" onClick={() => setSearch('')}>Clear search</button></div>}
      <Pager page={page} totalPages={sectionState.data.totalPages} onChange={setPage} />
      {selectedUser && <section className="admin-detail"><h3>Account details</h3><p>{selectedUser.name} · {selectedUser.email} · {selectedUser.role} · {selectedUser.isActive === false ? 'inactive' : 'active'}</p><p>Registered: {selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString() : 'Date unavailable'}</p></section>}
      {selectedCart && <section className="admin-detail"><h3>Current cart — {selectedCart.user.name} ({selectedCart.user.email})</h3>{selectedCart.cart.items.length ? <ul>{selectedCart.cart.items.map((item, index) => <li key={`${item.product?._id}-${index}`}>{item.product?.name || 'Unavailable product'} · qty {item.quantity} · {item.currentLineTotal === null ? 'price unavailable' : item.currentLineTotal.toFixed(2)}</li>)}</ul> : <p>This cart is empty.</p>}<p>Current-price total: {selectedCart.cart.currentTotal.toFixed(2)} (catalogue currency unspecified)</p></section>}
    </>;
  } else if (section === 'Orders' && sectionState.status === 'ready') {
    content = <>
      {sectionState.data.orders.length > 0 ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Status</th><th>Total</th><th>Items</th></tr></thead><tbody>{sectionState.data.orders.map((order) => <tr key={order._id}>
        <td><button type="button" className="text-link" onClick={() => getAdminOrder(order._id).then(setSelectedOrder).catch((error) => setMessage(error.message))}>{order._id}</button></td><td>{order.customerId?.name || order.customerId?.email || 'Unavailable customer'}</td><td>{new Date(order.orderDate).toLocaleString()}</td><td>{order.status}</td><td>{order.totalAmount}</td><td>{order.items.length}</td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><h3>No orders yet</h3><p>Orders appear here after a customer completes checkout. Choose an in-stock item for the local demo.</p><Link className="button" to="/">Open storefront</Link></div>}
      <Pager page={page} totalPages={sectionState.data.totalPages} onChange={setPage} />
      {selectedOrder && <section className="admin-detail"><h3>Order detail · {selectedOrder._id}</h3><p>{selectedOrder.customerId?.email || 'Customer unavailable'} · {selectedOrder.status} · total {selectedOrder.totalAmount}</p><ul>{selectedOrder.items.map((item, index) => <li key={`${item.productId}-${index}`}>{item.nameAtPurchase} · {item.qty} × {item.priceAtPurchase}</li>)}</ul></section>}
    </>;
  } else if (section === 'Products' && sectionState.status === 'ready') {
    content = <>
      <form className="admin-product-form" onSubmit={(event) => { event.preventDefault(); const body = { ...form, price: Number(form.price), stock: Number(form.stock) }; void run(() => createAdminProduct(body), 'Product created.').then((ok) => { if (ok) setForm(EMPTY_PRODUCT); }); }}>
        <h3>Create catalogue product</h3><ProductFields value={form} onChange={setForm} /><button className="button button--dark">Create product</button>
        <p className="admin-form-note">Stock is local inventory set by the administrator; the imported dataset does not supply stock values.</p>
      </form>
      {editingProduct && <form className="admin-product-form" onSubmit={(event) => { event.preventDefault(); const body = { name: editingProduct.name, description: editingProduct.description, category: editingProduct.category, price: Number(editingProduct.price), stock: Number(editingProduct.stock) }; void run(() => updateAdminProduct(editingProduct._id, body), 'Product updated.').then((ok) => { if (ok) setEditingProduct(null); }); }}>
        <h3>Edit product</h3><ProductFields value={editingProduct} onChange={setEditingProduct} /><button className="button button--dark">Save product</button><button type="button" className="button" onClick={() => setEditingProduct(null)}>Cancel</button>
        <p className="admin-form-note">Changing stock assigns local demo inventory; it does not represent retailer inventory.</p>
      </form>}
      <label className="admin-search">Search products<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product name or description" /></label>
      {sectionState.data.products.length > 0 ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Action</th></tr></thead><tbody>{sectionState.data.products.map((product) => <tr key={product._id}>
        <td>{product.name}</td><td>{product.category}</td><td>{product.price}</td><td>{product.stock}</td><td><button type="button" className="text-link" onClick={() => setEditingProduct({ ...product, description: product.description || '', price: String(product.price), stock: String(product.stock) })}>Edit product</button> <button type="button" className="text-link" onClick={() => { if (window.confirm(`Delete “${product.name}” from the catalogue?`)) void run(() => deleteAdminProduct(product._id), 'Product deleted.'); }}>Delete</button></td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><h3>No matching products</h3><p>Try another search or add a catalogue item using the form above.</p></div>}
      <Pager page={page} totalPages={sectionState.data.pagination.totalPages} onChange={setPage} />
    </>;
  } else if (section === 'Reviews' && sectionState.status === 'ready') {
    content = sectionState.data.reviews.length > 0 ? <>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Customer</th><th>Rating</th><th>Review</th><th>Date</th></tr></thead><tbody>{sectionState.data.reviews.map((review) => <tr key={review._id}>
        <td>{review.productId?.name || 'Unavailable product'}</td><td>{review.userId?.name || review.userId?.email || 'Unavailable user'}</td><td>{review.rating}/5</td><td>{review.text || 'No written comment'}</td><td>{new Date(review.createdAt).toLocaleDateString()}</td>
      </tr>)}</tbody></table></div><Pager page={page} totalPages={state.data.totalPages} onChange={setPage} />
    </> : <div className="admin-empty"><h3>No reviews yet</h3><p>Customer reviews appear here after they submit a rating on a product page.</p><Link className="button" to="/">Open storefront</Link></div>;
  } else if (section === 'Analytics') content = analytics;

  return <section className="admin-workspace" aria-label="Admin dashboard sections">
    <nav className="admin-tabs" aria-label="Admin sections">{SECTIONS.map(({ label, path }) => <Link key={path} className={section === label ? 'is-active' : ''} aria-current={section === label ? 'page' : undefined} to={path}>{label}</Link>)}</nav>
    <div className="admin-workspace__body">{section !== 'Analytics' && <StateMessage state={sectionState} retry={refresh} />}{message && <p role="status">{message}</p>}{content}</div>
  </section>;
}
