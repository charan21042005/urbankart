const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Order = require('../models/Order');
const { buildDashboardPipeline, SALES_STATUSES } = require('../analytics/buildDashboardPipeline');

const secret = 'analytics-unit-test-secret-with-at-least-32-bytes';
let server;
let baseUrl;
const adminId = new mongoose.Types.ObjectId();
const customerId = new mongoose.Types.ObjectId();

function token(subject, role = 'customer', expiresIn = '1h') {
  return jwt.sign({ sub: subject.toString(), role }, secret, {
    expiresIn, issuer: 'urbankart-api', audience: 'urbankart-client'
  });
}

async function request(headers = {}) {
  return fetch(`${baseUrl}/api/admin/dashboard`, { headers });
}

test('analytics route server starts with test-only JWT configuration', async () => {
  process.env.JWT_SECRET = secret;
  process.env.JWT_EXPIRES_IN = '1h';
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('analytics route rejects unauthenticated, invalid, expired and current-customer accounts before aggregation', async (t) => {
  t.mock.method(User, 'findById', (id) => ({ select: async () => ({
    _id: id, role: String(id) === adminId.toString() ? 'admin' : 'customer', isActive: true
  }) }));
  const aggregate = t.mock.method(Order, 'aggregate', async () => { throw new Error('must not aggregate'); });

  assert.equal((await request()).status, 401);
  assert.equal((await request({ authorization: 'Bearer invalid-token' })).status, 401);
  assert.equal((await request({ authorization: `Bearer ${token(customerId, 'customer', '-1s')}` })).status, 401);
  assert.equal((await request({ authorization: `Bearer ${token(customerId, 'admin')}` })).status, 403);
  assert.equal(aggregate.mock.callCount(), 0);
});

test('analytics route permits a database-confirmed admin and executes one facet aggregation', async (t) => {
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: adminId, role: 'admin', isActive: true }) }));
  const expected = {
    revenueByCategory: [{ category: 'Electronics', revenue: 32 }],
    topProducts: [{ productId: new mongoose.Types.ObjectId().toString(), name: 'Keyboard snapshot', unitsSold: 3 }],
    orderStatusBreakdown: [{ status: 'pending', count: 1 }, { status: 'completed', count: 1 }]
  };
  const aggregate = t.mock.method(Order, 'aggregate', async (pipeline) => {
    assert.equal(pipeline.length, 1);
    assert.ok(pipeline[0].$facet);
    return [expected];
  });
  const response = await request({ authorization: `Bearer ${token(adminId, 'admin')}` });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(aggregate.mock.callCount(), 1);
  assert.deepEqual(body.revenueByCategory, expected.revenueByCategory);
  assert.deepEqual(body.topProducts, expected.topProducts);
  assert.deepEqual(body.orderStatusBreakdown, expected.orderStatusBreakdown);
  assert.equal(body.hasOrders, true);
  assert.equal(typeof body.generatedAt, 'string');
});

test('aggregation uses historical item prices, preserves deleted-product revenue, and includes every status in one facet', () => {
  const pipeline = buildDashboardPipeline();
  assert.equal(pipeline.length, 1);
  const facet = pipeline[0].$facet;
  assert.deepEqual(Object.keys(facet), ['revenueByCategory', 'topProducts', 'orderStatusBreakdown']);
  assert.deepEqual(SALES_STATUSES, ['completed', 'shipped', 'delivered']);
  const revenue = facet.revenueByCategory;
  assert.ok(revenue.some((stage) => stage.$lookup?.from === 'products'));
  assert.ok(revenue.some((stage) => stage.$set?._category?.$ifNull?.[1] === 'Unattributed'));
  assert.ok(revenue.some((stage) => JSON.stringify(stage).includes('priceAtPurchase')));
  assert.ok(facet.topProducts.some((stage) => stage.$group?.unitsSold?.$sum === '$items.qty'));
  assert.ok(facet.topProducts.some((stage) => stage.$limit === 5));
  assert.equal(facet.orderStatusBreakdown.some((stage) => stage.$match), false);
  assert.ok(facet.orderStatusBreakdown.some((stage) => JSON.stringify(stage).includes('$status')));
});

test('empty aggregation response is a stable empty dashboard and database errors are sanitized', async (t) => {
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: adminId, role: 'admin', isActive: true }) }));
  let fail = false;
  t.mock.method(Order, 'aggregate', async () => {
    if (fail) throw new Error('sensitive database diagnostic');
    return [];
  });
  const empty = await request({ authorization: `Bearer ${token(adminId, 'admin')}` });
  const body = await empty.json();
  assert.equal(empty.status, 200);
  assert.deepEqual(body.revenueByCategory, []);
  assert.deepEqual(body.topProducts, []);
  assert.deepEqual(body.orderStatusBreakdown, []);
  assert.equal(body.hasOrders, false);

  fail = true;
  const failed = await request({ authorization: `Bearer ${token(adminId, 'admin')}` });
  assert.equal(failed.status, 500);
  assert.equal((await failed.text()).includes('sensitive database diagnostic'), false);
});

test('analytics route server closes', async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  delete process.env.JWT_SECRET;
  delete process.env.JWT_EXPIRES_IN;
});
