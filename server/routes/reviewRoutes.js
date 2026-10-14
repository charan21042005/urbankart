const express = require('express');
const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');
const { authenticate, loadCurrentUser } = require('../middleware/auth');

const router = express.Router();
const REVIEW_FIELDS = new Set(['productId', 'rating', 'text']);
const UPDATE_FIELDS = new Set(['rating', 'text']);
const MAX_PAGE_SIZE = 100;

function validText(value) {
  return typeof value === 'string' && value.length <= 4000;
}

function validateReviewPayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'A review object is required.';
  const allowed = partial ? UPDATE_FIELDS : REVIEW_FIELDS;
  const keys = Object.keys(body);
  if (keys.some((key) => !allowed.has(key))) return 'Review contains unsupported fields.';
  if (partial && keys.length === 0) return 'At least one review field is required.';
  if (!partial && !Object.hasOwn(body, 'productId')) return 'Product ID is required.';
  if (!partial && !Object.hasOwn(body, 'rating')) return 'Rating is required.';
  if (Object.hasOwn(body, 'productId') && (typeof body.productId !== 'string' || !mongoose.isValidObjectId(body.productId))) {
    return 'Product ID is invalid.';
  }
  if (Object.hasOwn(body, 'rating') && (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)) {
    return 'Rating must be an integer from 1 to 5.';
  }
  if (Object.hasOwn(body, 'text') && !validText(body.text)) {
    return 'Review text must be a string of at most 4000 characters.';
  }
  return null;
}

function positiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  if (Array.isArray(value) || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function refreshProductRating(productId, session) {
  const [summary] = await Review.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: null, ratingAvg: { $avg: '$rating' }, ratingCount: { $sum: 1 } } }
  ]).session(session);
  await Product.updateOne(
    { _id: productId },
    { $set: { ratingAvg: summary?.ratingAvg ?? 0, ratingCount: summary?.ratingCount ?? 0 } },
    { session, runValidators: true }
  );
}

router.get('/product/:productId', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.productId)) {
    return res.status(400).json({ status: 'error', message: 'Product ID is invalid.' });
  }
  const page = positiveInteger(req.query.page, 1);
  const requestedLimit = positiveInteger(req.query.limit, 20);
  if (page === null || requestedLimit === null || page > Math.floor(Number.MAX_SAFE_INTEGER / Math.min(requestedLimit, MAX_PAGE_SIZE))) {
    return res.status(400).json({ status: 'error', message: 'Page and limit must be positive integers.' });
  }
  const limit = Math.min(requestedLimit, MAX_PAGE_SIZE);
  try {
    const filter = { productId: req.params.productId };
    const [reviews, total] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Review.countDocuments(filter)
    ]);
    res.set({ 'X-Total-Count': String(total), 'X-Page': String(page), 'X-Page-Size': String(limit) });
    return res.status(200).json({ status: 'success', reviews });
  } catch {
    return res.status(500).json({ status: 'error', message: 'Reviews could not be listed.' });
  }
});

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ status: 'error', message: 'Review ID is invalid.' });
  }
  try {
    const review = await Review.findById(req.params.id).lean();
    if (!review) return res.status(404).json({ status: 'error', message: 'Review not found.' });
    return res.status(200).json({ status: 'success', review });
  } catch {
    return res.status(500).json({ status: 'error', message: 'Review could not be retrieved.' });
  }
});

router.post('/', authenticate, loadCurrentUser, async (req, res) => {
  const message = validateReviewPayload(req.body);
  if (message) return res.status(400).json({ status: 'error', message });
  try {
    if (!await Product.exists({ _id: req.body.productId })) {
      return res.status(404).json({ status: 'error', message: 'Product not found.' });
    }
    const session = await mongoose.startSession();
    let created;
    try {
      await session.withTransaction(async () => {
        [created] = await Review.create([{
          productId: req.body.productId,
          userId: req.currentUser._id,
          rating: req.body.rating,
          ...(Object.hasOwn(req.body, 'text') ? { text: req.body.text.trim() } : {})
        }], { session });
        await refreshProductRating(req.body.productId, session);
      });
    } finally {
      await session.endSession();
    }
    return res.status(201).json({ status: 'success', review: created });
  } catch (error) {
    if (error?.name === 'ValidationError' || error?.name === 'CastError') {
      return res.status(400).json({ status: 'error', message: 'Review data is invalid.' });
    }
    return res.status(500).json({ status: 'error', message: 'Review could not be created.' });
  }
});

router.patch('/:id', authenticate, loadCurrentUser, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ status: 'error', message: 'Review ID is invalid.' });
  }
  const message = validateReviewPayload(req.body, { partial: true });
  if (message) return res.status(400).json({ status: 'error', message });
  try {
    const existing = await Review.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ status: 'error', message: 'Review not found.' });
    if (String(existing.userId) !== String(req.currentUser._id)) {
      return res.status(403).json({ status: 'error', message: 'Only the review author can update it.' });
    }
    const session = await mongoose.startSession();
    let updated;
    try {
      await session.withTransaction(async () => {
        const review = await Review.findOne({ _id: req.params.id, userId: req.currentUser._id }).session(session);
        if (!review) throw Object.assign(new Error('Review not found.'), { statusCode: 404 });
        if (Object.hasOwn(req.body, 'rating')) review.rating = req.body.rating;
        if (Object.hasOwn(req.body, 'text')) review.text = req.body.text.trim();
        await review.save({ session });
        updated = review;
        await refreshProductRating(review.productId, session);
      });
    } finally {
      await session.endSession();
    }
    return res.status(200).json({ status: 'success', review: updated });
  } catch (error) {
    if (error?.statusCode === 404) return res.status(404).json({ status: 'error', message: 'Review not found.' });
    if (error?.name === 'ValidationError' || error?.name === 'CastError') {
      return res.status(400).json({ status: 'error', message: 'Review data is invalid.' });
    }
    return res.status(500).json({ status: 'error', message: 'Review could not be updated.' });
  }
});

router.delete('/:id', authenticate, loadCurrentUser, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ status: 'error', message: 'Review ID is invalid.' });
  }
  try {
    const existing = await Review.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ status: 'error', message: 'Review not found.' });
    if (String(existing.userId) !== String(req.currentUser._id)) {
      return res.status(403).json({ status: 'error', message: 'Only the review author can delete it.' });
    }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const deleted = await Review.findOneAndDelete({ _id: req.params.id, userId: req.currentUser._id }, { session });
        if (!deleted) throw Object.assign(new Error('Review not found.'), { statusCode: 404 });
        await refreshProductRating(existing.productId, session);
      });
    } finally {
      await session.endSession();
    }
    return res.status(200).json({ status: 'success', message: 'Review deleted.' });
  } catch (error) {
    if (error?.statusCode === 404) return res.status(404).json({ status: 'error', message: 'Review not found.' });
    return res.status(500).json({ status: 'error', message: 'Review could not be deleted.' });
  }
});

module.exports = router;
module.exports.validateReviewPayload = validateReviewPayload;
