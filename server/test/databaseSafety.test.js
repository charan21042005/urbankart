const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const {
  SafetyError,
  validatePreflight,
  connectAfterPreflight,
  classifyTopology,
  assessTransactionVersion
} = require('../scripts/databaseSafety');
const { readDay1SeedNames, connectReadOnly } = require('../scripts/auditDatabaseReadOnly');
const { requireTransactionTopology } = require('../scripts/checkoutIntegrationCommon');

const dbName = 'urbankart_test_isolated';
const uri = 'mongodb://private-user:private-pass@localhost:27017/urbankart_test_isolated?retryWrites=true';

function validEnv(overrides = {}) {
  return {
    MONGODB_URI: uri,
    URBANKART_EXPECTED_DB_NAME: dbName,
    URBANKART_DB_ENV: 'isolated-development',
    URBANKART_TEST_DB_NAME: dbName,
    URBANKART_TXN_TOPOLOGY_CONFIRMED: 'replicaSet',
    ...overrides
  };
}

const auditArgs = ['--confirm-isolated-db', dbName];
const testArgs = ['--confirm-test-db', dbName];

test('database preflight rejects missing confirmation before attempting a connection', async () => {
  let connects = 0;
  await assert.rejects(connectAfterPreflight({
    mode: 'audit', argv: [], env: validEnv(), connect: async () => { connects += 1; }
  }), SafetyError);
  assert.equal(connects, 0);
});

test('audit preflight failures never invoke mongoose.connect', async () => {
  const originalConnect = mongoose.connect;
  let calls = 0;
  mongoose.connect = async () => { calls += 1; };
  try {
    const failures = [
      { argv: [], env: validEnv() },
      { argv: auditArgs, env: validEnv({ URBANKART_EXPECTED_DB_NAME: '' }) },
      { argv: auditArgs, env: validEnv({ URBANKART_EXPECTED_DB_NAME: 'different_db' }) },
      { argv: auditArgs, env: validEnv({ URBANKART_DB_ENV: '' }) },
      { argv: auditArgs, env: validEnv({ MONGODB_URI: 'mongodb://localhost:27017/' }) }
    ];
    for (const { argv, env } of failures) {
      await assert.rejects(connectAfterPreflight({
        mode: 'audit', argv, env,
        connect: (targetUri) => mongoose.connect(targetUri)
      }), SafetyError);
    }
    assert.equal(calls, 0);
  } finally {
    mongoose.connect = originalConnect;
  }
});

test('read-only audit connection disables Mongoose collection and index creation', async () => {
  const originalConnect = mongoose.connect;
  let capturedOptions;
  mongoose.connect = async (_uri, options) => {
    capturedOptions = options;
    return mongoose;
  };
  try {
    await connectReadOnly('mongodb://offline.invalid/ignored');
    assert.equal(capturedOptions.autoCreate, false);
    assert.equal(capturedOptions.autoIndex, false);
    assert.equal(capturedOptions.serverSelectionTimeoutMS, 10_000);
  } finally {
    mongoose.connect = originalConnect;
  }
});

test('database preflight rejects missing, unknown, or conflicting expected database names offline', async () => {
  const cases = [
    [validEnv({ URBANKART_EXPECTED_DB_NAME: '' }), auditArgs],
    [validEnv({ URBANKART_EXPECTED_DB_NAME: 'other_db' }), auditArgs],
    [validEnv({ MONGODB_URI: 'mongodb://localhost:27017/' }), auditArgs],
    [validEnv({ MONGODB_URI: 'mongodb://localhost:27017/another_db' }), auditArgs],
    [validEnv({ URBANKART_EXPECTED_DB_NAME: 'one', MONGODB_URI: 'mongodb://localhost:27017/one?dbName=two' }), ['--confirm-isolated-db', 'one']]
  ];
  for (const [env, argv] of cases) {
    let connects = 0;
    await assert.rejects(connectAfterPreflight({
      mode: 'audit', argv, env, connect: async () => { connects += 1; }
    }), SafetyError);
    assert.equal(connects, 0);
  }
});

test('database preflight requires the separate human isolation assertion', async () => {
  let connects = 0;
  await assert.rejects(connectAfterPreflight({
    mode: 'audit', argv: auditArgs, env: validEnv({ URBANKART_DB_ENV: '' }),
    connect: async () => { connects += 1; }
  }), /URBANKART_DB_ENV/);
  assert.equal(connects, 0);
});

test('integration preflight requires a matching test database and topology attestation before connecting', async () => {
  const cases = [
    validEnv({ URBANKART_TEST_DB_NAME: '' }),
    validEnv({ URBANKART_TEST_DB_NAME: 'other_db' }),
    validEnv({ URBANKART_TXN_TOPOLOGY_CONFIRMED: '' }),
    validEnv({ URBANKART_TXN_TOPOLOGY_CONFIRMED: 'standalone' })
  ];
  for (const env of cases) {
    let connects = 0;
    await assert.rejects(connectAfterPreflight({
      mode: 'integration-test', argv: testArgs, env,
      connect: async () => { connects += 1; }
    }), SafetyError);
    assert.equal(connects, 0);
  }
});

test('a database name containing dev/test is not accepted without explicit confirmations', () => {
  assert.throws(() => validatePreflight({
    mode: 'audit', argv: [], env: { MONGODB_URI: 'mongodb://localhost/test' }
  }), SafetyError);
});

test('preflight errors never echo URI credentials', () => {
  assert.throws(() => validatePreflight({
    mode: 'audit', argv: auditArgs,
    env: validEnv({ URBANKART_EXPECTED_DB_NAME: 'wrong', MONGODB_URI: 'mongodb://do-not-print:secret@host/db' })
  }), (error) => error instanceof SafetyError && !error.message.includes('do-not-print') && !error.message.includes('secret'));
});

test('topology classifier distinguishes transaction-capable clusters from standalone and unknown', () => {
  assert.deepEqual(classifyTopology({ setName: 'rs0', isWritablePrimary: true }), {
    name: 'replicaSet', transactionsSupported: true
  });
  assert.deepEqual(classifyTopology({ msg: 'isdbgrid' }), { name: 'sharded', transactionsSupported: true });
  assert.deepEqual(classifyTopology({ isWritablePrimary: true }), { name: 'standalone', transactionsSupported: false });
  assert.deepEqual(classifyTopology({}), { name: 'unknown', transactionsSupported: false });
});

test('integration topology gate rejects unsupported or mismatched server topology before fixture setup', () => {
  assert.throws(() => requireTransactionTopology({ isWritablePrimary: true }, 'replicaSet'), SafetyError);
  assert.throws(() => requireTransactionTopology({ setName: 'rs0' }, 'sharded'), SafetyError);
  assert.equal(requireTransactionTopology({ msg: 'isdbgrid' }, 'sharded').transactionsSupported, true);
});

test('transaction version assessment uses topology-specific MongoDB minimums', () => {
  const replica = classifyTopology({ setName: 'rs0' });
  const sharded = classifyTopology({ msg: 'isdbgrid' });
  assert.equal(assessTransactionVersion(replica, [4, 0, 0]), true);
  assert.equal(assessTransactionVersion(sharded, [4, 0, 0]), false);
  assert.equal(assessTransactionVersion(sharded, [4, 2, 0]), true);
  assert.equal(assessTransactionVersion(replica, null), null);
  assert.equal(assessTransactionVersion(classifyTopology({ isWritablePrimary: true }), [8, 0, 0]), false);
});

test('matching offline configuration passes validation and selects no inferred database', () => {
  assert.deepEqual(validatePreflight({ mode: 'audit', argv: auditArgs, env: validEnv() }).databaseName, dbName);
  assert.deepEqual(validatePreflight({ mode: 'integration-test', argv: testArgs, env: validEnv() }).databaseName, dbName);
});

test('a post-connect database mismatch closes the injected connection', async () => {
  let closed = false;
  await assert.rejects(connectAfterPreflight({
    mode: 'audit', argv: auditArgs, env: validEnv(),
    connect: async () => ({ connection: { name: 'unexpected_db' }, async disconnect() { closed = true; } })
  }), /does not match/);
  assert.equal(closed, true);
});

test('Day 1 seed names are read statically without executing the destructive seed script', () => {
  const names = readDay1SeedNames();
  assert.equal(names.length, 18);
  assert.ok(names.includes('Urban X-Pro Laptop'));
});
