const mongoose = require('mongoose');
const crypto = require('node:crypto');
const safety = require('../scripts/databaseSafety');
const Product = require('../models/Product');

// 4. Create an array of mock (seed) data. This provides realistic data for our frontend to use during development.
const seedProducts = [
  // --- Electronics ---
  {
    name: "Urban X-Pro Laptop",
    description: "High-performance laptop for professionals",
    price: 1299,
    stock: 25,
    category: "Electronics",
    // Here we use the Attribute Pattern to store specs specific to laptops
    attributes: [
      { key: "processor", value: "Intel Core i7" },
      { key: "ram", value: "16GB" }
    ]
  },
  {
    name: "Noise-Cancelling Headphones",
    description: "Over-ear headphones with active noise cancellation",
    price: 249,
    stock: 50,
    category: "Electronics",
    attributes: [
      { key: "color", value: "Black" },
      { key: "battery", value: "30 hours" }
    ]
  },
  {
    name: "Smartphone Z1",
    description: "Latest 5G smartphone with amazing camera",
    price: 899,
    stock: 100,
    category: "Electronics",
    attributes: [
      { key: "storage", value: "128GB" },
      { key: "color", value: "Silver" }
    ]
  },
  {
    name: "4K Action Camera",
    description: "Waterproof action camera for adventures",
    price: 199,
    stock: 30,
    category: "Electronics",
    attributes: [
      { key: "resolution", value: "4K" },
      { key: "waterproof", value: "Up to 50m" }
    ]
  },
  {
    name: "Smartwatch Series 5",
    description: "Health and fitness tracking smartwatch",
    price: 349,
    stock: 75,
    category: "Electronics",
    attributes: [
      { key: "strap_color", value: "Blue" },
      { key: "water_resistant", value: "Yes" }
    ]
  },
  {
    name: "Wireless Charging Pad",
    description: "Fast wireless charger for multiple devices",
    price: 49,
    stock: 150,
    category: "Electronics",
    attributes: [
      { key: "power", value: "15W" }
    ]
  },

  // --- Apparel ---
  {
    name: "Classic Denim Jacket",
    description: "Vintage style denim jacket for men",
    price: 79,
    stock: 80,
    category: "Apparel",
    // Here we use the Attribute Pattern for clothing specs. No empty columns required!
    attributes: [
      { key: "size", value: "M" },
      { key: "color", value: "Blue" }
    ]
  },
  {
    name: "Running Sneakers",
    description: "Lightweight and breathable running shoes",
    price: 120,
    stock: 60,
    category: "Apparel",
    attributes: [
      { key: "size", value: "10" },
      { key: "color", value: "Neon Green" }
    ]
  },
  {
    name: "Cotton T-Shirt",
    description: "100% organic cotton basic t-shirt",
    price: 25,
    stock: 200,
    category: "Apparel",
    attributes: [
      { key: "size", value: "L" },
      { key: "color", value: "White" }
    ]
  },
  {
    name: "Winter Beanie",
    description: "Warm knitted beanie for cold weather",
    price: 15,
    stock: 120,
    category: "Apparel",
    attributes: [
      { key: "color", value: "Grey" },
      { key: "material", value: "Wool" }
    ]
  },
  {
    name: "Yoga Pants",
    description: "High-waisted stretch yoga pants",
    price: 45,
    stock: 90,
    category: "Apparel",
    attributes: [
      { key: "size", value: "S" },
      { key: "color", value: "Black" }
    ]
  },
  {
    name: "Leather Belt",
    description: "Genuine leather belt with classic buckle",
    price: 35,
    stock: 110,
    category: "Apparel",
    attributes: [
      { key: "length", value: "34 inches" },
      { key: "color", value: "Brown" }
    ]
  },

  // --- Groceries ---
  {
    name: "Organic Whole Milk",
    description: "Fresh organic whole milk",
    price: 4,
    stock: 200,
    category: "Groceries",
    // Here we use the Attribute Pattern for food specs.
    attributes: [
      { key: "weight", value: "1 Gallon" },
      { key: "organic", value: "Yes" }
    ]
  },
  {
    name: "Whole Wheat Bread",
    description: "Freshly baked whole wheat loaf",
    price: 3,
    stock: 150,
    category: "Groceries",
    attributes: [
      { key: "weight", value: "500g" }
    ]
  },
  {
    name: "Avocados (Pack of 4)",
    description: "Ripe Hass avocados",
    price: 6,
    stock: 80,
    category: "Groceries",
    attributes: [
      { key: "origin", value: "Mexico" }
    ]
  },
  {
    name: "Almond Butter",
    description: "Creamy roasted almond butter",
    price: 9,
    stock: 60,
    category: "Groceries",
    attributes: [
      { key: "weight", value: "16 oz" },
      { key: "sugar_free", value: "Yes" }
    ]
  },
  {
    name: "Ground Coffee",
    description: "Dark roast Arabica coffee blend",
    price: 12,
    stock: 90,
    category: "Groceries",
    attributes: [
      { key: "weight", value: "12 oz" },
      { key: "roast", value: "Dark" }
    ]
  },
  {
    name: "Pasta (Penne)",
    description: "Durum wheat semolina pasta",
    price: 2,
    stock: 300,
    category: "Groceries",
    attributes: [
      { key: "weight", value: "1 lb" }
    ]
  }
];

function sampleProductId(product) {
  const hex = crypto.createHash('sha256')
    .update('urbankart:day1-sample:' + product.category + ':' + product.name)
    .digest('hex')
    .slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

async function seedDatabase(argv = process.argv.slice(2)) {
  let connected = false;
  try {
    mongoose.set('autoCreate', false);
    mongoose.set('autoIndex', false);
    const target = await safety.connectAfterPreflight({
      mode: 'local-write',
      argv,
      connect: (uri) => mongoose.connect(uri, {
        autoCreate: false,
        autoIndex: false,
        serverSelectionTimeoutMS: 10_000
      })
    });
    connected = true;
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    safety.validateLocalReplicaSetHello(hello, target.expectedReplicaSetName);
    const info = await mongoose.connection.db.listCollections({ name: Product.collection.name }).next();
    if (!info?.options?.validator?.$jsonSchema) {
      throw new safety.SafetyError('Initialize the local products validator before running the sample seed.');
    }

    const operations = seedProducts.map((product) => {
      const _id = sampleProductId(product);
      return { updateOne: { filter: { _id }, update: { $setOnInsert: { ...product, _id } }, upsert: true } };
    });
    const result = await Product.bulkWrite(operations, { ordered: false });
    process.stdout.write(JSON.stringify({
      result: 'local sample seed complete',
      database: target.databaseName,
      sampleRows: seedProducts.length,
      inserted: result.upsertedCount,
      alreadyPresent: seedProducts.length - result.upsertedCount
    }, null, 2) + '\n');
  } catch (error) {
    if (error instanceof safety.SafetyError) process.stderr.write('Sample seed refused: ' + error.message + '\n');
    else process.stderr.write('Sample seed failed; database and credential details were suppressed.\n');
    process.exitCode = 1;
  } finally {
    if (connected || mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => { process.exitCode = 1; });
    }
  }
}

if (require.main === module) seedDatabase();
module.exports = { seedProducts, sampleProductId, seedDatabase };
