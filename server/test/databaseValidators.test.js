const test = require('node:test');
const assert = require('node:assert/strict');
const { collectionValidators } = require('../db/collectionValidators');

test('all six SRS collections and the checkout-operation collection have MongoDB validators', () => {
  assert.deepEqual(Object.keys(collectionValidators), [
    'products', 'users', 'carts', 'orders', 'reviews', 'recommendations', 'checkoutoperations'
  ]);
  for (const [name, schema] of Object.entries(collectionValidators)) {
    assert.equal(schema.bsonType, 'object', `${name} validator must describe documents`);
    assert.ok(schema.required.length > 0, `${name} must declare required fields`);
    assert.equal(schema.additionalProperties, false, `${name} must reject undeclared properties`);
  }
});

test('database validators preserve the existing key/value Attribute Pattern and bounded inventory fields', () => {
  const product = collectionValidators.products;
  assert.deepEqual(product.properties.stock, {
    bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0, multipleOf: 1, maximum: 2147483647
  });
  assert.deepEqual(product.properties.attributes.items.required, ['key', 'value']);
  assert.equal(product.properties.tags.bsonType, 'array');
  assert.deepEqual(collectionValidators.carts.properties.userId, { bsonType: 'objectId' });
  assert.deepEqual(collectionValidators.orders.properties.customerId, { bsonType: 'objectId' });
  assert.deepEqual(collectionValidators.users.properties.isActive, { bsonType: 'bool' });
});
