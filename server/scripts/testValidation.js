require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function testValidation() {
  try {
    console.log("Connecting to Atlas...");
    // Connect directly using mongoose connection (bypassing Mongoose Models)
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    console.log("Connected successfully.\n");

    const dummyId = new mongoose.Types.ObjectId();

    // =========================================
    // TEST 1: Valid Write
    // =========================================
    console.log("--- TEST 1: Valid Document Insertion ---");
    try {
      await db.collection('products').insertOne({
        name: "Test Secure Keyboard",
        price: 150,
        stock: 20,
        category: "Peripherals",
        attributes: [{ key: "Switch", value: "Mechanical" }]
      });
      console.log("✅ PASSED: Valid Product successfully inserted into MongoDB.");
    } catch (err) {
      console.error("❌ FAILED: Valid Product insertion rejected.", err.message);
    }

    // =========================================
    // TEST 2: Invalid Write (Negative Price)
    // =========================================
    console.log("\n--- TEST 2: Invalid Document (Negative Price) ---");
    try {
      await db.collection('products').insertOne({
        name: "Hacked Keyboard",
        price: -50, // Deliberate failure: Price minimum is 0
        stock: 20,
        category: "Peripherals"
      });
      console.error("❌ FAILED: DB allowed the negative price insertion! Firewall failed.");
    } catch (err) {
      if (err.code === 121) {
        console.log("✅ PASSED: MongoDB natively REJECTED the negative price (Error 121: DocumentValidationFailure).");
      } else {
        console.error("❌ FAILED: Rejected, but for an unexpected reason:", err.message);
      }
    }

    // =========================================
    // TEST 3: Invalid Write (Missing Required Field)
    // =========================================
    console.log("\n--- TEST 3: Invalid Document (Missing Role in User) ---");
    try {
      await db.collection('users').insertOne({
        name: "Ghost User",
        email: "ghost@example.com",
        passwordHash: "12345"
        // Missing 'role'
      });
      console.error("❌ FAILED: DB allowed the user insertion without a role! Firewall failed.");
    } catch (err) {
      if (err.code === 121) {
        console.log("✅ PASSED: MongoDB natively REJECTED the missing 'role' field (Error 121).");
      } else {
        console.error("❌ FAILED: Rejected, but for an unexpected reason:", err.message);
      }
    }

    // =========================================
    // CLEANUP
    // =========================================
    await db.collection('products').deleteMany({ name: "Test Secure Keyboard" });
    console.log("\nCleanup complete.");

  } catch (error) {
    console.error("\n❌ Fatal Test Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from Atlas.");
  }
}

testValidation();
