const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const safety = require('./databaseSafety');
const app = require('../app');
const Product = require('../models/Product');
const User = require('../models/User');
const Review = require('../models/Review');

// Exercise review ownership, CRUD endpoints, and the product rating aggregates.
async function main() {
  const secret = crypto.randomBytes(48).toString('hex');
  process.env.JWT_SECRET = secret;
  process.env.JWT_EXPIRES_IN = '10m';
  let server;
  let productId;
  let userId;
  let secondUserId;
  const email = `review-${crypto.randomUUID()}@example.invalid`;
  try {
    // Confirm a local replica-set target before adding synthetic test records.
    const target = await safety.connectAfterPreflight({
      mode: 'integration-test',
      argv: process.argv.slice(2),
      connect: (uri) => mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000, autoIndex: false, autoCreate: false })
    });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    safety.validateLocalReplicaSetHello(hello, target.expectedReplicaSetName);
    for (const Model of [Product, User, Review]) await Model.createIndexes();

    // Create one product and two users so ownership checks can be tested.
    const [product] = await Product.create([{
      name: 'Review integration fixture', price: 1, stock: 1, category: 'Integration'
    }]);
    productId = product._id;
    const [user, secondUser] = await User.create([
      { name: 'Review integration fixture', email, passwordHash: 'test-only-hash', role: 'customer' },
      { name: 'Review integration other user', email: `other-${email}`, passwordHash: 'test-only-hash', role: 'customer' }
    ]);
    userId = user._id;
    secondUserId = secondUser._id;

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const auth = (id) => ({ authorization: `Bearer ${jwt.sign(
      { sub: id.toString(), role: 'customer' }, secret,
      { expiresIn: '10m', issuer: 'urbankart-api', audience: 'urbankart-client' }
    )}` });
    const request = (path, { body, headers = {}, ...options } = {}) => fetch(`${base}${path}`, {
      ...options,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    // Create a review and verify that the product's average/count are recalculated.
    const createdResponse = await request('/api/reviews', {
      method: 'POST', headers: auth(userId), body: { productId: String(productId), rating: 5, text: 'integration review' }
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).review;
    let storedProduct = await Product.findById(productId).lean();
    assert.equal(storedProduct.ratingAvg, 5);
    assert.equal(storedProduct.ratingCount, 1);

    // A different user cannot edit the review; its owner can change its rating.
    const forbiddenUpdate = await request(`/api/reviews/${created._id}`, {
      method: 'PATCH', headers: auth(secondUserId), body: { rating: 1 }
    });
    assert.equal(forbiddenUpdate.status, 403);
    const updatedResponse = await request(`/api/reviews/${created._id}`, {
      method: 'PATCH', headers: auth(userId), body: { rating: 3 }
    });
    assert.equal(updatedResponse.status, 200);
    storedProduct = await Product.findById(productId).lean();
    assert.equal(storedProduct.ratingAvg, 3);
    assert.equal(storedProduct.ratingCount, 1);

    // Multiple reviews are allowed, and aggregates should include both records.
    const secondResponse = await request('/api/reviews', {
      method: 'POST', headers: auth(userId), body: { productId: String(productId), rating: 5 }
    });
    assert.equal(secondResponse.status, 201); // The existing schema/indexes do not prohibit multiple reviews.
    const secondReview = (await secondResponse.json()).review;
    storedProduct = await Product.findById(productId).lean();
    assert.equal(storedProduct.ratingAvg, 4);
    assert.equal(storedProduct.ratingCount, 2);

    // Check list/read endpoints, then remove reviews and verify aggregate reset.
    const listed = await request(`/api/reviews/product/${productId}`);
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).reviews.length, 2);
    assert.equal((await request(`/api/reviews/${created._id}`)).status, 200);
    const deleted = await request(`/api/reviews/${created._id}`, { method: 'DELETE', headers: auth(userId) });
    assert.equal(deleted.status, 200);
    storedProduct = await Product.findById(productId).lean();
    assert.equal(storedProduct.ratingAvg, 5);
    assert.equal(storedProduct.ratingCount, 1);

    assert.equal((await request(`/api/reviews/${secondReview._id}`, { method: 'DELETE', headers: auth(userId) })).status, 200);
    storedProduct = await Product.findById(productId).lean();
    assert.equal(storedProduct.ratingAvg, 0);
    assert.equal(storedProduct.ratingCount, 0);
    console.log(JSON.stringify({
      status: 'PASS', database: target.databaseName, replicaSet: hello.setName,
      endpoints: ['POST /api/reviews', 'GET /api/reviews/product/:productId', 'GET /api/reviews/:id', 'PATCH /api/reviews/:id', 'DELETE /api/reviews/:id'],
      aggregateLifecycle: '5/1 -> 3/1 -> 4/2 -> 5/1 -> 0/0', ownershipDenied: true, duplicateReviewsAllowed: true
    }));
  } finally {
    // Stop the temporary HTTP server and delete only the captured fixture records.
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState === 1) {
      if (productId) await Review.deleteMany({ productId });
      if (productId) await Product.deleteOne({ _id: productId, name: 'Review integration fixture' });
      if (userId) await User.deleteOne({ _id: userId, email });
      if (secondUserId) await User.deleteOne({ _id: secondUserId, email: `other-${email}` });
      await mongoose.disconnect();
    }
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRES_IN;
  }
}

main().catch((error) => {
  console.error(`${error?.name || 'Error'}: ${error?.message || 'Review integration test failed.'}`);
  process.exitCode = 1;
});
