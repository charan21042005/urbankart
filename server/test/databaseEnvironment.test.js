const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { loadSelectedDatabaseEnvironment } = require('../config/databaseEnvironment');

test('Atlas profile loads its separate config over root local values', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'urbankart-env-profile-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const rootPath = path.join(directory, '.env');
  const atlasPath = path.join(directory, '.env.atlas.local');
  fs.writeFileSync(rootPath, 'MONGODB_URI=mongodb://127.0.0.1/local\nURBANKART_DB_ENV=isolated-development\n');
  fs.writeFileSync(atlasPath, 'URBANKART_DB_PROFILE=atlas-demo\nMONGODB_URI=mongodb+srv://atlas.invalid/urbankart_atlas_demo\nURBANKART_DB_ENV=atlas-demo\n');
  const env = { URBANKART_DB_PROFILE: 'atlas-demo' };

  const result = loadSelectedDatabaseEnvironment({ env, rootPath, atlasPath });
  assert.equal(result.profile, 'atlas-demo');
  assert.equal(env.MONGODB_URI, 'mongodb+srv://atlas.invalid/urbankart_atlas_demo');
  assert.equal(env.URBANKART_DB_ENV, 'atlas-demo');
});

test('Atlas profile fails closed when its separate local config is missing', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'urbankart-env-missing-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const rootPath = path.join(directory, '.env');
  fs.writeFileSync(rootPath, 'MONGODB_URI=mongodb+srv://should-not-fall-back.invalid/old_db\n');
  assert.throws(() => loadSelectedDatabaseEnvironment({
    env: { URBANKART_DB_PROFILE: 'atlas-demo' }, rootPath, atlasPath: path.join(directory, 'missing.env')
  }), /missing/);
});

test('unknown database profile is refused before loading a target', () => {
  assert.throws(() => loadSelectedDatabaseEnvironment({ env: { URBANKART_DB_PROFILE: 'production' } }), /must be local or atlas-demo/);
});
