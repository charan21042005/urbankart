const mongoose = require('mongoose');

const checkoutOperationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true, minlength: 16, maxlength: 128 },
  fingerprint: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  completedAt: { type: Date, required: true, default: Date.now }
}, { timestamps: true });

checkoutOperationSchema.index(
  { userId: 1, key: 1 },
  { unique: true, name: 'uniq_checkout_operation_user_key' }
);

module.exports = mongoose.model('CheckoutOperation', checkoutOperationSchema);
