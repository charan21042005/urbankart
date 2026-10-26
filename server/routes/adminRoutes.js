// Express handles the HTTP requests exposed by this administrator router.
const express = require('express');
// Mongoose validates document IDs before they reach database queries.
const mongoose = require('mongoose');
// These models provide the records and metrics shown in the admin workspace.
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Review = require('../models/Review');
// Every route requires a signed-in user whose current role is administrator.
const { authenticate, loadCurrentUser, requireAdmin } = require('../middleware/auth');
// The dashboard's aggregation stages live separately for easier maintenance.
const { buildDashboardPipeline } = require('../analytics/buildDashboardPipeline');

// Create a router so the application can mount these endpoints under /api/admin.
const router = express.Router();
// Apply authentication, fresh user loading, and admin authorization to all routes.
router.use(authenticate, loadCurrentUser, requireAdmin);

// Parse and validate pagination query values, returning null for unsafe requests.
function paging(query) {
  // Accept only decimal digits; malformed values become NaN and fail validation.
  const page = /^\d+$/.test(query.page || '1') ? Number(query.page || 1) : NaN;
  const limit = /^\d+$/.test(query.limit || '20') ? Number(query.limit || 20) : NaN;
  // Bound page size to prevent a request from loading an unbounded result set.
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return null;
  // Calculate the number of records MongoDB should skip for this page.
  return { page, limit, skip: (page - 1) * limit };
}

// Escape user input so searches treat it as literal text instead of regex syntax.
function searchPattern(value) {
  // Ignore blank/non-string terms and cap length before building a case-insensitive regex.
  return typeof value === 'string' && value.trim() ? new RegExp(value.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
}

// Return high-level store counts and grouped summaries for the admin overview.
router.get('/overview', async (req, res) => {
  try {
    // Independent count and aggregation queries run concurrently to reduce latency.
    const [productCount, categoryCounts, userCount, orderCount, reviewStats, cartStats, orderSummary] = await Promise.all([
      Product.countDocuments({}),
      Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 20 }]),
      User.countDocuments({ isActive: { $ne: false } }),
      Order.countDocuments({}),
      Review.aggregate([{ $group: { _id: null, count: { $sum: 1 }, averageRating: { $avg: '$rating' } } }]),
      Cart.aggregate([{ $project: { itemCount: { $size: { $ifNull: ['$items', []] } } } }, { $match: { itemCount: { $gt: 0 } } }, { $group: { _id: null, activeCarts: { $sum: 1 }, itemCount: { $sum: '$itemCount' } } }]),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { _id: 1 } }])
    ]);
    // Normalize MongoDB aggregation output into a stable response shape.
    return res.json({ status: 'success', generatedAt: new Date().toISOString(), metrics: {
      productCount, categoryCounts: categoryCounts.map(({ _id, count }) => ({ category: _id, count })),
      activeUserCount: userCount, orderCount,
      reviewCount: reviewStats[0]?.count || 0, averageReviewRating: reviewStats[0]?.averageRating ?? null,
      activeCartCount: cartStats[0]?.activeCarts || 0, cartItemCount: cartStats[0]?.itemCount || 0,
      orderStatusBreakdown: orderSummary.map(({ _id, count }) => ({ status: _id, count }))
    } });
  } catch {
    // Keep database details private and return a consistent API error.
    return res.status(500).json({ status: 'error', message: 'Could not load store overview.' });
  }
});

// List active users with optional name/email search and bounded pagination.
router.get('/users', async (req, res) => {
  // Reject invalid page or limit values before querying the database.
  const pagingValues = paging(req.query);
  if (!pagingValues) return res.status(400).json({ status: 'error', message: 'Page or limit is invalid.' });
  // Search only the supported public identity fields.
  const search = searchPattern(req.query.search);
  const filter = { isActive: { $ne: false }, ...(search ? { $or: [{ name: search }, { email: search }] } : {}) };
  try {
    // Return safe user fields and the matching total in parallel.
    const [users, total] = await Promise.all([
      User.find(filter).select('name email role isActive createdAt').sort({ createdAt: -1, _id: 1 }).skip(pagingValues.skip).limit(pagingValues.limit).lean(),
      User.countDocuments(filter)
    ]);
    // Include page metadata so the client can render navigation controls.
    return res.json({ users, page: pagingValues.page, limit: pagingValues.limit, total, totalPages: Math.ceil(total / pagingValues.limit) });
  } catch { return res.status(500).json({ status: 'error', message: 'Could not list users.' }); }
});

// Read one user by ID while excluding credentials and other private fields.
router.get('/users/:id', async (req, res) => {
  // Avoid sending invalid identifiers to Mongoose.
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'User ID is invalid.' });
  try {
    const user = await User.findById(req.params.id).select('name email role isActive createdAt updatedAt').lean();
    return user ? res.json({ user }) : res.status(404).json({ status: 'error', message: 'User not found.' });
  } catch { return res.status(500).json({ status: 'error', message: 'Could not read user.' }); }
});

// Inspect a user's cart and calculate totals using current product prices.
router.get('/users/:id/cart', async (req, res) => {
  // Validate the user ID before looking up either the user or their cart.
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'User ID is invalid.' });
  try {
    // Fetch user details and populate only the product fields needed for review.
    const [user, cart] = await Promise.all([
      User.findById(req.params.id).select('name email role isActive createdAt').lean(),
      Cart.findOne({ userId: req.params.id }).populate('items.productId', 'name price category stock').lean()
    ]);
    // Return 404 when the requested customer does not exist.
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });
    // Preserve removed products as null and compute each line from its current price.
    const items = (cart?.items || []).map((item) => ({ product: item.productId || null, quantity: item.quantity,
      currentLineTotal: item.productId ? item.productId.price * item.quantity : null }));
    // Sum valid line totals and return the customer alongside their cart.
    return res.json({ user, cart: { items, currentTotal: items.reduce((sum, item) => sum + (item.currentLineTotal || 0), 0) } });
  } catch { return res.status(500).json({ status: 'error', message: 'Could not read the user cart.' }); }
});

// List orders with customer summaries and standard pagination metadata.
router.get('/orders', async (req, res) => {
  // Validate pagination before reading order documents.
  const pagingValues = paging(req.query);
  if (!pagingValues) return res.status(400).json({ status: 'error', message: 'Page or limit is invalid.' });
  try {
    // Populate customer identity fields while fetching the current page and count.
    const [orders, total] = await Promise.all([
      Order.find({}).populate('customerId', 'name email').sort({ orderDate: -1, _id: 1 }).skip(pagingValues.skip).limit(pagingValues.limit).lean(),
      Order.countDocuments({})
    ]);
    // Send records together with the total page count used by the admin interface.
    return res.json({ orders, page: pagingValues.page, limit: pagingValues.limit, total, totalPages: Math.ceil(total / pagingValues.limit) });
  } catch { return res.status(500).json({ status: 'error', message: 'Could not list orders.' }); }
});

// Read one order and its safe customer summary.
router.get('/orders/:id', async (req, res) => {
  // Reject malformed MongoDB IDs with a client error.
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'Order ID is invalid.' });
  try {
    const order = await Order.findById(req.params.id).populate('customerId', 'name email').lean();
    return order ? res.json({ order }) : res.status(404).json({ status: 'error', message: 'Order not found.' });
  } catch { return res.status(500).json({ status: 'error', message: 'Could not read order.' }); }
});

// List reviews with their product and author summaries.
router.get('/reviews', async (req, res) => {
  // Reject invalid pagination parameters before querying reviews.
  const pagingValues = paging(req.query);
  if (!pagingValues) return res.status(400).json({ status: 'error', message: 'Page or limit is invalid.' });
  try {
    // Populate only fields the admin review list displays and count matching records.
    const [reviews, total] = await Promise.all([
      Review.find({}).populate('productId', 'name category').populate('userId', 'name email').sort({ createdAt: -1, _id: 1 }).skip(pagingValues.skip).limit(pagingValues.limit).lean(),
      Review.countDocuments({})
    ]);
    // Return page metadata with the current slice of reviews.
    return res.json({ reviews, page: pagingValues.page, limit: pagingValues.limit, total, totalPages: Math.ceil(total / pagingValues.limit) });
  } catch { return res.status(500).json({ status: 'error', message: 'Could not list reviews.' }); }
});

// Return aggregated revenue, top products, and order-status analytics.
router.get('/dashboard', async (req, res) => {
  try {
    // Execute the shared pipeline; use an empty object when the collection is empty.
    const [result = {}] = await Order.aggregate(buildDashboardPipeline());
    // Ensure optional aggregation sections always serialize as arrays.
    const revenueByCategory = Array.isArray(result.revenueByCategory) ? result.revenueByCategory : [];
    const topProducts = Array.isArray(result.topProducts) ? result.topProducts : [];
    const orderStatusBreakdown = Array.isArray(result.orderStatusBreakdown) ? result.orderStatusBreakdown : [];
    // Include a flag so the UI can distinguish empty analytics from zero-valued data.
    return res.status(200).json({
      status: 'success',
      generatedAt: new Date().toISOString(),
      revenueByCategory,
      topProducts,
      orderStatusBreakdown,
      hasOrders: orderStatusBreakdown.some((entry) => entry.count > 0)
    });
  } catch (error) {
    // Log the error type for operators without exposing internal details to clients.
    console.error(`Admin dashboard aggregation failed (${error?.name || 'Error'}).`);
    return res.status(500).json({ status: 'error', message: 'Could not load dashboard analytics.' });
  }
});

// Export the configured router for mounting by the main application.
module.exports = router;
