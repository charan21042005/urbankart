// 1. Import 'express', which is a framework that makes building web servers much easier in Node.js
const express = require('express');

// 2. Import 'mongoose', which is a library that helps us connect to MongoDB and define data models
const mongoose = require('mongoose');

// 3. Import 'dotenv', which allows us to load secret variables (like passwords) from a hidden .env file
const dotenv = require('dotenv');

// 4. Import 'path', a built-in Node.js module that helps us build correct folder paths on any operating system
const path = require('path');

// 5. Load the environment variables from the .env file located one folder up (in the root directory)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// 6. Create our Express application. This 'app' object will be used to define routes and start the server
const app = express();

// 7. Define the port our server will listen on. Use the one provided by the environment, or default to 5000
const PORT = process.env.PORT || 5000;

// 8. Add a global middleware that automatically intercepts incoming requests and parses any JSON data in the body
app.use(express.json());

// 9. Define a simple "Health Check" route. This is used to verify that the server is alive and responding
app.get('/api/health', (req, res) => {
  // Send back a success message with the current time
  res.json({
    status: 'success',
    message: 'UrbanKart backend is running successfully.',
    timestamp: new Date().toISOString()
  });
});

// 10. Import the isolated product routes from our routes folder
const productRoutes = require('./routes/productRoutes');

// 11. Mount the product routes onto the '/api/products' URL prefix
app.use('/api/products', productRoutes);

// 12. Grab the MongoDB connection string from the environment variables we loaded earlier
const MONGODB_URI = process.env.MONGODB_URI;

// 13. Safety Check: If the connection string is missing, we must stop the server immediately to prevent errors
if (!MONGODB_URI) {
  console.error('FATAL ERROR: MONGODB_URI is not defined in the environment variables.');
  // Exit the Node process with code 1, which means "crashed with an error"
  process.exit(1);
}

// 14. Attempt to connect to the MongoDB Atlas database using Mongoose
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    // 15. If the connection succeeds, log a success message
    console.log('MongoDB connected via Mongoose');
    
    // 16. Start the Express server ONLY AFTER the database connection is successful.
    // This ensures no user can hit our API before the database is ready to handle requests.
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    // 17. If the connection fails (e.g., bad password, no internet), log the error and crash safely
    console.error('ERROR: Failed to connect to MongoDB.', error.message);
    process.exit(1);
  });
