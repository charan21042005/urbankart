// 1. Import Mongoose to define the schema
const mongoose = require('mongoose');

// 2. Define the Recommendation Schema (The Materialized View Pattern).
// Calculating "Users who bought X also bought Y" takes immense computing power.
// Instead of calculating it on-the-fly when a user loads a page, a background system will calculate it
// overnight and save the final result here. This makes reading the recommendations incredibly fast.
const recommendationSchema = new mongoose.Schema({
  // The main source product we are generating recommendations for.
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true, 
    // A product can only have one active recommendation list at a time
    unique: true 
  },
  
  // An array of products that are statistically related to the main product.
  relatedProducts: [{
    // The related product's ID
    productId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Product', 
      required: true 
    },
    // The algorithmic similarity score (e.g. how strongly they are related)
    score: { 
      type: Number, 
      required: true 
    }
  }],
  
  // When this recommendation was generated. Helps us know if the data is stale/old.
  computedAt: { type: Date, required: true }
});

// 3. Compile the schema into a Mongoose model named 'Recommendation' and export it
module.exports = mongoose.model('Recommendation', recommendationSchema);
