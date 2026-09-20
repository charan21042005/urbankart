// 1. Import Express so we can use its routing capabilities
const express = require('express');

// 2. Create an isolated Express Router. This helps us keep our routes organized in separate files instead of cluttering server.js
const router = express.Router();

// 3. Import our Product model so we can query the MongoDB database for product data
const Product = require('../models/Product');

// 4. Define a GET route for the root path ('/') of this router. 
// When mounted in server.js, this actually becomes GET '/api/products'
router.get('/', async (req, res) => {
  // 5. Use a try/catch block. Since database calls take time (over the internet), they might fail or timeout.
  // The try/catch block ensures our server doesn't crash if an error occurs.
  try {
    // 6. Tell Mongoose to find ALL documents in the 'products' collection.
    // We 'await' the result so the rest of the code pauses until the database responds.
    const products = await Product.find({});
    
    // 7. If successful, respond with an HTTP 200 (OK) status code and send the products array back as JSON
    res.status(200).json(products);
  } catch (error) {
    // 8. If something goes wrong, log the technical error to the server console (for developers to see)
    console.error('Error fetching products:', error.message);
    
    // 9. Send an HTTP 500 (Internal Server Error) response back to the client.
    // We send a generic, safe message so we don't accidentally leak sensitive database details to hackers.
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve products from the database.'
    });
  }
});

// 10. Export this router so it can be imported and mounted by server.js
module.exports = router;
