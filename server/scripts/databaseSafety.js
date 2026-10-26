const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

// Use a distinct error type so callers can report a refused target separately.
class SafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SafetyError';
  }
}

// Read a single flag value; repeated or value-less flags are treated as invalid.
function argumentValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1 || !argv[index + 1] || argv[index + 1].startsWith('--')) return null;
  if (argv.indexOf(flag, index + 1) !== -1) return null;
  return argv[index + 1];
}

// Resolve the database name encoded by the URI and reject ambiguous selection.
function getUriDatabaseName(uri) {
  if (typeof uri !== 'string' || !uri) throw new SafetyError('MONGODB_URI is not configured.');
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new SafetyError('MONGODB_URI is not a valid MongoDB connection URI.');
  }
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new SafetyError('MONGODB_URI must use mongodb:// or mongodb+srv:// and identify a host.');
  }
  let pathName = '';
  try {
    pathName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    throw new SafetyError('MONGODB_URI contains an invalid database path.');
  }
  const queryName = parsed.searchParams.get('dbName');
  if (parsed.searchParams.getAll('dbName').length > 1) {
    throw new SafetyError('MONGODB_URI contains ambiguous repeated dbName options.');
  }
  if (pathName && queryName && pathName !== queryName) {
    throw new SafetyError('The URI path and dbName option select different databases.');
  }
  if (!pathName || pathName.includes('/')) {
    throw new SafetyError('MONGODB_URI must explicitly select one database in its URI path.');
  }
  return pathName;
}

// Limit local integration targets to literal loopback hosts and one replica set.
function validateLocalReplicaSetUri(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('mongodb://')) {
    throw new SafetyError('Integration tests require a mongodb:// URI with loopback hosts and an explicit replicaSet option.');
  }
  let parsed;
  try { parsed = new URL(uri); }
  catch { throw new SafetyError('Integration-test MongoDB URI is invalid.'); }
  const authority = uri.slice('mongodb://'.length).split(/[/?#]/, 1)[0];
  const hostList = authority.slice(authority.lastIndexOf('@') + 1);
  if (!hostList) throw new SafetyError('Integration-test URI must identify a loopback MongoDB host.');
  const hosts = hostList.split(',');
  if (hosts.some((entry) => !entry)) throw new SafetyError('Integration-test URI contains an invalid host list.');
  for (const entry of hosts) {
    let hostname;
    if (entry.startsWith('[')) {
      const close = entry.indexOf(']');
      if (close < 0) throw new SafetyError('Integration-test URI contains an invalid IPv6 host.');
      hostname = entry.slice(1, close).toLowerCase();
    } else {
      hostname = entry.replace(/:\d+$/, '').toLowerCase();
    }
    const loopback = hostname === 'localhost' || hostname === '::1'
      || (net.isIP(hostname) === 4 && hostname.split('.')[0] === '127');
    if (!loopback) throw new SafetyError('Integration tests may connect only to localhost or a literal loopback IP address.');
  }
  const replicaSet = parsed.searchParams.get('replicaSet');
  if (!replicaSet || parsed.searchParams.getAll('replicaSet').length !== 1) {
    throw new SafetyError('Integration-test URI must explicitly select one local replica set with replicaSet=<name>.');
  }
  return { replicaSet };
}

// Check the live hello response and reject replica sets advertising remote members.
function validateLocalReplicaSetHello(hello, expectedName) {
  if (hello?.setName !== expectedName || hello?.isWritablePrimary !== true) {
    throw new SafetyError('Connected server is not the confirmed writable local replica-set primary.');
  }
  const members = [...(hello.hosts || []), ...(hello.passives || []), ...(hello.arbiters || [])];
  if (!members.length) throw new SafetyError('The connected replica set did not report any verifiable members.');
  for (const member of members) {
    try {
      validateLocalReplicaSetUri(`mongodb://${member}/urbankart_preflight?replicaSet=${encodeURIComponent(expectedName)}`);
    } catch {
      throw new SafetyError('The connected replica set advertises a non-loopback member. No database writes were performed.');
    }
  }
  return true;
}

// Verify Atlas profile, explicit target confirmation, pinned host, and topology.
function validateAtlasDemoPreflight({ argv = process.argv.slice(2), env = process.env, readOnly = false }) {
  const confirmedName = argumentValue(argv, readOnly ? '--confirm-atlas-read-db' : '--confirm-atlas-demo-db');
  if (confirmedName !== 'urbankart_atlas_demo' || env.URBANKART_EXPECTED_DB_NAME !== 'urbankart_atlas_demo'
      || confirmedName !== env.URBANKART_EXPECTED_DB_NAME) {
    throw new SafetyError(`Atlas ${readOnly ? 'reads' : 'writes'} require the exact target confirmation --confirm-atlas-${readOnly ? 'read' : 'demo'}-db urbankart_atlas_demo.`);
  }
  if (env.URBANKART_DB_PROFILE !== 'atlas-demo' || env.URBANKART_DB_ENV !== 'atlas-demo') {
    throw new SafetyError('Atlas writes require the explicitly selected atlas-demo environment profile.');
  }
  if (env.URBANKART_ATLAS_CLUSTER_NAME !== 'urbankart-cluster') {
    throw new SafetyError('Confirm the existing Atlas cluster name as urbankart-cluster in the local Atlas profile.');
  }
  let parsed;
  try { parsed = new URL(env.MONGODB_URI); }
  catch { throw new SafetyError('Atlas profile must contain a valid MongoDB URI.'); }
  if (parsed.protocol !== 'mongodb+srv:' || !parsed.hostname.toLowerCase().endsWith('.mongodb.net')) {
    throw new SafetyError('Atlas writes require the selected Atlas SRV endpoint; local and arbitrary remote hosts are refused.');
  }
  if (getUriDatabaseName(env.MONGODB_URI) !== 'urbankart_atlas_demo') {
    throw new SafetyError('Atlas URI must explicitly select urbankart_atlas_demo.');
  }
  const expectedHostHash = env.URBANKART_ATLAS_HOST_SHA256;
  const actualHostHash = crypto.createHash('sha256').update(parsed.hostname.toLowerCase()).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(expectedHostHash || '') || actualHostHash !== expectedHostHash) {
    throw new SafetyError('Atlas endpoint does not match the pinned local Atlas host identity.');
  }
  const expectedTopology = env.URBANKART_TXN_TOPOLOGY_CONFIRMED;
  if (!['replicaSet', 'sharded'].includes(expectedTopology)) {
    throw new SafetyError('Set the Atlas transaction topology only after checking the live cluster topology.');
  }
  return { databaseName: 'urbankart_atlas_demo', uri: env.MONGODB_URI, expectedTopology };
}

// Confirm the normal API is configured for the explicitly isolated local database.
function validateLocalServerTarget(env = process.env) {
  if (!env.URBANKART_EXPECTED_DB_NAME || getUriDatabaseName(env.MONGODB_URI) !== env.URBANKART_EXPECTED_DB_NAME) {
    throw new SafetyError('Local server URI and URBANKART_EXPECTED_DB_NAME must select the same explicit database.');
  }
  if (env.URBANKART_DB_ENV !== 'isolated-development' || env.URBANKART_TXN_TOPOLOGY_CONFIRMED !== 'replicaSet') {
    throw new SafetyError('Local server requires isolated-development and an explicitly confirmed local replica set.');
  }
  const topology = validateLocalReplicaSetUri(env.MONGODB_URI);
  if (!env.URBANKART_TXN_REPLICA_SET_NAME || topology.replicaSet !== env.URBANKART_TXN_REPLICA_SET_NAME) {
    throw new SafetyError('Local server replica-set name must match the URI topology.');
  }
  return { databaseName: env.URBANKART_EXPECTED_DB_NAME, expectedReplicaSetName: topology.replicaSet };
}

// Compare the live Atlas topology and version against the operator's attestation.
function validateAtlasDemoHello(hello, versionArray, expectedTopology) {
  const topology = classifyTopology(hello);
  if (topology.name !== expectedTopology || !topology.transactionsSupported) {
    throw new SafetyError('Live Atlas topology differs from the confirmed transaction-capable topology.');
  }
  if (assessTransactionVersion(topology, versionArray) !== true) {
    throw new SafetyError('Live Atlas server version does not meet the transaction support requirement.');
  }
  return { name: topology.name, transactionsSupported: true };
}

// Apply common target checks, with stricter requirements for writes and integration.
function validatePreflight({ mode, argv, env }) {
  const isAudit = mode === 'audit';
  const isIntegration = mode === 'integration-test';
  const isLocalWrite = mode === 'local-write';
  const flag = isAudit ? '--confirm-isolated-db' : isLocalWrite ? '--confirm-local-db' : '--confirm-test-db';
  if (!isAudit && !isIntegration && !isLocalWrite) throw new SafetyError('Unknown database tool mode.');

  const confirmedName = argumentValue(argv, flag);
  if (!confirmedName) throw new SafetyError(`Required explicit confirmation: ${flag} <database-name>.`);
  const configuredName = env.URBANKART_EXPECTED_DB_NAME;
  if (!configuredName) throw new SafetyError('Set URBANKART_EXPECTED_DB_NAME in the local root .env after independently confirming the target.');
  if (confirmedName !== configuredName) throw new SafetyError('The command confirmation does not match URBANKART_EXPECTED_DB_NAME.');

  const uriName = getUriDatabaseName(env.MONGODB_URI);
  if (uriName !== configuredName) throw new SafetyError('The database selected by MONGODB_URI does not match URBANKART_EXPECTED_DB_NAME.');
  if (env.URBANKART_DB_ENV !== 'isolated-development') {
    throw new SafetyError('Set URBANKART_DB_ENV=isolated-development only after confirming the Atlas project and cluster are isolated and non-production.');
  }

  if (isIntegration) {
    if (!env.URBANKART_TEST_DB_NAME || env.URBANKART_TEST_DB_NAME !== configuredName) {
      throw new SafetyError('URBANKART_TEST_DB_NAME must exactly match the explicitly confirmed disposable test database.');
    }
    if (env.URBANKART_TXN_TOPOLOGY_CONFIRMED !== 'replicaSet') {
      throw new SafetyError('Local integration tests require URBANKART_TXN_TOPOLOGY_CONFIRMED=replicaSet and a matching replicaSet URI option.');
    }
  }

  const localTopology = isAudit ? null : validateLocalReplicaSetUri(env.MONGODB_URI);
  if (!isAudit && env.URBANKART_TXN_TOPOLOGY_CONFIRMED !== 'replicaSet') {
    throw new SafetyError('Local database writes require URBANKART_TXN_TOPOLOGY_CONFIRMED=replicaSet.');
  }
  if (!isAudit && (!env.URBANKART_TXN_REPLICA_SET_NAME
      || env.URBANKART_TXN_REPLICA_SET_NAME !== localTopology.replicaSet)) {
    throw new SafetyError('URBANKART_TXN_REPLICA_SET_NAME must match the replicaSet value in the local MongoDB URI.');
  }
  return { databaseName: configuredName, uri: env.MONGODB_URI, expectedReplicaSetName: localTopology?.replicaSet || null };
}

// Run preflight before connecting, then confirm the driver's selected DB name.
async function connectAfterPreflight({ mode, argv = process.argv.slice(2), env = process.env, connect }) {
  if (typeof connect !== 'function') throw new TypeError('A connection function is required.');
  const target = mode === 'atlas-demo-write' || mode === 'atlas-demo-read'
    ? validateAtlasDemoPreflight({ argv, env, readOnly: mode === 'atlas-demo-read' })
    : validatePreflight({ mode, argv, env });
  const connection = await connect(target.uri);
  const selectedName = connection?.connection?.name || connection?.name;
  if (selectedName !== target.databaseName) {
    try { await connection?.disconnect?.(); } catch { /* preserve the safety failure */ }
    throw new SafetyError('The connected database name does not match the confirmed database. Connection closed.');
  }
  return { ...target, connection };
}

// Classify a MongoDB hello result and whether its topology supports transactions.
function classifyTopology(hello) {
  if (hello?.msg === 'isdbgrid') return { name: 'sharded', transactionsSupported: true };
  if (typeof hello?.setName === 'string' && hello.setName) {
    return { name: 'replicaSet', transactionsSupported: true };
  }
  if (hello && (hello.isWritablePrimary === true || hello.ismaster === true)) {
    return { name: 'standalone', transactionsSupported: false };
  }
  return { name: 'unknown', transactionsSupported: false };
}

// Apply the minimum MongoDB version needed for transactions on this topology.
function assessTransactionVersion(topology, versionArray) {
  if (!topology?.transactionsSupported) return false;
  if (!Array.isArray(versionArray) || versionArray.length < 2 || !versionArray.every(Number.isInteger)) return null;
  const [major, minor] = versionArray;
  const minimumMinor = topology.name === 'sharded' ? 2 : 0;
  return major > 4 || (major === 4 && minor >= minimumMinor);
}

module.exports = {
  SafetyError,
  argumentValue,
  getUriDatabaseName,
  validatePreflight,
  connectAfterPreflight,
  classifyTopology,
  assessTransactionVersion,
  validateLocalReplicaSetUri,
  validateLocalReplicaSetHello,
  validateAtlasDemoPreflight,
  validateAtlasDemoHello,
  validateLocalServerTarget
};
