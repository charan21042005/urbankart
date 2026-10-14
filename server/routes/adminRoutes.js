const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Review = require('../models/Review');
const { authenticate, loadCurrentUser, requireAdmin } = require('../middleware/auth');
const { buildDashboardPipeline } = require('../analytics/buildDashboardPipeline');

const router = express.Router();
router.use(authenticate, loadCurrentUser, requireAdmin);

function paging(query) {
  const page = /^\d+$/.test(query.page || '1') ? Number(query.page || 1) : NaN;
  const limit = /^\d+$/.test(query.limit || '20') ? Number(query.limit || 20) : NaN;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return null;
  return { page, limit, skip: (page - 1) * limit };
}

function searchPattern(value) {
  return typeof value === 'string' && value.trim() ? new RegExp(value.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
}

router.get('/overview', async (req, res) => {
  try {
    const [productCount, categoryCounts, userCount, orderCount, reviewStats, cartStats, orderSummary] = await Promise.all([
      Product.countDocuments({}),
      Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 20 }]),
      User.countDocuments({ isActive: { $ne: false } }),
      Order.countDocuments({}),
      Review.aggregate([{ $group: { _id: null, count: { $sum: 1 }, averageRating: { $avg: '$rating' } } }]),
      Cart.aggregate([{ $project: { itemCount: { $size: { $ifNull: ['$items', []] } } } }, { $match: { itemCount: { $gt: 0 } } }, { $group: { _id: null, activeCarts: { $sum: 1 }, itemCount: { $sum: '$itemCount' } } }]),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { _id: 1 } }])
    ]);
    return res.json({ status: 'success', generatedAt: new Date().toISOString(), metrics: {
      productCount, categoryCounts: categoryCounts.map(({ _id, count }) => ({ category: _id, count })),
      activeUserCount: userCount, orderCount,
      reviewCount: reviewStats[0]?.count || 0, averageReviewRating: reviewStats[0]?.averageRating ?? null,
      activeCartCount: cartStats[0]?.activeCarts || 0, cartItemCount: cartStats[0]?.itemCount || 0,
      orderStatusBreakdown: orderSummary.map(({ _id, count }) => ({ status: _id, count }))
    } });
  } catch {
    return res.status(500).json({ status: 'error', message: 'Could not load store overview.' });
  }
});

router.get('/users', async (req, res) => {
  const pagingValues = paging(req.query);
  if (!pagingValues) return res.status(400).json({ status: 'error', message: 'Page or limit is invalid.' });
  const search = searchPattern(req.query.search);
  const filter = { isActive: { $ne: false }, ...(search ? { $or: [{ name: search }, { email: search }] } : {}) };
  try {
    const [users, total] = await Promise.all([
      User.find(filter).select('name email role isActive createdAt').sort({ createdAt: -1, _id: 1 }).skip(pagingValues.skip).limit(pagingValues.limit).lean(),
      User.countDocuments(filter)
    ]);
    return res.json({ users, page: pagingValues.page, limit: pagingValues.limit, total, totalPages: Math.ceil(total / pagingValues.limit) });
  } catch { return res.status(500).json({ status: 'error', message: 'Could not list users.' }); }
});

router.get('/users/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'User ID is invalid.' });
  try {
    const user = await User.findById(req.params.id).select('name email role isActive createdAt updatedAt').lean();
    return user ? res.json({ user }) : res.status(404).json({ status: 'error', message: 'User not found.' });
  } catch { return res.status(500).json({ status: 'error', message: 'Could not read user.' }); }
});

router.get('/users/:id/cart', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'User ID is invalid.' });
  try {
    const [user, cart] = await Promise.all([
      User.findById(req.params.id).select('name email role isActive createdAt').lean(),
      Cart.findOne({ userId: req.params.id }).populate('items.productId', 'name price category stock').lean()
    ]);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });
    const items = (cart?.items || []).map((item) => ({ product: item.productId || null, quantity: item.quantity,
      currentLineTotal: item.productId ? item.productId.price * item.quantity : null }));
    return res.json({ user, cart: { items, currentTotal: items.reduce((sum, item) => sum + (item.currentLineTotal || 0), 0) } });
  } catch { return res.status(500).json({ status: 'error', message: 'Could not read the user cart.' }); }
});

router.get('/orders', async (req, res) => {
  const pagingValues = paging(req.query);
  if (!pagingValues) return res.status(400).json({ status: 'error', message: 'Page or limit is invalid.' });
  try {
    const [orders, total] = await Promise.all([
      Order.find({}).populate('customerId', 'name email').sort({ orderDate: -1, _id: 1 }).skip(pagingValues.skip).limit(pagingValues.limit).lean(),
      Order.countDocuments({})
    ]);
    return res.json({ orders, page: pagingValues.page, limit: pagingValues.limit, total, totalPages: Math.ceil(total / pagingValues.limit) });
  } catch { return res.status(500).json({ status: 'error', message: 'Could not list orders.' }); }
});

router.get('/orders/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'Order ID is invalid.' });
  try {
    const order = await Order.findById(req.params.id).populate('customerId', 'name email').lean();
    return order ? res.json({ order }) : res.status(404).json({ status: 'error', message: 'Order not found.' });
  } catch { return res.status(500).json({ status: 'error', message: 'Could not read order.' }); }
});

router.get('/reviews', async (req, res) => {
  const pagingValues = paging(req.query);
  if (!pagingValues) return res.status(400).json({ status: 'error', message: 'Page or limit is invalid.' });
  try {
    const [reviews, total] = await Promise.all([
      Review.find({}).populate('productId', 'name category').populate('userId', 'name email').sort({ createdAt: -1, _id: 1 }).skip(pagingValues.skip).limit(pagingValues.limit).lean(),
      Review.countDocuments({})
    ]);
    return res.json({ reviews, page: pagingValues.page, limit: pagingValues.limit, total, totalPages: Math.ceil(total / pagingValues.limit) });
  } catch { return res.status(500).json({ status: 'error', message: 'Could not list reviews.' }); }
});

router.get('/dashboard', async (req, res) => {
  try {
    const [result = {}] = await Order.aggregate(buildDashboardPipeline());
    const revenueByCategory = Array.isArray(result.revenueByCategory) ? result.revenueByCategory : [];
    const topProducts = Array.isArray(result.topProducts) ? result.topProducts : [];
    const orderStatusBreakdown = Array.isArray(result.orderStatusBreakdown) ? result.orderStatusBreakdown : [];
    return res.status(200).json({
      status: 'success',
      generatedAt: new Date().toISOString(),
      revenueByCategory,
      topProducts,
      orderStatusBreakdown,
      hasOrders: orderStatusBreakdown.some((entry) => entry.count > 0)
    });
  } catch (error) {
    console.error(`Admin dashboard aggregation failed (${error?.name || 'Error'}).`);
    return res.status(500).json({ status: 'error', message: 'Could not load dashboard analytics.' });
  }
});

module.exports = router;
