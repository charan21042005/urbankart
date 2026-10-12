const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../app');
const Product = require('../models/Product');
const User = require('../models/User');
const {
  parseArguments,
  parsePrice,
  deterministicProductId,
  normalizeRow,
  upsertOperation,
  runImport
} = require('../seed/importKaggleProducts');
const { getJwtExpiresIn } = require('../middleware/auth');
const { parseProductSpecifications } = require('../seed/parseProductSpecifications');

const TEST_SECRET = 'test-only-secret-that-is-at-least-32-bytes';
let server;
let baseUrl;

before(async () => {
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.JWT_EXPIRES_IN = '1h';
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  delete process.env.JWT_SECRET;
  delete process.env.JWT_EXPIRES_IN;
});

function makeToken(role = 'customer', userId = new mongoose.Types.ObjectId().toString()) {
  return jwt.sign(
    { sub: userId, role },
    TEST_SECRET,
    { expiresIn: '1h', issuer: 'urbankart-api', audience: 'urbankart-client' }
  );
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers }
  });
}

test('health and paginated public product listing work without connecting to MongoDB', async (t) => {
  t.mock.method(Product, 'find', () => ({
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    then(resolve, reject) { return Promise.resolve([{ name: 'Sample' }]).then(resolve, reject); }
  }));
  t.mock.method(Product, 'countDocuments', async () => 23);

  const health = await request('/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'success');

  const response = await request('/api/products?page=2&limit=5');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-total-count'), '23');
  assert.equal(response.headers.get('x-page'), '2');
  assert.equal(response.headers.get('x-page-size'), '5');
  assert.deepEqual(await response.json(), [{ name: 'Sample' }]);
});

test('product list rejects malformed pagination and clamps large page sizes', async (t) => {
  t.mock.method(Product, 'find', () => ({
    sort() { return this; }, skip() { return this; }, limit(value) { this.value = value; return this; },
    then(resolve, reject) { return Promise.resolve([]).then(resolve, reject); }
  }));
  t.mock.method(Product, 'countDocuments', async () => 0);

  assert.equal((await request('/api/products?page=0')).status, 400);
  assert.equal((await request('/api/products?page=9007199254740991&limit=100')).status, 400);
  const response = await request('/api/products?limit=10000');
  assert.equal(response.headers.get('x-page-size'), '100');
});

test('product lookup validates ObjectIds and returns not found for valid missing IDs', async (t) => {
  t.mock.method(Product, 'findById', async () => null);
  assert.equal((await request('/api/products/not-an-object-id')).status, 400);
  const missing = await request(`/api/products/${new mongoose.Types.ObjectId()}`);
  assert.equal(missing.status, 404);
});

test('registration hashes passwords, ignores client role, and returns a signed token', async (t) => {
  let storedUser;
  t.mock.method(User, 'create', async (payload) => {
    storedUser = {
      ...payload,
      _id: new mongoose.Types.ObjectId(),
      role: 'customer'
    };
    return storedUser;
  });

  const response = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test User', email: 'Test@Example.com', password: 'long-password', role: 'admin' })
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(storedUser.email, 'test@example.com');
  assert.notEqual(storedUser.passwordHash, 'long-password');
  assert.equal(await bcrypt.compare('long-password', storedUser.passwordHash), true);
  assert.equal(body.user.role, 'customer');
  assert.equal(body.user.passwordHash, undefined);
  assert.equal(typeof body.token, 'string');
});

test('registration validates input and handles duplicate email keys safely', async (t) => {
  t.mock.method(User, 'create', async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
  const invalid = await request('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ name: '', email: 'bad', password: 'short' })
  });
  assert.equal(invalid.status, 400);

  const duplicate = await request('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ name: 'Test', email: 'a@example.com', password: 'long-password' })
  });
  assert.equal(duplicate.status, 409);
  assert.match((await duplicate.json()).message, /already exists/);
});

test('login verifies password hashes and returns generic credential errors', async (t) => {
  const passwordHash = await bcrypt.hash('correct-password', 4);
  const user = { _id: new mongoose.Types.ObjectId(), name: 'Test', email: 'user@example.com', role: 'customer', passwordHash };
  t.mock.method(User, 'findOne', async () => user);

  const missing = await request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: '', password: '' })
  });
  assert.equal(missing.status, 400);

  const success = await request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'USER@example.com', password: 'correct-password' })
  });
  assert.equal(success.status, 200);

  const rejected = await request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'USER@example.com', password: 'wrong-password' })
  });
  assert.equal(rejected.status, 401);
  assert.equal((await rejected.json()).message, 'Invalid email or password.');
});

test('product writes reject missing or malformed tokens and customer tokens', async (t) => {
  const create = t.mock.method(Product, 'create', async () => ({}));
  t.mock.method(User, 'findById', () => ({ select: async () => ({ role: 'customer' }) }));
  const product = { name: 'Keyboard', category: 'Electronics', price: 10 };

  assert.equal((await request('/api/products', { method: 'POST', body: JSON.stringify(product) })).status, 401);
  assert.equal((await request('/api/products', {
    method: 'POST', headers: { authorization: 'Bearer bad.token.value' }, body: JSON.stringify(product)
  })).status, 401);
  const customerResponse = await request('/api/products', {
    method: 'POST', headers: { authorization: `Bearer ${makeToken('customer')}` }, body: JSON.stringify(product)
  });
  assert.equal(customerResponse.status, 403);
  assert.equal(create.mock.callCount(), 0);
});

test('admin can create, update, and delete products with whitelisted fields', async (t) => {
  const id = new mongoose.Types.ObjectId();
  const adminHeader = { authorization: `Bearer ${makeToken('admin')}` };
  const created = { _id: id, name: 'Keyboard', category: 'Electronics', price: 10 };
  t.mock.method(User, 'findById', () => ({ select: async () => ({ role: 'admin' }) }));
  t.mock.method(Product, 'create', async (payload) => ({ ...payload, _id: id }));
  const updateDoc = {
    _id: id,
    name: 'Keyboard',
    category: 'Electronics',
    price: 10,
    async save() { return this; }
  };
  t.mock.method(Product, 'findById', async () => updateDoc);
  t.mock.method(Product, 'findByIdAndDelete', async () => created);

  const create = await request('/api/products', {
    method: 'POST', headers: adminHeader,
    body: JSON.stringify({ name: 'Keyboard', category: 'Electronics', price: 10, $set: { stock: 5 } })
  });
  assert.equal(create.status, 400);

  const createdResponse = await request('/api/products', {
    method: 'POST', headers: adminHeader,
    body: JSON.stringify({ name: 'Keyboard', category: 'Electronics', price: 10 })
  });
  assert.equal(createdResponse.status, 201);

  const updated = await request(`/api/products/${id}`, {
    method: 'PATCH', headers: adminHeader, body: JSON.stringify({ price: 12 })
  });
  assert.equal(updated.status, 200);
  assert.equal(updateDoc.price, 12);

  const deleted = await request(`/api/products/${id}`, { method: 'DELETE', headers: adminHeader });
  assert.equal(deleted.status, 200);
});

test('older admin tokens lose mutation access after demotion or account deletion', async (t) => {
  const demotedId = new mongoose.Types.ObjectId().toString();
  const deletedId = new mongoose.Types.ObjectId().toString();
  const create = t.mock.method(Product, 'create', async () => ({}));
  t.mock.method(User, 'findById', (id) => ({
    select: async () => id === demotedId ? { role: 'customer' } : null
  }));
  const product = { name: 'Keyboard', category: 'Electronics', price: 10 };

  const demoted = await request('/api/products', {
    method: 'POST', headers: { authorization: `Bearer ${makeToken('admin', demotedId)}` },
    body: JSON.stringify(product)
  });
  assert.equal(demoted.status, 403);

  const deleted = await request('/api/products', {
    method: 'POST', headers: { authorization: `Bearer ${makeToken('admin', deletedId)}` },
    body: JSON.stringify(product)
  });
  assert.equal(deleted.status, 403);
  assert.equal(create.mock.callCount(), 0);
});

test('product model enforces integer stock and key/value attributes', async () => {
  const valid = new Product({
    name: 'Test', price: 1, stock: 2, category: 'Test',
    attributes: [{ key: 'color', value: 'blue' }]
  });
  await valid.validate();

  const invalid = new Product({ name: 'Test', price: 1, stock: 1.5, category: 'Test' });
  await assert.rejects(invalid.validate(), (error) => Boolean(error.errors.stock));
});

test('CSV normalization keeps the Attribute Pattern and rejects absent or invalid prices', () => {
  assert.equal(parsePrice('379'), 379);
  assert.equal(parsePrice('0'), null);
  assert.equal(parsePrice(''), null);
  const row = {
    uniq_id: 'source-id', product_name: '  Product  ', description: '',
    product_category_tree: '["Clothing >> Women >> Tops"]', discounted_price: '379',
    brand: 'Brand',
    product_specifications: '{"product_specification"=>[{"key"=>"Color", "value"=>"Blue"}, {"value"=>"Pack of 1"}]}'
  };
  const normalized = normalizeRow(row, 0);
  assert.equal(normalized.product.name, 'Product');
  assert.equal(normalized.product.category, 'Clothing');
  assert.equal(normalized.product.stock, 0);
  assert.deepEqual(normalized.product.attributes, [
    { key: 'Color', value: 'Blue' }, { key: 'brand', value: 'Brand' }
  ]);
  assert.equal(normalizeRow({ ...row, discounted_price: '' }, 0).error, 'invalidPrice');
  assert.equal(deterministicProductId('source-id').toString(), deterministicProductId('source-id').toString());
  assert.equal(upsertOperation(normalized.product).updateOne.upsert, true);
});

test('specification parser safely accepts known values and ignores value-only entries', () => {
  assert.deepEqual(parseProductSpecifications('{"product_specification"=>[{"key"=>"Size", "value"=>"M"}, {"value"=>"Pack of 2"}]}'), {
    attributes: [{ key: 'Size', value: 'M' }], malformed: false, missingKeyValue: 1
  });
  assert.equal(parseProductSpecifications('{"product_specification"=>nil}').malformed, false);
  assert.equal(parseProductSpecifications('(()=>process.exit())()').malformed, true);
});

test('import mode requires an explicit synthetic stock policy', () => {
  assert.equal(parseArguments(['--dry-run']).import, false);
  assert.throws(() => parseArguments(['--import']), /requires --stock-default/);
  assert.equal(parseArguments(['--import', '--stock-default', '0']).stockDefault, 0);
  assert.throws(() => parseArguments(['--import', '--stock-default', '2147483648']), /BSON int32/);
});

test('JWT expiry configuration rejects zero and unsafe durations', () => {
  process.env.JWT_EXPIRES_IN = '0s';
  assert.equal(getJwtExpiresIn(), null);
  process.env.JWT_EXPIRES_IN = '9007199254740992d';
  assert.equal(getJwtExpiresIn(), null);
  process.env.JWT_EXPIRES_IN = '15m';
  assert.equal(getJwtExpiresIn(), '15m');
});

test('importer dry-run parses a CSV without connecting or writing to MongoDB', async (t) => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'urbankart-dry-run-'));
  t.after(() => fs.rm(tempDirectory, { recursive: true, force: true }));
  const csvPath = path.join(tempDirectory, 'fixture.csv');
  await fs.writeFile(csvPath, [
    'uniq_id,product_name,product_category_tree,discounted_price',
    'fixture-1,Fixture,"[""Electronics >> Audio""]",49'
  ].join('\n'));

  const connect = t.mock.method(mongoose, 'connect', async () => {
    throw new Error('Dry-run must not connect to MongoDB.');
  });
  const bulkWrite = t.mock.method(Product, 'bulkWrite', async () => {
    throw new Error('Dry-run must not write to MongoDB.');
  });
  const summary = await runImport({ csvPath });

  assert.equal(summary.totalCsvRows, 1);
  assert.equal(summary.validRows, 1);
  assert.equal(summary.newlyImported, 0);
  assert.equal(summary.failedWrites, 0);
  assert.equal(connect.mock.callCount(), 0);
  assert.equal(bulkWrite.mock.callCount(), 0);
});
