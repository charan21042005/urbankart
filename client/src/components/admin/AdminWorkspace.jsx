import { useEffect, useState } from 'react';
import {
  createAdminProduct, deleteAdminProduct, getAdminOrder, getAdminOrders, getAdminOverview,
  getAdminProducts, getAdminReviews, getAdminUser, getAdminUserCart, getAdminUsers, updateAdminProduct
} from '../../api/adminApi.js';

const SECTIONS = ['Overview', 'Users & carts', 'Orders', 'Products', 'Reviews', 'Analytics'];

function StateMessage({ state, retry }) {
  if (state.status === 'loading') return <p role="status" aria-busy="true">Loading records from MongoDB…</p>;
  if (state.status === 'error') return <div role="alert"><p>{state.error}</p><button type="button" className="button" onClick={retry}>Try again</button></div>;
  return null;
}

function Pager({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  return <nav className="admin-pager" aria-label="Admin table pages"><button className="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button className="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</button></nav>;
}

export default function AdminWorkspace({ section, onSectionChange, analytics }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading', data: null, error: '' });
  const [selectedCart, setSelectedCart] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: '', description: '', category: '', price: '', stock: '0' });

  useEffect(() => { setPage(1); setSelectedCart(null); setSelectedOrder(null); setSelectedUser(null); }, [section, search]);
  useEffect(() => {
    if (section === 'Analytics') return;
    const controller = new AbortController();
    setState({ status: 'loading', data: null, error: '' });
    const request = section === 'Overview' ? getAdminOverview({ signal: controller.signal })
      : section === 'Users & carts' ? getAdminUsers({ page, search, signal: controller.signal })
        : section === 'Orders' ? getAdminOrders({ page, signal: controller.signal })
          : section === 'Products' ? getAdminProducts({ page, search, signal: controller.signal })
            : getAdminReviews({ page, signal: controller.signal });
    request.then((data) => { if (!controller.signal.aborted) setState({ status: 'ready', data, error: '' }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ status: 'error', data: null, error: error.message }); });
    return () => controller.abort();
  }, [section, page, search, attempt]);

  const refresh = () => setAttempt((value) => value + 1);
  const changePage = (value) => setPage(value);
  const run = async (operation, success) => {
    setMessage('');
    try { await operation(); setMessage(success); refresh(); }
    catch (error) { setMessage(error.message); }
  };

  let content = null;
  if (section === 'Overview' && state.status === 'ready') {
    const m = state.data;
    content = <><div className="admin-metrics">{[
      ['Products', m.productCount], ['Active accounts', m.activeUserCount], ['Orders', m.orderCount],
      ['Reviews', m.reviewCount], ['Average rating', m.averageReviewRating === null ? 'No ratings' : `${m.averageReviewRating.toFixed(2)} / 5`],
      ['Active carts', `${m.activeCartCount} · ${m.cartItemCount} items`]
    ].map(([label, value]) => <article className="admin-metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <h3>Largest catalogue categories</h3><ul className="admin-compact-list">{m.categoryCounts.map((item) => <li key={item.category}>{item.category}<span>{item.count.toLocaleString()}</span></li>)}</ul>
      <h3>Order statuses</h3><ul className="admin-compact-list">{m.orderStatusBreakdown.length ? m.orderStatusBreakdown.map((item) => <li key={item.status}>{item.status}<span>{item.count}</span></li>) : <li>No order records</li>}</ul></>;
  } else if (section === 'Users & carts' && state.status === 'ready') {
    content = <><label className="admin-search">Search users<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" /></label>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Registered</th><th>Details</th><th>Current cart</th></tr></thead><tbody>{state.data.users.map((user) => <tr key={user._id}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td><td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unavailable'}</td><td><button className="text-link" onClick={() => getAdminUser(user._id).then(setSelectedUser).catch((error) => setMessage(error.message))}>Inspect account</button></td><td><button className="text-link" onClick={() => getAdminUserCart(user._id).then(setSelectedCart).catch((error) => setMessage(error.message))}>Inspect cart</button></td></tr>)}</tbody></table></div>
      {!state.data.users.length && <p>No matching users.</p>}<Pager page={page} totalPages={state.data.totalPages} onChange={changePage}/>
      {selectedUser && <section className="admin-detail"><h3>Account details</h3><p>{selectedUser.name} · {selectedUser.email} · {selectedUser.role} · {selectedUser.isActive === false ? 'inactive' : 'active'}</p><p>Registered: {selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString() : 'Unavailable'}</p></section>}
      {selectedCart && <section className="admin-detail"><h3>Current cart — {selectedCart.user.name} ({selectedCart.user.email})</h3>{selectedCart.cart.items.length ? <ul>{selectedCart.cart.items.map((item,index)=><li key={`${item.product?._id}-${index}`}>{item.product?.name || 'Unavailable product'} · qty {item.quantity} · {item.currentLineTotal === null ? 'price unavailable' : item.currentLineTotal.toFixed(2)}</li>)}</ul> : <p>This cart is empty.</p>}<p>Current-price total: {selectedCart.cart.currentTotal.toFixed(2)} (catalogue currency unspecified)</p></section>}</>;
  } else if (section === 'Orders' && state.status === 'ready') {
    content = <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Status</th><th>Total</th><th>Items</th></tr></thead><tbody>{state.data.orders.map((order) => <tr key={order._id}><td><button className="text-link" onClick={() => getAdminOrder(order._id).then(setSelectedOrder).catch((error) => setMessage(error.message))}>{order._id}</button></td><td>{order.customerId?.name || order.customerId?.email || 'Unavailable customer'}</td><td>{new Date(order.orderDate).toLocaleString()}</td><td>{order.status}</td><td>{order.totalAmount}</td><td>{order.items.length}</td></tr>)}</tbody></table></div><Pager page={page} totalPages={state.data.totalPages} onChange={changePage}/>{selectedOrder && <section className="admin-detail"><h3>Order detail · {selectedOrder._id}</h3><p>{selectedOrder.customerId?.email || 'Customer unavailable'} · {selectedOrder.status} · total {selectedOrder.totalAmount}</p><ul>{selectedOrder.items.map((item,index)=><li key={`${item.productId}-${index}`}>{item.nameAtPurchase} · {item.qty} × {item.priceAtPurchase}</li>)}</ul></section>}{!state.data.orders.length && <p>No order records.</p>}</>;
  } else if (section === 'Products' && state.status === 'ready') {
    content = <><form className="admin-product-form" onSubmit={(event) => {event.preventDefault(); const body={...form,price:Number(form.price),stock:Number(form.stock)}; void run(()=>createAdminProduct(body),'Product created.');}}><h3>Create catalogue product</h3><label>Name<input required maxLength="300" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></label><label>Category<input required maxLength="120" value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})}/></label><label>Description<textarea maxLength="20000" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/></label><label>Price<input required type="number" min="0" step="0.01" value={form.price} onChange={(e)=>setForm({...form,price:e.target.value})}/></label><label>Stock<input required type="number" min="0" step="1" value={form.stock} onChange={(e)=>setForm({...form,stock:e.target.value})}/></label><button className="button button--dark">Create product</button></form>
      <label className="admin-search">Search products<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product name or description" /></label><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Action</th></tr></thead><tbody>{state.data.products.map((product)=><tr key={product._id}><td>{product.name}</td><td>{product.category}</td><td>{product.price}</td><td>{product.stock}</td><td><button className="text-link" onClick={()=>{const name=window.prompt('Updated product name',product.name);if(name===null)return;const price=window.prompt('Updated price',String(product.price));if(price===null||!Number.isFinite(Number(price)))return;void run(()=>updateAdminProduct(product._id,{name,price:Number(price)}),'Product updated.');}}>Edit name/price</button> <button className="text-link" onClick={()=>{if(window.confirm(`Delete “${product.name}” from the catalogue?`))void run(()=>deleteAdminProduct(product._id),'Product deleted.');}}>Delete</button></td></tr>)}</tbody></table></div><Pager page={page} totalPages={state.data.pagination.totalPages} onChange={changePage}/></>;
  } else if (section === 'Reviews' && state.status === 'ready') {
    content = <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Customer</th><th>Rating</th><th>Review</th><th>Date</th></tr></thead><tbody>{state.data.reviews.map((review)=><tr key={review._id}><td>{review.productId?.name || 'Unavailable product'}</td><td>{review.userId?.name || review.userId?.email || 'Unavailable user'}</td><td>{review.rating}/5</td><td>{review.text || 'No written comment'}</td><td>{new Date(review.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div><Pager page={page} totalPages={state.data.totalPages} onChange={changePage}/>{!state.data.reviews.length && <p>No reviews recorded.</p>}</>;
  } else if (section === 'Analytics') content = analytics;

  return <section className="admin-workspace" aria-label="Admin dashboard sections">
    <nav className="admin-tabs" aria-label="Admin sections">{SECTIONS.map((name)=><button key={name} type="button" className={section===name?'is-active':''} aria-current={section===name?'page':undefined} onClick={()=>onSectionChange(name)}>{name}</button>)}</nav>
    <div className="admin-workspace__body">{section !== 'Analytics' && <StateMessage state={state} retry={refresh}/>} {message && <p role="status">{message}</p>}{content}</div>
  </section>;
}
