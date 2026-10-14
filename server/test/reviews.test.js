const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../app');
const Review = require('../models/Review');
const Product = require('../models/Product');
const User = require('../models/User');

const SECRET = 'review-route-tests-use-this-secret-over-32-bytes';
const authorId = new mongoose.Types.ObjectId();
let server;
let baseUrl;

before(async () => {
  process.env.JWT_SECRET = SECRET;
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  delete process.env.JWT_SECRET;
});

const token = (id = authorId) => jwt.sign(
  { sub: id.toString(), role: 'customer' }, SECRET,
  { expiresIn: '1h', issuer: 'urbankart-api', audience: 'urbankart-client' }
);

async function request(path, { body, headers = {}, ...options } = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

function mockStore(t, { productsExist = true, initialReviews = [] } = {}) {
  const reviews = initialReviews;
  const summaries = new Map();
  const currentUser = { _id: authorId, role: 'customer', isActive: true };
  t.mock.method(User, 'findById', () => ({ select: async () => currentUser }));
  t.mock.method(Product, 'exists', async () => productsExist ? { _id: new mongoose.Types.ObjectId() } : null);
  t.mock.method(Product, 'updateOne', async (filter, update) => {
    summaries.set(String(filter._id), update.$set);
    return { acknowledged: true, modifiedCount: 1 };
  });
  t.mock.method(Review, 'create', async ([payload]) => {
    const review = { ...payload, _id: new mongoose.Types.ObjectId(), createdAt: new Date(), updatedAt: new Date() };
    reviews.push(review);
    return [review];
  });
  t.mock.method(Review, 'findById', (id) => ({ lean: async () => reviews.find((review) => String(review._id) === String(id)) || null }));
  t.mock.method(Review, 'find', () => ({
    sort() { return this; }, skip() { return this; }, limit() { return this; },
    lean: async () => [...reviews]
  }));
  t.mock.method(Review, 'countDocuments', async () => reviews.length);
  t.mock.method(Review, 'findOne', (filter) => ({
    session() {
      const review = reviews.find((item) => String(item._id) === String(filter._id) && String(item.userId) === String(filter.userId));
      if (!review) return null;
      review.save = async () => { review.updatedAt = new Date(); return review; };
      return review;
    }
  }));
  t.mock.method(Review, 'findOneAndDelete', async (filter) => {
    const index = reviews.findIndex((item) => String(item._id) === String(filter._id) && String(item.userId) === String(filter.userId));
    return index < 0 ? null : reviews.splice(index, 1)[0];
  });
  t.mock.method(Review, 'aggregate', () => ({
    session: async () => {
      if (!reviews.length) return [];
      return [{ ratingAvg: reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length, ratingCount: reviews.length }];
    }
  }));
  t.mock.method(mongoose, 'startSession', async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {}
  }));
  return { reviews, summaries };
}

test('review CRUD lifecycle updates product aggregates and lists by product', async (t) => {
  const { reviews, summaries } = mockStore(t);
  const headers = { authorization: `Bearer ${token()}` };
  const productId = new mongoose.Types.ObjectId().toString();

  assert.equal((await request('/api/reviews', { method: 'POST', headers, body: { productId, rating: 5, text: '  Excellent  ' } })).status, 201);
  assert.equal(reviews[0].text, 'Excellent');
  assert.equal(String(reviews[0].userId), authorId.toString());
  assert.deepEqual(summaries.get(productId), { ratingAvg: 5, ratingCount: 1 });

  const list = await request(`/api/reviews/product/${productId}`);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).reviews.length, 1);
  assert.equal((await request(`/api/reviews/${reviews[0]._id}`)).status, 200);

  const update = await request(`/api/reviews/${reviews[0]._id}`, { method: 'PATCH', headers, body: { rating: 3, text: 'Updated' } });
  assert.equal(update.status, 200);
  assert.deepEqual(summaries.get(productId), { ratingAvg: 3, ratingCount: 1 });

  const remove = await request(`/api/reviews/${reviews[0]._id}`, { method: 'DELETE', headers });
  assert.equal(remove.status, 200);
  assert.equal(reviews.length, 0);
  assert.deepEqual(summaries.get(productId), { ratingAvg: 0, ratingCount: 0 });
});

test('review routes validate ids, required fields, rating, comments, and product existence', async (t) => {
  mockStore(t, { productsExist: false });
  const headers = { authorization: `Bearer ${token()}` };
  assert.equal((await request('/api/reviews/nope')).status, 400);
  assert.equal((await request('/api/reviews/product/nope')).status, 400);
  assert.equal((await request('/api/reviews', { method: 'POST', headers, body: {} })).status, 400);
  assert.equal((await request('/api/reviews', { method: 'POST', headers, body: { productId: new mongoose.Types.ObjectId(), rating: 6 } })).status, 400);
  assert.equal((await request('/api/reviews', { method: 'POST', headers, body: { productId: new mongoose.Types.ObjectId(), rating: 4.5 } })).status, 400);
  assert.equal((await request('/api/reviews', { method: 'POST', headers, body: { productId: new mongoose.Types.ObjectId(), rating: 4, userId: new mongoose.Types.ObjectId() } })).status, 400);
  assert.equal((await request('/api/reviews', { method: 'POST', headers, body: { productId: new mongoose.Types.ObjectId(), rating: 4, text: 'x'.repeat(4001) } })).status, 400);
  assert.equal((await request('/api/reviews', { method: 'POST', headers, body: { productId: new mongoose.Types.ObjectId(), rating: 4, text: 123 } })).status, 400);
  const missingProduct = await request('/api/reviews', { method: 'POST', headers, body: { productId: new mongoose.Types.ObjectId(), rating: 4 } });
  assert.equal(missingProduct.status, 404);
  const missingReviewId = new mongoose.Types.ObjectId();
  const missingReview = await request(`/api/reviews/${missingReviewId}`);
  assert.equal(missingReview.status, 404);
  assert.equal((await request(`/api/reviews/${missingReviewId}`, { method: 'PATCH', headers, body: { rating: 3 } })).status, 404);
  assert.equal((await request(`/api/reviews/${missingReviewId}`, { method: 'DELETE', headers })).status, 404);
});

test('review mutations require authentication and only the author may update or delete', async (t) => {
  const foreignId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  mockStore(t, { initialReviews: [{ _id: foreignId, productId, userId: new mongoose.Types.ObjectId(), rating: 4 }] });
  assert.equal((await request('/api/reviews', { method: 'POST', body: { productId: productId.toString(), rating: 4 } })).status, 401);
  assert.equal((await request(`/api/reviews/${foreignId}`, { method: 'PATCH', body: { rating: 2 } })).status, 401);
  assert.equal((await request(`/api/reviews/${foreignId}`, { method: 'DELETE' })).status, 401);
  const headers = { authorization: `Bearer ${token()}` };
  assert.equal((await request(`/api/reviews/${foreignId}`, { method: 'PATCH', headers, body: { rating: 2 } })).status, 403);
  assert.equal((await request(`/api/reviews/${foreignId}`, { method: 'DELETE', headers })).status, 403);
});
