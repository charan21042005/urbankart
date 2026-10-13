const path = require('node:path');
const net = require('node:net');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

class SafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SafetyError';
  }
}

function argumentValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1 || !argv[index + 1] || argv[index + 1].startsWith('--')) return null;
  if (argv.indexOf(flag, index + 1) !== -1) return null;
  return argv[index + 1];
}

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
  if (pathName && queryName && pathName !== queryName) {
    throw new SafetyError('The URI path and dbName option select different databases.');
  }
  if (!pathName || pathName.includes('/')) {
    throw new SafetyError('MONGODB_URI must explicitly select one database in its URI path.');
  }
  return pathName;
}

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

function validatePreflight({ mode, argv, env }) {
  const isAudit = mode === 'audit';
  const flag = isAudit ? '--confirm-isolated-db' : '--confirm-test-db';
  if (!isAudit && mode !== 'integration-test') throw new SafetyError('Unknown database tool mode.');

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

  if (!isAudit) {
    if (!env.URBANKART_TEST_DB_NAME || env.URBANKART_TEST_DB_NAME !== configuredName) {
      throw new SafetyError('URBANKART_TEST_DB_NAME must exactly match the explicitly confirmed disposable test database.');
    }
    if (env.URBANKART_TXN_TOPOLOGY_CONFIRMED !== 'replicaSet') {
      throw new SafetyError('Local integration tests require URBANKART_TXN_TOPOLOGY_CONFIRMED=replicaSet and a matching replicaSet URI option.');
    }
  }

  const localTopology = isAudit ? null : validateLocalReplicaSetUri(env.MONGODB_URI);
  if (!isAudit && (!env.URBANKART_TXN_REPLICA_SET_NAME
      || env.URBANKART_TXN_REPLICA_SET_NAME !== localTopology.replicaSet)) {
    throw new SafetyError('URBANKART_TXN_REPLICA_SET_NAME must match the replicaSet value in the local MongoDB URI.');
  }
  return { databaseName: configuredName, uri: env.MONGODB_URI, expectedReplicaSetName: localTopology?.replicaSet || null };
}

async function connectAfterPreflight({ mode, argv = process.argv.slice(2), env = process.env, connect }) {
  if (typeof connect !== 'function') throw new TypeError('A connection function is required.');
  const target = validatePreflight({ mode, argv, env });
  const connection = await connect(target.uri);
  const selectedName = connection?.connection?.name || connection?.name;
  if (selectedName !== target.databaseName) {
    try { await connection?.disconnect?.(); } catch { /* preserve the safety failure */ }
    throw new SafetyError('The connected database name does not match the confirmed database. Connection closed.');
  }
  return { ...target, connection };
}

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
  validateLocalReplicaSetUri
};
