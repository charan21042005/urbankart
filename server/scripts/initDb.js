// 1. Load the secret variables from the .env file (e.g. MONGODB_URI)
// We use path.resolve to guarantee it finds the file even if we run the script from a different folder
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// 2. Import mongoose to interact with the database
const mongoose = require('mongoose');

// 3. Define an asynchronous function to apply the database firewall rules
async function initializeDatabase() {
  try {
    // 4. Connect to the Atlas cluster using our secret connection string
    await mongoose.connect(process.env.MONGODB_URI);
    
    // 5. Access the raw MongoDB native driver. We need this because Mongoose doesn't natively 
    // handle applying low-level collection schemas to the database engine.
    const db = mongoose.connection.db;

    // 6. Apply strict rules to the 'products' collection.
    // 'collMod' stands for Collection Modify. It tells Atlas to update the rules for this collection.
    await db.command({
      collMod: 'products',
      validator: {
        $jsonSchema: {
          // The product document must be a JSON object
          bsonType: 'object',
          // These specific fields MUST exist in every product document.
          required: ['name', 'price', 'stock', 'category'],
          properties: {
            // Name must be text
            name: { bsonType: 'string' },
            // Price must be a number, and cannot be negative
            price: { bsonType: 'number', minimum: 0 },
            // Stock must be a whole integer (no decimals), and cannot be negative
            stock: { bsonType: 'int', minimum: 0 },
            // Category must be text
            category: { bsonType: 'string' },
            // The dynamic attributes must be an array (a list)
            attributes: {
              bsonType: 'array',
              items: {
                // Every item in the array must be an object containing exactly a 'key' and a 'value'
                bsonType: 'object',
                required: ['key', 'value'],
                properties: {
                  key: { bsonType: 'string' },
                  value: { bsonType: 'string' }
                }
              }
            }
          }
        }
      },
      // 'strict' means all inserts and updates will be checked against these rules
      validationLevel: 'strict',
      // 'error' means if the rules are broken, MongoDB will block the save and throw an error 
      // (rather than just quietly logging a warning)
      validationAction: 'error'
    });
    
    // 7. If successful, print a success message to the console
    console.log('✅ Validation rules applied.');
  } finally {
    // 8. No matter what happens (success or crash), we MUST disconnect from the database.
    // If we don't, the script will hang forever in the terminal.
    await mongoose.disconnect();
  }
}

// 9. Execute the function we just defined
initializeDatabase();
