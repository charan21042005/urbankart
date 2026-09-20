// Import required modules
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from the root .env file
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware to parse JSON
app.use(express.json());

// Simple Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'success',
    message: 'UrbanKart backend is running successfully.',
    timestamp: new Date().toISOString()
  });
});

/*
 * WHY WE USE ENVIRONMENT VARIABLES FOR THE DATABASE CONNECTION:
 * Hardcoding database credentials in source code exposes sensitive information to version control (GitHub).
 * By using process.env, we ensure that secrets (like passwords and connection strings) remain securely on the
 * host machine or deployment server and are never pushed to the repository.
 */
const MONGODB_URI = process.env.MONGODB_URI;

// Validate that the URI exists before attempting to connect
if (!MONGODB_URI) {
  console.error('FATAL ERROR: MONGODB_URI is not defined in the environment variables.');
  process.exit(1);
}

// Connect to MongoDB Atlas (or local MongoDB)
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected via Mongoose');
    // Start the Express server only AFTER the database connection is successful.
    // This prevents the server from accepting requests when the database is down.
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('ERROR: Failed to connect to MongoDB.', error.message);
    process.exit(1);
  });
