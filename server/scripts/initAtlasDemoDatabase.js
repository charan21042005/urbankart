const mongoose = require('mongoose');
const { loadSelectedDatabaseEnvironment } = require('../config/databaseEnvironment');
const safety = require('./databaseSafety');
const { collectionValidators } = require('../db/collectionValidators');
const models = [
  require('../models/Product'), require('../models/User'), require('../models/Cart'),
  require('../models/Order'), require('../models/Review'), require('../models/Recommendation'),
  require('../models/CheckoutOperation')
];

// Create validators and indexes only after the Atlas target passes safety checks.
async function initialize() {
  loadSelectedDatabaseEnvironment();
  let connected = false;
  try {
    if (process.env.URBANKART_DB_PROFILE !== 'atlas-demo') throw new safety.SafetyError('Select the atlas-demo profile before initialization.');
    mongoose.set('autoCreate', false);
    mongoose.set('autoIndex', false);
    const target = await safety.connectAfterPreflight({
      mode: 'atlas-demo-write', argv: process.argv.slice(2),
      connect: (uri) => mongoose.connect(uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10_000 })
    });
    connected = true;
    const db = mongoose.connection.db;
    const hello = await db.admin().command({ hello: 1 });
    const build = await db.admin().command({ buildInfo: 1 });
    const topology = safety.validateAtlasDemoHello(hello, build.versionArray, target.expectedTopology);

    // Refuse to initialize over any pre-existing collection/data. The read-only
    // audit command is the required next step if the target is no longer empty.
    // This initializer is deliberately first-run-only; inspect instead of overwriting data.
    const existing = await db.listCollections({}, { nameOnly: true }).toArray();
    if (existing.length) throw new safety.SafetyError('Atlas demo database is not empty. Run the read-only audit and review its schema before any initialization.');
    // Create each application collection with server-side document validation enabled.
    for (const [name, validator] of Object.entries(collectionValidators)) {
      await db.createCollection(name, { validator: { $jsonSchema: validator }, validationLevel: 'strict', validationAction: 'error' });
    }
    await Promise.all(models.map((model) => model.createIndexes()));
    // Re-read collection metadata to verify the server actually stored each validator.
    const applied = await db.listCollections({}, { nameOnly: false }).toArray();
    const verified = new Set(applied.filter((item) => item.options?.validator?.$jsonSchema).map((item) => item.name));
    for (const name of Object.keys(collectionValidators)) if (!verified.has(name)) throw new Error('A required collection validator could not be verified.');
    process.stdout.write(`${JSON.stringify({ result: 'Atlas demo schema initialized and verified', database: target.databaseName, topology: topology.name, collections: Object.keys(collectionValidators), validatorsVerified: verified.size, indexesDeclared: models.reduce((sum, model) => sum + model.schema.indexes().length, 0) }, null, 2)}\n`);
  } catch (error) {
    if (error instanceof safety.SafetyError) process.stderr.write(`Atlas demo initialization refused: ${error.message}\n`);
    else process.stderr.write('Atlas demo initialization failed; connection details were suppressed.\n');
    process.exitCode = 1;
  } finally {
    // Release the database connection regardless of whether setup succeeded.
    if (connected || mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => { process.exitCode = 1; });
  }
}

if (require.main === module) initialize();
module.exports = { initialize };
