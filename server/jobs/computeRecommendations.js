const Product = require('../models/Product');
const Recommendation = require('../models/Recommendation');
const { extractFeatures, normalizeText, similarityScore, stableId } = require('./similarityScorer');

const MAX_RECOMMENDATIONS = 5;
const MIN_RELEVANCE_SCORE = 0.2;
const WRITE_BATCH_SIZE = 250;

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function buildCandidateIndexes(products) {
  const byCategory = new Map();
  const byFeature = new Map();
  for (const product of products) {
    const id = stableId(product);
    const category = normalizeText(product.category);
    if (category) {
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push(product);
    }
    for (const key of extractFeatures(product).keys()) {
      if (!byFeature.has(key)) byFeature.set(key, []);
      byFeature.get(key).push(product);
    }
    product.__recommendationStableId = id;
  }
  return { byCategory, byFeature };
}

function rankRecommendations(source, products, indexes) {
  const candidateIds = new Set();
  const category = normalizeText(source.category);
  if (category) {
    for (const product of indexes.byCategory.get(category) || []) candidateIds.add(product.__recommendationStableId);
  }
  for (const key of extractFeatures(source).keys()) {
    for (const product of indexes.byFeature.get(key) || []) candidateIds.add(product.__recommendationStableId);
  }

  return products
    .filter((candidate) => candidate.__recommendationStableId !== source.__recommendationStableId
      && candidateIds.has(candidate.__recommendationStableId))
    .map((candidate) => ({ candidate, explanation: similarityScore(source, candidate) }))
    .filter(({ explanation }) => explanation.score >= MIN_RELEVANCE_SCORE)
    .sort((left, right) => right.explanation.score - left.explanation.score
      || compareStrings(left.candidate.__recommendationStableId, right.candidate.__recommendationStableId))
    .slice(0, MAX_RECOMMENDATIONS)
    .map(({ candidate, explanation }) => ({
      productId: candidate._id,
      score: explanation.score,
      sharedTags: explanation.sharedTags,
      sharedAttributes: explanation.sharedAttributes,
      categoryMatch: explanation.categoryMatch,
      categoryBonus: explanation.categoryBonus,
      sharedFeatureCount: explanation.sharedFeatureCount,
      unionFeatureCount: explanation.unionFeatureCount
    }));
}

async function recomputeRecommendations({
  ProductModel = Product,
  RecommendationModel = Recommendation,
  now = () => new Date(),
  batchSize = WRITE_BATCH_SIZE
} = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new TypeError('Recommendation batch size must be a positive integer.');

  // Keep a compact feature catalogue in memory so overlapping tags/attributes
  // and same-category peers can be scored without issuing a query per product.
  const products = await ProductModel.find({}).select('_id category tags attributes').lean();
  products.sort((left, right) => compareStrings(stableId(left), stableId(right)));
  const indexes = buildCandidateIndexes(products);
  const computedAt = now();
  const operations = products.map((source) => ({
    updateOne: {
      filter: { productId: source._id },
      update: { $set: { relatedProducts: rankRecommendations(source, products, indexes), computedAt } },
      upsert: true
    }
  }));

  try {
    for (let offset = 0; offset < operations.length; offset += batchSize) {
      await RecommendationModel.bulkWrite(operations.slice(offset, offset + batchSize), { ordered: true });
    }
    const activeIds = products.map((product) => product._id);
    const stale = await RecommendationModel.deleteMany({ productId: { $nin: activeIds } });
    return {
      status: 'success',
      productsProcessed: products.length,
      recommendationsStored: operations.reduce((sum, operation) => sum
        + operation.updateOne.update.$set.relatedProducts.length, 0),
      staleCacheDocumentsRemoved: stale.deletedCount || 0,
      computedAt
    };
  } catch (error) {
    // A partially completed bulk refresh must not look like a coherent new
    // generation. Clear this derived cache so the API uses its labelled fallback.
    try { await RecommendationModel.deleteMany({}); }
    catch { /* Keep the original failure; a later read also checks cache age and references. */ }
    throw error;
  }
}

module.exports = {
  recomputeRecommendations,
  rankRecommendations,
  buildCandidateIndexes,
  MAX_RECOMMENDATIONS,
  MIN_RELEVANCE_SCORE,
  WRITE_BATCH_SIZE
};
