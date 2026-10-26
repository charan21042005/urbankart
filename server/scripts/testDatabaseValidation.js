const mongoose = require('mongoose');
const safety = require('./databaseSafety');

const invalidDocuments = {
  // Each factory violates one required collection invariant for server validation.
  products: (id) => ({ _id: id, name: 'Invalid stock fixture', price: 1, stock: -1, category: 'Fixture', attributes: [] }),
  users: (id) => ({ _id: id, name: 'Invalid role fixture', email: `invalid-${id}@example.invalid`, passwordHash: 'not-a-real-password-hash', role: 'owner' }),
  carts: (id) => ({ _id: id, userId: new mongoose.Types.ObjectId(), items: [{ _id: new mongoose.Types.ObjectId(), productId: new mongoose.Types.ObjectId(), quantity: 0 }] }),
  orders: (id) => ({ _id: id, customerId: new mongoose.Types.ObjectId(), items: [{ productId: new mongoose.Types.ObjectId(), nameAtPurchase: 'Fixture', priceAtPurchase: 1, qty: 0 }], totalAmount: 0, status: 'pending', orderDate: new Date() }),
  reviews: (id) => ({ _id: id, productId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), rating: 6 }),
  recommendations: (id) => ({ _id: id, productId: new mongoose.Types.ObjectId(), relatedProducts: [{ _id: new mongoose.Types.ObjectId(), productId: new mongoose.Types.ObjectId(), score: 1.1 }], computedAt: new Date() }),
  checkoutoperations: (id) => ({ _id: id, userId: new mongoose.Types.ObjectId(), key: 'too-short', fingerprint: 'a'.repeat(64), orderId: new mongoose.Types.ObjectId(), completedAt: new Date() })
};

// Attempt one invalid insert per collection and require MongoDB to reject each.
async function verify(argv = process.argv.slice(2)) {
  let connected = false;
  try {
    mongoose.set('autoCreate', false);
    mongoose.set('autoIndex', false);
    const target = await safety.connectAfterPreflight({
      mode: 'local-write', argv,
      connect: (uri) => mongoose.connect(uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10_000 })
    });
    connected = true;
    const db = mongoose.connection.db;
    const hello = await db.admin().command({ hello: 1 });
    safety.validateLocalReplicaSetHello(hello, target.expectedReplicaSetName);

    const rejected = [];
    // A successful invalid insert is deleted by its exact sentinel ID before failing.
    for (const [name, makeInvalid] of Object.entries(invalidDocuments)) {
      const _id = new mongoose.Types.ObjectId();
      try {
        await db.collection(name).insertOne(makeInvalid(_id));
      } catch (error) {
        if (error.code !== 121) throw new Error(`Collection validator test failed for ${name}.`);
        rejected.push(name);
        continue;
      }
      // If server validation is missing or misconfigured, remove only this exact
      // synthetic sentinel before reporting the failed invariant.
      await db.collection(name).deleteOne({ _id });
      throw new Error(`The ${name} validator accepted an invalid test document.`);
    }
    process.stdout.write(`${JSON.stringify({ result: 'MongoDB rejected invalid documents', database: target.databaseName, topology: 'replicaSet', rejectedCollections: rejected }, null, 2)}\n`);
  } catch (error) {
    if (error instanceof safety.SafetyError) process.stderr.write(`Database validation test refused: ${error.message}\n`);
    else process.stderr.write('Database validation test failed; connection and document details were suppressed.\n');
    process.exitCode = 1;
  } finally {
    // Always close the connection opened for verification.
    if (connected || mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => { process.exitCode = 1; });
  }
}

if (require.main === module) verify();
module.exports = { invalidDocuments, verify };
