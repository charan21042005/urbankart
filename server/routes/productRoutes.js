const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const MAX_PAGE_SIZE = 100;
const MAX_BSON_INT32 = 2_147_483_647;
const PRODUCT_FIELDS = new Set(['name', 'description', 'price', 'stock', 'category', 'attributes']);

function parsePositiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  if (Array.isArray(value) || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

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
  return null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
  if ((category !== undefined && (typeof category !== 'string' || category.length > 120))
    || (search !== undefined && (typeof search !== 'string' || search.length > 100))) {
    return res.status(400).json({ status: 'error', message: 'Category or search query is invalid.' });
  }

  const filter = {};
  if (category) filter.category = category.trim();
  if (search?.trim()) {
    const expression = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [{ name: expression }, { description: expression }];
  }

  try {
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit),
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

router.post('/', authenticate, requireAdmin, async (req, res) => {
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

router.patch('/:id', authenticate, requireAdmin, async (req, res) => {
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

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ status: 'error', message: 'Product ID is invalid.' });
  }
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ status: 'error', message: 'Product not found.' });
    return res.status(200).json({ status: 'success', message: 'Product deleted.' });
  } catch {
    return res.status(500).json({ status: 'error', message: 'Failed to delete product.' });
  }
});

module.exports = router;
