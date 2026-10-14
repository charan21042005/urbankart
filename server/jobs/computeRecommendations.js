const Product = require('../models/Product');
const Recommendation = require('../models/Recommendation');
const { extractFeatures, normalizeText, similarityScoreFromCounts, similarityScoreFromFeatures, stableId } = require('./similarityScorer');

const MAX_RECOMMENDATIONS = 5;
const MIN_RELEVANCE_SCORE = 0.2;
const WRITE_BATCH_SIZE = 250;

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function buildCandidateIndexes(products) {
  const byCategory = new Map();
  const byFeature = new Map();
  const byId = new Map();
  const featuresById = new Map();
  const categoryById = new Map();
  for (const product of products) {
    const id = stableId(product);
    const features = extractFeatures(product);
    const category = normalizeText(product.category);
    byId.set(id, product);
    featuresById.set(id, features);
    categoryById.set(id, category);
    if (category) {
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push(product);
    }
    for (const key of features.keys()) {
      if (!byFeature.has(key)) byFeature.set(key, []);
      byFeature.get(key).push(product);
    }
    product.__recommendationStableId = id;
  }
  return { byCategory, byFeature, byId, featuresById, categoryById };
}

function insertTopRecommendation(best, ranked) {
  const position = best.findIndex((current) => ranked.score > current.score
    || (ranked.score === current.score
      && compareStrings(ranked.candidateId, current.candidateId) < 0));
  if (position === -1) {
    if (best.length < MAX_RECOMMENDATIONS) best.push(ranked);
  } else {
    best.splice(position, 0, ranked);
    if (best.length > MAX_RECOMMENDATIONS) best.pop();
  }
}

function rankRecommendations(source, _products, indexes) {
  const sourceId = source.__recommendationStableId || stableId(source);
  const category = indexes.categoryById.get(sourceId) ?? normalizeText(source.category);
  const categoryCandidates = category ? indexes.byCategory.get(category) || [] : [];
  const sourceFeatures = indexes.featuresById.get(sourceId) || new Map();
  const featureCandidateSharedCounts = new Map();
  for (const key of sourceFeatures.keys()) {
    for (const product of indexes.byFeature.get(key) || []) {
      const candidateId = product.__recommendationStableId;
      if (candidateId !== sourceId) {
        featureCandidateSharedCounts.set(candidateId, (featureCandidateSharedCounts.get(candidateId) || 0) + 1);
      }
    }
  }

  // A shared feature is the only way for the Jaccard component to be positive.
  // Same-category candidates without shared features all score exactly 0.2,
  // so consider them only as deterministic fillers after scoring feature hits.
  const best = [];
  for (const [candidateId, sharedFeatureCount] of featureCandidateSharedCounts) {
    const candidate = indexes.byId.get(candidateId);
    if (!candidate) continue;
    const candidateFeatures = indexes.featuresById.get(candidateId) || new Map();
    const categoryMatch = Boolean(category && indexes.categoryById.get(candidateId) === category);
    const computed = similarityScoreFromCounts(
      sourceFeatures.size,
      candidateFeatures.size,
      sharedFeatureCount,
      categoryMatch
    );
    if (computed.score < MIN_RELEVANCE_SCORE) continue;
    insertTopRecommendation(best, {
      candidate, candidateId, score: computed.score, categoryMatch, sharedFeatureCount,
      unionFeatureCount: computed.unionFeatureCount
    });
  }

  for (const candidate of categoryCandidates) {
    if (best.length === MAX_RECOMMENDATIONS) break;
    const candidateId = candidate.__recommendationStableId;
    if (candidateId === sourceId || featureCandidateSharedCounts.has(candidateId)) continue;
    const candidateFeatureCount = indexes.featuresById.get(candidateId)?.size || 0;
    insertTopRecommendation(best, {
      candidate, candidateId, score: 0.2, categoryMatch: true, sharedFeatureCount: 0,
      unionFeatureCount: sourceFeatures.size + candidateFeatureCount
    });
  }

  return best.map(({ candidate, candidateId, score }) => {
    const explanation = similarityScoreFromFeatures(
      source,
      candidate,
      sourceFeatures,
      indexes.featuresById.get(candidateId),
      indexes.categoryById.get(sourceId),
      indexes.categoryById.get(candidateId)
    );
    return {
      productId: candidate._id,
      score,
      sharedTags: explanation.sharedTags,
      sharedAttributes: explanation.sharedAttributes,
      categoryMatch: explanation.categoryMatch,
      categoryBonus: explanation.categoryBonus,
      sharedFeatureCount: explanation.sharedFeatureCount,
      unionFeatureCount: explanation.unionFeatureCount
    };
  });
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
