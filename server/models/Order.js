const mongoose = require('mongoose');

// Define the schema for historical order items
// _id: false prevents generating unnecessary ObjectIds for these embedded snapshots.
const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product', // Identifies the Product model for population, preserving the relationship.
    required: true // An order item must reference a valid product origin.
  },
  nameAtPurchase: {
    type: String,
    required: true,
    trim: true // Prevents formatting bugs on the invoice caused by accidental spaces.
  },
  priceAtPurchase: {
    type: Number,
    required: true,
    min: 0 // Freezes the financial value and prevents malicious negative pricing on the historical invoice.
  },
  qty: {
    type: Number,
    required: true,
    min: 1, // Prevents 0 or negative quantities from corrupting the order.
    validate: {
      validator: Number.isInteger, // Ensures the customer purchased whole integer units.
      message: 'Quantity must be an integer.'
    }
  }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Identifies the User model for population.
    required: true // Every order must be explicitly tied to a customer account.
  },
  items: {
    type: [orderItemSchema], // Embeds the historical snapshot items.
    required: true,
    validate: {
      validator: (v) => Array.isArray(v) && v.length > 0, // Domain validation: an order cannot be empty.
      message: 'An order must contain at least one item.'
    }
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0 // Safeguards the total invoice amount against negative calculation exploits.
  },
  status: {
    type: String,
    required: true // Tracks fulfillment state, exact enum allowed values are pending SRS definition.
  },
  orderDate: {
    type: Date,
    required: true,
    default: Date.now // Automatically records the exact moment the order contract was executed.
  }
});
// Explicitly NOT adding { timestamps: true } to adhere strictly to the SRS 'orderDate' requirement.

module.exports = mongoose.model('Order', orderSchema);
