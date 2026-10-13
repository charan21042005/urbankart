const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const httpClient = require('node:http');
const app = require('../app');
const safety = require('./databaseSafety');
const {
  mongoose, Product, User, Cart, Order, CheckoutOperation,
  prepareIntegration, createFixtureUser, createFixtureProduct, createFixtureCart,
  tokenFor, checkoutRequestWithKey, reconcileRequest, cleanupFixtures, startHttpServer
} = require('./checkoutIntegrationCommon');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function sendAndDiscardResponse(baseUrl, token, key) {
  const url = new URL('/api/cart/checkout', baseUrl);
  return new Promise((resolve, reject) => {
    const request = httpClient.request(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': key, 'content-length': '2' },
      timeout: 10_000
    });
    request.once('finish', () => {
      // Simulate a client that loses its connection after sending the request.
      request.destroy();
      resolve();
    });
    request.once('error', (error) => {
      if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') resolve();
      else reject(error);
    });
    request.end('{}');
  });
}

async function reconcileUntilVisible(baseUrl, token, key) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await reconcileRequest(baseUrl, token, key);
    if (response.status === 200) return response;
    assert.equal(response.status, 404, 'only an absent operation is expected while the request settles');
    await delay(100);
  }
  throw new Error('Committed checkout did not become visible through reconciliation within the test deadline.');
}

async function run() {
  let target;
  let http;
  const runId = crypto.randomUUID();
  const users = [];
  const carts = [];
  const products = [];
  const originalCartUpdate = Cart.updateOne;
  let patchedCartUpdate = false;

  async function user(index) {
    const record = await createFixtureUser(runId, index);
    users.push(record);
    return record;
  }

  async function product(stock) {
    const record = await createFixtureProduct(runId, stock);
    products.push(record);
    return record;
  }

  async function cartFor(owner, item, quantity = 1) {
    const record = await createFixtureCart(owner._id, item._id, quantity);
    carts.push(record);
    return record;
  }

  try {
    target = await prepareIntegration(process.argv.slice(2));
    const sharedProduct = await product(20);
    const firstUser = await user(1);
    const firstCart = await cartFor(firstUser, sharedProduct);
    const sharedKey = `uk-stage-h-${crypto.randomUUID()}`;
    http = await startHttpServer(app);

    const first = await checkoutRequestWithKey(http.baseUrl, tokenFor(firstUser), sharedKey);
    assert.equal(first.status, 201, 'first request should create the order');
    const firstBody = await first.json();
    const replay = await checkoutRequestWithKey(http.baseUrl, tokenFor(firstUser), sharedKey);
    assert.equal(replay.status, 200, 'same-key replay should return the original order');
    const replayBody = await replay.json();
    assert.equal(replayBody.order._id, firstBody.order._id);
    assert.equal(replayBody.replayed, true);
    const reconciliation = await reconcileRequest(http.baseUrl, tokenFor(firstUser), sharedKey);
    assert.equal(reconciliation.status, 200);
    assert.equal((await reconciliation.json()).order._id, firstBody.order._id);

    const otherUser = await user(2);
    await cartFor(otherUser, sharedProduct);
    const otherUserLookup = await reconcileRequest(http.baseUrl, tokenFor(otherUser), sharedKey);
    assert.equal(otherUserLookup.status, 404, 'a key collision must not reveal a different user order');
    const independentKeySpace = await checkoutRequestWithKey(http.baseUrl, tokenFor(otherUser), sharedKey);
    assert.equal(independentKeySpace.status, 201, 'the same key is independent for another user');

    const changedProduct = await product(5);
    await Cart.updateOne({ _id: firstCart._id, userId: firstUser._id }, {
      $set: { items: [{ productId: changedProduct._id, quantity: 1 }] }
    });
    const changedCartConflict = await checkoutRequestWithKey(http.baseUrl, tokenFor(firstUser), sharedKey);
    assert.equal(changedCartConflict.status, 409, 'same key with a changed cart must conflict');
    assert.equal((await Product.findById(changedProduct._id).select('stock').lean()).stock, 5,
      'conflict must not change stock');
    assert.equal((await Cart.findById(firstCart._id).lean()).items.length, 1,
      'conflict must preserve the changed cart');

    const insufficientUser = await user(6);
    const insufficientProduct = await product(1);
    const insufficientCart = await cartFor(insufficientUser, insufficientProduct, 2);
    const insufficientKey = `uk-stage-h-${crypto.randomUUID()}`;
    const insufficient = await checkoutRequestWithKey(http.baseUrl, tokenFor(insufficientUser), insufficientKey);
    assert.equal(insufficient.status, 409, 'insufficient stock must produce a conflict');
    assert.equal(await Order.countDocuments({ customerId: insufficientUser._id }), 0,
      'insufficient stock must not create an order');
    assert.equal((await Product.findById(insufficientProduct._id).select('stock').lean()).stock, 1,
      'insufficient stock must remain unchanged');
    assert.equal((await Cart.findById(insufficientCart._id).lean()).items.length, 1,
      'insufficient stock must preserve the cart');

    const droppedUser = await user(3);
    await cartFor(droppedUser, sharedProduct);
    const droppedKey = `uk-stage-h-${crypto.randomUUID()}`;
    await sendAndDiscardResponse(http.baseUrl, tokenFor(droppedUser), droppedKey);
    const recovered = await reconcileUntilVisible(http.baseUrl, tokenFor(droppedUser), droppedKey);
    const recoveredBody = await recovered.json();
    assert.equal(recoveredBody.status, 'success');
    assert.ok(recoveredBody.order._id, 'reconciliation returns the persisted order id');

    const racingUser = await user(4);
    const racingCart = await cartFor(racingUser, sharedProduct);
    const racingKey = `uk-stage-h-${crypto.randomUUID()}`;
    const sameKeyResponses = await Promise.all([
      checkoutRequestWithKey(http.baseUrl, tokenFor(racingUser), racingKey),
      checkoutRequestWithKey(http.baseUrl, tokenFor(racingUser), racingKey)
    ]);
    assert.deepEqual(sameKeyResponses.map((response) => response.status).sort(), [200, 201]);
    const sameKeyBodies = await Promise.all(sameKeyResponses.map((response) => response.json()));
    assert.equal(new Set(sameKeyBodies.map((body) => body.order._id)).size, 1,
      'concurrent same-key requests must converge on one order');
    assert.equal(await Order.countDocuments({ customerId: racingUser._id }), 1);
    assert.equal(await CheckoutOperation.countDocuments({ userId: racingUser._id, key: racingKey }), 1);
    assert.equal((await Cart.findById(racingCart._id).lean()).items.length, 0);

    const rollbackUser = await user(5);
    const rollbackProduct = await product(4);
    const rollbackCart = await cartFor(rollbackUser, rollbackProduct, 2);
    const rollbackKey = `uk-stage-h-${crypto.randomUUID()}`;
    Cart.updateOne = async function (...args) {
      assert.ok(args[2]?.session, 'injected failure occurs after order and operation writes inside the transaction');
      throw new Error('Controlled failure after idempotency record creation.');
    };
    patchedCartUpdate = true;
    const failed = await checkoutRequestWithKey(http.baseUrl, tokenFor(rollbackUser), rollbackKey);
    assert.equal(failed.status, 503);
    assert.equal(await Order.countDocuments({ customerId: rollbackUser._id }), 0);
    assert.equal(await CheckoutOperation.countDocuments({ userId: rollbackUser._id, key: rollbackKey }), 0);
    assert.equal((await Product.findById(rollbackProduct._id).select('stock').lean()).stock, 4);
    assert.equal((await Cart.findById(rollbackCart._id).lean()).items.length, 1);

    process.stdout.write(`${JSON.stringify({
      result: 'passed against isolated MongoDB replica-set transactions',
      database: target.databaseName,
      topology: target.topology.name,
      replay: { firstStatus: 201, replayStatus: 200, sameOrder: true },
      userScopedKey: { crossUserLookup: 404, sameKeyIndependentAcrossUsers: true },
      changedCart: { status: 409, stockUnchanged: true, cartPreserved: true },
      insufficientStock: { status: insufficient.status, orders: 0, stock: 1, cartItems: 1 },
      lostResponse: { responseDiscardedAfterRequestFlush: true, reconciliationStatus: 200 },
      concurrentSameKey: { statuses: sameKeyResponses.map((response) => response.status).sort(), orders: 1 },
      rollbackAfterOperationWrite: { status: failed.status, orders: 0, operations: 0, stock: 4, cartItems: 1 }
    }, null, 2)}\n`);
  } catch (error) {
    if (error instanceof safety.SafetyError) process.stderr.write(`Idempotency test refused: ${error.message}\n`);
    else if (error?.name === 'AssertionError') process.stderr.write(`Idempotency integration assertion failed: ${error.message}\n`);
    else process.stderr.write('Idempotency integration test failed; connection details were suppressed.\n');
    process.exitCode = 1;
  } finally {
    if (patchedCartUpdate) Cart.updateOne = originalCartUpdate;
    if (http?.server) {
      http.server.closeAllConnections();
      await new Promise((resolve) => http.server.close(resolve));
    }
    if (target) {
      try { await cleanupFixtures({ userIds: users.map((record) => record._id), productIds: products.map((record) => record._id), cartIds: carts.map((record) => record._id) }); }
      catch { process.stderr.write('Fixture cleanup was incomplete; only captured test fixture IDs were targeted.\n'); process.exitCode = 1; }
      await mongoose.disconnect().catch(() => { process.exitCode = 1; });
    }
  }
}

if (require.main === module) run();
module.exports = { run, sendAndDiscardResponse };
