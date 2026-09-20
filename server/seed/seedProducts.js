require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');

const seedProducts = [
  // Electronics
  {
    name: "Urban X-Pro Laptop",
    description: "High-performance laptop for professionals",
    price: 1299,
    stock: 25,
    category: "Electronics",
    attributes: [
      { key: "processor", value: "Intel Core i7" },
      { key: "ram", value: "16GB" },
      { key: "storage", value: "512GB SSD" },
      { key: "display", value: "15.6 inch 4K" }
    ]
  },
  {
    name: "Quantum Noise-Cancelling Headphones",
    description: "Industry-leading wireless headphones",
    price: 299,
    stock: 50,
    category: "Electronics",
    attributes: [
      { key: "connectivity", value: "Bluetooth 5.0" },
      { key: "batteryLife", value: "30 hours" },
      { key: "color", value: "Matte Black" }
    ]
  },
  {
    name: "NextGen Smartphone Ultra",
    description: "Flagship smartphone with an incredible camera",
    price: 999,
    stock: 120,
    category: "Electronics",
    attributes: [
      { key: "processor", value: "Snapdragon 8 Gen 2" },
      { key: "storage", value: "256GB" },
      { key: "display", value: "6.7 inch OLED" },
      { key: "connectivity", value: "5G" }
    ]
  },
  {
    name: "Echo Smart Speaker",
    description: "Voice-controlled smart home hub",
    price: 99,
    stock: 200,
    category: "Electronics",
    attributes: [
      { key: "connectivity", value: "Wi-Fi" },
      { key: "color", value: "Charcoal" }
    ]
  },
  {
    name: "Vision 4K Action Camera",
    description: "Waterproof rugged action camera",
    price: 199,
    stock: 45,
    category: "Electronics",
    attributes: [
      { key: "storage", value: "MicroSD up to 256GB" },
      { key: "connectivity", value: "Wi-Fi, Bluetooth" }
    ]
  },
  {
    name: "Titan Mechanical Keyboard",
    description: "RGB mechanical gaming keyboard",
    price: 149,
    stock: 75,
    category: "Electronics",
    attributes: [
      { key: "switch", value: "Cherry MX Red" },
      { key: "connectivity", value: "Wired USB-C" }
    ]
  },

  // Apparel
  {
    name: "Classic Denim Jacket",
    description: "Timeless blue denim jacket for everyday wear",
    price: 59,
    stock: 80,
    category: "Apparel",
    attributes: [
      { key: "size", value: "M" },
      { key: "color", value: "Blue" },
      { key: "material", value: "100% Cotton" },
      { key: "fit", value: "Regular" }
    ]
  },
  {
    name: "Athletic Performance Tee",
    description: "Moisture-wicking workout t-shirt",
    price: 25,
    stock: 150,
    category: "Apparel",
    attributes: [
      { key: "size", value: "L" },
      { key: "color", value: "Black" },
      { key: "material", value: "Polyester Blend" },
      { key: "fit", value: "Slim" }
    ]
  },
  {
    name: "Urban Chino Pants",
    description: "Comfortable and stylish chinos",
    price: 45,
    stock: 100,
    category: "Apparel",
    attributes: [
      { key: "size", value: "32x32" },
      { key: "color", value: "Khaki" },
      { key: "fit", value: "Straight" }
    ]
  },
  {
    name: "Winter Wool Coat",
    description: "Warm and elegant coat for winter",
    price: 120,
    stock: 30,
    category: "Apparel",
    attributes: [
      { key: "size", value: "L" },
      { key: "color", value: "Charcoal" },
      { key: "material", value: "Wool Blend" }
    ]
  },
  {
    name: "Floral Summer Dress",
    description: "Lightweight dress with a floral pattern",
    price: 35,
    stock: 60,
    category: "Apparel",
    attributes: [
      { key: "size", value: "S" },
      { key: "pattern", value: "Floral" },
      { key: "material", value: "Viscose" }
    ]
  },
  {
    name: "Running Sneakers",
    description: "Lightweight and breathable sneakers",
    price: 85,
    stock: 90,
    category: "Apparel",
    attributes: [
      { key: "size", value: "10 US" },
      { key: "color", value: "Neon Green" },
      { key: "material", value: "Mesh" }
    ]
  },

  // Groceries
  {
    name: "Organic Whole Milk",
    description: "Fresh organic whole milk from pasture-raised cows",
    price: 4,
    stock: 200,
    category: "Groceries",
    attributes: [
      { key: "weight", value: "1 Gallon" },
      { key: "organic", value: "Yes" },
      { key: "shelfLife", value: "14 days" },
      { key: "packaging", value: "Plastic Jug" }
    ]
  },
  {
    name: "Artisan Sourdough Bread",
    description: "Freshly baked sourdough loaf",
    price: 6,
    stock: 40,
    category: "Groceries",
    attributes: [
      { key: "weight", value: "16 oz" },
      { key: "organic", value: "No" },
      { key: "flavor", value: "Sourdough" }
    ]
  },
  {
    name: "Premium Arabica Coffee Beans",
    description: "Whole bean medium roast coffee",
    price: 14,
    stock: 150,
    category: "Groceries",
    attributes: [
      { key: "weight", value: "12 oz" },
      { key: "flavor", value: "Medium Roast" },
      { key: "packaging", value: "Resealable Bag" }
    ]
  },
  {
    name: "Extra Virgin Olive Oil",
    description: "Cold-pressed extra virgin olive oil",
    price: 18,
    stock: 75,
    category: "Groceries",
    attributes: [
      { key: "weight", value: "750 ml" },
      { key: "organic", value: "Yes" },
      { key: "packaging", value: "Glass Bottle" }
    ]
  },
  {
    name: "Fresh Honeycrisp Apples",
    description: "Crisp and sweet organic apples",
    price: 5,
    stock: 300,
    category: "Groceries",
    attributes: [
      { key: "weight", value: "3 lbs" },
      { key: "organic", value: "Yes" }
    ]
  },
  {
    name: "Free-Range Eggs",
    description: "Dozen large brown eggs",
    price: 6,
    stock: 120,
    category: "Groceries",
    attributes: [
      { key: "packaging", value: "Cardboard Carton" },
      { key: "organic", value: "Yes" },
      { key: "shelfLife", value: "30 days" }
    ]
  }
];

async function seedDatabase() {
  try {
    console.log("Connecting to Atlas...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected successfully.");

    // Clear ONLY the products collection to avoid nuking other domain data
    console.log("Clearing existing products...");
    await Product.deleteMany({});
    
    // Insert new products
    console.log(`Inserting ${seedProducts.length} sample products...`);
    const inserted = await Product.insertMany(seedProducts);
    
    console.log(`✅ Success! ${inserted.length} products inserted.`);
  } catch (err) {
    console.error("❌ Seeding Error:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from Atlas.");
  }
}

seedDatabase();
