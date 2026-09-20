// 1. Load the secret variables from the .env file (e.g. MONGODB_URI)
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// 2. Import mongoose to interact with the database
const mongoose = require('mongoose');

// 3. Define an asynchronous function to test if our database firewall actually works
async function testDbValidation() {
  try {
    // 4. Connect to the Atlas cluster using our secret connection string
    await mongoose.connect(process.env.MONGODB_URI);
    
    // 5. Access the raw MongoDB native driver. 
    // We intentionally bypass Mongoose here to prove that the database itself protects the data.
    const db = mongoose.connection.db;

    console.log('--- DELIBERATE VALIDATION FAILURE TEST ---');
    
    try {
      // 6. Deliberately try to insert an illegal product directly into the database engine.
      // The stock is -5, which violates our minimum: 0 rule.
      await db.collection('products').insertOne({
        name: 'Invalid Item',
        price: 10,
        stock: -5,
        category: 'Test'
      });
      
      // 7. If this line prints, our firewall FAILED and allowed bad data into the database!
      console.log('❌ DB allowed negative stock! THIS SHOULD FAIL.');
    } catch(e) {
      // 8. If the database engine blocks the insert, it will throw an error.
      // Error code 121 means "DocumentValidationFailure". This is exactly what we want!
      if (e.code === 121) {
        console.log('✅ DB natively REJECTED negative stock (Error 121: DocumentValidationFailure)');
      } else {
        // If it throws a different error, something else broke (like no internet connection)
        console.log('❌ Unexpected error:', e.message);
      }
    }
  } finally {
    // 9. Always disconnect so the script doesn't hang in the terminal.
    await mongoose.disconnect();
  }
}

// 10. Execute the test
testDbValidation();
