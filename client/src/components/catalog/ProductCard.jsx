import { Link } from 'react-router';
import ProductVisual from './ProductVisual.jsx';

export function formatPrice(value) {
  const number = value === null || value === undefined || value === '' ? NaN : Number(value);
  return Number.isFinite(number) && number >= 0
    ? new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number)
    : 'Price unavailable';
}

export default function ProductCard({ product }) {
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
          <Link className="product-card__action" to={`/products/${encodeURIComponent(product._id)}`}>View item <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </article>
  );
}
