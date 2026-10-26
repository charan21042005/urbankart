const crypto = require('node:crypto');
const mongoose = require('mongoose');
const safety = require('./databaseSafety');
const Product = require('../models/Product');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const CheckoutOperation = require('../models/CheckoutOperation');
const { getJwtSecret, getJwtExpiresIn, signUserToken } = require('../middleware/auth');

// Confirm the connected database can support the transaction-based checkout tests.
function requireTransactionTopology(hello, attestedTopology) {
  const topology = safety.classifyTopology(hello);
  if (!topology.transactionsSupported || topology.name !== attestedTopology) {
    throw new safety.SafetyError('The connected MongoDB topology does not match the locally attested transaction-capable topology. No test fixtures were created.');
  }
  return topology;
}

// Apply the isolated-database safety checks and verify the checkout's unique-key index.
async function prepareIntegration(argv) {
  if (!getJwtSecret()) throw new safety.SafetyError('JWT_SECRET must be configured with at least 32 bytes before integration tests.');
  if (!getJwtExpiresIn()) throw new safety.SafetyError('JWT_EXPIRES_IN must be a supported duration before integration tests.');
  const envTopology = process.env.URBANKART_TXN_TOPOLOGY_CONFIRMED;
  try {
    mongoose.set('autoIndex', false);
    mongoose.set('autoCreate', false);
    const target = await safety.connectAfterPreflight({
      mode: 'integration-test',
      argv,
      connect: (uri) => mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10_000,
        autoIndex: false,
        autoCreate: false
      })
    });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    safety.validateLocalReplicaSetHello(hello, target.expectedReplicaSetName);
    const topology = requireTransactionTopology(hello, envTopology);
    // Ensure test prerequisites exist before creating disposable fixture records.
    await Promise.all([Product, User, Cart, Order, CheckoutOperation].map((model) => model.createIndexes()));
    const operationIndexes = await CheckoutOperation.collection.indexes();
    if (!operationIndexes.some((index) => index.name === 'uniq_checkout_operation_user_key'
        && index.unique === true && index.key.userId === 1 && index.key.key === 1)) {
      throw new safety.SafetyError('The required unique checkout operation index is unavailable. No test fixtures were created.');
    }
    return { ...target, topology };
  } catch (error) {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
    throw error;
  }
}

// Create a uniquely named test customer with a non-login synthetic password hash.
async function createFixtureUser(runId, index) {
  return User.create({
    name: `UrbanKart integration ${runId} ${index}`,
    email: `urbankart-it-${runId}-${index}@example.invalid`,
    passwordHash: crypto.randomBytes(32).toString('hex'),
    role: 'customer'
  });
}

// Add a disposable product whose attributes identify the integration run.
async function createFixtureProduct(runId, stock) {
  return Product.create({
    name: `UrbanKart integration ${runId}`,
    description: 'Disposable checkout integration fixture',
    price: 7.25,
    stock,
    category: 'Integration Test',
    attributes: [{ key: 'fixture', value: runId }]
  });
}

// Create the cart line that checkout endpoints will consume.
async function createFixtureCart(userId, productId, quantity) {
  return Cart.create({ userId, items: [{ productId, quantity }] });
}

// Sign an authenticated test token using the application's normal token helper.
function tokenFor(user) {
  const token = signUserToken(user);
  if (!token) throw new Error('Could not sign an integration-test token with the configured JWT settings.');
  return token;
}

// Submit checkout with a fresh idempotency key for an independent test operation.
async function checkoutRequest(baseUrl, token) {
  return checkoutRequestWithKey(baseUrl, token, crypto.randomUUID());
}

// Submit checkout with a caller-supplied key to test replay and conflict behavior.
async function checkoutRequestWithKey(baseUrl, token, key) {
  return fetch(`${baseUrl}/api/cart/checkout`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key },
    body: '{}',
    signal: AbortSignal.timeout(20_000)
  });
}

// Ask the authenticated reconciliation endpoint for an existing checkout result.
async function reconcileRequest(baseUrl, token, key) {
  return fetch(`${baseUrl}/api/cart/checkout/${encodeURIComponent(key)}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000)
  });
}

// Delete only records whose IDs were captured from this test's fixtures.
async function cleanupFixtures({ userIds = [], productId = null, productIds = [], cartIds = [] }) {
  const customerIds = userIds.map((id) => new mongoose.Types.ObjectId(id));
  if (customerIds.length) {
    await CheckoutOperation.deleteMany({ userId: { $in: customerIds } });
    const orders = await Order.find({ customerId: { $in: customerIds } }).select('_id').lean();
    for (const order of orders) await Order.deleteOne({ _id: order._id });
  }
  for (const id of cartIds) await Cart.deleteOne({ _id: id });
  if (productId) await Product.deleteOne({ _id: productId });
  for (const id of productIds) await Product.deleteOne({ _id: id });
  for (const id of userIds) await User.deleteOne({ _id: id });
}

// Start the application on an ephemeral loopback port for local HTTP testing.
async function startHttpServer(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

module.exports = {
  mongoose,
  Product,
  User,
  Cart,
  Order,
  CheckoutOperation,
  prepareIntegration,
  requireTransactionTopology,
  createFixtureUser,
  createFixtureProduct,
  createFixtureCart,
  tokenFor,
  checkoutRequest,
  checkoutRequestWithKey,
  reconcileRequest,
  cleanupFixtures,
  startHttpServer
};
