const objectId = { bsonType: 'objectId' };
const date = { bsonType: 'date' };
const numeric = { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0 };
const wholeNumber = { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0, multipleOf: 1 };
const timestamps = { createdAt: date, updatedAt: date, __v: { bsonType: ['int', 'long', 'double'], minimum: 0 } };
const reference = { bsonType: 'objectId' };
const object = (required, properties, additionalProperties = false) => ({
  bsonType: 'object', required, properties, additionalProperties
});

// These contracts mirror the Mongoose fields, including the existing
// { key, value } Attribute Pattern. Mongoose remains the early validator;
// MongoDB repeats the invariants at the persistence boundary.
const collectionValidators = Object.freeze({
  products: object(
    ['name', 'price', 'stock', 'category', 'attributes'],
    {
      _id: objectId,
      name: { bsonType: 'string', minLength: 1 },
      description: { bsonType: 'string' },
      price: numeric,
      stock: { ...wholeNumber, maximum: 2147483647 },
      category: { bsonType: 'string', minLength: 1 },
      tags: { bsonType: 'array', items: { bsonType: 'string', minLength: 1, maxLength: 120 } },
      ratingAvg: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0, maximum: 5 },
      ratingCount: wholeNumber,
      attributes: {
        bsonType: 'array',
        items: object(['key', 'value'], {
          key: { bsonType: 'string', minLength: 1 },
          value: { bsonType: 'string', minLength: 1 }
        })
      },
      ...timestamps
    }
  ),
  users: object(
    ['name', 'email', 'passwordHash', 'role'],
    {
      _id: objectId,
      name: { bsonType: 'string', minLength: 1, maxLength: 100 },
      email: { bsonType: 'string', minLength: 3, maxLength: 254 },
      passwordHash: { bsonType: 'string', minLength: 1 },
      role: { enum: ['customer', 'admin'] },
      isActive: { bsonType: 'bool' },
      ...timestamps
    }
  ),
  carts: object(
    ['userId', 'items'],
    {
      _id: objectId,
      userId: reference,
      items: {
        bsonType: 'array',
        maxItems: 100,
        items: object(['productId', 'quantity'], {
          _id: objectId,
          productId: reference,
          quantity: { ...wholeNumber, minimum: 1, maximum: 2147483647 }
        })
      },
      ...timestamps
    }
  ),
  orders: object(
    ['customerId', 'items', 'totalAmount', 'status', 'orderDate'],
    {
      _id: objectId,
      customerId: reference,
      items: {
        bsonType: 'array',
        minItems: 1,
        items: object(['productId', 'nameAtPurchase', 'priceAtPurchase', 'qty'], {
          productId: reference,
          nameAtPurchase: { bsonType: 'string', minLength: 1 },
          priceAtPurchase: numeric,
          qty: { ...wholeNumber, minimum: 1, maximum: 2147483647 }
        })
      },
      totalAmount: numeric,
      status: { enum: ['pending', 'completed', 'shipped', 'delivered', 'cancelled'] },
      orderDate: date,
      ...timestamps
    }
  ),
  reviews: object(
    ['productId', 'userId', 'rating'],
    {
      _id: objectId,
      productId: reference,
      userId: reference,
      rating: { bsonType: ['double', 'int', 'long'], minimum: 1, maximum: 5, multipleOf: 1 },
      comment: { bsonType: 'string', maxLength: 4000 },
      ...timestamps
    }
  ),
  recommendations: object(
    ['productId', 'relatedProducts', 'computedAt'],
    {
      _id: objectId,
      __v: { bsonType: ['int', 'long', 'double'], minimum: 0 },
      productId: reference,
      relatedProducts: {
        bsonType: 'array',
        maxItems: 5,
        items: object(['productId', 'score'], {
          _id: objectId,
          productId: reference,
          score: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0, maximum: 1 }
        })
      },
      computedAt: date
    }
  ),
  checkoutoperations: object(
    ['userId', 'key', 'fingerprint', 'orderId', 'completedAt'],
    {
      _id: objectId,
      userId: reference,
      key: { bsonType: 'string', minLength: 16, maxLength: 128, pattern: '^[A-Za-z0-9._~-]+$' },
      fingerprint: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
      orderId: reference,
      completedAt: date,
      ...timestamps
    }
  )
});

module.exports = { collectionValidators };
