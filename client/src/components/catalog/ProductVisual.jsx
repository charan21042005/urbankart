function visualStyle(category) {
  const value = String(category).toLowerCase();
  if (/electronic|computer|mobile|camera|audio/.test(value)) return 'tech';
  if (/apparel|clothing|fashion|footwear|jewel|watch/.test(value)) return 'style';
  if (/home|kitchen|furniture|decor|appliance/.test(value)) return 'home';
  if (/book|media|music|movie/.test(value)) return 'media';
  if (/beauty|personal|health/.test(value)) return 'care';
  return 'general';
}

export default function ProductVisual({ category = '', name = '' }) {
  const initial = [...String(name).trim()][0]?.toLocaleUpperCase() || 'U';
  return (
    <div className="product-visual" data-visual={visualStyle(category)} role="img" aria-label={`${category || 'Product'} illustration for ${name || 'catalogue item'}`}>
      <span className="product-visual__index">UK / {initial}</span>
      <span className="product-visual__shape" aria-hidden="true"><i /><i /><i /></span>
      <span className="product-visual__caption">{category || 'Everyday objects'}</span>
    </div>
  );
}
