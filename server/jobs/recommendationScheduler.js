const cron = require('node-cron');
const { recomputeRecommendations } = require('./computeRecommendations');

let scheduledTask = null;
let recomputationInProgress = false;

function startRecommendationJob({
  schedule = process.env.RECOMMENDATION_CRON_SCHEDULE || '0 2 * * *',
  timezone = process.env.RECOMMENDATION_TIMEZONE || 'Asia/Kolkata',
  cronLibrary = cron,
  recompute = recomputeRecommendations,
  logger = console
} = {}) {
  if (scheduledTask) return scheduledTask;
  if (!cronLibrary.validate(schedule)) throw new Error('The recommendation cron schedule is invalid.');

  scheduledTask = cronLibrary.schedule(schedule, async () => {
    if (recomputationInProgress) {
      logger.warn('Recommendation refresh skipped because an earlier run is still active.');
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
