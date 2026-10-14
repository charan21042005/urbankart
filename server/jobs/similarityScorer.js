const CATEGORY_BONUS = 0.2;

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function stableId(product) {
  const value = product?._id ?? product?.id;
  return value == null ? '' : String(value);
}

function extractFeatures(product) {
  const features = new Map();
  const tags = Array.isArray(product?.tags) ? product.tags : [];
  for (const value of tags) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    const key = `tag:${normalized}`;
    if (!features.has(key)) features.set(key, { type: 'tag', normalized, value: value.trim() });
  }

  const attributes = Array.isArray(product?.attributes) ? product.attributes : [];
  for (const attribute of attributes) {
    const normalizedKey = normalizeText(attribute?.key);
    const normalizedValue = normalizeText(attribute?.value);
    if (!normalizedKey || !normalizedValue) continue;
    const key = `attribute:${normalizedKey}\u0000${normalizedValue}`;
    if (!features.has(key)) {
      features.set(key, {
        type: 'attribute',
        normalized: key,
        key: attribute.key.trim(),
        value: attribute.value.trim()
      });
    }
  }
  return features;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Equal-weight, typed-feature Jaccard plus the SRS category bonus.
 * Tags and key/value attributes are separate feature types, so a tag named
 * "size=large" cannot accidentally collide with the corresponding attribute.
 */
function similarityScore(productA, productB) {
  const idA = stableId(productA);
  const idB = stableId(productB);
  const sameProduct = Boolean(idA && idB && idA === idB);
  const featuresA = extractFeatures(productA);
  const featuresB = extractFeatures(productB);
  const sharedKeys = [...featuresA.keys()].filter((key) => featuresB.has(key)).sort(compareStrings);
  const unionSize = new Set([...featuresA.keys(), ...featuresB.keys()]).size;
  const jaccard = unionSize ? sharedKeys.length / unionSize : 0;
  const categoryA = normalizeText(productA?.category);
  const categoryB = normalizeText(productB?.category);
  const categoryMatch = Boolean(categoryA && categoryB && categoryA === categoryB);
  const categoryBonus = categoryMatch ? CATEGORY_BONUS : 0;

  // Example: [wireless, mechanical] versus [wireless, gaming] has one shared
  // feature in a union of three (1/3). Matching categories add 0.2, so the
  // final score is min(1, 0.333333 + 0.2) = 0.533333.
  const score = sameProduct ? 0 : Number(Math.min(1, jaccard + categoryBonus).toFixed(6));
  const sharedTags = sharedKeys
    .map((key) => featuresA.get(key))
    .filter((feature) => feature.type === 'tag')
    .map((feature) => feature.value);
  const sharedAttributes = sharedKeys
    .map((key) => featuresA.get(key))
    .filter((feature) => feature.type === 'attribute')
    .map(({ key, value }) => ({ key, value }));

  return {
    score,
    sharedTags,
    sharedAttributes,
    categoryMatch,
    categoryBonus,
    sharedFeatureCount: sameProduct ? 0 : sharedKeys.length,
    unionFeatureCount: unionSize,
    sameProduct
  };
}

module.exports = { similarityScore, extractFeatures, normalizeText, stableId, CATEGORY_BONUS };
