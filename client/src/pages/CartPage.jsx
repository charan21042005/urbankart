import { Link } from 'react-router';
import PageContainer from '../components/layout/PageContainer.jsx';
import { formatPrice } from '../components/catalog/ProductCard.jsx';
import ProductVisual from '../components/catalog/ProductVisual.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCart } from '../cart/CartContext.jsx';
import { useEffect } from 'react';

export default function CartPage() {
  const auth = useAuth();
  const cart = useCart();
  useEffect(() => { document.title = 'Your cart | UrbanKart'; }, []);

  if (!auth.isAuthenticated) return <PageContainer className="route-state"><p className="eyebrow">Your saved selection</p><h1>Your cart is waiting.</h1><p>Sign in to view and update the cart linked to your account.</p><Link className="button button--dark" to="/login" state={{ from: '/cart' }}>Sign in</Link><p className="route-state__secondary">New to UrbanKart? <Link to="/register" state={{ from: '/cart' }}>Create an account</Link></p></PageContainer>;
  if (cart.status === 'loading' || cart.status === 'idle') return <PageContainer className="route-state" aria-busy="true"><p className="eyebrow">Your cart</p><h1>Gathering your selection…</h1></PageContainer>;
  if (cart.status === 'error') return <PageContainer className="route-state" role="alert"><p className="eyebrow">Cart unavailable</p><h1>We couldn’t load your cart.</h1><p>{cart.mutationError?.message || cart.error?.message}</p><button className="button button--dark" type="button" onClick={() => cart.refresh()}>{cart.mutationError?.uncertain ? 'Refresh cart' : 'Try again'}</button></PageContainer>;
  if (cart.status === 'empty') return <PageContainer className="route-state"><p className="eyebrow">A little room for something useful</p><h1>Your cart is empty.</h1><p>Explore the collection and add an item when something feels right.</p><Link className="button button--dark" to="/">Browse the collection</Link></PageContainer>;

  return <PageContainer className="cart-page">
    <div className="catalog-heading"><div><p className="eyebrow"><span className="eyebrow__rule" /> Your selection</p><h1>Your cart</h1></div><p className="catalog-count">{cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'}</p></div>
    {cart.mutationError && <div className="form-error" role="alert"><p>{cart.mutationError.message}</p>{cart.mutationError.uncertain && <button className="button" type="button" disabled={cart.status === 'loading'} onClick={() => cart.refresh()}>Refresh cart</button>}</div>}
    <div className="cart-layout"><div className="cart-lines">{cart.cart.items.map((item) => {
      const product = item.product;
      return <article className="cart-line" key={item.productId}>
        {product ? <Link to={`/products/${encodeURIComponent(item.productId)}`}><ProductVisual category={product.category} name={product.name} /></Link> : <div className="cart-line__missing">Item unavailable</div>}
        <div className="cart-line__details"><p className="eyebrow">{product?.category || 'UrbanKart collection'}</p><h2>{product?.name || 'Product no longer available'}</h2><p>Unit price · {formatPrice(product?.price)}</p><div className="quantity-controls" aria-label={`Quantity for ${product?.name || 'unavailable item'}`}>
          <button type="button" aria-label={`Decrease ${product?.name || 'item'} quantity`} disabled={cart.isMutating || cart.mutationError?.uncertain || item.quantity <= 1} onClick={() => cart.updateItem(item.productId, item.quantity - 1)}>−</button><span aria-live="polite">{item.quantity}</span><button type="button" aria-label={`Increase ${product?.name || 'item'} quantity`} disabled={cart.isMutating || cart.mutationError?.uncertain || !product || (Number.isInteger(product.stock) && item.quantity >= product.stock)} onClick={() => cart.updateItem(item.productId, item.quantity + 1)}>+</button>
        </div><button className="remove-link" type="button" disabled={cart.isMutating || cart.mutationError?.uncertain} onClick={() => cart.removeItem(item.productId)}>Remove</button></div>
        <strong className="cart-line__total">{formatPrice(Number(product?.price) * item.quantity)}</strong>
      </article>;
    })}</div>
      <aside className="cart-summary"><p className="eyebrow">A quick summary</p><h2>Estimated subtotal</h2><p className="cart-summary__total">{formatPrice(cart.total)}</p><p>Based on current catalogue prices. Currency is not specified by the API.</p><button type="button" disabled={cart.isMutating || cart.mutationError?.uncertain} onClick={() => cart.clearCart()}>Clear cart</button><p className="cart-summary__note">Checkout is not available yet.</p></aside>
    </div>
  </PageContainer>;
}
