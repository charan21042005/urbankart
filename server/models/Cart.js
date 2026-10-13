// 1. Import Mongoose to define the schema
const mongoose = require('mongoose');

// 2. Define the Cart Schema. We keep Carts separate from the User document
// so that frequent cart updates (adding/removing items) don't cause high write-churn on the main User record.
const cartSchema = new mongoose.Schema({
  // The user who owns this cart. It references the 'User' collection.
  // 'unique: true' ensures a single user can only have one active cart at a time.
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    unique: true 
  },
  
  // The items currently inside the shopping cart. We EMBED these items as an array 
  // because we always want to load the entire cart contents at once.
  items: [{
    // The specific product the user wants to buy. References the 'Product' collection.
    productId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Product', 
      required: true 
    },
    
    // The amount of this product the user wants to buy.
    quantity: { 
      type: Number, 
      required: true, 
      // Minimum is 1 (you can't add 0 items to a cart)
      min: 1, 
      max: 2_147_483_647,
      // Custom validation ensures you can only add whole items (e.g. 1, 2, 3), not fractions (1.5)
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be an integer.'
      }
    }
  }]
}, { timestamps: true });

cartSchema.path('items').validate((items) => items.length <= 100, 'A cart may contain at most 100 distinct products.');

// One cart per account; the TTL index removes abandoned local/production cart
// documents 30 days after their last update. Orders remain independently stored.
cartSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 2_592_000, name: 'ttl_carts_updated_at_30d' });

// 3. Compile the schema into a Mongoose model named 'Cart' and export it
module.exports = mongoose.model('Cart', cartSchema);
