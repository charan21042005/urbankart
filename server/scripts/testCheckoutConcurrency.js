const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const app = require('../app');
const safety = require('./databaseSafety');
const {
  mongoose, Product, User, Cart, Order, prepareIntegration, createFixtureUser,
  createFixtureProduct, createFixtureCart, tokenFor, checkoutRequest,
  cleanupFixtures, startHttpServer
} = require('./checkoutIntegrationCommon');

async function run() {
  let target;
  let http;
  const runId = crypto.randomUUID();
  const userIds = [];
  const cartIds = [];
  let productId;
  try {
    target = await prepareIntegration(process.argv.slice(2));
    const product = await createFixtureProduct(runId, 1);
    productId = product._id;
    const users = [];
    const carts = [];
    for (let index = 0; index < 20; index += 1) {
      const user = await createFixtureUser(runId, index + 1);
      users.push(user);
      userIds.push(user._id);
      const cart = await createFixtureCart(user._id, product._id, 1);
      carts.push(cart);
      cartIds.push(cart._id);
    }

    http = await startHttpServer(app);
    const outcomes = await Promise.allSettled(users.map((user) => checkoutRequest(http.baseUrl, tokenFor(user))));
    assert.equal(outcomes.filter((item) => item.status === 'rejected').length, 0, 'all bounded HTTP requests should settle');
    const responses = outcomes.map((item) => item.value);
    const statuses = responses.map((response) => response.status);
    const successIndexes = statuses.flatMap((status, index) => status === 201 ? [index] : []);
    assert.equal(successIndexes.length, 1, 'exactly one request must succeed');
    assert.equal(statuses.filter((status) => status === 409).length, 19, 'the other requests must receive safe stock conflicts');

    const finalProduct = await Product.findById(product._id).select('stock').lean();
    const persistedOrders = await Order.find({ customerId: { $in: userIds } }).lean();
    const persistedCarts = await Cart.find({ _id: { $in: cartIds } }).lean();
    assert.equal(finalProduct.stock, 0, 'the final stock must be exactly zero');
    assert.ok(finalProduct.stock >= 0, 'stock must never be negative');
    assert.equal(persistedOrders.length, 1, 'exactly one order must be committed');
    assert.equal(persistedOrders[0].customerId.toString(), userIds[successIndexes[0]].toString());
    assert.equal(persistedOrders[0].items.length, 1);
    assert.equal(persistedOrders[0].items[0].productId.toString(), product._id.toString());
    assert.equal(persistedOrders[0].items[0].qty, 1);
    assert.equal(persistedCarts.length, 20);

    const cartById = new Map(persistedCarts.map((cart) => [cart._id.toString(), cart]));
    for (let index = 0; index < carts.length; index += 1) {
      const persistedCart = cartById.get(carts[index]._id.toString());
      assert.ok(persistedCart, 'every test cart must remain present until explicit cleanup');
      assert.equal(persistedCart.items.length, index === successIndexes[0] ? 0 : 1,
        index === successIndexes[0] ? 'successful cart should be cleared' : 'failed cart should remain intact');
    }

    process.stdout.write(`${JSON.stringify({
      result: 'passed against MongoDB transaction', database: target.databaseName,
      topology: target.topology.name, requests: 20, statusCounts: {
        success201: statuses.filter((status) => status === 201).length,
        conflict409: statuses.filter((status) => status === 409).length
      }, finalStock: finalProduct.stock, orders: persistedOrders.length,
      successfulCustomerCartItems: persistedCarts.find((cart) => cart._id.equals(carts[successIndexes[0]]._id)).items.length,
      failedCustomerCartsRetained: 19
    }, null, 2)}\n`);
  } catch (error) {
    if (error instanceof safety.SafetyError) {
      process.stderr.write(`Concurrency test refused: ${error.message}\n`);
    } else if (error?.name === 'AssertionError') {
      process.stderr.write(`Concurrency integration assertion failed: ${error.message}\n`);
    } else {
      process.stderr.write('Concurrency integration test failed; database details and connection string were suppressed.\n');
    }
    process.exitCode = 1;
  } finally {
    if (http?.server) {
      http.server.closeAllConnections();
      await new Promise((resolve) => http.server.close(resolve));
    }
    if (target) {
      try { await cleanupFixtures({ userIds, productId, cartIds }); }
      catch { process.stderr.write('Fixture cleanup was incomplete; only captured test fixture IDs were targeted.\n'); process.exitCode = 1; }
      await mongoose.disconnect().catch(() => { process.exitCode = 1; });
    }
  }
}

if (require.main === module) run();
module.exports = { run };
