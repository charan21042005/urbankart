const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('node:path');
const app = require('./app');

dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('FATAL ERROR: MONGODB_URI is not defined in the environment variables.');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected via Mongoose');
    const server = HOST
      ? app.listen(PORT, HOST, () => console.log(`Server is running on ${HOST}:${PORT}`))
      : app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
    server.on('error', () => {
      console.error('ERROR: Express could not listen on the configured address.');
      process.exit(1);
    });
  })
  .catch(() => {
    console.error('ERROR: Failed to connect to MongoDB. Connection details were suppressed.');
    process.exit(1);
  });
