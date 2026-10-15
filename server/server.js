const mongoose = require('mongoose');
const { loadSelectedDatabaseEnvironment } = require('./config/databaseEnvironment');
const safety = require('./scripts/databaseSafety');
const app = require('./app');
const { startRecommendationJob, stopRecommendationJob } = require('./jobs/recommendationScheduler');
const { API_PROCESS_LOCK_PATH, acquireLocalProcessLock } = require('./jobs/recommendationSchedulerLock');

let selection;
try { selection = loadSelectedDatabaseEnvironment(); }
catch (error) {
  console.error(`FATAL ERROR: Database profile could not be selected (${error.message}).`);
  process.exit(1);
}

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('FATAL ERROR: MONGODB_URI is not defined in the environment variables.');
  process.exit(1);
}

let expectedTarget;
try {
  expectedTarget = selection.profile === 'atlas-demo'
    ? safety.validateAtlasDemoPreflight({ argv: ['--confirm-atlas-demo-db', 'urbankart_atlas_demo'] })
    : safety.validateLocalServerTarget();
} catch (error) {
  console.error(`FATAL ERROR: Database target refused (${error.message}).`);
  process.exit(1);
}

// Schema/index changes are applied only by the explicitly gated local initializer
// or a reviewed deployment migration, never as a side effect of server startup.
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);

let apiLease;
let httpServer;
let stopping = false;
async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  stopRecommendationJob();
  if (httpServer) {
    await new Promise((resolve) => {
      httpServer.close(() => resolve());
      httpServer.closeAllConnections?.();
    });
  }
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  if (apiLease) await apiLease.release().catch(() => {});
  process.exitCode = exitCode;
}

try {
  apiLease = acquireLocalProcessLock(API_PROCESS_LOCK_PATH);
  if (!apiLease) throw new Error('An UrbanKart API process already holds the local API lock.');
} catch (error) {
  console.error(`FATAL ERROR: API process lock could not be acquired (${error.message}).`);
  process.exit(1);
}

process.once('SIGINT', () => { shutdown(130).catch(() => { process.exitCode = 1; }); });
process.once('SIGTERM', () => { shutdown(143).catch(() => { process.exitCode = 1; }); });

mongoose.connect(MONGODB_URI)
  .then(() => {
    const verifyConnection = async () => {
      if (mongoose.connection.name !== expectedTarget.databaseName) {
        throw new safety.SafetyError('Connected database name differs from the selected database profile.');
      }
      const db = mongoose.connection.db;
      const hello = await db.admin().command({ hello: 1 });
      if (selection.profile === 'atlas-demo') {
        const buildInfo = await db.admin().command({ buildInfo: 1 });
        const topology = safety.validateAtlasDemoHello(hello, buildInfo.versionArray, expectedTarget.expectedTopology);
        console.log(`MongoDB ready: profile=atlas-demo database=${expectedTarget.databaseName} topology=${topology.name} cluster=${process.env.URBANKART_ATLAS_CLUSTER_NAME}`);
      } else {
        safety.validateLocalReplicaSetHello(hello, expectedTarget.expectedReplicaSetName);
        console.log(`MongoDB ready: profile=local database=${expectedTarget.databaseName} topology=replicaSet`);
      }
    };
    return verifyConnection();
  })
  .then(() => {
    httpServer = HOST
      ? app.listen(PORT, HOST, () => {
        console.log(`Server is running on ${HOST}:${PORT}`);
        try { startRecommendationJob(); }
        catch (error) { console.error(`Recommendation scheduler was not started (${error?.name || 'Error'}).`); }
      })
      : app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        try { startRecommendationJob(); }
        catch (error) { console.error(`Recommendation scheduler was not started (${error?.name || 'Error'}).`); }
      });
    httpServer.on('error', () => {
      console.error('ERROR: Express could not listen on the configured address.');
      shutdown(1).catch(() => { process.exitCode = 1; });
    });
  })
  .catch(async () => {
    console.error('ERROR: Failed to connect to MongoDB. Connection details were suppressed.');
    await shutdown(1);
  });
