require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

// ==========================================
// 1. Define the $jsonSchema Validators
// ==========================================

const productValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["name", "price", "stock", "category"],
    properties: {
      name: { bsonType: "string" },
      price: { bsonType: "number", minimum: 0 },
      stock: { bsonType: "int", minimum: 0 },
      category: { bsonType: "string" },
      attributes: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["key", "value"],
          properties: {
            key: { bsonType: "string" },
            value: { bsonType: "string" }
          }
        }
      }
    }
  }
};

const userValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["name", "email", "passwordHash", "role"],
    properties: {
      name: { bsonType: "string" },
      email: { bsonType: "string" },
      passwordHash: { bsonType: "string" },
      role: { bsonType: "string" }
    }
  }
};

const cartValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["userId", "items"],
    properties: {
      userId: { bsonType: "objectId" },
      items: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["productId", "quantity"],
          properties: {
            productId: { bsonType: "objectId" },
            quantity: { bsonType: "int", minimum: 1 }
          }
        }
      }
    }
  }
};

const orderValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["customerId", "items", "totalAmount", "status", "orderDate"],
    properties: {
      customerId: { bsonType: "objectId" },
      items: {
        bsonType: "array",
        minItems: 1,
        items: {
          bsonType: "object",
          required: ["productId", "nameAtPurchase", "priceAtPurchase", "qty"],
          properties: {
            productId: { bsonType: "objectId" },
            nameAtPurchase: { bsonType: "string" },
            priceAtPurchase: { bsonType: "number", minimum: 0 },
            qty: { bsonType: "int", minimum: 1 }
          }
        }
      },
      totalAmount: { bsonType: "number", minimum: 0 },
      status: { bsonType: "string" },
      orderDate: { bsonType: "date" }
    }
  }
};

const reviewValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["productId", "userId", "rating"],
    properties: {
      productId: { bsonType: "objectId" },
      userId: { bsonType: "objectId" },
      rating: { bsonType: "int", minimum: 1, maximum: 5 },
      comment: { bsonType: "string" }
    }
  }
};

const recommendationValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["productId", "relatedProducts", "computedAt"],
    properties: {
      productId: { bsonType: "objectId" },
      relatedProducts: {
        bsonType: "array",
        maxItems: 5,
        items: {
          bsonType: "object",
          required: ["productId", "score"],
          properties: {
            productId: { bsonType: "objectId" },
            score: { bsonType: "number" }
          }
        }
      },
      computedAt: { bsonType: "date" }
    }
  }
};

// ==========================================
// 2. Collection Initialization Logic
// ==========================================

const collectionsToInit = [
  { name: 'products', validator: productValidator },
  { name: 'users', validator: userValidator },
  { name: 'carts', validator: cartValidator },
  { name: 'orders', validator: orderValidator },
  { name: 'reviews', validator: reviewValidator },
  { name: 'recommendations', validator: recommendationValidator }
];

async function initializeDatabase() {
  try {
    console.log("Connecting to Atlas...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected successfully.");

    const db = mongoose.connection.db;
    
    // Fetch all existing collections
    const existingCollections = await db.listCollections().toArray();
    const existingNames = existingCollections.map(c => c.name);

    for (const coll of collectionsToInit) {
      if (existingNames.includes(coll.name)) {
        // Use collMod to apply/update the validator on an existing collection
        await db.command({ collMod: coll.name, validator: coll.validator });
        console.log(`✅ Updated existing collection with $jsonSchema: ${coll.name}`);
      } else {
        // Create collection brand new with the validator
        await db.createCollection(coll.name, { validator: coll.validator });
        console.log(`✅ Created new collection with $jsonSchema: ${coll.name}`);
      }
    }
  } catch (error) {
    console.error("❌ Database Initialization Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from Atlas.");
  }
}

initializeDatabase();
