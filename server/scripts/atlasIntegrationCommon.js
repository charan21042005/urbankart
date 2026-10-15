const crypto = require('node:crypto');
const net = require('node:net');
const mongoose = require('mongoose');
const safety = require('./databaseSafety');
const { loadSelectedDatabaseEnvironment } = require('../config/databaseEnvironment');
const { LOCK_PATH, API_PROCESS_LOCK_PATH, acquireLocalProcessLock, acquireRecommendationSchedulerLock } = require('../jobs/recommendationSchedulerLock');

const TARGET_DB = 'urbankart_atlas_demo';
const TARGET_CLUSTER = 'urbankart-cluster';
const RUN_MARKER_PREFIX = '__UK_ATLAS_IT__';

function loadAndValidateTarget(argv = process.argv.slice(2)) {
  if (process.env.URBANKART_DB_PROFILE !== 'atlas-demo') {
    throw new safety.SafetyError('Set URBANKART_DB_PROFILE=atlas-demo explicitly before loading the Atlas integration configuration.');
  }
  const selected = loadSelectedDatabaseEnvironment();
  if (selected.profile !== 'atlas-demo') throw new safety.SafetyError('Select URBANKART_DB_PROFILE=atlas-demo before running the Atlas integration suite.');
  if (process.env.URBANKART_EXPECTED_DB_NAME !== TARGET_DB || process.env.URBANKART_DB_ENV !== 'atlas-demo'
      || process.env.URBANKART_ATLAS_CLUSTER_NAME !== TARGET_CLUSTER) {
    throw new safety.SafetyError('Atlas integration requires the atlas-demo profile, expected database urbankart_atlas_demo, and cluster urbankart-cluster.');
  }
  if (argv.filter((argument) => argument === '--confirm-no-remote-recommendation-scheduler').length !== 1) {
    throw new safety.SafetyError('Confirm that no remote UrbanKart recommendation scheduler is active with --confirm-no-remote-recommendation-scheduler.');
  }

  // Atlas SRV URIs enable TLS by default. Force TLS on the driver and reject
  // every URI option that disables encryption or certificate/hostname checks.
  const target = safety.validateAtlasDemoPreflight({ argv, env: process.env, readOnly: false });
  const parsed = new URL(target.uri);
  const queryOptions = [...parsed.searchParams.entries()].map(([name, value]) => [name.toLowerCase(), value.toLowerCase()]);
  const invalidTlsOptions = new Set(['tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames',
    'sslinsecure', 'sslallowinvalidcertificates', 'sslallowinvalidhostnames']);
  const encryptionOptions = new Set(['tls', 'ssl']);
  const tlsCounts = new Map();
  for (const [name, value] of queryOptions) tlsCounts.set(name, (tlsCounts.get(name) || 0) + 1);
  if (queryOptions.some(([name, value]) => invalidTlsOptions.has(name) && ['true', '1', 'yes'].includes(value))
      || [...tlsCounts.values()].some((count) => count > 1)
      || queryOptions.some(([name, value]) => encryptionOptions.has(name) && value === 'false')) {
    throw new safety.SafetyError('Atlas test URI must retain certificate-validating TLS; insecure TLS options are refused.');
  }
  return { ...target, clusterName: TARGET_CLUSTER, runMarker: `${RUN_MARKER_PREFIX}:${crypto.randomUUID()}` };
}

async function connectAndVerify(target) {
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  try {
    await mongoose.connect(target.uri, {
      serverSelectionTimeoutMS: 10_000,
      autoIndex: false,
      autoCreate: false,
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false
    });
    if (mongoose.connection.name !== TARGET_DB) throw new safety.SafetyError('Connected database name does not match the approved Atlas target.');

    const [hello, buildInfo, authStatus] = await Promise.all([
      mongoose.connection.db.admin().command({ hello: 1 }),
      mongoose.connection.db.admin().command({ buildInfo: 1 }),
      mongoose.connection.db.admin().command({ connectionStatus: 1, showPrivileges: false })
    ]);
    const verifiedTopology = safety.validateAtlasDemoHello(hello, buildInfo.versionArray, target.expectedTopology);
    if (!authStatus?.authInfo?.authenticatedUsers?.length) throw new safety.SafetyError('MongoDB connection did not report an authenticated database user.');

    const hostDigest = crypto.createHash('sha256').update(new URL(target.uri).hostname.toLowerCase()).digest('hex');
    if (hostDigest !== process.env.URBANKART_ATLAS_HOST_SHA256) throw new safety.SafetyError('Atlas endpoint pin verification failed.');
    return { databaseName: mongoose.connection.name, topology: verifiedTopology.name, serverVersion: buildInfo.version };
  } catch (error) {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
    if (error instanceof safety.SafetyError) throw error;
    throw new safety.SafetyError('Atlas connection or identity verification failed; connection details were suppressed.');
  }
}

async function assertForegroundApiInactive({ env = process.env, connect = net.createConnection } = {}) {
  const configuredPort = env.PORT || '5000';
  if (!/^\d+$/.test(String(configuredPort)) || Number(configuredPort) < 1 || Number(configuredPort) > 65535) {
    throw new safety.SafetyError('The foreground API port is invalid; scheduler inactivity cannot be verified.');
  }
  const configuredHost = env.HOST || '';
  const host = !configuredHost || configuredHost === '0.0.0.0' ? '127.0.0.1'
    : configuredHost === '::' ? '::1' : configuredHost;
  await new Promise((resolve, reject) => {
    const socket = connect({ host, port: Number(configuredPort) });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error); else resolve();
    };
    socket.setTimeout(1_500, () => finish(new safety.SafetyError('Could not verify whether the foreground API is inactive; refusing Atlas tests.')));
    socket.once('connect', () => finish(new safety.SafetyError('The foreground API is listening; stop it before Atlas integration tests.')));
    socket.once('error', (error) => {
      if (error.code === 'ECONNREFUSED') finish();
      else finish(new safety.SafetyError('Could not verify foreground API inactivity; refusing Atlas tests.'));
    });
  });
}

async function acquireIntegrationSchedulerLease({ env = process.env, lockPath = LOCK_PATH,
  apiLockPath = API_PROCESS_LOCK_PATH, connect = net.createConnection } = {}) {
  let schedulerLease;
  let apiLease;
  try {
    schedulerLease = acquireRecommendationSchedulerLock({ lockPath });
    if (schedulerLease) apiLease = acquireLocalProcessLock(apiLockPath);
  }
  catch { throw new safety.SafetyError('Could not acquire the local recommendation scheduler lock; refusing Atlas tests.'); }
  if (!schedulerLease) throw new safety.SafetyError('Another recommendation job or Atlas integration run holds the scheduler lock.');
  if (!apiLease) {
    await schedulerLease.release().catch(() => {});
    throw new safety.SafetyError('A foreground UrbanKart API process holds the local process lock; stop it before Atlas tests.');
  }
  try {
    await assertForegroundApiInactive({ env, connect });
    return {
      async release() {
        let firstError;
        try { await apiLease.release(); } catch (error) { firstError = error; }
        try { await schedulerLease.release(); } catch (error) { firstError ||= error; }
        if (firstError) throw new safety.SafetyError('Could not release a local scheduler/API process lock; inspect the exact lock files before retrying.');
      }
    };
  } catch (error) {
    await apiLease.release().catch(() => {});
    await schedulerLease.release().catch(() => {});
    throw error;
  }
}

async function close() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

module.exports = {
  TARGET_DB, TARGET_CLUSTER, RUN_MARKER_PREFIX, loadAndValidateTarget, connectAndVerify,
  assertForegroundApiInactive, acquireIntegrationSchedulerLease, close, mongoose
};
