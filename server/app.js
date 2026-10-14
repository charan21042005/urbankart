const express = require('express');
const authRoutes = require('./routes/authRoutes');
const cartRoutes = require('./routes/cartRoutes');
const productRoutes = require('./routes/productRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'success',
    message: 'UrbanKart backend is running successfully.',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/products', productRoutes);
app.use('/api/reviews', reviewRoutes);

// Keep malformed JSON and request-size errors in the API's JSON response format.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ status: 'error', message: 'Request body is too large.' });
  }
  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({ status: 'error', message: 'Request body must be valid JSON.' });
  }
  return res.status(500).json({ status: 'error', message: 'Unexpected server error.' });
});

module.exports = app;
