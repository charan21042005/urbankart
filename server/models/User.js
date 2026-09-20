// 1. Import Mongoose to define the schema
const mongoose = require('mongoose');

// 2. Define the User Schema. This acts as a strict blueprint for user data.
const userSchema = new mongoose.Schema({
  // The user's full name. It is mandatory, and 'trim' removes accidental spaces.
  name: { type: String, required: true, trim: true },
  
  // The user's email address.
  email: { 
    type: String, 
    required: true, 
    // 'unique: true' tells MongoDB to build a special index preventing two users from having the same email
    unique: true, 
    // Automatically convert emails to lowercase so 'John@test.com' and 'john@test.com' are treated equally
    lowercase: true, 
    trim: true 
  },
  
  // We store a securely hashed version of the password, NEVER the plaintext password.
  passwordHash: { type: String, required: true },
  
  // The user's role dictates what they can do on the site.
  role: { 
    type: String, 
    // 'enum' restricts the value to ONLY these specific strings. No other roles are allowed.
    enum: ['customer', 'admin'], 
    // By default, everyone who signs up is a standard customer
    default: 'customer' 
  }
}, { 
  // Automatically manage 'createdAt' and 'updatedAt' timestamps
  timestamps: true 
});

// 3. Compile the schema into a Mongoose model named 'User' and export it
module.exports = mongoose.model('User', userSchema);
