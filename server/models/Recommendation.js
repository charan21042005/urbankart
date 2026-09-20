const mongoose = require('mongoose');

// Define the schema for the embedded related products
// _id: false prevents Mongoose from allocating space for ObjectIds since these are strictly dependent data points.
const relatedProductSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product', // Allows the frontend to .populate() and retrieve the actual suggested item details.
    required: true // A recommendation score is meaningless without a target product.
  },
  score: {
    type: Number,
    required: true
    // Note: The SRS similarity algorithm generates this score. We omit boundary constraints to prevent premature 
    // assumption of the algorithm's mathematical range.
  }
}, { _id: false });

const recommendationSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product', // Identifies the primary "source" product the user is currently viewing.
    required: true,
    unique: true // Ensures only one materialized view document exists per source product.
  },
  relatedProducts: {
    type: [relatedProductSchema],
    validate: {
      validator: function(v) {
        return v.length <= 5;
      },
      // Implementation validation choice: Derived from the SRS's `.slice(0, 5)` batch job logic 
      // to guarantee the materialized view never bloats beyond the expected UI limit.
      message: 'A product can have a maximum of 5 recommendations.'
    }
  },
  computedAt: {
    type: Date,
    required: true
    // Explicitly defines when the nightly batch job last ran, allowing the system to detect stale recommendations.
  }
});
// Explicitly omitting { timestamps: true } as per SRS specifications.

module.exports = mongoose.model('Recommendation', recommendationSchema);
