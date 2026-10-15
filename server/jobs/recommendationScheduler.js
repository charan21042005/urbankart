const cron = require('node-cron');
const { recomputeRecommendations } = require('./computeRecommendations');
const { LOCK_PATH, acquireRecommendationSchedulerLock } = require('./recommendationSchedulerLock');

let scheduledTask = null;
let recomputationInProgress = false;

function startRecommendationJob({
  schedule = process.env.RECOMMENDATION_CRON_SCHEDULE || '0 2 * * *',
  timezone = process.env.RECOMMENDATION_TIMEZONE || 'Asia/Kolkata',
  cronLibrary = cron,
  recompute = recomputeRecommendations,
  schedulerLockPath = LOCK_PATH,
  logger = console
} = {}) {
  if (scheduledTask) return scheduledTask;
  if (!cronLibrary.validate(schedule)) throw new Error('The recommendation cron schedule is invalid.');

  scheduledTask = cronLibrary.schedule(schedule, async () => {
    if (recomputationInProgress) {
      logger.warn('Recommendation refresh skipped because an earlier run is still active.');
      return;
    }
    let lease;
    try { lease = acquireRecommendationSchedulerLock({ lockPath: schedulerLockPath }); }
    catch (error) {
      logger.error(`Recommendation refresh could not acquire its local scheduler lock (${error?.name || 'Error'}); skipped.`);
      return;
    }
    if (!lease) {
      logger.warn('Recommendation refresh skipped because the Atlas integration suite or another scheduler holds the local lock.');
      return;
    }
    recomputationInProgress = true;
    try {
      const result = await recompute();
      logger.info(`Recommendation refresh complete: ${result.productsProcessed} products processed.`);
    } catch (error) {
      logger.error(`Recommendation refresh failed (${error?.name || 'Error'}); the API remains available.`);
    } finally {
      recomputationInProgress = false;
      try { await lease.release(); }
      catch (error) { logger.error(`Recommendation scheduler lock release failed (${error?.name || 'Error'}).`); }
    }
  }, { timezone, noOverlap: true });
  logger.info(`Recommendation refresh scheduled at ${schedule} (${timezone}).`);
  return scheduledTask;
}

function stopRecommendationJob() {
  if (scheduledTask) scheduledTask.stop();
  scheduledTask = null;
}

module.exports = { startRecommendationJob, stopRecommendationJob };
