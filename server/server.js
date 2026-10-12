const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('node:path');
const app = require('./app');

dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('FATAL ERROR: MONGODB_URI is not defined in the environment variables.');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected via Mongoose');
    app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
  })
  .catch((error) => {
    console.error('ERROR: Failed to connect to MongoDB.', error.message);
    process.exit(1);
  });
