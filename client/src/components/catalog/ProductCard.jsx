import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useCart } from '../../cart/CartContext.jsx';
import ProductVisual from './ProductVisual.jsx';

export function formatPrice(value) {
  const number = value === null || value === undefined || value === '' ? NaN : Number(value);
  return Number.isFinite(number) && number >= 0
    ? new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number)
    : 'Price unavailable';
}

export default function ProductCard({ product }) {
  const auth = useAuth();
  const cart = useCart();
  const [feedback, setFeedback] = useState('');
  const available = Number.isInteger(product.stock) && product.stock > 0;
  const addToCart = async () => {
    setFeedback('');
    const result = await cart.addItem(product._id, 1);
    setFeedback(result?.ok ? 'Added to cart' : result?.error?.message || 'Cart update could not be confirmed. Refresh your cart before trying again.');
  };

  return (
    <article className="product-card">
      <Link className="product-card__visual-link" to={`/products/${encodeURIComponent(product._id)}`} aria-label={`View ${product.name}`}>
        <ProductVisual category={product.category} name={product.name} />
      </Link>
      <div className="product-card__body">
        <div className="product-card__meta"><span>{product.category || 'Uncategorized'}</span><span>Product</span></div>
        <h3><Link to={`/products/${encodeURIComponent(product._id)}`}>{product.name || 'Untitled product'}</Link></h3>
        <div className="product-card__bottom">
          <span className="product-price" aria-label={`Price ${formatPrice(product.price)}`}>{formatPrice(product.price)}</span>
          {auth.isAuthenticated
            ? <button className="product-card__action" type="button" disabled={!available || cart.isMutating || Boolean(cart.mutationError?.uncertain)} onClick={addToCart}>{cart.isMutating ? 'Adding…' : available ? 'Add to cart' : 'Unavailable'}</button>
            : <Link className="product-card__action" to="/login" state={{ from: `/products/${encodeURIComponent(product._id)}` }}>Sign in to add</Link>}
          <Link className="product-card__details" to={`/products/${encodeURIComponent(product._id)}`}>Details <span aria-hidden="true">↗</span></Link>
        </div>
        {feedback && <p className={feedback === 'Added to cart' ? 'product-card__feedback' : 'product-card__feedback product-card__feedback--error'} role="status">{feedback}</p>}
      </div>
    </article>
  );
}
