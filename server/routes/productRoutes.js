const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// GET /api/products
// Retrieves all products from the MongoDB database
router.get('/', async (req, res) => {
  try {
    // Mongoose reads from the 'products' collection in MongoDB
    const products = await Product.find({});
    
    // Express responds with HTTP 200 OK and sends the raw JSON array back
    res.status(200).json(products);
  } catch (error) {
    console.error('Error fetching products:', error.message);
    // Properly format the error as JSON and send HTTP 500 (Internal Server Error)
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve products from the database.'
    });
  }
});

module.exports = router;
