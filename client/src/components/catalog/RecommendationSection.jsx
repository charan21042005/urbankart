import { useEffect, useState } from 'react';
import ProductCard from './ProductCard.jsx';
import { getRecommendations } from '../../api/productApi.js';

function RecommendationExplanation({ item, source }) {
  if (source === 'fallback') {
    return <p className="recommendation-explanation">A highly rated pick from the same category.</p>;
  }

  const explanation = item.explanation || {};
  const details = [];
  if (item.score !== null && Number.isFinite(item.score)) {
    details.push(`Similarity ${Math.round(item.score * 100)}%`);
  }
  if (explanation.sharedTags?.length) details.push(`Shared tags: ${explanation.sharedTags.join(', ')}`);
  if (explanation.sharedAttributes?.length) {
    details.push(`Shared specifications: ${explanation.sharedAttributes.map(({ key, value }) => `${key}: ${value}`).join(', ')}`);
  }
  if (explanation.categoryMatch) details.push('Same category');
  return <p className="recommendation-explanation">{details.join(' · ') || 'Related by catalogue features.'}</p>;
}

export default function RecommendationSection({ productId }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading', result: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', result: null, error: null });
    getRecommendations(productId, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setState({ status: result.items.length ? 'ready' : 'empty', result, error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ status: 'error', result: null, error });
      });
    return () => controller.abort();
  }, [productId, attempt]);

  return <section className="recommendation-section" aria-labelledby="recommendation-heading" aria-busy={state.status === 'loading'}>
    <div className="catalog-heading">
      <div><p className="eyebrow"><span className="eyebrow__rule" /> More to explore</p><h2 id="recommendation-heading">You might also like</h2></div>
      {state.status === 'ready' && state.result.source === 'fallback' && <p className="recommendation-source">Popular in this category</p>}
    </div>
    {state.status === 'loading' && <p role="status" className="recommendation-state">Finding related products…</p>}
    {state.status === 'error' && <div className="recommendation-state" role="alert">
      <p>Recommendations could not be loaded. The product details above are still available.</p>
      <button className="button" type="button" onClick={() => setAttempt((current) => current + 1)}>Retry recommendations</button>
    </div>}
    {state.status === 'empty' && <p className="recommendation-state" role="status">There are no related products to show yet.</p>}
    {state.status === 'ready' && <div className="product-grid recommendation-grid">
      {state.result.items.map((item) => <div className="recommendation-item" key={item.product._id}>
        <ProductCard product={item.product} />
        <RecommendationExplanation item={item} source={state.result.source} />
      </div>)}
    </div>}
  </section>;
}
