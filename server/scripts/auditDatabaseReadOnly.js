const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const safety = require('./databaseSafety');
const { loadSelectedDatabaseEnvironment } = require('../config/databaseEnvironment');

const models = [Product, User, Cart, Order];
const SAFE_ERROR_NAMES = new Set([
  'Error', 'SafetyError', 'TypeError', 'RangeError', 'SyntaxError', 'AggregateError',
  'MongoAPIError', 'MongoNetworkError', 'MongoNetworkTimeoutError',
  'MongoOperationTimeoutError', 'MongoParseError', 'MongoServerError',
  'MongoServerSelectionError', 'MongooseServerSelectionError',
  'MongoSystemError', 'MongoTopologyClosedError'
]);
const SAFE_ERROR_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  'EHOSTUNREACH', 'ENETUNREACH', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_SSL_WRONG_VERSION_NUMBER', 'ERR_SSL_CERTIFICATE_VERIFY_FAILED',
  'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA', 'ERR_SOCKET_CLOSED',
  'ERR_MONGODB_AUTHENTICATION_FAILED'
]);

function safeProperty(value, key) {
  try { return value?.[key]; } catch { return undefined; }
}

// Remove likely credentials and connection details before diagnostic output.
function redactDiagnosticMessage(value) {
  if (typeof value !== 'string') return undefined;
  return value
    .replace(/\b(?:mongodb(?:\+srv)?|https?|wss?):\/\/[^\s"'<>]+/gi, '[REDACTED_URI]')
    .replace(/\b[^\s/@:]+:[^\s/@]+@[^\s/]+/g, '[REDACTED_CREDENTIALS]')
    .replace(/\b(password|passwd|pwd|token|secret|authorization|credential|api[_-]?key|access[_-]?key|auth(?:source|mechanism)?|username|user)\b\s*([:=])\s*("[^"]*"|'[^']*'|[^\s,;&]+)/gi, '$1$2[REDACTED]')
    .replace(/\b(user(?:name)?\s+)("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_TOKEN]')
    .replace(/\?[^\s"'<>]+/g, '?[REDACTED_QUERY]')
    .slice(0, 1000);
}

// Keep only recognized error names/codes and a redacted, bounded message.
function safeErrorSummary(error) {
  const rawName = safeProperty(error, 'name');
  const rawCode = safeProperty(error, 'code');
  const rawMessage = typeof error === 'string' ? error : safeProperty(error, 'message');
  const summary = {
    name: typeof rawName === 'string' && SAFE_ERROR_NAMES.has(rawName) ? rawName : 'Error'
  };
  if (Number.isInteger(rawCode) && rawCode >= 0 && rawCode <= 100_000) {
    summary.code = rawCode;
  } else if (typeof rawCode === 'string' && SAFE_ERROR_CODES.has(rawCode)) {
    summary.code = rawCode;
  }
  const message = redactDiagnosticMessage(rawMessage);
  if (message !== undefined) summary.message = message;
  return summary;
}

// Include a short, cycle-safe chain of causes to help locate the failing stage.
function createSafeDiagnostic(stage, error) {
  const safeStage = typeof stage === 'string' && /^[a-z][a-zA-Z0-9_.-]{0,63}$/.test(stage)
    ? stage
    : 'unknown';
  const first = safeErrorSummary(error);
  const causes = [];
  const visited = new Set();
  let current = safeProperty(error, 'cause');
  while (current && (typeof current === 'object' || typeof current === 'function') && causes.length < 4 && !visited.has(current)) {
    visited.add(current);
    causes.push(safeErrorSummary(current));
    current = safeProperty(current, 'cause');
  }
  return { stage: safeStage, error: first, causes };
}

// Emit one JSON diagnostic without exposing raw error objects.
function writeSafeDiagnostic(stream, stage, error) {
  stream.write(`${JSON.stringify(createSafeDiagnostic(stage, error))}\n`);
}

function connectReadOnly(uri) {
  // Model compilation records schema indexes, and Mongoose can otherwise create
  // collections/indexes automatically when the connection opens. Disable both
  // behaviors explicitly; the audit only inspects existing database metadata/data.
  return mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    autoCreate: false,
    autoIndex: false
  });
}

function readDay1SeedNames() {
  const seedPath = path.resolve(__dirname, '../seed/seedProducts.js');
  const source = fs.readFileSync(seedPath, 'utf8');
  // Parse only the literal name fields; never require or execute the destructive seed script.
  const names = [...source.matchAll(/^\s*name:\s*(['"])(.*?)\1\s*,?\s*$/gm)].map((match) => match[2]);
  return names.length === 18 && new Set(names).size === 18 ? names : null;
}

async function run(options = {}) {
  loadSelectedDatabaseEnvironment();
  const argv = options.argv || process.argv.slice(2);
  const env = options.env || process.env;
  const connect = options.connect || connectReadOnly;
  const getDatabase = options.getDatabase || (() => mongoose.connection.db);
  const disconnect = options.disconnect || (() => mongoose.disconnect());
  const isConnected = options.isConnected || (() => mongoose.connection.readyState !== 0);
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  let connected = false;
  let stage = 'preflight';
  let exitCode = 0;
  try {
    // Validate the selected target before opening the intentionally read-only connection.
    const target = await safety.connectAfterPreflight({
      mode: process.env.URBANKART_DB_PROFILE === 'atlas-demo' ? 'atlas-demo-read' : 'audit',
      argv,
      env,
      connect: (uri) => {
        stage = 'connection';
        return connect(uri);
      }
    });
    connected = true;
    const db = getDatabase();
    const diagnostics = [];
    stage = 'metadata.collectionListing';
    const collections = await db.listCollections({}, { nameOnly: false }).toArray();
    const result = {
      database: target.databaseName,
      connected: true,
      topology: null,
      serverMetadata: { version: null, versionArray: null, maxWireVersion: null },
      collections: [],
      diagnostics,
      modelSchemaPaths: Object.fromEntries(models.map((model) => [model.collection.name, Object.keys(model.schema.paths)])),
      schemaCompatibilityReview: 'Compare each local modelSchemaPaths entry with the same-named collection validator and indexes below; this report supplies both sides but does not mutate or certify validators.',
      day1SeedProducts: { expectedNames: 18, matchedByName: null, missingNames: null, status: 'unverified' },
      notes: ['Read-only tool: no writes, collection creation, index changes, or validator changes are performed.']
    };

    stage = 'metadata.hello';
    try {
      const hello = await db.admin().command({ hello: 1 });
      result.topology = safety.classifyTopology(hello);
      result.topology.setNamePresent = Boolean(hello.setName);
      result.topology.shardRouter = hello.msg === 'isdbgrid';
      result.serverMetadata.maxWireVersion = Number.isInteger(hello.maxWireVersion) ? hello.maxWireVersion : null;
      stage = 'metadata.buildInfo';
      try {
        const buildInfo = await db.admin().command({ buildInfo: 1 });
        result.serverMetadata.version = buildInfo.version || null;
        result.serverMetadata.versionArray = Array.isArray(buildInfo.versionArray) ? buildInfo.versionArray : null;
      } catch (error) {
        diagnostics.push(createSafeDiagnostic(stage, error));
      }
      stage = 'metadata.transactionAssessment';
      result.topology.transactionVersionRequirementMet = safety.assessTransactionVersion(
        result.topology, result.serverMetadata.versionArray
      );
    } catch (error) {
      diagnostics.push(createSafeDiagnostic(stage, error));
      result.topology = { name: 'unverified', transactionsSupported: false, transactionVersionRequirementMet: null, reason: 'hello command unavailable' };
    }

    // Collect existing collection counts, validators, and indexes without modifying them.
    for (const info of collections) {
      stage = 'metadata.collectionHandle';
      const collection = db.collection(info.name);
      let documentCount = null;
      let indexes = null;
      let indexError = false;
      stage = 'metadata.collectionCount';
      try { documentCount = await collection.countDocuments({}); } catch (error) {
        diagnostics.push(createSafeDiagnostic(stage, error));
      }
      stage = 'metadata.indexListing';
      try { indexes = await collection.listIndexes().toArray(); } catch (error) {
        indexError = true;
        diagnostics.push(createSafeDiagnostic(stage, error));
      }
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

    // Report whether carts have an index on userId and whether the metadata was readable.
    const cartCollection = result.collections.find((item) => item.name === Cart.collection.name);
    const cartUserIndexes = cartCollection?.indexes?.filter((index) => index.key?.userId === 1) || [];
    result.cartUserIdIndex = {
      indexes: cartUserIndexes,
      unique: cartUserIndexes.some((index) => index.unique === true),
      verified: Boolean(cartCollection && !cartCollection.indexMetadataUnverified)
    };

    stage = 'metadata.day1StaticSeedNames';
    // Compare expected seed names only; matching names do not prove data provenance.
    const seedNames = readDay1SeedNames();
    if (seedNames) {
      stage = 'lookup.day1ProductNames';
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
    stage = 'output.auditReport';
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const isSafetyFailure = error instanceof safety.SafetyError;
    const label = isSafetyFailure ? 'Database audit refused' : 'Database audit failed';
    const diagnostic = createSafeDiagnostic(stage, error);
    if (error instanceof safety.SafetyError) {
      exitCode = 2;
    } else {
      exitCode = 1;
    }
    stderr.write(`${label}: ${JSON.stringify(diagnostic)}\n`);
  } finally {
    // Close the connection even when preflight or one of the read-only queries fails.
    let shouldDisconnect = connected;
    if (!shouldDisconnect) {
      try { shouldDisconnect = Boolean(isConnected()); } catch (error) {
        stderr.write(`Database audit cleanup check failed: ${JSON.stringify(createSafeDiagnostic('cleanup.connectionState', error))}\n`);
        exitCode = 1;
      }
    }
    if (shouldDisconnect) {
      try { await disconnect(); } catch (error) {
        stderr.write(`Database audit cleanup failed: ${JSON.stringify(createSafeDiagnostic('cleanup.disconnect', error))}\n`);
        exitCode = 1;
      }
    }
  }
  return exitCode;
}

if (require.main === module) {
  run().then((code) => { process.exitCode = code; }).catch((error) => {
    writeSafeDiagnostic(process.stderr, 'audit.runner', error);
    process.exitCode = 1;
  });
}
module.exports = { readDay1SeedNames, connectReadOnly, createSafeDiagnostic, writeSafeDiagnostic, run };
