// 1. Import Mongoose to connect to the database
const mongoose = require('mongoose');

// 2. Load the secret variables from the .env file (e.g. MONGODB_URI)
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// 3. Import our Product model so we can insert data into the 'products' collection
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

// 5. Define an async function to execute the seed operation
async function seedDatabase() {
  try {
    // Connect to the database
    await mongoose.connect(process.env.MONGODB_URI);
    
    // 6. IDEMPOTENCY: Clear ONLY the products collection before inserting.
    // This allows us to run this script 100 times without duplicating the data 100 times.
    console.log("Clearing existing products...");
    await Product.deleteMany({});

    // 7. Insert all 18 products into the database at once.
    console.log(`Inserting ${seedProducts.length} sample products...`);
    const inserted = await Product.insertMany(seedProducts);

    console.log(`✅ Success! ${inserted.length} products inserted.`);
  } catch (err) {
    console.error("❌ Seeding Error:", err.message);
  } finally {
    // 8. Disconnect from the database so the terminal prompt returns
    mongoose.disconnect();
  }
}

// 9. Execute the seed operation
seedDatabase();
