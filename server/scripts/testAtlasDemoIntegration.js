const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const safety = require('./databaseSafety');
const atlas = require('./atlasIntegrationCommon');
const app = require('../app');
const Product = require('../models/Product');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const CheckoutOperation = require('../models/CheckoutOperation');
const Review = require('../models/Review');
const Recommendation = require('../models/Recommendation');
const { getJwtSecret, signUserToken } = require('../middleware/auth');

const { mongoose, TARGET_DB, RUN_MARKER_PREFIX } = atlas;
let shutdownRequested = false;
let activePersistenceChild = null;
let mutationMayHaveOccurred = false;

function onShutdownSignal(signal) {
  shutdownRequested = signal;
  if (activePersistenceChild) activePersistenceChild.kill();
}

function ensureRunning() {
  if (shutdownRequested) throw new Error(`Graceful ${shutdownRequested} received; no further test requests will start.`);
}

async function listen() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function stop(http) {
  if (!http?.server) return;
  http.server.closeAllConnections();
  await new Promise((resolve) => http.server.close(resolve));
}

async function runPersistenceProbe(fixture) {
  const child = spawn(process.execPath, [__filename, ...process.argv.slice(2), '--persistence-probe'], {
    cwd: process.cwd(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
  });
  activePersistenceChild = child;
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Persistence probe exceeded its 25 second limit.')); }, 25_000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
  child.stdin.end(JSON.stringify(fixture));
  const outcome = await result;
  activePersistenceChild = null;
    if (outcome.code !== 0) throw new Error(`Fresh API process persistence probe failed (exit ${outcome.code}); sanitized probe diagnostics: ${outcome.stderr.slice(0, 300)}`);
}

async function runPersistenceProbeChild() {
  const fixture = JSON.parse(fs.readFileSync(0, 'utf8'));
  const target = atlas.loadAndValidateTarget(process.argv.slice(2));
  const verified = await atlas.connectAndVerify(target);
  const http = await listen();
  try {
    const response = await client(http.base, fixture.token)('/api/users/me');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.id, fixture.userId);
    const ordersResponse = await client(http.base, fixture.token)('/api/users/me/orders?limit=50');
    assert.equal(ordersResponse.status, 200);
    const ordersBody = await ordersResponse.json();
    assert.ok(ordersBody.orders.some((order) => order._id === fixture.orderId));
    const productResponse = await client(http.base)(`/api/products/${fixture.productId}`);
    assert.equal(productResponse.status, 200);
    assert.equal((await productResponse.json())._id, fixture.productId);
    process.stdout.write(`Persistence probe passed for ${verified.databaseName}.\n`);
  } finally {
    await stop(http);
    await atlas.close();
  }
}

function client(base, token) {
  return async (path, { method = 'GET', body, headers = {} } = {}) => {
    ensureRunning();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) mutationMayHaveOccurred = true;
    return fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000)
    });
  };
}

async function run() {
  if (process.argv.includes('--persistence-probe')) return runPersistenceProbeChild();
  shutdownRequested = false;
  mutationMayHaveOccurred = false;
  let target;
  let verified;
  let http;
  let schedulerLease;
  let report;
  let baselineRecommendationCount;
  let baselineOrderCount;
  const runTag = `${RUN_MARKER_PREFIX}:${crypto.randomUUID()}`;
  const operationKeyPrefix = runTag.replace(/[^a-z0-9]/gi, '');
  const fixtures = { users: new Map(), products: new Map(), carts: new Map(), orders: new Map(), reviews: new Map(), operations: new Map() };
  let originalOrderCreate;
  const plannedUsers = new Map();
  const plannedProducts = new Map();
  const expectedOperationKeys = new Set();
  const cleaned = { users: new Set(), products: new Set(), carts: new Set(), orders: new Set(), reviews: new Set(), checkoutOperations: new Set() };
  const retained = { users: new Set(), products: new Set(), carts: new Set(), orders: new Set(), reviews: new Set(), checkoutOperations: new Set() };
  const cleanupErrors = [];
  let primaryCustomerId = null;
  let testStatus = 'RUNNING';
  let failure = null;
  process.once('SIGINT', onShutdownSignal);
  process.once('SIGTERM', onShutdownSignal);

  const rememberCart = async (userId) => {
    const cart = await Cart.findOne({ userId }).select('_id').lean();
    if (cart) fixtures.carts.set(String(cart._id), String(userId));
    return cart;
  };
  const createProduct = async (label, stock) => {
    ensureRunning();
    const name = `${runTag} ${label}`;
    if (await Product.exists({ name, attributes: { $elemMatch: { key: 'integrationMarker', value: runTag } } })) {
      throw new safety.SafetyError('The generated product marker already exists; refusing an ambiguous fixture.');
    }
    plannedProducts.set(name, { name, category: 'Integration Test', marker: runTag });
    mutationMayHaveOccurred = true;
    const product = await Product.create({
      name, description: 'Disposable Atlas integration fixture', price: 7.25, stock,
      category: 'Integration Test', attributes: [{ key: 'integrationMarker', value: runTag }]
    });
    fixtures.products.set(String(product._id), { name, marker: runTag });
    return product;
  };
  const register = async (base, suffix) => {
    ensureRunning();
    const email = `${runTag.slice(-32).replace(/[^a-z0-9]/gi, '').toLowerCase()}-${suffix}@example.invalid`;
    const name = `${runTag} ${suffix}`;
    const password = `Uk-${crypto.randomBytes(24).toString('base64url')}!`;
    if (await User.exists({ email })) throw new safety.SafetyError('The generated fixture email already exists; refusing an ambiguous user.');
    plannedUsers.set(email, { email, name, password });
    const request = client(base);
    const response = await request('/api/auth/register', { method: 'POST', body: { name, email, password } });
    assert.equal(response.status, 201, 'fixture registration should succeed');
    const result = await response.json();
    assert.equal(result.user.role, 'customer');
    assert.ok(result.token);
    fixtures.users.set(result.user.id, { email, name, password });
    return { id: result.user.id, email, password, token: result.token };
  };
  const captureCheckoutRecords = async (userIds) => {
    if (!userIds.length) return;
    const customerIds = userIds.map((id) => new mongoose.Types.ObjectId(id));
    const operations = await CheckoutOperation.find({ userId: { $in: customerIds }, key: { $in: [...expectedOperationKeys] } }).select('_id orderId userId key').lean();
    for (const row of operations) {
      const operationId = String(row._id);
      const orderId = String(row.orderId);
      fixtures.operations.set(operationId, { userId: String(row.userId), key: row.key, orderId });
      fixtures.orders.set(orderId, { userId: String(row.userId), operationId });
    }
  };

  try {
    target = atlas.loadAndValidateTarget(process.argv.slice(2));
    schedulerLease = await atlas.acquireIntegrationSchedulerLease();
    verified = await atlas.connectAndVerify(target);
    assert.equal(verified.databaseName, TARGET_DB);
    if (!getJwtSecret()) throw new safety.SafetyError('JWT_SECRET was not loaded from the selected Atlas profile.');

    baselineRecommendationCount = await Recommendation.countDocuments({});
    baselineOrderCount = await Order.countDocuments({});
    const admin = await User.findOne({ role: 'admin', isActive: { $ne: false } }).select('_id role isActive').lean();
    if (!admin) throw new safety.SafetyError('An active Atlas administrator is required for read-only admin endpoint checks.');
    const adminToken = signUserToken({ _id: admin._id, role: admin.role });
    if (!adminToken) throw new safety.SafetyError('Could not sign the read-only admin endpoint test token.');

    http = await listen();
    const anonymous = client(http.base);
    const adminApi = client(http.base, adminToken);
    assert.equal((await anonymous('/api/admin/overview')).status, 401);
    assert.equal((await adminApi('/api/admin/overview')).status, 200);
    assert.equal((await adminApi('/api/admin/dashboard')).status, 200);
    assert.equal((await adminApi('/api/admin/users?page=1&limit=1')).status, 200);
    assert.equal((await anonymous('/api/products', { method: 'POST', body: { name: `${runTag} denied`, price: 1, stock: 1, category: 'Integration Test' } })).status, 401);
    const customer = await register(http.base, 'customer');
    primaryCustomerId = customer.id;
    let customerApi = client(http.base, customer.token);
    assert.equal((await customerApi('/api/products', { method: 'POST', body: { name: `${runTag} denied`, price: 1, stock: 1, category: 'Integration Test' } })).status, 403);
    const adminProductName = `${runTag} admin-crud`;
    if (await Product.exists({ name: adminProductName, attributes: { $elemMatch: { key: 'integrationMarker', value: runTag } } })) {
      throw new safety.SafetyError('The generated admin product marker already exists; refusing an ambiguous fixture.');
    }
    plannedProducts.set(adminProductName, { name: adminProductName, category: 'Integration Test', marker: runTag });
    const adminProductResponse = await adminApi('/api/products', { method: 'POST', body: {
      name: adminProductName, description: 'Marked disposable admin CRUD fixture', price: 2, stock: 2,
      category: 'Integration Test', attributes: [{ key: 'integrationMarker', value: runTag }]
    } });
    assert.equal(adminProductResponse.status, 201);
    const adminProduct = await adminProductResponse.json();
    fixtures.products.set(String(adminProduct._id), { name: adminProductName, marker: runTag });
    assert.equal((await adminApi(`/api/products/${adminProduct._id}`, { method: 'PATCH', body: { price: 3 } })).status, 200);
    assert.equal((await Product.findById(adminProduct._id).select('price').lean()).price, 3);
    assert.equal((await adminApi(`/api/products/${adminProduct._id}`, { method: 'DELETE' })).status, 200);
    assert.equal(await Product.countDocuments({ _id: adminProduct._id }), 0);

    const secondCustomer = await register(http.base, 'concurrent-a');
    const thirdCustomer = await register(http.base, 'concurrent-b');
    const loginResponse = await anonymous('/api/auth/login', { method: 'POST', body: { email: customer.email, password: customer.password } });
    assert.equal(loginResponse.status, 200, 'registered fixture credentials should log in');
    customer.token = (await loginResponse.json()).token;
    assert.ok(customer.token);
    customerApi = client(http.base, customer.token);
    const profileResponse = await customerApi('/api/users/me');
    assert.equal(profileResponse.status, 200);
    assert.equal((await profileResponse.json()).id, customer.id);
    assert.equal((await customerApi('/api/admin/overview')).status, 403);

    const cartProduct = await createProduct('cart-lifecycle', 10);
    let cartResponse = await customerApi('/api/cart/items', { method: 'POST', body: { productId: String(cartProduct._id), quantity: 1 } });
    assert.equal(cartResponse.status, 201);
    await rememberCart(customer.id);
    let cartBody = await customerApi('/api/cart');
    assert.equal((await cartBody.json()).items[0].quantity, 1);
    cartResponse = await customerApi(`/api/cart/items/${cartProduct._id}`, { method: 'PATCH', body: { quantity: 2 } });
    assert.equal(cartResponse.status, 200);
    assert.equal((await (await customerApi('/api/cart')).json()).items[0].quantity, 2);
    assert.equal((await customerApi(`/api/cart/items/${cartProduct._id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await (await customerApi('/api/cart')).json()).items.length, 0);
    assert.equal((await customerApi('/api/cart/items', { method: 'POST', body: { productId: String(cartProduct._id), quantity: 1 } })).status, 201);
    assert.equal((await customerApi('/api/cart', { method: 'DELETE' })).status, 200);
    assert.equal((await (await customerApi('/api/cart')).json()).items.length, 0);
    await rememberCart(customer.id);

    const checkoutProduct = await createProduct('checkout-price-snapshot', 10);
    assert.equal((await customerApi('/api/cart/items', { method: 'POST', body: { productId: String(checkoutProduct._id), quantity: 2 } })).status, 201);
    await rememberCart(customer.id);
    const checkoutKey = `${operationKeyPrefix}-checkout`;
    expectedOperationKeys.add(checkoutKey);
    const checkout = await customerApi('/api/cart/checkout', { method: 'POST', headers: { 'idempotency-key': checkoutKey }, body: {} });
    assert.equal(checkout.status, 201);
    const checkoutBody = await checkout.json();
    fixtures.orders.set(checkoutBody.order._id, { userId: customer.id, key: checkoutKey });
    await captureCheckoutRecords([customer.id]);
    const storedOrder = await Order.findById(checkoutBody.order._id).lean();
    assert.equal(storedOrder.items[0].nameAtPurchase, checkoutProduct.name);
    assert.equal(storedOrder.items[0].priceAtPurchase, checkoutProduct.price);
    assert.equal(storedOrder.items[0].qty, 2);
    assert.equal(storedOrder.totalAmount, 14.5);
    assert.equal((await Product.findById(checkoutProduct._id).select('stock').lean()).stock, 8);
    const replayResponse = await customerApi('/api/cart/checkout', { method: 'POST', headers: { 'idempotency-key': checkoutKey }, body: {} });
    assert.equal(replayResponse.status, 200);
    const replayBody = await replayResponse.json();
    assert.equal(replayBody.order._id, checkoutBody.order._id);
    assert.equal(replayBody.replayed, true);
    assert.equal(await Order.countDocuments({ customerId: customer.id }), 1);
    assert.equal(await CheckoutOperation.countDocuments({ userId: customer.id, key: checkoutKey }), 1);
    assert.equal((await Cart.findOne({ userId: customer.id }).lean()).items.length, 0);
    const changedProduct = await createProduct('idempotency-conflict', 5);
    assert.equal((await customerApi('/api/cart/items', { method: 'POST', body: { productId: String(changedProduct._id), quantity: 1 } })).status, 201);
    await rememberCart(customer.id);
    const reusedKey = await customerApi('/api/cart/checkout', { method: 'POST', headers: { 'idempotency-key': checkoutKey }, body: {} });
    assert.equal(reusedKey.status, 409);
    assert.equal((await Product.findById(changedProduct._id).select('stock').lean()).stock, 5);
    assert.equal((await Cart.findOne({ userId: customer.id }).lean()).items.length, 1);
    assert.equal((await customerApi('/api/cart', { method: 'DELETE' })).status, 200);
    await rememberCart(customer.id);

    const rollbackProduct = await createProduct('controlled-rollback', 3);
    assert.equal((await customerApi('/api/cart/items', { method: 'POST', body: { productId: String(rollbackProduct._id), quantity: 1 } })).status, 201);
    await rememberCart(customer.id);
    originalOrderCreate = Order.create;
    Order.create = async () => { throw new Error('Controlled Atlas test failure after stock decrement.'); };
    const rollbackKey = `${operationKeyPrefix}-rollback`;
    expectedOperationKeys.add(rollbackKey);
    const orderCountBeforeRollback = await Order.countDocuments({ customerId: customer.id });
    const operationCountBeforeRollback = await CheckoutOperation.countDocuments({ userId: customer.id, key: rollbackKey });
    const rollbackResponse = await customerApi('/api/cart/checkout', { method: 'POST', headers: { 'idempotency-key': rollbackKey }, body: {} });
    Order.create = originalOrderCreate;
    originalOrderCreate = null;
    assert.equal(rollbackResponse.status, 503);
    assert.equal((await Product.findById(rollbackProduct._id).select('stock').lean()).stock, 3);
    assert.equal((await Cart.findOne({ userId: customer.id }).lean()).items.length, 1);
    assert.equal(await Order.countDocuments({ customerId: customer.id }), orderCountBeforeRollback);
    assert.equal(await CheckoutOperation.countDocuments({ userId: customer.id, key: rollbackKey }), operationCountBeforeRollback);

    const raceProduct = await createProduct('bounded-concurrency-stock-one', 1);
    for (const user of [secondCustomer, thirdCustomer]) {
      const api = client(http.base, user.token);
      assert.equal((await api('/api/cart/items', { method: 'POST', body: { productId: String(raceProduct._id), quantity: 1 } })).status, 201);
      await rememberCart(user.id);
    }
    const raceKey = `${operationKeyPrefix}-race`;
    const raceKeys = [`${raceKey}-0`, `${raceKey}-1`];
    for (const key of raceKeys) expectedOperationKeys.add(key);
    const raceResults = await Promise.all([secondCustomer, thirdCustomer].map((user, i) => client(http.base, user.token)('/api/cart/checkout', {
      method: 'POST', headers: { 'idempotency-key': raceKeys[i] }, body: {}
    })));
    await captureCheckoutRecords([secondCustomer.id, thirdCustomer.id]);
    assert.deepEqual(raceResults.map((result) => result.status).sort(), [201, 409]);
    assert.equal((await Product.findById(raceProduct._id).select('stock').lean()).stock, 0);
    assert.ok((await Product.findById(raceProduct._id).select('stock').lean()).stock >= 0);
    assert.equal(await Order.countDocuments({ customerId: { $in: [secondCustomer.id, thirdCustomer.id] } }), 1);
    assert.equal(await CheckoutOperation.countDocuments({ userId: { $in: [secondCustomer.id, thirdCustomer.id] }, key: { $in: raceKeys } }), 1);

    const overviewAfterOrders = await adminApi('/api/admin/overview');
    assert.equal(overviewAfterOrders.status, 200);
    const overviewMetrics = (await overviewAfterOrders.json()).metrics;
    assert.equal(overviewMetrics.orderCount, baselineOrderCount + 2);
    assert.ok((await adminApi('/api/admin/dashboard').then((response) => response.json())).hasOrders);

    const reviewProduct = await createProduct('review-rating-aggregate', 4);
    const reviewApi = customerApi;
    const reviewResponse = await reviewApi('/api/reviews', { method: 'POST', body: { productId: String(reviewProduct._id), rating: 5, text: runTag } });
    assert.equal(reviewResponse.status, 201);
    const createdReview = (await reviewResponse.json()).review;
    fixtures.reviews.set(createdReview._id, { userId: customer.id, productId: String(reviewProduct._id), text: runTag });
    let reviewAggregate = await Product.findById(reviewProduct._id).select('ratingAvg ratingCount').lean();
    assert.equal(reviewAggregate.ratingCount, 1);
    assert.equal(reviewAggregate.ratingAvg, 5);
    assert.equal((await client(http.base, secondCustomer.token)(`/api/reviews/${createdReview._id}`, { method: 'PATCH', body: { rating: 1 } })).status, 403);
    assert.equal((await client(http.base, secondCustomer.token)(`/api/reviews/${createdReview._id}`, { method: 'DELETE' })).status, 403);
    assert.equal((await reviewApi(`/api/reviews/${createdReview._id}`, { method: 'PATCH', body: { rating: 3 } })).status, 200);
    reviewAggregate = await Product.findById(reviewProduct._id).select('ratingAvg ratingCount').lean();
    assert.equal(reviewAggregate.ratingAvg, 3);
    assert.equal(reviewAggregate.ratingCount, 1);
    assert.equal((await reviewApi(`/api/reviews/${createdReview._id}`, { method: 'DELETE' })).status, 200);
    reviewAggregate = await Product.findById(reviewProduct._id).select('ratingAvg ratingCount').lean();
    assert.equal(reviewAggregate.ratingCount, 0);
    assert.equal(reviewAggregate.ratingAvg, 0);

    await stop(http);
    http = null;
    await atlas.close();
    await runPersistenceProbe({ userId: customer.id, token: customer.token, orderId: checkoutBody.order._id, productId: String(checkoutProduct._id) });
    verified = await atlas.connectAndVerify(target);

    await captureCheckoutRecords([...fixtures.users.keys()]);
    assert.equal(await Recommendation.countDocuments({}), baselineRecommendationCount, 'recommendation corpus must not be modified');
    report = { database: verified.databaseName, topology: verified.topology, fixtureCounts: { users: fixtures.users.size, products: fixtures.products.size, carts: fixtures.carts.size, orders: fixtures.orders.size, reviews: fixtures.reviews.size, checkoutOperations: fixtures.operations.size }, checks: ['registration/login token', 'cart item contents and quantities', 'checkout snapshots/stock decrement/cart clear', 'rollback', 'idempotent same-order replay and changed-cart conflict', 'two-request race (not stress test)', 'review ownership/aggregate lifecycle', 'fixture-correlated admin analytics', 'fresh-process user/order/product persistence'], recommendationCountUnchanged: baselineRecommendationCount };
    testStatus = 'PASS';
  } catch (error) {
    testStatus = shutdownRequested ? 'INTERRUPTED' : error instanceof safety.SafetyError && !verified ? 'REFUSED' : 'FAILED';
    failure = error instanceof safety.SafetyError ? error.message : `${error?.name || 'Error'}; details suppressed`;
  } finally {
    if (originalOrderCreate) Order.create = originalOrderCreate;
    try { await stop(http); } catch (error) { cleanupErrors.push(`http-listener-close:run:${error?.name || 'Error'}`); }
    const idList = (records) => [...records.keys()];
    const addError = (kind, id, error) => cleanupErrors.push(`${kind}:${id || 'run'}:${error?.name || 'Error'}`);
    const idAbsent = async (Model, id) => !(await Model.exists({ _id: id }));
    let dbReadyForCleanup = verified?.databaseName === TARGET_DB
      && mongoose.connection.readyState === 1 && mongoose.connection.name === TARGET_DB;

    if (!dbReadyForCleanup && verified?.databaseName === TARGET_DB && target && mutationMayHaveOccurred) {
      try {
        verified = await atlas.connectAndVerify(target);
        dbReadyForCleanup = verified.databaseName === TARGET_DB && mongoose.connection.name === TARGET_DB;
      } catch (error) { addError('reconnect-for-cleanup', null, error); }
    }

    if (dbReadyForCleanup) {
      try {
        for (const [email, fixture] of plannedUsers) {
          const rows = await User.find({ email, name: fixture.name, role: 'customer' }).select('_id email name role').limit(2).lean();
          if (rows.length > 1) {
            for (const row of rows) retained.users.add(String(row._id));
            addError('ambiguous-user-match', email, new Error('Ambiguous fixtures'));
          } else if (rows.length === 1) fixtures.users.set(String(rows[0]._id), { email, name: fixture.name });
        }
        for (const [name, fixture] of plannedProducts) {
          const rows = await Product.find({ name, category: fixture.category, attributes: { $elemMatch: { key: 'integrationMarker', value: runTag } } })
            .select('_id name category attributes').limit(2).lean();
          if (rows.length > 1) {
            for (const row of rows) retained.products.add(String(row._id));
            addError('ambiguous-product-match', name, new Error('Ambiguous fixtures'));
          } else if (rows.length === 1) fixtures.products.set(String(rows[0]._id), fixture);
        }

        const userIds = [...fixtures.users.keys()].map((id) => new mongoose.Types.ObjectId(id));
        const productIds = [...fixtures.products.keys()].map((id) => new mongoose.Types.ObjectId(id));
        if (userIds.length) {
          const ownedCarts = await Cart.find({ userId: { $in: userIds } }).select('_id userId').lean();
          for (const row of ownedCarts) fixtures.carts.set(String(row._id), String(row.userId));
        }
        if (primaryCustomerId && productIds.length) {
          const markedReviews = await Review.find({ userId: primaryCustomerId, productId: { $in: productIds }, text: runTag })
            .select('_id userId productId text').limit(2).lean();
          if (markedReviews.length > 1) {
            for (const row of markedReviews) retained.reviews.add(String(row._id));
            addError('ambiguous-review-marker', runTag, new Error('Multiple reviews match the exact run markers; none will be deleted'));
          } else {
            for (const row of markedReviews) fixtures.reviews.set(String(row._id), {
              userId: String(row.userId), productId: String(row.productId), text: runTag
            });
          }
        }
        await captureCheckoutRecords([...fixtures.users.keys()]);

        for (const [id, fixture] of fixtures.reviews) {
          try {
            await Review.deleteOne({ _id: id, userId: fixture.userId, productId: fixture.productId, text: runTag });
            if (await idAbsent(Review, id)) cleaned.reviews.add(id); else retained.reviews.add(id);
          } catch (error) { retained.reviews.add(id); addError('review', id, error); }
        }

        const operationsForRun = [];
        for (const [id, fixture] of fixtures.operations) {
          if (!expectedOperationKeys.has(fixture.key) || !fixtures.users.has(fixture.userId)) {
            retained.checkoutOperations.add(id);
            addError('operation-ownership', id, new Error('Operation key or fixture owner did not match'));
            continue;
          }
          const exact = await CheckoutOperation.findOne({ _id: id, userId: fixture.userId, key: fixture.key }).select('_id userId key orderId').lean();
          if (exact) operationsForRun.push({ id, userId: fixture.userId, key: fixture.key, orderId: String(exact.orderId) });
          else cleaned.checkoutOperations.add(id);
        }

        for (const operation of operationsForRun) {
          const orderId = operation.orderId;
          if (!fixtures.orders.has(orderId)) {
            retained.orders.add(orderId);
            retained.checkoutOperations.add(operation.id);
            addError('order-association', orderId, new Error('Order ID was not captured from a run operation'));
            continue;
          }
          try {
            await Order.deleteOne({ _id: orderId, customerId: operation.userId });
            if (await idAbsent(Order, orderId)) {
              cleaned.orders.add(orderId);
              await CheckoutOperation.deleteOne({ _id: operation.id, userId: operation.userId, key: operation.key });
              if (await idAbsent(CheckoutOperation, operation.id)) cleaned.checkoutOperations.add(operation.id);
              else retained.checkoutOperations.add(operation.id);
            } else {
              retained.orders.add(orderId);
              retained.checkoutOperations.add(operation.id);
            }
          } catch (error) {
            retained.orders.add(orderId);
            retained.checkoutOperations.add(operation.id);
            addError('order-or-operation', orderId, error);
          }
        }
        const orderIdsWithRunOperations = new Set(operationsForRun.map((operation) => operation.orderId));
        for (const id of fixtures.orders.keys()) {
          if (!orderIdsWithRunOperations.has(id) && !(await idAbsent(Order, id))) {
            retained.orders.add(id);
            addError('uncorrelated-order', id, new Error('No exact run operation proves ownership'));
          }
        }

        for (const [id, ownerId] of fixtures.carts) {
          if (!fixtures.users.has(ownerId)) { retained.carts.add(id); addError('cart-owner', id, new Error('Owner is not a fixture user')); continue; }
          try {
            await Cart.deleteOne({ _id: id, userId: ownerId });
            if (await idAbsent(Cart, id)) cleaned.carts.add(id); else retained.carts.add(id);
          } catch (error) { retained.carts.add(id); addError('cart', id, error); }
        }

        for (const [id, fixture] of fixtures.products) {
          try {
            const stillReferenced = await Promise.all([
              Cart.exists({ 'items.productId': id }), Review.exists({ productId: id })
            ]);
            if (stillReferenced.some(Boolean)) { retained.products.add(id); addError('referenced-product', id, new Error('Fixture remains referenced')); continue; }
            await Product.deleteOne({ _id: id, name: fixture.name, category: fixture.category || 'Integration Test', attributes: { $elemMatch: { key: 'integrationMarker', value: runTag } } });
            if (await idAbsent(Product, id)) cleaned.products.add(id); else retained.products.add(id);
          } catch (error) { retained.products.add(id); addError('product', id, error); }
        }

        for (const [id, fixture] of fixtures.users) {
          try {
            const remainingOwned = await Promise.all([
              Cart.exists({ userId: id }), Order.exists({ customerId: id }),
              Review.exists({ userId: id }), CheckoutOperation.exists({ userId: id })
            ]);
            if (remainingOwned.some(Boolean)) { retained.users.add(id); addError('referenced-user', id, new Error('Fixture user still owns records')); continue; }
            await User.deleteOne({ _id: id, email: fixture.email, name: fixture.name, role: 'customer' });
            if (await idAbsent(User, id)) cleaned.users.add(id); else retained.users.add(id);
          } catch (error) { retained.users.add(id); addError('user', id, error); }
        }

        const remaining = await Promise.all([
          User.countDocuments({ _id: { $in: [...fixtures.users.keys()] } }),
          Product.countDocuments({ _id: { $in: [...fixtures.products.keys()] } }),
          Cart.countDocuments({ _id: { $in: [...fixtures.carts.keys()] } }),
          Order.countDocuments({ _id: { $in: [...fixtures.orders.keys()] } }),
          Review.countDocuments({ _id: { $in: [...fixtures.reviews.keys()] } }),
          CheckoutOperation.countDocuments({ _id: { $in: [...fixtures.operations.keys()] } })
        ]);
        if (remaining.some(Boolean)) addError('reconciliation', null, new Error(`Remaining counts ${remaining.join(',')}`));
        if (baselineRecommendationCount !== undefined
            && await Recommendation.countDocuments({}) !== baselineRecommendationCount) {
          addError('recommendation-count', null, new Error('Recommendation document count changed; no repair was attempted'));
        }
      } catch (error) {
        addError('cleanup-recovery', null, error);
        for (const id of fixtures.users.keys()) retained.users.add(id);
        for (const id of fixtures.products.keys()) retained.products.add(id);
        for (const id of fixtures.carts.keys()) retained.carts.add(id);
        for (const id of fixtures.orders.keys()) retained.orders.add(id);
        for (const id of fixtures.reviews.keys()) retained.reviews.add(id);
        for (const id of fixtures.operations.keys()) retained.checkoutOperations.add(id);
      }
    } else if (mutationMayHaveOccurred) {
      cleanupErrors.push('database-unavailable:run:could not safely reconcile writes against verified target');
      for (const id of fixtures.users.keys()) retained.users.add(id);
      for (const id of fixtures.products.keys()) retained.products.add(id);
      for (const id of fixtures.carts.keys()) retained.carts.add(id);
      for (const id of fixtures.orders.keys()) retained.orders.add(id);
      for (const id of fixtures.reviews.keys()) retained.reviews.add(id);
      for (const id of fixtures.operations.keys()) retained.checkoutOperations.add(id);
    }

    try { await atlas.close(); } catch (error) { addError('database-close', null, error); }
    if (schedulerLease) {
      try { await schedulerLease.release(); } catch (error) { addError('scheduler-lock-release', null, error); }
    }
    process.removeListener('SIGINT', onShutdownSignal);
    process.removeListener('SIGTERM', onShutdownSignal);
    if (shutdownRequested) { testStatus = 'INTERRUPTED'; process.exitCode = 130; }
    else if (cleanupErrors.length || Object.values(retained).some((ids) => ids.size)) {
      if (testStatus === 'PASS') testStatus = 'CLEANUP_INCOMPLETE';
      process.exitCode = 1;
    } else if (testStatus !== 'PASS') process.exitCode = 1;
    process.stdout.write(`${JSON.stringify({
      status: testStatus, runId: runTag,
      failure,
      target: verified?.databaseName || (target?.databaseName || 'not verified'),
      created: { users: idList(fixtures.users), products: idList(fixtures.products), carts: idList(fixtures.carts), orders: idList(fixtures.orders), reviews: idList(fixtures.reviews), checkoutOperations: idList(fixtures.operations) },
      cleaned: Object.fromEntries(Object.entries(cleaned).map(([kind, ids]) => [kind, [...ids]])),
      retained: Object.fromEntries(Object.entries(retained).map(([kind, ids]) => [kind, [...ids]])),
      unresolvedMarkers: !dbReadyForCleanup && mutationMayHaveOccurred
        ? {
          users: [...plannedUsers.values()].map(({ email, name }) => ({ email, name })),
          products: [...plannedProducts.keys()],
          checkoutOperationKeys: [...expectedOperationKeys]
        } : {},
      cleanupErrors,
      note: 'Forced termination may prevent this reconciliation code from running.'
    }, null, 2)}\n`);
  }
}

if (require.main === module) run().catch(() => {
  process.stderr.write('Atlas integration stopped due to an unexpected error; details were suppressed.\n');
  process.exitCode = 1;
});
module.exports = { run };
