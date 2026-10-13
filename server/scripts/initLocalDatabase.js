const mongoose = require('mongoose');
const safety = require('./databaseSafety');
const { collectionValidators } = require('../db/collectionValidators');
const models = [
  require('../models/Product'), require('../models/User'), require('../models/Cart'),
  require('../models/Order'), require('../models/Review'), require('../models/Recommendation'),
  require('../models/CheckoutOperation')
];

async function initialize() {
  let connected = false;
  try {
    mongoose.set('autoCreate', false);
    mongoose.set('autoIndex', false);
    const target = await safety.connectAfterPreflight({
      mode: 'local-write',
      connect: (uri) => mongoose.connect(uri, {
        autoCreate: false,
        autoIndex: false,
        serverSelectionTimeoutMS: 10_000
      })
    });
    connected = true;
    const db = mongoose.connection.db;
    const hello = await db.admin().command({ hello: 1 });
    safety.validateLocalReplicaSetHello(hello, target.expectedReplicaSetName);

    // A database may only be initialized after both the URI and live server
    // identity pass the local-only gate. Create/modify just the seven known app collections.
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name));
    for (const [name, validator] of Object.entries(collectionValidators)) {
      if (!existing.has(name)) {
        await db.createCollection(name, { validator: { $jsonSchema: validator }, validationLevel: 'strict', validationAction: 'error' });
      } else {
        await db.command({
          collMod: name,
          validator: { $jsonSchema: validator },
          validationLevel: 'strict',
          validationAction: 'error'
        });
      }
    }
    await Promise.all(models.map((model) => model.createIndexes()));
    const applied = await db.listCollections({}, { nameOnly: false }).toArray();
    const verified = new Set(applied.filter((item) => item.options?.validator?.$jsonSchema).map((item) => item.name));
    for (const name of Object.keys(collectionValidators)) {
      if (!verified.has(name)) throw new Error('A required collection validator could not be verified.');
    }
    process.stdout.write(`${JSON.stringify({
      result: 'local schema initialized and verified',
      database: target.databaseName,
      topology: 'replicaSet',
      collections: Object.keys(collectionValidators),
      validatorsVerified: verified.size,
      indexesDeclared: models.reduce((sum, model) => sum + model.schema.indexes().length, 0)
    }, null, 2)}\n`);
  } catch (error) {
    if (error instanceof safety.SafetyError) process.stderr.write(`Local database initialization refused: ${error.message}\n`);
    else process.stderr.write('Local database initialization failed; connection details were suppressed.\n');
    process.exitCode = 1;
  } finally {
    if (connected || mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => { process.exitCode = 1; });
  }
}

if (require.main === module) initialize();
module.exports = { initialize };
