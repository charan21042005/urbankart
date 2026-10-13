const assert = require('node:assert/strict');
const { test } = require('node:test');
const { run } = require('../scripts/auditDatabaseReadOnly');

const databaseName = 'urbankart_diagnostic_test';
const fakeUri = `mongodb://localhost:27017/${databaseName}?retryWrites=true`;

function auditEnv() {
  return {
    MONGODB_URI: fakeUri,
    URBANKART_EXPECTED_DB_NAME: databaseName,
    URBANKART_DB_ENV: 'isolated-development'
  };
}

function errorWith({ name, code, message, cause }) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.name = name;
  if (code !== undefined) error.code = code;
  return error;
}

async function invokeAudit({ connectionError, metadataError, database }) {
  let stdout = '';
  let stderr = '';
  let disconnected = false;
  const db = database || {
    listCollections() {
      return { toArray: async () => { throw metadataError; } };
    }
  };
  const code = await run({
    argv: ['--confirm-isolated-db', databaseName],
    env: auditEnv(),
    connect: async () => {
      if (connectionError) throw connectionError;
      return { connection: { name: databaseName } };
    },
    getDatabase: () => db,
    isConnected: () => !connectionError,
    disconnect: async () => { disconnected = true; },
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });
  return { code, stdout, stderr, disconnected };
}

function readableFakeDatabase({ countError, productLookupError } = {}) {
  return {
    listCollections: () => ({ toArray: async () => [{ name: 'products', options: {} }] }),
    admin: () => ({
      command: async ({ hello }) => hello
        ? { setName: 'offlineReplica', isWritablePrimary: true, maxWireVersion: 25 }
        : { version: '8.0.0', versionArray: [8, 0, 0] }
    }),
    collection: () => ({
      countDocuments: async () => {
        if (countError) throw countError;
        return 18;
      },
      listIndexes: () => ({ toArray: async () => [] }),
      find: () => ({
        toArray: async () => {
          if (productLookupError) throw productLookupError;
          return [];
        }
      })
    })
  };
}

test('audit diagnostics identify simulated network/auth failures and redact secrets', async (t) => {
  const cases = [
    {
      title: 'DNS resolution',
      error: errorWith({
        name: 'MongoNetworkError',
        code: 'ENOTFOUND',
        message: 'querySrv failed for mongodb+srv://diagnostic-user:diagnostic-password@cluster.invalid/db?privateOption=private-query-value'
      }),
      code: 'ENOTFOUND'
    },
    {
      title: 'authentication',
      error: errorWith({
        name: 'MongoServerError',
        code: 18,
        message: 'Authentication failed for user \'diagnostic-user\'; password=private-password-value; token=private-token-value'
      }),
      code: 18
    },
    {
      title: 'server selection timeout with a nested cause',
      error: errorWith({
        name: 'MongoServerSelectionError',
        code: 'ETIMEDOUT',
        message: 'Server selection timed out for mongodb://diagnostic-user:diagnostic-password@cluster.invalid/db?authSource=private-auth-value',
        cause: errorWith({ name: 'Error', message: 'cause secret=private-cause-value' })
      }),
      code: 'ETIMEDOUT',
      hasCause: true
    }
  ];

  for (const item of cases) {
    await t.test(item.title, async () => {
      const result = await invokeAudit({ connectionError: item.error });
      assert.equal(result.code, 1);
      assert.equal(result.stdout, '');
      assert.equal(result.disconnected, false);
      const diagnostic = JSON.parse(result.stderr.slice(result.stderr.indexOf('{')));
      assert.equal(diagnostic.stage, 'connection');
      assert.equal(diagnostic.error.name, item.error.name);
      assert.equal(diagnostic.error.code, item.code);
      if (item.hasCause) assert.equal(diagnostic.causes.length, 1);
      for (const secret of [
        'diagnostic-user', 'diagnostic-password', 'private-query-value',
        'private-password-value', 'private-token-value', 'private-auth-value',
        'private-cause-value', 'mongodb://', 'mongodb+srv://'
      ]) {
        assert.equal(result.stderr.includes(secret), false, `diagnostic leaked ${secret}`);
      }
      for (const queryName of ['privateOption', 'retryWrites', 'authSource']) {
        assert.equal(result.stderr.includes(queryName), false, `diagnostic leaked URI query parameter ${queryName}`);
      }
    });
  }
});

test('audit diagnostics identify metadata failures and redact secret-like fields', async () => {
  const metadataError = errorWith({
    name: 'MongoServerError',
    code: 13,
    message: 'listCollections failed; authorization=private-authz-value; ?credential=private-query-value'
  });
  const result = await invokeAudit({ metadataError });
  assert.equal(result.code, 1);
  assert.equal(result.disconnected, true);
  const diagnostic = JSON.parse(result.stderr.slice(result.stderr.indexOf('{')));
  assert.equal(diagnostic.stage, 'metadata.collectionListing');
  assert.equal(diagnostic.error.name, 'MongoServerError');
  assert.equal(diagnostic.error.code, 13);
  assert.equal(result.stderr.includes('private-authz-value'), false);
  assert.equal(result.stderr.includes('private-query-value'), false);
  assert.equal(result.stderr.includes('credential'), false);
});

test('audit records sanitized count failures and identifies product-name lookup failures', async (t) => {
  await t.test('count failure is recorded as a partial metadata warning', async () => {
    const countError = errorWith({
      name: 'MongoServerError',
      code: 13,
      message: 'count denied; password=private-count-password'
    });
    const result = await invokeAudit({ database: readableFakeDatabase({ countError }) });
    assert.equal(result.code, 0);
    assert.equal(result.disconnected, true);
    const report = JSON.parse(result.stdout);
    assert.equal(report.diagnostics[0].stage, 'metadata.collectionCount');
    assert.equal(report.diagnostics[0].error.code, 13);
    assert.equal(result.stdout.includes('private-count-password'), false);
  });

  await t.test('product-name lookup failure has its own failure stage', async () => {
    const lookupError = errorWith({
      name: 'MongoServerError',
      code: 13,
      message: 'find denied; token=private-lookup-token'
    });
    const result = await invokeAudit({ database: readableFakeDatabase({ productLookupError: lookupError }) });
    assert.equal(result.code, 1);
    assert.equal(result.disconnected, true);
    const diagnostic = JSON.parse(result.stderr.slice(result.stderr.indexOf('{')));
    assert.equal(diagnostic.stage, 'lookup.day1ProductNames');
    assert.equal(diagnostic.error.code, 13);
    assert.equal(result.stderr.includes('private-lookup-token'), false);
  });
});
