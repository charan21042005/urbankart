// Product endpoints serve catalog browsing, recommendations, and admin product changes.
const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Recommendation = require('../models/Recommendation');
const Cart = require('../models/Cart');
const Review = require('../models/Review');
const { authenticate, loadCurrentUser, requireAdmin } = require('../middleware/auth');

const router = express.Router();
// Bound catalog pages so a client cannot request an unbounded result set.
const MAX_PAGE_SIZE = 100;
// Match the maximum positive integer stock value supported by BSON.
const MAX_BSON_INT32 = 2_147_483_647;
// Allow-list fields accepted from administrator product create and update requests.
const PRODUCT_FIELDS = new Set(['name', 'description', 'price', 'stock', 'category', 'attributes', 'tags']);
// Ignore recommendation records older than this cache freshness window.
const MAX_RECOMMENDATION_CACHE_AGE_MS = 36 * 60 * 60 * 1000;

// Sanitize optional explanation fields before sending cached recommendation data.
function normalizeCachedExplanation(item) {
  return {
    sharedTags: Array.isArray(item.sharedTags) ? item.sharedTags.filter((tag) => typeof tag === 'string') : [],
    sharedAttributes: Array.isArray(item.sharedAttributes)
      ? item.sharedAttributes.filter((attribute) => typeof attribute?.key === 'string' && typeof attribute?.value === 'string')
      : [],
    categoryMatch: item.categoryMatch === true,
    categoryBonus: Number.isFinite(item.categoryBonus) ? item.categoryBonus : 0,
    sharedFeatureCount: Number.isInteger(item.sharedFeatureCount) ? item.sharedFeatureCount : 0,
    unionFeatureCount: Number.isInteger(item.unionFeatureCount) ? item.unionFeatureCount : 0
  };
}

// Prefer fresh precomputed recommendations, then fall back to rated same-category products.
async function readCachedRecommendations(source, { ProductModel = Product, RecommendationModel = Recommendation, now = Date.now() } = {}) {
  const cache = await RecommendationModel.findOne({ productId: source._id }).lean();
  const computedAt = cache?.computedAt ? new Date(cache.computedAt) : null;
  // Validate cache time and entries before allowing cached data into the response.
  const cacheIsFresh = computedAt && Number.isFinite(computedAt.getTime())
    && now - computedAt.getTime() <= MAX_RECOMMENDATION_CACHE_AGE_MS;
  const sourceId = String(source._id);
  const cachedItems = Array.isArray(cache?.relatedProducts) ? cache.relatedProducts.filter((item) => {
    const productId = item?.productId == null ? '' : String(item.productId);
    return productId && productId !== sourceId && mongoose.isValidObjectId(productId)
      && Number.isFinite(item.score) && item.score >= 0 && item.score <= 1;
  }) : [];

  // Load existing products in one query and discard duplicate, missing, or self references.
  if (cacheIsFresh && cachedItems.length) {
    const uniqueItems = [...new Map(cachedItems.map((item) => [String(item.productId), item])).values()];
    const products = await ProductModel.find({ _id: { $in: uniqueItems.map((item) => item.productId) } }).lean();
    const productsById = new Map(products.map((product) => [String(product._id), product]));
    const items = uniqueItems.flatMap((item) => {
      const product = productsById.get(String(item.productId));
      if (!product || String(product._id) === sourceId) return [];
      return [{ product, score: item.score, explanation: normalizeCachedExplanation(item) }];
    });
    if (items.length) return { source: 'recommendation-engine', computedAt, items };
  }

  // New products may not have reached the nightly batch yet. If the cache is
  // absent, stale, empty, or points only to deleted products, return same-
  // category products by current rating so recommendations never block detail.
  if (typeof source.category !== 'string' || !source.category.trim()) {
    return { source: 'fallback', computedAt: null, items: [] };
  }
  const fallbackProducts = await ProductModel.find({
    category: source.category,
    _id: { $ne: source._id }
  }).sort({ ratingAvg: -1, ratingCount: -1, _id: 1 }).limit(5).lean();
  return {
    source: 'fallback',
    computedAt: null,
    items: fallbackProducts.map((product) => ({
      product,
      score: null,
      explanation: {
        type: 'same-category-rating-fallback',
        categoryMatch: true,
        categoryName: source.category,
        sharedTags: [],
        sharedAttributes: []
      }
    }))
  };
}

// Parse a positive integer query value or return null when it is malformed.
function parsePositiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  if (Array.isArray(value) || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

// Validate product fields and reject values that the API does not support.
function validateProductPayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'A product object is required.';
  const keys = Object.keys(body);
  if (keys.some((key) => !PRODUCT_FIELDS.has(key))) return 'Product contains unsupported fields.';
  if (partial && keys.length === 0) return 'At least one product field is required.';
  if (!partial && (!Object.hasOwn(body, 'name') || !Object.hasOwn(body, 'price') || !Object.hasOwn(body, 'category'))) {
    return 'Name, price, and category are required.';
  }

  for (const field of ['name', 'description', 'category']) {
    if (Object.hasOwn(body, field) && typeof body[field] !== 'string') {
      return `${field} must be a string.`;
    }
  }
  if ((body.name?.length ?? 0) > 300 || (body.category?.length ?? 0) > 120 || (body.description?.length ?? 0) > 20000) {
    return 'A product text field exceeds its allowed length.';
  }
  if (Object.hasOwn(body, 'price') && (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0)) {
    return 'Price must be a non-negative number.';
  }
  if (Object.hasOwn(body, 'stock') && (!Number.isInteger(body.stock) || body.stock < 0 || body.stock > MAX_BSON_INT32)) {
    return 'Stock must be a non-negative integer.';
  }
  if (Object.hasOwn(body, 'attributes')) {
    if (!Array.isArray(body.attributes)) return 'Attributes must be an array of key/value pairs.';
    for (const attribute of body.attributes) {
      if (!attribute || typeof attribute !== 'object' || Array.isArray(attribute)
        || Object.keys(attribute).some((key) => !['key', 'value'].includes(key))
        || typeof attribute.key !== 'string' || typeof attribute.value !== 'string') {
        return 'Each attribute must contain only string key and value fields.';
      }
    }
  }
  if (Object.hasOwn(body, 'tags') && (!Array.isArray(body.tags) || body.tags.length > 50
    || body.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 120))) {
    return 'Tags must be an array of at most 50 non-empty strings.';
  }
  return null;
}

// Browse products with supported filters and bounded pagination.
router.get('/', async (req, res) => {
  const page = parsePositiveInteger(req.query.page, 1);
  const requestedLimit = parsePositiveInteger(req.query.limit, 20);
  if (page === null || requestedLimit === null) {
    return res.status(400).json({ status: 'error', message: 'Page and limit must be positive integers.' });
  }
  const limit = Math.min(requestedLimit, MAX_PAGE_SIZE);
  if (page > Math.floor(Number.MAX_SAFE_INTEGER / limit)) {
    return res.status(400).json({ status: 'error', message: 'Page is too large.' });
  }
  const category = req.query.category;
  const search = req.query.search;
  const requestedSort = req.query.sort === undefined ? 'available' : req.query.sort;
  const sortModes = {
    available: { stock: -1, _id: 1 },
    newest: { createdAt: -1, _id: 1 },
    'price-asc': { price: 1, _id: 1 },
    'price-desc': { price: -1, _id: 1 },
    'name-asc': { name: 1, _id: 1 }
  };
  if ((category !== undefined && (typeof category !== 'string' || category.length > 120))
    || (search !== undefined && (typeof search !== 'string' || search.length > 100))
    || typeof requestedSort !== 'string' || !Object.hasOwn(sortModes, requestedSort)) {
    return res.status(400).json({ status: 'error', message: 'Category, search query, or sort option is invalid.' });
  }

  const filter = {};
  if (category) filter.category = category.trim();
  if (search?.trim()) {
    filter.$text = { $search: search.trim() };
  }
  const hasSearch = Boolean(search?.trim());
  const selectedSort = sortModes[requestedSort];
  const searchSort = hasSearch && requestedSort !== 'available' && req.query.sort !== undefined
    ? {
      ...Object.fromEntries(Object.entries(selectedSort).filter(([field]) => field !== '_id')),
      score: { $meta: 'textScore' },
      _id: 1
    }
    : hasSearch
      ? { score: { $meta: 'textScore' }, createdAt: -1, _id: 1 }
      : selectedSort;

  try {
    const [products, total] = await Promise.all([
      Product.find(filter).sort(searchSort).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter)
    ]);
    res.set({
      'X-Total-Count': String(total),
      'X-Page': String(page),
      'X-Page-Size': String(limit),
      'X-Total-Pages': String(Math.ceil(total / limit))
    });
    return res.status(200).json(products);
  } catch {
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve products.' });
  }
});

// Return the distinct categories currently present in the product collection.
router.get('/categories', async (req, res) => {
  try {
    const categories = await Product.distinct('category');
    const uniqueCategories = [...new Set(categories.filter((category) => typeof category === 'string' && category.trim()))];
    return res.status(200).json(uniqueCategories.sort((left, right) => left.localeCompare(right)));
  } catch {
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve product categories.' });
  }
});

// Return cached or fallback recommendations for one existing product.
router.get('/:id/recommendations', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ status: 'error', message: 'Product ID is invalid.' });
  }
  try {
    const source = await Product.findById(req.params.id).lean();
    if (!source) return res.status(404).json({ status: 'error', message: 'Product not found.' });
    const result = await readCachedRecommendations(source);
    return res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    console.error(`Product recommendation lookup failed (${error?.name || 'Error'}).`);
    return res.status(500).json({ status: 'error', message: 'Could not retrieve product recommendations.' });
  }
});

// Read one product by ID and include its rating and recommendation details as needed.
router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ status: 'error', message: 'Product ID is invalid.' });
  }
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ status: 'error', message: 'Product not found.' });
    return res.status(200).json(product);
  } catch {
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve product.' });
  }
});

// Create a product; authentication middleware restricts this operation to admins.
router.post('/', authenticate, loadCurrentUser, requireAdmin, async (req, res) => {
  const validationMessage = validateProductPayload(req.body);
  if (validationMessage) return res.status(400).json({ status: 'error', message: validationMessage });
  try {
    const product = await Product.create(req.body);
    return res.status(201).json(product);
  } catch (error) {
    if (error?.name === 'ValidationError' || error?.name === 'CastError') {
      return res.status(400).json({ status: 'error', message: 'Product data is invalid.' });
    }
    return res.status(500).json({ status: 'error', message: 'Failed to create product.' });
  }
});

// Apply an allow-listed partial update to an existing product.
router.patch('/:id', authenticate, loadCurrentUser, requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ status: 'error', message: 'Product ID is invalid.' });
  }
  const validationMessage = validateProductPayload(req.body, { partial: true });
  if (validationMessage) return res.status(400).json({ status: 'error', message: validationMessage });
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ status: 'error', message: 'Product not found.' });
    Object.assign(product, req.body);
    await product.save();
    return res.status(200).json(product);
  } catch (error) {
    if (error?.name === 'ValidationError' || error?.name === 'CastError') {
      return res.status(400).json({ status: 'error', message: 'Product data is invalid.' });
    }
    return res.status(500).json({ status: 'error', message: 'Failed to update product.' });
  }
});

// Delete a product only when it is not referenced by an active cart or review.
router.delete('/:id', authenticate, loadCurrentUser, requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ status: 'error', message: 'Product ID is invalid.' });
  }
  try {
    const [cartReference, reviewReference] = await Promise.all([
      Cart.exists({ 'items.productId': req.params.id }),
      Review.exists({ productId: req.params.id })
    ]);
    if (cartReference || reviewReference) {
      return res.status(409).json({ status: 'error', message: 'Product is referenced by a current cart or review and cannot be deleted.' });
    }
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ status: 'error', message: 'Product not found.' });
    return res.status(200).json({ status: 'success', message: 'Product deleted.' });
  } catch {
    return res.status(500).json({ status: 'error', message: 'Failed to delete product.' });
  }
});

// Export the router and helper metadata used by the application and unit tests.
module.exports = router;
module.exports.readCachedRecommendations = readCachedRecommendations;
module.exports.MAX_RECOMMENDATION_CACHE_AGE_MS = MAX_RECOMMENDATION_CACHE_AGE_MS;
