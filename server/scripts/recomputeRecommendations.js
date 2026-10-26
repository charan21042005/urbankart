const mongoose = require('mongoose');
const { loadSelectedDatabaseEnvironment } = require('../config/databaseEnvironment');
const safety = require('./databaseSafety');
const Product = require('../models/Product');
const Recommendation = require('../models/Recommendation');
const { recomputeRecommendations } = require('../jobs/computeRecommendations');
const { acquireRecommendationSchedulerLock } = require('../jobs/recommendationSchedulerLock');

let schedulerLease;

// Acquire exclusive job access, verify the target database, then rebuild the cache.
async function main() {
  loadSelectedDatabaseEnvironment();
  schedulerLease = acquireRecommendationSchedulerLock();
  if (!schedulerLease) throw new safety.SafetyError('Another recommendation job or integration run holds the scheduler lock.');
  const atlasMode = process.env.URBANKART_DB_PROFILE === 'atlas-demo';
  const target = await safety.connectAfterPreflight({
    mode: atlasMode ? 'atlas-demo-write' : 'local-write',
    argv: process.argv.slice(2),
    connect: (uri) => mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      autoIndex: false,
      autoCreate: false
    })
  });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (atlasMode) {
    const build = await mongoose.connection.db.admin().command({ buildInfo: 1 });
    safety.validateAtlasDemoHello(hello, build.versionArray, target.expectedTopology);
  } else safety.validateLocalReplicaSetHello(hello, target.expectedReplicaSetName);
  // Ensure the recommendation source index exists before updating computed results.
  await Promise.all([Product, Recommendation].map((model) => model.createIndexes()));
  const indexes = await Recommendation.collection.indexes();
  if (!indexes.some((index) => index.name === 'uniq_recommendation_source'
      && index.unique === true && index.key.productId === 1)) {
    throw new safety.SafetyError('The required unique recommendation-source index is unavailable.');
  }
  const result = await recomputeRecommendations();
  console.log(JSON.stringify({ database: target.databaseName, topology: atlasMode ? target.expectedTopology : hello.setName, ...result }));
}

main().catch((error) => {
  if (error instanceof safety.SafetyError) console.error(`Recommendation recompute refused: ${error.message}`);
  else console.error(`Recommendation recompute failed (${error?.name || 'Error'}); details were suppressed.`);
  process.exitCode = 1;
}).finally(async () => {
  // Release both database and scheduler resources on success or failure.
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  if (schedulerLease) {
    try { await schedulerLease.release(); }
    catch (error) {
      console.error(`Recommendation scheduler lock release failed (${error?.name || 'Error'}).`);
      process.exitCode = 1;
    }
  }
});
