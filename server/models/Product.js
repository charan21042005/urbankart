// 1. Import Mongoose, which is the library we use to model our MongoDB data
const mongoose = require('mongoose');

// 2. Define a sub-schema for Product Attributes (The Attribute Pattern)
// This allows us to store flexible key-value pairs (like { key: "RAM", value: "16GB" }) 
// for diverse products without adding hundreds of empty columns to our main schema.
const attributeSchema = new mongoose.Schema({
  // The name of the attribute (e.g., 'Size', 'Color')
  key: { type: String, required: true, trim: true },
  
  // The value of the attribute (e.g., 'Medium', 'Red')
  value: { type: String, required: true, trim: true }
}, { 
  // Disable automatic ObjectIds for these tiny sub-documents to save database storage space
  _id: false 
});

// 3. Define the main Product Schema. This is the blueprint for how every product must look in the database.
const productSchema = new mongoose.Schema({
  // The name of the product. It is required, and 'trim' removes accidental spaces before saving.
  name: { type: String, required: true, trim: true },
  
  // An optional description of the product.
  description: { type: String },
  
  // The price of the product. It must be a number, and 'min: 0' prevents negative prices.
  price: { type: Number, required: true, min: 0 },
  
  // The inventory stock level. It defaults to 0 if not provided.
  stock: { 
    type: Number, 
    required: true, 
    min: 0, 
    max: 2_147_483_647,
    default: 0, 
    // This custom validator ensures the stock is an absolute whole number (integer). 
    // You cannot sell 1.5 laptops.
    validate: {
      validator: Number.isInteger,
      message: 'Stock must be an integer.'
    }
  },
  
  // The category the product belongs to (e.g., 'Electronics', 'Apparel')
  category: { type: String, required: true, trim: true },

  // Optional catalog tags support search and similarity without fabricating
  // tag data when the source dataset does not provide it.
  tags: { type: [{ type: String, trim: true, minlength: 1, maxlength: 120 }], default: [] },

  // A new catalog item has no reviews; zero is a count, not a synthetic rating.
  ratingAvg: { type: Number, min: 0, max: 5, default: 0 },
  ratingCount: { type: Number, min: 0, default: 0, validate: Number.isInteger },
  
  // This is an array that uses the 'attributeSchema' we defined above.
  // A single product can have 0, 1, or 50 dynamic attributes stored here.
  attributes: [attributeSchema]
}, { 
  // This automatically adds 'createdAt' and 'updatedAt' timestamps to every product document
  timestamps: true 
});

productSchema.index({ category: 1, price: 1 }, { name: 'idx_products_category_price' });
productSchema.index({ category: 1, createdAt: -1, _id: 1 }, { name: 'idx_products_category_created' });
productSchema.index({ stock: -1, _id: 1 }, { name: 'idx_products_stock_id' });
productSchema.index({ category: 1, stock: -1, _id: 1 }, { name: 'idx_products_category_stock_id' });
productSchema.index({ createdAt: -1, _id: 1 }, { name: 'idx_products_created_id' });
productSchema.index({ price: 1, _id: 1 }, { name: 'idx_products_price_id' });
productSchema.index({ name: 1, _id: 1 }, { name: 'idx_products_name_id' });
productSchema.index(
  { name: 'text', description: 'text', tags: 'text' },
  { name: 'text_products_name_description_tags', weights: { name: 10, description: 2, tags: 4 } }
);

// 4. Compile our blueprint schema into an active Mongoose Model named 'Product' and export it.
// Mongoose will automatically look for a MongoDB collection named 'products' (pluralized).
module.exports = mongoose.model('Product', productSchema);
