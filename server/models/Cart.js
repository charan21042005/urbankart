const mongoose = require('mongoose');

// Define the schema for individual cart items
// _id: false prevents Mongoose from generating ObjectIds for transient item records, saving space.
const cartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product', // Tells Mongoose this ID references the Product collection for easy population.
    required: true // Prevents ghost items; a cart item must point to a product.
  },
  quantity: {
    type: Number,
    required: true,
    min: 1, // Prevents users from having 0 or negative items, protecting checkout calculations.
    validate: {
      validator: Number.isInteger, // Ensures users can only buy whole items (no fractional quantities).
      message: 'Quantity must be an integer.'
    }
  }
}, { _id: false });

const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Tells Mongoose this ID references the User collection.
    required: true // Every cart must definitively belong to a registered user.
  },
  items: [cartItemSchema] // Embeds the cart items directly inside the Cart document.
});

module.exports = mongoose.model('Cart', cartSchema);
