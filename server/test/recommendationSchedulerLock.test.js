const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { acquireRecommendationSchedulerLock } = require('../jobs/recommendationSchedulerLock');
const { startRecommendationJob, stopRecommendationJob } = require('../jobs/recommendationScheduler');
const { assertForegroundApiInactive, acquireIntegrationSchedulerLease } = require('../scripts/atlasIntegrationCommon');

function socketThatEmits(event, value) {
  const socket = new EventEmitter();
  socket.setTimeout = (_milliseconds, callback) => { socket.timeoutCallback = callback; return socket; };
  socket.destroy = () => {};
  process.nextTick(() => socket.emit(event, value));
  return socket;
}

test('scheduler lock excludes overlapping jobs and releases only its own lease', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'urbankart-scheduler-lock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const lockPath = path.join(directory, 'scheduler.lock');
  const first = acquireRecommendationSchedulerLock({ lockPath });
  assert.ok(first);
  assert.equal(acquireRecommendationSchedulerLock({ lockPath }), null);
  await first.release();
  const second = acquireRecommendationSchedulerLock({ lockPath });
  assert.ok(second);
  await second.release();
  assert.equal(fs.existsSync(lockPath), false);
});

test('scheduler lock refuses a pre-existing stale or foreign lock without deleting it', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'urbankart-scheduler-stale-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const lockPath = path.join(directory, 'scheduler.lock');
  fs.writeFileSync(lockPath, JSON.stringify({ pid: -1, token: 'foreign-lock' }));
  assert.equal(acquireRecommendationSchedulerLock({ lockPath }), null);
  assert.equal(JSON.parse(fs.readFileSync(lockPath, 'utf8')).token, 'foreign-lock');
});

test('foreground API probe passes only on an explicit connection refusal', async () => {
  await assert.doesNotReject(assertForegroundApiInactive({ env: { PORT: '5000' }, connect: () => socketThatEmits('error', { code: 'ECONNREFUSED' }) }));
  await assert.rejects(assertForegroundApiInactive({ env: { PORT: '5000' }, connect: () => socketThatEmits('connect') }), /foreground API is listening/);
  await assert.rejects(assertForegroundApiInactive({ env: { PORT: '5000' }, connect: () => socketThatEmits('error', { code: 'ETIMEDOUT' }) }), /Could not verify foreground API inactivity/);
});

test('failed foreground API probe releases the integration scheduler lease', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'urbankart-scheduler-probe-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const lockPath = path.join(directory, 'scheduler.lock');
  const apiLockPath = path.join(directory, 'api.lock');
  await assert.rejects(acquireIntegrationSchedulerLease({
    env: { PORT: '5000' }, lockPath, apiLockPath, connect: () => socketThatEmits('connect')
  }), /foreground API is listening/);
  const next = acquireRecommendationSchedulerLock({ lockPath });
  assert.ok(next);
  await next.release();
});

test('scheduled recommendation work yields while the Atlas integration lease is held', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'urbankart-scheduler-job-'));
  t.after(() => { stopRecommendationJob(); fs.rmSync(directory, { recursive: true, force: true }); });
  const lockPath = path.join(directory, 'scheduler.lock');
  const lease = acquireRecommendationSchedulerLock({ lockPath });
  let callback;
  let recomputes = 0;
  const events = [];
  startRecommendationJob({
    schedulerLockPath: lockPath,
    cronLibrary: { validate: () => true, schedule: (_schedule, handler) => { callback = handler; return { stop() {} }; } },
    recompute: async () => { recomputes += 1; return { productsProcessed: 0 }; },
    logger: { info() {}, warn: (message) => events.push(message), error() {} }
  });
  await callback();
  assert.equal(recomputes, 0);
  assert.match(events[0], /integration suite/);
  await lease.release();
  await callback();
  assert.equal(recomputes, 1);
});
