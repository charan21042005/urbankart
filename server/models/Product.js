const mongoose = require('mongoose');

// Define the Attribute subdocument schema
// _id: false prevents Mongoose from generating unnecessary ObjectIds for simple key-value pairs, saving database space.
const attributeSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true
  },
  value: {
    type: String,
    required: true
  }
}, { _id: false });

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true // Prevents duplicate entries or search issues caused by accidental trailing spaces.
  },
  description: {
    type: String
    // Optional field. Purely informational, no strict validation required.
  },
  price: {
    type: Number,
    required: true,
    min: 0 // Enforced at DB layer to ensure malicious actors cannot create products with negative prices.
  },
  stock: {
    type: Number,
    required: true,
    min: 0, // Prevents negative inventory (e.g., selling more than we have).
    default: 0 // Safely defaults to 'Out of Stock' rather than causing null pointer errors if omitted.
  },
  category: {
    type: String,
    required: true,
    trim: true // Required for accurate UI filtering and categorization without whitespace errors.
  },
  // The Attribute Pattern: Allows polymorphic products (laptops vs shirts) to coexist cleanly without schema bloat.
  attributes: [attributeSchema]
}, { 
  // Automatically creates and manages 'createdAt' and 'updatedAt' timestamps.
  timestamps: true 
});

module.exports = mongoose.model('Product', productSchema);
