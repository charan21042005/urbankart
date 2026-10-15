const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const LOCK_DIRECTORY = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'UrbanKart');
const LOCK_PATH = path.join(LOCK_DIRECTORY, 'recommendation-scheduler.lock');
const API_PROCESS_LOCK_PATH = path.join(LOCK_DIRECTORY, 'atlas-api-process.lock');

function acquireLocalProcessLock(lockPath) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const token = crypto.randomUUID();
  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }));
    fs.closeSync(descriptor);
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* Preserve the acquisition error. */ }
      try { fs.unlinkSync(lockPath); } catch { /* The lock may belong to another process. */ }
    }
    if (error.code === 'EEXIST') return null;
    throw error;
  }

  let released = false;
  return {
    lockPath,
    async release() {
      if (released) return;
      let record;
      try { record = JSON.parse(fs.readFileSync(lockPath, 'utf8')); }
      catch { throw new Error('Local process lock cannot be read for safe release.'); }
      if (record.token !== token) throw new Error('Local process lock ownership changed before release.');
      fs.unlinkSync(lockPath);
      released = true;
    }
  };
}

function acquireRecommendationSchedulerLock({ lockPath = LOCK_PATH } = {}) {
  return acquireLocalProcessLock(lockPath);
}

module.exports = { LOCK_PATH, API_PROCESS_LOCK_PATH, acquireLocalProcessLock, acquireRecommendationSchedulerLock };
