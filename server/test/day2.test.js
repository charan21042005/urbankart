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
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const CheckoutOperation = require('../models/CheckoutOperation');
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

function mockCartQuery(t, getCart) {
  t.mock.method(Cart, 'findOne', () => ({
    lean: async () => getCart(),
    session: async () => getCart()
  }));
}

function mockOperationLookup(t, getOperation = () => null) {
  t.mock.method(CheckoutOperation, 'findOne', () => ({
    populate() { return this; },
    lean: async () => getOperation()
  }));
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

test('catalog search uses the indexed text contract and validates sort options', async (t) => {
  let observedFilter;
  let observedSort;
  t.mock.method(Product, 'find', (filter) => {
    observedFilter = filter;
    return { sort(value) { observedSort = value; return this; }, skip() { return this; }, limit() { return this; }, then(resolve, reject) { return Promise.resolve([]).then(resolve, reject); } };
  });
  t.mock.method(Product, 'countDocuments', async () => 0);
  const response = await request('/api/products?search=wireless%20keyboard&category=Electronics&sort=price-asc');
  assert.equal(response.status, 200);
  assert.deepEqual(observedFilter, { category: 'Electronics', $text: { $search: 'wireless keyboard' } });
  assert.deepEqual(observedSort, { price: 1, score: { $meta: 'textScore' }, _id: 1 });
  assert.equal((await request('/api/products?sort=drop-table')).status, 400);
});

test('catalog categories are read from the current database contents', async (t) => {
  t.mock.method(Product, 'distinct', async (field) => {
    assert.equal(field, 'category');
    return ['Home', 'Electronics', 'Home', null];
  });
  const response = await request('/api/products/categories');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), ['Electronics', 'Home']);
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

  user.isActive = false;
  const closedAccount = await request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'USER@example.com', password: 'correct-password' })
  });
  assert.equal(closedAccount.status, 401);
});

test('customers can read and update only their public profile fields', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const current = { _id: userId, name: 'Before', email: 'profile@example.test', role: 'customer', passwordHash: 'must-not-leak', async save() { return this; } };
  t.mock.method(User, 'findById', () => ({ select: async () => current }));
  const headers = { authorization: `Bearer ${makeToken('customer', userId.toString())}` };
  const read = await request('/api/users/me', { headers });
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), { id: userId.toString(), name: 'Before', email: 'profile@example.test', role: 'customer' });
  assert.equal((await request('/api/users/me', { method: 'PATCH', headers, body: JSON.stringify({ role: 'admin' }) })).status, 400);
  const updated = await request('/api/users/me', { method: 'PATCH', headers, body: JSON.stringify({ name: 'After' }) });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).name, 'After');
  assert.equal((await request('/api/users/me')).status, 401);
});

test('customer management routes require a current database admin role', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: userId, role: 'customer', isActive: true }) }));
  const customerHeaders = { authorization: `Bearer ${makeToken('admin', userId.toString())}` };
  assert.equal((await request('/api/users')).status, 401);
  assert.equal((await request('/api/users', { headers: customerHeaders })).status, 403);
});

test('admin customer creation always creates a customer and never returns its password hash', async (t) => {
  const adminId = new mongoose.Types.ObjectId();
  const adminHeaders = { authorization: `Bearer ${makeToken('admin', adminId.toString())}` };
  let created;
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: adminId, role: 'admin', isActive: true }) }));
  const create = t.mock.method(User, 'create', async (payload) => {
    created = { ...payload, _id: new mongoose.Types.ObjectId(), isActive: true };
    return created;
  });

  const escalation = await request('/api/users', {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ name: 'New User', email: 'new@example.test', password: 'long-password', role: 'admin' })
  });
  assert.equal(escalation.status, 400);
  assert.equal(create.mock.callCount(), 0);

  const response = await request('/api/users', {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ name: ' New User ', email: 'NEW@example.test', password: 'long-password' })
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(created.role, 'customer');
  assert.equal(created.name, 'New User');
  assert.equal(created.email, 'new@example.test');
  assert.equal(await bcrypt.compare('long-password', created.passwordHash), true);
  assert.equal(body.user.passwordHash, undefined);
});

test('admin customer listing and lookup return only safe customer fields', async (t) => {
  const adminId = new mongoose.Types.ObjectId();
  const customerId = new mongoose.Types.ObjectId();
  const adminHeaders = { authorization: `Bearer ${makeToken('admin', adminId.toString())}` };
  const customer = { _id: customerId, name: 'Customer', email: 'customer@example.test', role: 'customer', isActive: true, passwordHash: 'never-return' };
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: adminId, role: 'admin', isActive: true }) }));
  t.mock.method(User, 'find', () => ({
    select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; },
    lean: async () => [customer]
  }));
  t.mock.method(User, 'countDocuments', async () => 1);
  t.mock.method(User, 'findOne', () => ({
    select() { return this; }, lean: async () => customer
  }));

  const list = await request('/api/users?page=1&limit=10', { headers: adminHeaders });
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).users[0], {
    id: customerId.toString(), name: 'Customer', email: 'customer@example.test', role: 'customer', isActive: true
  });
  assert.equal((await request('/api/users/not-an-id', { headers: adminHeaders })).status, 400);
  const read = await request(`/api/users/${customerId}`, { headers: adminHeaders });
  assert.equal(read.status, 200);
  assert.equal((await read.json()).user.passwordHash, undefined);
});

test('admin can update customer profile fields but cannot change roles or account state', async (t) => {
  const adminId = new mongoose.Types.ObjectId();
  const customerId = new mongoose.Types.ObjectId();
  const adminHeaders = { authorization: `Bearer ${makeToken('admin', adminId.toString())}` };
  const customer = {
    _id: customerId, name: 'Before', email: 'before@example.test', role: 'customer', isActive: true,
    async save() { return this; }
  };
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: adminId, role: 'admin', isActive: true }) }));
  const findOne = t.mock.method(User, 'findOne', async () => customer);
  const forbidden = await request(`/api/users/${customerId}`, {
    method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ role: 'admin' })
  });
  assert.equal(forbidden.status, 400);
  assert.equal(findOne.mock.callCount(), 0);
  const updated = await request(`/api/users/${customerId}`, {
    method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ name: 'After' })
  });
  assert.equal(updated.status, 200);
  assert.equal(customer.name, 'After');
  assert.equal(customer.role, 'customer');
});

test('admin customer deletion anonymizes and deactivates while retaining the original user ID', async (t) => {
  const adminId = new mongoose.Types.ObjectId();
  const customerId = new mongoose.Types.ObjectId();
  const adminHeaders = { authorization: `Bearer ${makeToken('admin', adminId.toString())}` };
  const customer = {
    _id: customerId, name: 'Customer', email: 'customer@example.test', role: 'customer',
    passwordHash: 'old-hash', isActive: true, async save() { return this; }
  };
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: adminId, role: 'admin', isActive: true }) }));
  t.mock.method(User, 'findOne', async () => customer);
  t.mock.method(bcrypt, 'hash', async () => 'replacement-hash');
  const response = await request(`/api/users/${customerId}`, { method: 'DELETE', headers: adminHeaders });
  assert.equal(response.status, 200);
  assert.equal(customer._id, customerId);
  assert.equal(customer.name, 'Deleted account');
  assert.equal(customer.email, `deleted-${customerId}@urbankart.invalid`);
  assert.equal(customer.passwordHash, 'replacement-hash');
  assert.equal(customer.isActive, false);
});

test('customers can close only their own account and the tombstone blocks old tokens', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const current = {
    _id: userId, name: 'Before', email: 'close@example.test', role: 'customer',
    passwordHash: 'old-hash', isActive: true, async save() { return this; }
  };
  t.mock.method(User, 'findById', () => ({ select: async () => current }));
  const headers = { authorization: `Bearer ${makeToken('customer', userId.toString())}` };

  assert.equal((await request('/api/users/me', { method: 'DELETE' })).status, 401);
  assert.equal((await request(`/api/users/${new mongoose.Types.ObjectId()}`, { method: 'DELETE', headers })).status, 403);
  assert.equal(current.isActive, true, 'customers cannot use the administrator customer-management route');
  const closed = await request('/api/users/me', { method: 'DELETE', headers });
  assert.equal(closed.status, 200);
  assert.equal(current.name, 'Deleted account');
  assert.equal(current.email, `deleted-${userId.toString()}@urbankart.invalid`);
  assert.notEqual(current.passwordHash, 'old-hash');
  assert.equal(current.isActive, false);
  assert.equal((await request('/api/users/me', { headers })).status, 401);
  assert.equal((await request('/api/users/me', { method: 'DELETE', headers })).status, 401);
});

test('administrator self-service account closure is rejected without mutation', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const current = {
    _id: userId, name: 'Admin', email: 'admin@example.test', role: 'admin', isActive: true,
    async save() { throw new Error('must not save'); }
  };
  t.mock.method(User, 'findById', () => ({ select: async () => current }));
  const response = await request('/api/users/me', {
    method: 'DELETE', headers: { authorization: `Bearer ${makeToken('admin', userId.toString())}` }
  });
  assert.equal(response.status, 409);
  assert.equal(current.isActive, true);
  assert.equal(current.email, 'admin@example.test');
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
  assert.equal(deleted.status, 401);
  assert.equal(create.mock.callCount(), 0);
});

test('admin mutations fail closed when the current-user lookup fails', async (t) => {
  const create = t.mock.method(Product, 'create', async () => ({}));
  t.mock.method(User, 'findById', () => ({ select: async () => { throw new Error('database unavailable'); } }));
  const response = await request('/api/products', {
    method: 'POST',
    headers: { authorization: `Bearer ${makeToken('admin')}` },
    body: JSON.stringify({ name: 'Keyboard', category: 'Electronics', price: 10 })
  });
  assert.equal(response.status, 503);
  assert.equal(create.mock.callCount(), 0);
});

test('authenticated cart operations validate quantities and current stock', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  let cart;
  t.mock.method(User, 'findById', () => ({ select: async () => ({ role: 'customer' }) }));
  t.mock.method(Product, 'findById', async () => ({ _id: productId, stock: 3 }));
  t.mock.method(Cart, 'findOne', async (filter) => {
    assert.equal(String(filter.userId), userId.toString());
    return cart || null;
  });
  t.mock.method(Cart.prototype, 'save', async function save() { cart = this; return this; });
  const headers = { authorization: `Bearer ${makeToken('customer', userId.toString())}` };

  const invalid = await request('/api/cart/items', {
    method: 'POST', headers, body: JSON.stringify({ productId: productId.toString(), quantity: 0 })
  });
  assert.equal(invalid.status, 400);

  const added = await request('/api/cart/items', {
    method: 'POST', headers, body: JSON.stringify({ productId: productId.toString(), quantity: 2, price: 0.01, userId: new mongoose.Types.ObjectId().toString() })
  });
  assert.equal(added.status, 201);
  assert.equal((await added.json()).items[0].quantity, 2);

  const tooMany = await request('/api/cart/items', {
    method: 'POST', headers, body: JSON.stringify({ productId: productId.toString(), quantity: 2 })
  });
  assert.equal(tooMany.status, 409);
});

test('cart add rejects invalid IDs and missing products', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const validId = new mongoose.Types.ObjectId();
  const productLookup = t.mock.method(Product, 'findById', async () => null);
  t.mock.method(User, 'findById', () => ({ select: async () => ({ role: 'customer' }) }));
  const headers = { authorization: `Bearer ${makeToken('customer', userId.toString())}` };

  const invalid = await request('/api/cart/items', {
    method: 'POST', headers, body: JSON.stringify({ productId: 'bad-id', quantity: 1 })
  });
  assert.equal(invalid.status, 400);
  assert.equal(productLookup.mock.callCount(), 0);

  const missing = await request('/api/cart/items', {
    method: 'POST', headers, body: JSON.stringify({ productId: validId.toString(), quantity: 1 })
  });
  assert.equal(missing.status, 404);
  assert.equal(productLookup.mock.callCount(), 1);
});

test('checkout prices from products, snapshots items, decrements stock and clears the cart in one transaction', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  const cart = { _id: new mongoose.Types.ObjectId(), userId, items: [{ productId, quantity: 2 }] };
  let transactionCalls = 0;
  let orderCalls = 0;
  const session = {
    async withTransaction(callback) { transactionCalls += 1; return callback(); },
    async endSession() {}
  };
  t.mock.method(User, 'findById', () => ({ select: async () => ({ role: 'customer' }) }));
  mockOperationLookup(t);
  t.mock.method(mongoose, 'startSession', async () => session);
  mockCartQuery(t, () => cart);
  t.mock.method(Product, 'findOneAndUpdate', async (filter, update, options) => {
    assert.equal(filter.stock.$gte, 2);
    assert.equal(update.$inc.stock, -2);
    assert.equal(options.session, session);
    return { _id: productId, name: 'Speaker', price: 12.99 };
  });
  t.mock.method(Order, 'create', async (documents, options) => {
    orderCalls += 1;
    assert.equal(options.session, session);
    return [{ ...documents[0], _id: new mongoose.Types.ObjectId() }];
  });
  t.mock.method(CheckoutOperation, 'create', async (documents, options) => {
    assert.equal(options.session, session);
    return [{ ...documents[0], _id: new mongoose.Types.ObjectId(), toObject() { return this; } }];
  });
  t.mock.method(Cart, 'updateOne', async (filter, update, options) => {
    assert.equal(options.session, session);
    assert.deepEqual(update, { $set: { items: [] } });
    cart.items = [];
    return { matchedCount: 1 };
  });
  const headers = { authorization: `Bearer ${makeToken('customer', userId.toString())}` };
  headers['Idempotency-Key'] = 'checkout-attempt-0001';

  const response = await request('/api/cart/checkout', {
    method: 'POST', headers,
    body: JSON.stringify({ totalAmount: 0, price: 0.01 })
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.order.totalAmount, 25.98);
  assert.deepEqual(body.order.items, [{ productId: productId.toString(), nameAtPurchase: 'Speaker', priceAtPurchase: 12.99, qty: 2 }]);
  assert.equal(transactionCalls, 1);
  assert.equal(orderCalls, 1);
  assert.deepEqual(cart.items, []);
});

test('checkout rejects empty carts and insufficient stock before creating an order', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  let cart = { _id: new mongoose.Types.ObjectId(), userId, items: [{ productId, quantity: 2 }] };
  let orderCalls = 0;
  const session = { async withTransaction(callback) { return callback(); }, async endSession() {} };
  t.mock.method(User, 'findById', () => ({ select: async () => ({ role: 'customer' }) }));
  mockOperationLookup(t);
  t.mock.method(mongoose, 'startSession', async () => session);
  mockCartQuery(t, () => cart);
  t.mock.method(Product, 'findOneAndUpdate', async () => null);
  t.mock.method(Order, 'create', async () => { orderCalls += 1; return []; });
  t.mock.method(Cart, 'updateOne', async () => ({ matchedCount: 1 }));
  const headers = { authorization: `Bearer ${makeToken('customer', userId.toString())}`, 'Idempotency-Key': 'checkout-attempt-0002' };

  const insufficient = await request('/api/cart/checkout', { method: 'POST', headers, body: '{}' });
  assert.equal(insufficient.status, 409);
  assert.equal(orderCalls, 0);

  cart = { ...cart, items: [] };
  const duplicateAfterCartClear = await request('/api/cart/checkout', { method: 'POST', headers, body: '{}' });
  assert.equal(duplicateAfterCartClear.status, 409);
  assert.equal(orderCalls, 0);
});

test('simultaneous checkout requests produce at most one order for the same cart', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  let cart = { _id: new mongoose.Types.ObjectId(), userId, items: [{ productId, quantity: 1 }] };
  let stock = 1;
  let orders = 0;
  let transactionQueue = Promise.resolve();
  t.mock.method(User, 'findById', () => ({ select: async () => ({ role: 'customer' }) }));
  mockOperationLookup(t);
  t.mock.method(mongoose, 'startSession', async () => ({
    async withTransaction(callback) {
      const previous = transactionQueue;
      let release;
      transactionQueue = new Promise((resolve) => { release = resolve; });
      await previous;
      try { return await callback(); } finally { release(); }
    },
    async endSession() {}
  }));
  mockCartQuery(t, () => cart);
  t.mock.method(Product, 'findOneAndUpdate', async (filter) => {
    if (stock < filter.stock.$gte) return null;
    stock -= filter.stock.$gte;
    return { _id: productId, name: 'Cable', price: 5 };
  });
  t.mock.method(Order, 'create', async (documents) => {
    orders += 1;
    return [{ ...documents[0], _id: new mongoose.Types.ObjectId() }];
  });
  t.mock.method(CheckoutOperation, 'create', async (documents) => [{ ...documents[0], _id: new mongoose.Types.ObjectId(), toObject() { return this; } }]);
  t.mock.method(Cart, 'updateOne', async () => { cart.items = []; return { matchedCount: 1 }; });
  const headers = { authorization: `Bearer ${makeToken('customer', userId.toString())}`, 'Idempotency-Key': 'checkout-attempt-race-01' };
  const checkout = () => request('/api/cart/checkout', { method: 'POST', headers, body: '{}' });

  const responses = await Promise.all([checkout(), checkout()]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(orders, 1);
  assert.equal(stock, 0);
  assert.deepEqual(cart.items, []);
});

test('checkout does not clear the cart when order creation fails', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  const cart = { _id: new mongoose.Types.ObjectId(), userId, items: [{ productId, quantity: 1 }] };
  const session = { async withTransaction(callback) { return callback(); }, async endSession() {} };
  const clear = t.mock.method(Cart, 'updateOne', async () => ({ matchedCount: 1 }));
  t.mock.method(User, 'findById', () => ({ select: async () => ({ role: 'customer' }) }));
  mockOperationLookup(t);
  t.mock.method(mongoose, 'startSession', async () => session);
  mockCartQuery(t, () => cart);
  t.mock.method(Product, 'findOneAndUpdate', async () => ({ _id: productId, name: 'Cable', price: 5 }));
  t.mock.method(Order, 'create', async () => { throw new Error('simulated order write failure'); });
  const headers = { authorization: `Bearer ${makeToken('customer', userId.toString())}`, 'Idempotency-Key': 'checkout-attempt-fail-01' };

  const response = await request('/api/cart/checkout', { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 503);
  assert.equal(clear.mock.callCount(), 0);
  assert.equal(cart.items.length, 1);
});

test('checkout requires a well-formed idempotency key before opening a transaction', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  let sessionStarts = 0;
  t.mock.method(User, 'findById', () => ({ select: async () => ({ role: 'customer' }) }));
  t.mock.method(mongoose, 'startSession', async () => { sessionStarts += 1; throw new Error('must not start'); });
  const headers = { authorization: `Bearer ${makeToken('customer', userId.toString())}` };
  const missing = await request('/api/cart/checkout', { method: 'POST', headers, body: '{}' });
  const short = await request('/api/cart/checkout', { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'short' }, body: '{}' });
  const oversized = await request('/api/cart/checkout', { method: 'POST', headers: { ...headers, 'Idempotency-Key': 'k'.repeat(129) }, body: '{}' });
  assert.deepEqual([missing.status, short.status, oversized.status], [400, 400, 400]);
  assert.equal(sessionStarts, 0);
});

test('checkout requires authentication before idempotency processing or session creation', async (t) => {
  let sessionStarts = 0;
  t.mock.method(mongoose, 'startSession', async () => { sessionStarts += 1; throw new Error('must not start'); });
  const response = await request('/api/cart/checkout', { method: 'POST', body: '{}' });
  assert.equal(response.status, 401);
  assert.equal(sessionStarts, 0);
});

test('checkout operation schema declares a unique user and key index', () => {
  const uniqueIndex = CheckoutOperation.schema.indexes().find(([keys]) => keys.userId === 1 && keys.key === 1);
  assert.ok(uniqueIndex);
  assert.equal(uniqueIndex[1].unique, true);
  assert.equal(uniqueIndex[1].name, 'uniq_checkout_operation_user_key');
});

test('checkout replay returns the original user-scoped operation and changed cart conflicts', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const originalProduct = new mongoose.Types.ObjectId();
  const changedProduct = new mongoose.Types.ObjectId();
  const order = { _id: new mongoose.Types.ObjectId(), totalAmount: 9.5 };
  const operation = { fingerprint: require('node:crypto').createHash('sha256').update(JSON.stringify([[originalProduct.toString(), 1]])).digest('hex'), orderId: order };
  let currentCart = { userId, items: [{ productId: originalProduct, quantity: 1 }] };
  const filters = [];
  t.mock.method(User, 'findById', () => ({ select: async () => ({ role: 'customer' }) }));
  t.mock.method(Cart, 'findOne', (filter) => ({ lean: async () => currentCart }));
  t.mock.method(CheckoutOperation, 'findOne', (filter) => {
    filters.push(filter);
    return { populate() { return this; }, lean: async () => String(filter.userId) === userId.toString() ? operation : null };
  });
  const headers = { authorization: `Bearer ${makeToken('customer', userId.toString())}`, 'Idempotency-Key': 'checkout-replay-0001' };
  const replay = await request('/api/cart/checkout', { method: 'POST', headers, body: '{}' });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).order._id, order._id.toString());

  currentCart = { userId, items: [{ productId: changedProduct, quantity: 1 }] };
  const conflict = await request('/api/cart/checkout', { method: 'POST', headers, body: '{}' });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, 'IDEMPOTENCY_KEY_REUSED');
  assert.equal(filters.every((filter) => String(filter.userId) === userId.toString()), true);
});

test('checkout reconciliation requires authentication and returns only the current user operation', async (t) => {
  const ownerId = new mongoose.Types.ObjectId();
  const strangerId = new mongoose.Types.ObjectId();
  const order = { _id: new mongoose.Types.ObjectId(), totalAmount: 4 };
  const queriedOwners = [];
  t.mock.method(User, 'findById', () => ({ select: async () => ({ role: 'customer' }) }));
  t.mock.method(CheckoutOperation, 'findOne', (filter) => {
    queriedOwners.push(filter.userId.toString());
    return { populate() { return this; }, lean: async () => String(filter.userId) === ownerId.toString() ? { orderId: order } : null };
  });
  const key = 'checkout-reconcile-001';
  const owner = await request(`/api/cart/checkout/${key}`, { headers: { authorization: `Bearer ${makeToken('customer', ownerId.toString())}` } });
  assert.equal(owner.status, 200);
  assert.equal((await owner.json()).order._id, order._id.toString());
  const stranger = await request(`/api/cart/checkout/${key}`, { headers: { authorization: `Bearer ${makeToken('customer', strangerId.toString())}` } });
  assert.equal(stranger.status, 404);
  const anonymous = await request(`/api/cart/checkout/${key}`);
  assert.equal(anonymous.status, 401);
  assert.deepEqual(queriedOwners, [ownerId.toString(), strangerId.toString()]);
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
  assert.throws(() => parseArguments(['--import', '--stock-default', '0']), /requires --confirm-local-db/);
  assert.equal(parseArguments(['--import', '--stock-default', '0', '--confirm-local-db', 'urbankart_local_demo']).stockDefault, 0);
  assert.throws(() => parseArguments(['--import', '--stock-default', '2147483648', '--confirm-local-db', 'urbankart_local_demo']), /BSON int32/);
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
