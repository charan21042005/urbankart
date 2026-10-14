const express = require('express');
const Order = require('../models/Order');
const { authenticate, loadCurrentUser, requireAdmin } = require('../middleware/auth');
const { buildDashboardPipeline } = require('../analytics/buildDashboardPipeline');

const router = express.Router();

router.get('/dashboard', authenticate, loadCurrentUser, requireAdmin, async (req, res) => {
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
