const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { test } = require('node:test');
const mongoose = require('mongoose');
const {
  SafetyError,
  validatePreflight,
  connectAfterPreflight,
  classifyTopology,
  assessTransactionVersion,
  validateLocalReplicaSetHello,
  validateAtlasDemoPreflight,
  validateAtlasDemoHello,
  validateLocalServerTarget
} = require('../scripts/databaseSafety');
const { readDay1SeedNames, connectReadOnly } = require('../scripts/auditDatabaseReadOnly');
const { requireTransactionTopology } = require('../scripts/checkoutIntegrationCommon');

const dbName = 'urbankart_test_isolated';
const uri = 'mongodb://127.0.0.1:27018/urbankart_test_isolated?replicaSet=ukStageH';

function validEnv(overrides = {}) {
  return {
    MONGODB_URI: uri,
    URBANKART_EXPECTED_DB_NAME: dbName,
    URBANKART_DB_ENV: 'isolated-development',
    URBANKART_TEST_DB_NAME: dbName,
    URBANKART_TXN_TOPOLOGY_CONFIRMED: 'replicaSet',
    URBANKART_TXN_REPLICA_SET_NAME: 'ukStageH',
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
    validEnv({ URBANKART_TXN_TOPOLOGY_CONFIRMED: 'standalone' }),
    validEnv({ MONGODB_URI: 'mongodb+srv://cluster.example/urbankart_test_isolated?replicaSet=ukStageH' }),
    validEnv({ MONGODB_URI: 'mongodb://atlas.mongodb.net/urbankart_test_isolated?replicaSet=ukStageH' }),
    validEnv({ MONGODB_URI: 'mongodb://192.168.1.5:27017/urbankart_test_isolated?replicaSet=ukStageH' }),
    validEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27018/urbankart_test_isolated' }),
    validEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27018/urbankart_test_isolated?replicaSet=other' }),
    validEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27018/urbankart_test_isolated?replicaSet=ukStageH', URBANKART_TXN_REPLICA_SET_NAME: '' }),
    validEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27018/urbankart_test_isolated?replicaSet=ukStageH', URBANKART_TXN_REPLICA_SET_NAME: 'other' })
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

test('integration preflight accepts only explicit loopback replica-set targets before connecting', async () => {
  for (const host of ['localhost:27018', '127.0.0.1:27018', '[::1]:27018']) {
    const env = validEnv({ MONGODB_URI: `mongodb://${host}/${dbName}?replicaSet=ukStageH`, URBANKART_TXN_REPLICA_SET_NAME: 'ukStageH' });
    const result = validatePreflight({ mode: 'integration-test', argv: testArgs, env });
    assert.equal(result.expectedReplicaSetName, 'ukStageH');
  }
  const rejectedUris = [
    'mongodb://127.0.0.1:27018,attacker.example:27018/urbankart_test_isolated?replicaSet=ukStageH',
    'mongodb://[::ffff:127.0.0.1]:27018/urbankart_test_isolated?replicaSet=ukStageH',
    'mongodb://127.0.0.1:27018/urbankart_test_isolated?replicaSet=ukStageH&replicaSet=other'
  ];
  for (const testUri of rejectedUris) {
    let connects = 0;
    await assert.rejects(connectAfterPreflight({
      mode: 'integration-test', argv: testArgs,
      env: validEnv({ MONGODB_URI: testUri }),
      connect: async () => { connects += 1; }
    }), SafetyError);
    assert.equal(connects, 0);
  }
});

test('local database write preflight requires a loopback target and explicit local database name', () => {
  const args = ['--confirm-local-db', dbName];
  const expected = validatePreflight({ mode: 'local-write', argv: args, env: validEnv() });
  assert.equal(expected.databaseName, dbName);
  for (const uri of [
    'mongodb+srv://cluster.example/urbankart_test_isolated?replicaSet=ukStageH',
    'mongodb://remote.example/urbankart_test_isolated?replicaSet=ukStageH',
    'mongodb://10.0.0.2:27017/urbankart_test_isolated?replicaSet=ukStageH'
  ]) {
    assert.throws(() => validatePreflight({ mode: 'local-write', argv: args, env: validEnv({ MONGODB_URI: uri }) }), SafetyError);
  }
  assert.throws(() => validatePreflight({ mode: 'local-write', argv: [], env: validEnv() }), SafetyError);
});

test('live replica-set identity gate requires a writable local primary and loopback members', () => {
  assert.equal(validateLocalReplicaSetHello({
    setName: 'ukStageH', isWritablePrimary: true, hosts: ['127.0.0.1:27018']
  }, 'ukStageH'), true);
  for (const hello of [
    { setName: 'other', isWritablePrimary: true, hosts: ['127.0.0.1:27018'] },
    { setName: 'ukStageH', isWritablePrimary: false, hosts: ['127.0.0.1:27018'] },
    { setName: 'ukStageH', isWritablePrimary: true, hosts: ['mongodb.example:27017'] },
    { setName: 'ukStageH', isWritablePrimary: true, hosts: [] }
  ]) assert.throws(() => validateLocalReplicaSetHello(hello, 'ukStageH'), SafetyError);
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

test('Day 1 sample seed preserves its records and is explicitly local-only and non-destructive', () => {
  const names = readDay1SeedNames();
  assert.equal(names.length, 18);
  assert.ok(names.includes('Urban X-Pro Laptop'));
  const seedSource = fs.readFileSync(path.resolve(__dirname, '../seed/seedProducts.js'), 'utf8');
  assert.match(seedSource, /mode:\s*'local-write'/);
  assert.match(seedSource, /validateLocalReplicaSetHello/);
  assert.match(seedSource, /\$setOnInsert/);
  assert.doesNotMatch(seedSource, /deleteMany\s*\(/);
});

test('dataset importer validates every advertised replica-set member before writes', () => {
  const importerSource = fs.readFileSync(path.resolve(__dirname, '../seed/importKaggleProducts.js'), 'utf8');
  assert.match(importerSource, /validateLocalReplicaSetHello\(hello, target\.expectedReplicaSetName\)/);
});

function atlasEnv(overrides = {}) {
  const uri = 'mongodb+srv://atlas-user:local-test-only@demo.example.mongodb.net/urbankart_atlas_demo?retryWrites=true';
  const host = new URL(uri).hostname.toLowerCase();
  return {
    MONGODB_URI: uri,
    URBANKART_DB_PROFILE: 'atlas-demo',
    URBANKART_EXPECTED_DB_NAME: 'urbankart_atlas_demo',
    URBANKART_DB_ENV: 'atlas-demo',
    URBANKART_ATLAS_CLUSTER_NAME: 'urbankart-cluster',
    URBANKART_ATLAS_HOST_SHA256: crypto.createHash('sha256').update(host).digest('hex'),
    URBANKART_TXN_TOPOLOGY_CONFIRMED: 'replicaSet',
    ...overrides
  };
}

test('Atlas demo writes require a pinned Atlas SRV endpoint and exact isolated database', () => {
  const env = atlasEnv();
  const result = validateAtlasDemoPreflight({ argv: ['--confirm-atlas-demo-db', 'urbankart_atlas_demo'], env });
  assert.equal(result.databaseName, 'urbankart_atlas_demo');
  assert.equal(result.expectedTopology, 'replicaSet');
  const failures = [
    { argv: [], env },
    { argv: ['--confirm-atlas-demo-db', 'test'], env },
    { argv: ['--confirm-atlas-demo-db', 'urbankart_atlas_demo'], env: atlasEnv({ URBANKART_DB_PROFILE: 'local' }) },
    { argv: ['--confirm-atlas-demo-db', 'urbankart_atlas_demo'], env: atlasEnv({ URBANKART_DB_ENV: 'isolated-development' }) },
    { argv: ['--confirm-atlas-demo-db', 'urbankart_atlas_demo'], env: atlasEnv({ URBANKART_ATLAS_HOST_SHA256: '0'.repeat(64) }) },
    { argv: ['--confirm-atlas-demo-db', 'urbankart_atlas_demo'], env: atlasEnv({ URBANKART_ATLAS_CLUSTER_NAME: 'other-cluster' }) },
    { argv: ['--confirm-atlas-demo-db', 'urbankart_atlas_demo'], env: atlasEnv({ URBANKART_TXN_TOPOLOGY_CONFIRMED: '' }) },
    { argv: ['--confirm-atlas-demo-db', 'urbankart_atlas_demo'], env: atlasEnv({ MONGODB_URI: 'mongodb://127.0.0.1:27017/urbankart_atlas_demo?replicaSet=local' }) },
    { argv: ['--confirm-atlas-demo-db', 'urbankart_atlas_demo'], env: atlasEnv({ MONGODB_URI: 'mongodb+srv://demo.example.mongodb.net/test' }) }
  ];
  for (const failure of failures) assert.throws(() => validateAtlasDemoPreflight(failure), SafetyError);
});

test('Atlas startup verifies the confirmed replica-set topology and transaction server version', () => {
  assert.deepEqual(validateAtlasDemoHello({ setName: 'atlas-rs', isWritablePrimary: true }, [8, 0, 34], 'replicaSet'), {
    name: 'replicaSet', transactionsSupported: true
  });
  assert.throws(() => validateAtlasDemoHello({ isWritablePrimary: true }, [8, 0, 34], 'replicaSet'), SafetyError);
  assert.throws(() => validateAtlasDemoHello({ msg: 'isdbgrid' }, [8, 0, 34], 'replicaSet'), SafetyError);
  assert.throws(() => validateAtlasDemoHello({ msg: 'isdbgrid' }, [4, 0, 0], 'sharded'), SafetyError);
});

test('local server refuses an Atlas URI unless Atlas profile is selected', () => {
  assert.equal(validateLocalServerTarget(validEnv()).databaseName, dbName);
  assert.throws(() => validateLocalServerTarget(validEnv({ MONGODB_URI: atlasEnv().MONGODB_URI })), SafetyError);
});
