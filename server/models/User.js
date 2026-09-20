const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true // Normalizes input by removing accidental trailing spaces for consistent UI display.
  },
  email: {
    type: String,
    required: true,
    trim: true, // Normalizes email input to prevent failed logins due to hidden spaces.
    lowercase: true, // Mongoose schema behavior to ensure "John@example.com" matches "john@example.com".
    unique: true // Creates a MongoDB unique-index constraint at the DB layer to prevent duplicate accounts.
  },
  passwordHash: {
    type: String,
    required: true
    // No trim validation here. A password hash is an opaque generated value and should never be modified.
  },
  role: {
    type: String,
    required: true
    // Note: The specific enum values (e.g., customer, vendor) are intentionally omitted here 
    // pending explicit confirmation from the blueprint/SRS.
  }
}, { 
  // Automatically creates and manages 'createdAt' and 'updatedAt' timestamps for security and auditing.
  timestamps: true 
});

module.exports = mongoose.model('User', userSchema);
