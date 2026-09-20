const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product', // Identifies the associated Product to allow aggregation and population.
    required: true // A review cannot exist without pointing to the product being reviewed.
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Identifies the author of the review.
    required: true // Anonymous reviews are not permitted by the data model.
  },
  rating: {
    type: Number,
    required: true,
    min: 1, // Enforces the lowest possible rating limit.
    max: 5, // Enforces the highest possible rating limit.
    validate: {
      validator: Number.isInteger, // Ensures users provide whole star ratings.
      message: 'Rating must be an integer.'
    }
  },
  comment: {
    type: String,
    trim: true // Optional field, but trims trailing spaces if provided to prevent empty-looking blocks in UI.
  }
}, { 
  // Automatically manages 'createdAt' and 'updatedAt'. 
  // 'createdAt' is essential for sorting reviews from newest to oldest.
  timestamps: true 
});

module.exports = mongoose.model('Review', reviewSchema);
