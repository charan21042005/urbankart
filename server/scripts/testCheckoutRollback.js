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
  const originalOrderCreate = Order.create;
  const originalProductUpdate = Product.findOneAndUpdate;
  const originalStartSession = mongoose.startSession;
  let patched = false;
  try {
    target = await prepareIntegration(process.argv.slice(2));
    const user = await createFixtureUser(runId, 1);
    userIds.push(user._id);
    const product = await createFixtureProduct(runId, 5);
    productId = product._id;
    const cart = await createFixtureCart(user._id, product._id, 2);
    cartIds.push(cart._id);
    const startingStock = product.stock;
    let stockUpdateAppliedInSession = false;
    let orderWriteFailureInjected = false;
    let sessionEnded = false;

    Product.findOneAndUpdate = async function (...args) {
      const result = await originalProductUpdate.apply(Product, args);
      if (result) stockUpdateAppliedInSession = true;
      return result;
    };
    Order.create = async function () {
      assert.equal(stockUpdateAppliedInSession, true, 'controlled failure must happen after the real stock update');
      orderWriteFailureInjected = true;
      throw new Error('Controlled rollback integration-test failure.');
    };
    mongoose.startSession = async function (...args) {
      const session = await originalStartSession.apply(mongoose, args);
      const endSession = session.endSession.bind(session);
      session.endSession = async function (...endArgs) {
        sessionEnded = true;
        return endSession(...endArgs);
      };
      return session;
    };
    patched = true;

    http = await startHttpServer(app);
    const response = await checkoutRequest(http.baseUrl, tokenFor(user));
    assert.equal(response.status, 503, 'checkout should report that the controlled operation failed');
    const afterStock = await Product.findById(product._id).select('stock').lean();
    const persistedCart = await Cart.findById(cart._id).lean();
    const orderCount = await Order.countDocuments({ customerId: user._id });

    assert.equal(stockUpdateAppliedInSession, true);
    assert.equal(orderWriteFailureInjected, true);
    assert.equal(afterStock.stock, startingStock, 'stock decrement must roll back');
    assert.equal(orderCount, 0, 'failed checkout must not persist an order');
    assert.equal(persistedCart.items.length, 1, 'failed checkout must preserve the cart');
    assert.equal(sessionEnded, true, 'checkout must release the Mongoose session');
    process.stdout.write(`${JSON.stringify({
      result: 'passed against MongoDB transaction', database: target.databaseName,
      topology: target.topology.name, startingStock, stockAfterRollback: afterStock.stock,
      failedCustomerOrders: orderCount, cartItemsAfterRollback: persistedCart.items.length,
      stockUpdateReached: stockUpdateAppliedInSession, injectedOrderFailure: orderWriteFailureInjected,
      sessionEnded
    }, null, 2)}\n`);
  } catch (error) {
    if (error instanceof safety.SafetyError) {
      process.stderr.write(`Rollback test refused: ${error.message}\n`);
    } else if (error?.name === 'AssertionError') {
      process.stderr.write(`Rollback integration assertion failed: ${error.message}\n`);
    } else {
      process.stderr.write('Rollback integration test failed; database details and connection string were suppressed.\n');
    }
    process.exitCode = 1;
  } finally {
    if (patched) {
      Order.create = originalOrderCreate;
      Product.findOneAndUpdate = originalProductUpdate;
      mongoose.startSession = originalStartSession;
    }
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
