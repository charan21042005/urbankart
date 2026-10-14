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
function similarityScoreFromCounts(featureCountA, featureCountB, sharedFeatureCount, categoryMatch) {
  const unionFeatureCount = featureCountA + featureCountB - sharedFeatureCount;
  const jaccard = unionFeatureCount ? sharedFeatureCount / unionFeatureCount : 0;
  const categoryBonus = categoryMatch ? CATEGORY_BONUS : 0;

  // Example: [wireless, mechanical] versus [wireless, gaming] has one shared
  // feature in a union of three (1/3). Matching categories add 0.2, so the
  // final score is min(1, 0.333333 + 0.2) = 0.533333.
  const score = Number(Math.min(1, jaccard + categoryBonus).toFixed(6));
  return { score, categoryBonus, unionFeatureCount };
}

function similarityScoreFromFeatures(productA, productB, featuresA, featuresB, categoryA, categoryB) {
  const idA = stableId(productA);
  const idB = stableId(productB);
  const sameProduct = Boolean(idA && idB && idA === idB);
  const leftFeatures = featuresA || extractFeatures(productA);
  const rightFeatures = featuresB || extractFeatures(productB);
  const sharedKeys = [...leftFeatures.keys()].filter((key) => rightFeatures.has(key)).sort(compareStrings);
  const leftCategory = categoryA === undefined ? normalizeText(productA?.category) : categoryA;
  const rightCategory = categoryB === undefined ? normalizeText(productB?.category) : categoryB;
  const categoryMatch = Boolean(leftCategory && rightCategory && leftCategory === rightCategory);
  const computed = similarityScoreFromCounts(leftFeatures.size, rightFeatures.size, sharedKeys.length, categoryMatch);
  const score = sameProduct ? 0 : computed.score;
  const sharedTags = sharedKeys
    .map((key) => leftFeatures.get(key))
    .filter((feature) => feature.type === 'tag')
    .map((feature) => feature.value.slice(0, 120))
    .slice(0, 50);
  const sharedAttributes = sharedKeys
    .map((key) => leftFeatures.get(key))
    .filter((feature) => feature.type === 'attribute')
    .map(({ key, value }) => ({ key: key.slice(0, 120), value: value.slice(0, 120) }))
    .slice(0, 50);

  return {
    score,
    sharedTags,
    sharedAttributes,
    categoryMatch,
    categoryBonus: computed.categoryBonus,
    // Cache validators bound each explanation list to 50 entries. The score
    // and sharedFeatureCount still use every matched feature.
    sharedFeatureCount: sameProduct ? 0 : sharedKeys.length,
    unionFeatureCount: computed.unionFeatureCount,
    sameProduct
  };
}

function similarityScore(productA, productB) {
  return similarityScoreFromFeatures(productA, productB);
}

module.exports = { similarityScore, similarityScoreFromFeatures, similarityScoreFromCounts, extractFeatures, normalizeText, stableId, CATEGORY_BONUS };
