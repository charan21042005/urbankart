// 1. Import Mongoose to define the schema
const mongoose = require('mongoose');

// 2. Define the Review Schema. 
// We keep reviews entirely separate from the Product document (The Outlier Pattern).
// If a product goes viral and gets 50,000 reviews, embedding them inside the Product document 
// would crash the database due to the 16MB document size limit. Separating them allows infinite scaling.
const reviewSchema = new mongoose.Schema({
  // The product this review is for. References the 'Product' collection.
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  
  // The user who wrote the review. References the 'User' collection.
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // The 1-to-5 star rating. 
  rating: { 
    type: Number, 
    required: true, 
    // Must be at least 1 star
    min: 1, 
    // Cannot be more than 5 stars
    max: 5, 
    // Must be a whole number (no 4.5 star ratings allowed in this design)
    validate: {
      validator: Number.isInteger,
      message: 'Rating must be an integer.'
    }
  },
  
  // The optional text comment left by the user. 'trim' cleans up accidental spaces.
  comment: { type: String, trim: true }
}, { 
  // Automatically manage 'createdAt' and 'updatedAt' timestamps
  timestamps: true 
});

// 3. Compile the schema into a Mongoose model named 'Review' and export it
module.exports = mongoose.model('Review', reviewSchema);
