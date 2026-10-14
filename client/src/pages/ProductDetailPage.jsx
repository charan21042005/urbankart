import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { getProduct } from '../api/productApi.js';
import ProductVisual from '../components/catalog/ProductVisual.jsx';
import { formatPrice } from '../components/catalog/ProductCard.jsx';
import PageContainer from '../components/layout/PageContainer.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useCart } from '../cart/CartContext.jsx';
import RecommendationSection from '../components/catalog/RecommendationSection.jsx';

export default function ProductDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const auth = useAuth();
  const cart = useCart();
  const [state, setState] = useState({ status: 'loading', product: null, error: null });
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  // Fetch the route's product from the API; abort on navigation and retry on request.
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', product: null, error: null });
    setQuantity(1);
    getProduct(id, { signal: controller.signal }).then((product) => {
      if (!controller.signal.aborted) setState({ status: 'ready', product, error: null });
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setState({ status: error?.status === 404 ? 'not-found' : 'error', product: null, error });
    });
    return () => controller.abort();
  }, [id, retryCount]);

  // Keep the document title aligned with the currently loaded product.
  useEffect(() => { document.title = state.product?.name ? `${state.product.name} | UrbanKart` : 'Product | UrbanKart'; }, [state.product]);

  const product = state.product;
  const canAdd = auth.isAuthenticated && Number.isInteger(product?.stock) && product.stock > 0
    && !cart.isMutating && !cart.mutationError?.uncertain;
  const addToCart = async () => {
    setFeedback('');
    const outcome = await cart.addItem(product._id, quantity);
    setFeedback(outcome?.ok ? `${product.name} was added to your cart.` : outcome?.error?.message || 'We could not confirm the cart update. Refresh your cart before trying again.');
  };

  const confirmCart = async () => {
    const result = await cart.refresh();
    if (result) setFeedback('Your cart has been refreshed. Review its contents before making another change.');
  };

  if (state.status === 'loading') return <PageContainer className="route-state" aria-busy="true"><p className="eyebrow">Product detail</p><h1>Loading item…</h1></PageContainer>;
  if (state.status === 'not-found') return <PageContainer className="route-state" role="status"><p className="eyebrow">No longer in the collection</p><h1>We couldn’t find that item.</h1><Link className="button button--dark" to="/">Back to the collection</Link></PageContainer>;
  if (state.status === 'error') return <PageContainer className="route-state" role="alert"><p className="eyebrow">Product unavailable</p><h1>We couldn’t load this item.</h1><p>{state.error?.message}</p><button className="button button--dark" type="button" onClick={() => setRetryCount((current) => current + 1)}>Try again</button> <Link className="text-link" to="/">Return to the collection</Link></PageContainer>;

  return (
    <PageContainer className="product-detail-page">
      <Link className="back-link" to="/">← Back to the collection</Link>
      <div className="product-detail">
        <ProductVisual category={product.category} name={product.name} />
        <section className="product-detail__copy" aria-labelledby="product-title">
          <p className="eyebrow"><span className="eyebrow__rule" /> {product.category || 'UrbanKart collection'}</p>
          <h1 id="product-title">{product.name || 'Untitled product'}</h1>
          <p className="product-detail__price">{formatPrice(product.price)} <span>Price as supplied by catalogue</span></p>
          {product.description && <p className="product-detail__description">{product.description}</p>}
          {Number.isInteger(product.stock) && <p className={`stock-note${product.stock > 0 ? ' stock-note--available' : ''}`}>{product.stock > 0 ? 'Available' : 'Currently unavailable'}</p>}
          {Array.isArray(product.attributes) && product.attributes.length > 0 && <dl className="attribute-list">{product.attributes.filter((item) => item && typeof item.key === 'string' && typeof item.value === 'string').map((item, index) => <div key={`${item.key}-${index}`}><dt>{item.key}</dt><dd>{item.value}</dd></div>)}</dl>}
          {auth.isAuthenticated ? <div className="add-controls">
            {Number.isInteger(product.stock) && product.stock > 0 && <label>Quantity <input aria-label="Quantity" type="number" min="1" max={product.stock} step="1" value={quantity} onChange={(event) => setQuantity(Math.min(product.stock, Math.max(1, Math.floor(Number(event.target.value) || 1))))} /></label>}
            <button className="button button--dark" type="button" disabled={cart.isMutating || (!canAdd && !cart.mutationError?.uncertain)} onClick={cart.mutationError?.uncertain ? confirmCart : addToCart}>{cart.isMutating ? 'Adding…' : cart.mutationError?.uncertain ? 'Refresh cart' : product.stock === 0 ? 'Unavailable' : 'Add to cart'}</button>
          </div> : <Link className="button button--dark" to="/login" state={{ from: `${location.pathname}${location.search}` }}>Sign in to add to cart</Link>}
          {feedback && <p className={feedback.includes('was added') ? 'form-success' : 'form-error'} role="status">{feedback}</p>}
          {cart.mutationError && !feedback && <p className="form-error" role="alert">{cart.mutationError.message}</p>}
        </section>
      </div>
      <RecommendationSection key={product._id} productId={product._id} />
    </PageContainer>
  );
}
