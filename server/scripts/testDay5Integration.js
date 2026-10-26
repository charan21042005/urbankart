const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const safety = require('./databaseSafety');
const Product = require('../models/Product');
const Recommendation = require('../models/Recommendation');
const User = require('../models/User');
const Order = require('../models/Order');
const app = require('../app');
const { recomputeRecommendations } = require('../jobs/computeRecommendations');

// Verify the Day 5 admin analytics and recommendation features against a local DB.
async function main() {
  process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('hex');
  process.env.JWT_EXPIRES_IN ||= '10m';
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  let server;
  let fixtureProductIds = [];
  let orderIds = [];
  let adminId;
  let customerId;
  const email = `day5-${crypto.randomUUID()}@example.invalid`;
  try {
    // Validate the disposable target and its transaction-capable replica-set identity.
    const target = await safety.connectAfterPreflight({
      mode: 'integration-test',
      argv: process.argv.slice(2),
      connect: (uri) => mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000, autoIndex: false, autoCreate: false })
    });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    safety.validateLocalReplicaSetHello(hello, target.expectedReplicaSetName);
    for (const model of [Product, Recommendation, User, Order]) await model.createIndexes();
    assert((await Recommendation.collection.indexes()).some((index) => index.name === 'uniq_recommendation_source' && index.unique));

    // Run real HTTP requests through the app on a temporary loopback port.
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const emptyResponse = await fetch(`${base}/api/admin/dashboard`);
    assert.equal(emptyResponse.status, 401);

    // Build recognizable products and orders for category, sales, and recommendation checks.
    const [a, b, c] = await Product.create([
      { name: 'Wireless Keyboard', description: 'Day 5 fixture', price: 20, stock: 2, category: 'Electronics', tags: ['wireless', 'keyboard'], attributes: [{ key: 'switch', value: 'mechanical' }] },
      { name: 'Wireless Mouse', description: 'Day 5 fixture', price: 12, stock: 3, category: 'Electronics', tags: ['wireless', 'mouse'], attributes: [{ key: 'switch', value: 'mechanical' }] },
      { name: 'Ceramic Mug', description: 'Day 5 fixture', price: 5, stock: 4, category: 'Home', tags: ['ceramic'] }
    ]);
    fixtureProductIds = [a._id, b._id, c._id];
    await Product.updateOne({ _id: b._id }, { $set: { category: 'Kitchen' } });
    const deletedProductId = new mongoose.Types.ObjectId();
    const admin = await User.create({ name: 'Day 5 fixture admin', email, passwordHash: 'synthetic-test-hash', role: 'admin' });
    adminId = admin._id;
    const customer = await User.create({ name: 'Day 5 fixture customer', email: `customer-${email}`, passwordHash: 'synthetic-test-hash', role: 'customer' });
    customerId = customer._id;
    const jwt = require('jsonwebtoken');
    const token = (user) => jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: '10m', issuer: 'urbankart-api', audience: 'urbankart-client' });

    const at = (day) => new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`);
    const orders = await Order.create([
      { customerId: customer._id, status: 'completed', orderDate: at(1), totalAmount: 20, items: [{ productId: a._id, nameAtPurchase: 'Keyboard Old', priceAtPurchase: 10, qty: 2 }] },
      { customerId: customer._id, status: 'shipped', orderDate: at(2), totalAmount: 12, items: [{ productId: a._id, nameAtPurchase: 'Keyboard New', priceAtPurchase: 12, qty: 1 }] },
      { customerId: customer._id, status: 'delivered', orderDate: at(3), totalAmount: 15, items: [{ productId: b._id, nameAtPurchase: 'Mouse', priceAtPurchase: 5, qty: 3 }] },
      { customerId: customer._id, status: 'delivered', orderDate: at(4), totalAmount: 32, items: [{ productId: deletedProductId, nameAtPurchase: 'Deleted item', priceAtPurchase: 8, qty: 4 }] },
      { customerId: customer._id, status: 'pending', orderDate: at(5), totalAmount: 9900, items: [{ productId: c._id, nameAtPurchase: 'Pending Mug', priceAtPurchase: 100, qty: 99 }] },
      { customerId: customer._id, status: 'cancelled', orderDate: at(6), totalAmount: 8910, items: [{ productId: c._id, nameAtPurchase: 'Cancelled Mug', priceAtPurchase: 90, qty: 99 }] }
    ]);
    orderIds = orders.map((order) => order._id);

    const forbidden = await fetch(`${base}/api/admin/dashboard`, { headers: { authorization: `Bearer ${token(customer)}` } });
    assert.equal(forbidden.status, 403);
    // Use the admin identity to validate analytics after checking access controls.
    const dashboardResponse = await fetch(`${base}/api/admin/dashboard`, { headers: { authorization: `Bearer ${token(admin)}` } });
    assert.equal(dashboardResponse.status, 200);
    const dashboard = await dashboardResponse.json();
    assert.equal(dashboard.hasOrders, true);
    assert.deepEqual(Object.fromEntries(dashboard.revenueByCategory.map((entry) => [entry.category, entry.revenue])), { Electronics: 32, Kitchen: 15, Unattributed: 32 });
    assert.equal(dashboard.topProducts[0].unitsSold, 4);
    assert.deepEqual(dashboard.orderStatusBreakdown.map(({ status, count }) => [status, count]), [['delivered', 2], ['cancelled', 1], ['completed', 1], ['pending', 1], ['shipped', 1]]);

    // Rebuild recommendation results and verify both cached results and fallback behavior.
    const recompute = await recomputeRecommendations();
    assert.equal(recompute.productsProcessed, await Product.countDocuments());
    const recommendations = await fetch(`${base}/api/products/${a._id}/recommendations`);
    assert.equal(recommendations.status, 200);
    const recommendationBody = await recommendations.json();
    assert.equal(recommendationBody.source, 'recommendation-engine');
    const fixtureRecommendation = recommendationBody.items.find(({ product: candidate }) => candidate._id === b._id.toString());
    assert.ok(fixtureRecommendation);
    assert.deepEqual(fixtureRecommendation.explanation.sharedTags, ['wireless']);
    await Recommendation.deleteOne({ productId: a._id });
    await Product.updateOne({ _id: a._id }, { $set: { category: 'Kitchen' } });
    const fallback = await fetch(`${base}/api/products/${a._id}/recommendations`);
    const fallbackBody = await fallback.json();
    assert.equal(fallbackBody.source, 'fallback');
    assert.ok(fallbackBody.items.length > 0);

    const missing = await fetch(`${base}/api/products/${new mongoose.Types.ObjectId()}/recommendations`);
    assert.equal(missing.status, 404);
    console.log(JSON.stringify({ status: 'PASS', database: target.databaseName, replicaSet: hello.setName, fixtures: { products: fixtureProductIds.length, orders: orderIds.length }, dashboard: { categoryRows: dashboard.revenueByCategory.length, topProducts: dashboard.topProducts.length, statusRows: dashboard.orderStatusBreakdown.length }, recommendations: { computedProducts: recompute.productsProcessed, cacheAndFallback: true }, auth: 'customer denied; admin allowed' }));
  } finally {
    // Remove test-owned rows and close resources while preserving unrelated data.
    if (mongoose.connection.readyState === 1) {
      await Recommendation.deleteMany({ productId: { $in: fixtureProductIds } });
      if (orderIds.length) await Order.deleteMany({ _id: { $in: orderIds } });
      if (fixtureProductIds.length) await Product.deleteMany({ _id: { $in: fixtureProductIds } });
      if (adminId) await User.deleteOne({ _id: adminId, email });
      if (customerId) await User.deleteOne({ _id: customerId });
      await User.deleteOne({ email: new RegExp(`^customer-${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

main().catch((error) => {
  if (error instanceof safety.SafetyError) console.error(`Day 5 integration refused: ${error.message}`);
  else console.error(`Day 5 integration failed (${error?.name || 'Error'}); details were suppressed.`);
  process.exitCode = 1;
});
