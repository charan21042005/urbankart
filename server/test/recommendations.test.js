const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Recommendation = require('../models/Recommendation');
const app = require('../app');
const { similarityScore } = require('../jobs/similarityScorer');
const { recomputeRecommendations, rankRecommendations, buildCandidateIndexes, MIN_RELEVANCE_SCORE } = require('../jobs/computeRecommendations');
const { startRecommendationJob, stopRecommendationJob } = require('../jobs/recommendationScheduler');

const secret = 'day-five-unit-test-secret-with-at-least-32-bytes';
let server;
let baseUrl;

test('recommendation API and scheduler test server starts', async () => {
  process.env.JWT_SECRET = secret;
  process.env.JWT_EXPIRES_IN = '1h';
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test('scorer normalizes unique typed features and explains weighted Jaccard plus category bonus', () => {
  const source = {
    _id: new mongoose.Types.ObjectId(), category: '  Electronics ',
    tags: [' Wireless ', 'Mechanical', 'WIRELESS'],
    attributes: [{ key: ' Switch ', value: ' Blue ' }, { key: 'switch', value: 'blue' }]
  };
  const candidate = {
    _id: new mongoose.Types.ObjectId(), category: 'electronics',
    tags: ['wireless', 'gaming'],
    attributes: [{ key: 'switch', value: 'blue' }, { key: 'layout', value: 'US' }]
  };
  const result = similarityScore(source, candidate);
  // Shared wireless + switch=blue over five unique typed features, plus category bonus.
  assert.equal(result.score, 0.6);
  assert.deepEqual(result.sharedTags, ['Wireless']);
  assert.deepEqual(result.sharedAttributes, [{ key: 'Switch', value: 'Blue' }]);
  assert.equal(result.categoryMatch, true);
  assert.equal(result.categoryBonus, 0.2);
  assert.equal(result.sharedFeatureCount, 2);
  assert.equal(result.unionFeatureCount, 5);
  assert.ok(result.score >= 0 && result.score <= 1);
});

test('scorer handles category-only overlap, empty and malformed features without NaN', () => {
  assert.deepEqual(similarityScore({ category: 'Home' }, { category: 'home' }), {
    score: 0.2, sharedTags: [], sharedAttributes: [], categoryMatch: true,
    categoryBonus: 0.2, sharedFeatureCount: 0, unionFeatureCount: 0, sameProduct: false
  });
  const empty = similarityScore({ tags: null, attributes: ['x'] }, { tags: [], attributes: [{ key: {}, value: 'x' }] });
  assert.equal(empty.score, 0);
  assert.ok(Number.isFinite(empty.score));
  assert.equal(similarityScore({ _id: 'same', tags: ['x'] }, { _id: 'same', tags: ['x'] }).sameProduct, true);
});

test('ranking excludes self, filters zero-score candidates, caps at five and breaks ties by stable id', () => {
  const source = { _id: new mongoose.Types.ObjectId('000000000000000000000001'), category: 'Home', tags: ['linen'] };
  const candidates = [source, ...Array.from({ length: 7 }, (_, index) => ({
    _id: new mongoose.Types.ObjectId((index + 2).toString(16).padStart(24, '0')),
    category: 'Home', tags: ['linen']
  })), { _id: new mongoose.Types.ObjectId('00000000000000000000000a'), category: 'Other', tags: [] }];
  const indexes = buildCandidateIndexes(candidates);
  const ranked = rankRecommendations(source, candidates, indexes);
  assert.equal(ranked.length, 5);
  assert.ok(ranked.every((item) => !item.productId.equals(source._id) && item.score === 1));
  assert.deepEqual(ranked.map((item) => String(item.productId)), [
    '000000000000000000000002', '000000000000000000000003', '000000000000000000000004',
    '000000000000000000000005', '000000000000000000000006'
  ]);
  assert.equal(MIN_RELEVANCE_SCORE, 0.2);
});

test('recompute persists explained top results and removes stale source caches after a full pass', async () => {
  const products = [
    { _id: new mongoose.Types.ObjectId('000000000000000000000101'), category: 'Tech', tags: ['quiet', 'wireless'], attributes: [{ key: 'switch', value: 'blue' }] },
    { _id: new mongoose.Types.ObjectId('000000000000000000000102'), category: 'Tech', tags: ['wireless'], attributes: [{ key: 'switch', value: 'blue' }] },
    { _id: new mongoose.Types.ObjectId('000000000000000000000103'), category: 'Other', tags: [], attributes: [] }
  ];
  const writes = [];
  const deletions = [];
  const ProductModel = { find: () => ({ select() { return this; }, lean: async () => products }) };
  const RecommendationModel = {
    bulkWrite: async (batch) => { writes.push(...batch); return { upsertedCount: batch.length }; },
    deleteMany: async (filter) => { deletions.push(filter); return { deletedCount: 2 }; }
  };
  const computedAt = new Date('2026-10-14T00:00:00.000Z');
  const result = await recomputeRecommendations({ ProductModel, RecommendationModel, now: () => computedAt, batchSize: 1 });
  assert.equal(result.productsProcessed, 3);
  assert.equal(result.recommendationsStored, 2);
  assert.equal(result.staleCacheDocumentsRemoved, 2);
  assert.equal(writes.length, 3);
  const related = writes[0].updateOne.update.$set.relatedProducts[0];
  assert.ok(related.productId);
  assert.ok(related.score > 0);
  assert.deepEqual(related.sharedTags, ['wireless']);
  assert.deepEqual(related.sharedAttributes, [{ key: 'switch', value: 'blue' }]);
  assert.ok(related.categoryMatch);
  assert.ok(deletions[0].productId.$nin.length === 3);
});

test('a failed cache bulk refresh invalidates partial derived results; a failed catalogue read writes nothing', async () => {
  const products = [{ _id: new mongoose.Types.ObjectId(), category: 'Home', tags: [] }];
  const ProductModel = { find: () => ({ select() { return this; }, lean: async () => products }) };
  let invalidated = false;
  const failedWrite = {
    bulkWrite: async () => { throw new Error('write failed'); },
    deleteMany: async (filter) => { invalidated = Object.keys(filter).length === 0; }
  };
  await assert.rejects(recomputeRecommendations({ ProductModel, RecommendationModel: failedWrite }), /write failed/);
  assert.equal(invalidated, true);
  let wrote = false;
  const failedRead = { find: () => ({ select() { return this; }, lean: async () => { throw new Error('read failed'); } }) };
  await assert.rejects(recomputeRecommendations({ ProductModel: failedRead, RecommendationModel: {
    bulkWrite: async () => { wrote = true; }, deleteMany: async () => { wrote = true; }
  } }), /read failed/);
  assert.equal(wrote, false);
});

test('nightly scheduler registers once, uses the configured timezone and prevents overlapping work', async (t) => {
  stopRecommendationJob();
  let task;
  let starts = 0;
  let resolveRun;
  const events = [];
  const fakeCron = {
    validate: (expression) => expression === '0 2 * * *',
    schedule: (expression, callback, options) => {
      events.push({ expression, options }); task = callback; return { stop() {} };
    }
  };
  const start = () => startRecommendationJob({ cronLibrary: fakeCron, recompute: () => {
    starts += 1; return new Promise((resolve) => { resolveRun = resolve; });
  }, logger: { info() {}, warn: (message) => events.push(message), error() {} } });
  const first = start();
  assert.equal(start(), first);
  const active = task();
  const overlapping = task();
  assert.equal(starts, 1);
  assert.match(events[1], /still active/);
  resolveRun({ productsProcessed: 2 });
  await active;
  await overlapping;
  assert.equal(events[0].options.timezone, 'Asia/Kolkata');
  stopRecommendationJob();
  t.after(() => { stopRecommendationJob(); delete process.env.JWT_SECRET; delete process.env.JWT_EXPIRES_IN; });
});

test('recommendation API returns explainable cached products in ranking order and falls back when cache is stale', async (t) => {
  const sourceId = new mongoose.Types.ObjectId();
  const firstId = new mongoose.Types.ObjectId();
  const secondId = new mongoose.Types.ObjectId();
  const source = { _id: sourceId, category: 'Home', name: 'Source' };
  const sourceQuery = { lean: async () => source };
  t.mock.method(Product, 'findById', () => sourceQuery);
  t.mock.method(Recommendation, 'findOne', () => ({ lean: async () => ({
    computedAt: new Date(), relatedProducts: [
      { productId: secondId, score: 0.7, sharedTags: ['linen'], categoryMatch: false },
      { productId: firstId, score: 0.9, sharedAttributes: [{ key: 'material', value: 'cotton' }], categoryMatch: true, categoryBonus: 0.2 },
      { productId: sourceId, score: 1, categoryMatch: true }
    ]
  }) }));
  t.mock.method(Product, 'find', (filter) => ({
    lean: async () => filter._id.$in.map((id) => ({ _id: id, name: String(id) }))
  }));
  const response = await fetch(`${baseUrl}/api/products/${sourceId}/recommendations`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.source, 'recommendation-engine');
  assert.deepEqual(body.items.map((item) => item.score), [0.7, 0.9]);
  assert.deepEqual(body.items[0].explanation.sharedTags, ['linen']);
  assert.deepEqual(body.items[1].explanation.sharedAttributes, [{ key: 'material', value: 'cotton' }]);
});

test('recommendation API validates IDs, reports missing sources, uses category fallback and returns 500 on database failure', async (t) => {
  let source = { _id: new mongoose.Types.ObjectId(), category: 'Home' };
  let cacheFailure = false;
  t.mock.method(Product, 'findById', () => ({ lean: async () => source }));
  t.mock.method(Recommendation, 'findOne', () => ({ lean: async () => {
    if (cacheFailure) throw new Error('db failed');
    return null;
  } }));
  t.mock.method(Product, 'find', () => ({
    sort(value) { assert.deepEqual(value, { ratingAvg: -1, ratingCount: -1, _id: 1 }); return this; },
    limit(value) { assert.equal(value, 5); return this; },
    lean: async () => [{ _id: new mongoose.Types.ObjectId(), ratingAvg: 4.8 }]
  }));
  assert.equal((await fetch(`${baseUrl}/api/products/bad-id/recommendations`)).status, 400);
  const fallback = await fetch(`${baseUrl}/api/products/${source._id}/recommendations`);
  const fallbackBody = await fallback.json();
  assert.equal(fallbackBody.source, 'fallback');
  assert.equal(fallbackBody.items[0].score, null);
  assert.equal(fallbackBody.items[0].explanation.type, 'same-category-rating-fallback');
  source = null;
  assert.equal((await fetch(`${baseUrl}/api/products/${new mongoose.Types.ObjectId()}/recommendations`)).status, 404);
  cacheFailure = true;
  source = { _id: new mongoose.Types.ObjectId(), category: 'Home' };
  assert.equal((await fetch(`${baseUrl}/api/products/${source._id}/recommendations`)).status, 500);
});

test('recommendation test server closes', async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  delete process.env.JWT_SECRET;
  delete process.env.JWT_EXPIRES_IN;
});
