export default function ProductVisual({ category = '', name = '' }) {
  const initial = [...String(name).trim()][0]?.toLocaleUpperCase() || 'U';
  return (
    <div className="product-visual" aria-hidden="true">
      <span className="product-visual__index">UK / {initial}</span>
      <span className="product-visual__shape" />
      <span className="product-visual__caption">{category || 'Everyday objects'}</span>
    </div>
  );
}
