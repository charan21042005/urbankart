// 1. Import Mongoose to define the schema
const mongoose = require('mongoose');

// 2. Define a sub-schema for items within an order (The Snapshot Pattern)
// We DO NOT just store the productId. We must "hardcopy" the name and price at the exact moment of checkout.
// If the store owner changes the product price tomorrow, the historical order receipt MUST stay the same.
const orderItemSchema = new mongoose.Schema({
  // Reference to the original product (useful for analytics like "How many times was this bought?")
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  
  // The exact name of the product at the time the user bought it.
  nameAtPurchase: { type: String, required: true },
  
  // The exact price the user paid at the time of purchase.
  priceAtPurchase: { type: Number, required: true, min: 0 },
  
  // The quantity purchased.
  qty: { 
    type: Number, 
    required: true, 
    min: 1, 
    validate: { validator: Number.isInteger, message: 'Quantity must be an integer.' }
  }
}, { 
  // We disable ObjectIds for these sub-documents to save space in the database
  _id: false 
});

// 3. Define the main Order Schema representing a finalized checkout.
const orderSchema = new mongoose.Schema({
  // The customer who placed the order. References the 'User' collection.
  customerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // The array of items they bought, using the snapshot schema defined above.
  items: [orderItemSchema],
  
  // The total final calculated price of the order.
  totalAmount: { type: Number, required: true, min: 0 },
  
  // The current progression state of the order. Defaults to 'pending'.
  status: { 
    type: String, 
    enum: ['pending', 'shipped', 'delivered', 'cancelled'], 
    default: 'pending' 
  },
  
  // When the order was placed.
  orderDate: { type: Date, default: Date.now }
}, { 
  // Automatically manage 'createdAt' and 'updatedAt' timestamps
  timestamps: true 
});

// 4. Compile the schema into a Mongoose model named 'Order' and export it
module.exports = mongoose.model('Order', orderSchema);
