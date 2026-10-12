const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const safety = require('./databaseSafety');

const models = [Product, User, Cart, Order];

function readDay1SeedNames() {
  const seedPath = path.resolve(__dirname, '../seed/seedProducts.js');
  const source = fs.readFileSync(seedPath, 'utf8');
  // Parse only the literal name fields; never require or execute the destructive seed script.
  const names = [...source.matchAll(/^\s*name:\s*(['"])(.*?)\1\s*,?\s*$/gm)].map((match) => match[2]);
  return names.length === 18 && new Set(names).size === 18 ? names : null;
}

async function run() {
  let connected = false;
  try {
    const target = await safety.connectAfterPreflight({
      mode: 'audit',
      connect: (uri) => mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 })
    });
    connected = true;
    const db = mongoose.connection.db;
    const collections = await db.listCollections({}, { nameOnly: false }).toArray();
    const result = {
      database: target.databaseName,
      connected: true,
      topology: null,
      serverMetadata: { version: null, versionArray: null, maxWireVersion: null },
      collections: [],
      modelSchemaPaths: Object.fromEntries(models.map((model) => [model.collection.name, Object.keys(model.schema.paths)])),
      schemaCompatibilityReview: 'Compare each local modelSchemaPaths entry with the same-named collection validator and indexes below; this report supplies both sides but does not mutate or certify validators.',
      day1SeedProducts: { expectedNames: 18, matchedByName: null, missingNames: null, status: 'unverified' },
      notes: ['Read-only tool: no writes, collection creation, index changes, or validator changes are performed.']
    };

    try {
      const hello = await db.admin().command({ hello: 1 });
      result.topology = safety.classifyTopology(hello);
      result.topology.setNamePresent = Boolean(hello.setName);
      result.topology.shardRouter = hello.msg === 'isdbgrid';
      result.serverMetadata.maxWireVersion = Number.isInteger(hello.maxWireVersion) ? hello.maxWireVersion : null;
      try {
        const buildInfo = await db.admin().command({ buildInfo: 1 });
        result.serverMetadata.version = buildInfo.version || null;
        result.serverMetadata.versionArray = Array.isArray(buildInfo.versionArray) ? buildInfo.versionArray : null;
      } catch { /* server version remains unverified if permission is restricted */ }
      result.topology.transactionVersionRequirementMet = safety.assessTransactionVersion(
        result.topology, result.serverMetadata.versionArray
      );
    } catch {
      result.topology = { name: 'unverified', transactionsSupported: false, transactionVersionRequirementMet: null, reason: 'hello command unavailable' };
    }

    for (const info of collections) {
      const collection = db.collection(info.name);
      let documentCount = null;
      let indexes = null;
      let indexError = false;
      try { documentCount = await collection.countDocuments({}); } catch { /* report inaccessible metadata */ }
      try { indexes = await collection.listIndexes().toArray(); } catch { indexError = true; }
      result.collections.push({
        name: info.name,
        documentCount,
        validator: info.options?.validator || null,
        validationLevel: info.options?.validationLevel || null,
        validationAction: info.options?.validationAction || null,
        indexes,
        indexMetadataUnverified: indexError
      });
    }

    const cartCollection = result.collections.find((item) => item.name === Cart.collection.name);
    const cartUserIndexes = cartCollection?.indexes?.filter((index) => index.key?.userId === 1) || [];
    result.cartUserIdIndex = {
      indexes: cartUserIndexes,
      unique: cartUserIndexes.some((index) => index.unique === true),
      verified: Boolean(cartCollection && !cartCollection.indexMetadataUnverified)
    };

    const seedNames = readDay1SeedNames();
    if (seedNames) {
      const productCollection = db.collection(Product.collection.name);
      const matches = await productCollection.find({ name: { $in: seedNames } }, { projection: { _id: 1, name: 1 } }).toArray();
      const matchedNames = new Set(matches.map((item) => item.name));
      result.day1SeedProducts = {
        expectedNames: seedNames.length,
        matchedByName: matchedNames.size,
        missingNames: seedNames.filter((name) => !matchedNames.has(name)),
        status: 'name match only; database records have no Day 1 provenance marker'
      };
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    if (error instanceof safety.SafetyError) {
      process.stderr.write(`Database audit refused: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write('Database audit could not complete; connection or metadata remains unverified.\n');
      process.exitCode = 1;
    }
  } finally {
    if (connected || mongoose.connection.readyState !== 0) {
      try { await mongoose.disconnect(); } catch { process.exitCode = 1; }
    }
  }
}

if (require.main === module) run();
module.exports = { readDay1SeedNames, run };
