const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const ROOT_ENV_PATH = path.resolve(__dirname, '../../.env');
const ATLAS_ENV_PATH = process.env.URBANKART_ATLAS_ENV_FILE
  ? path.resolve(process.env.URBANKART_ATLAS_ENV_FILE)
  : path.join(process.env.LOCALAPPDATA || process.env.TEMP || require('node:os').tmpdir(), 'UrbanKart', 'atlas.env');

function loadSelectedDatabaseEnvironment({ env = process.env, rootPath = ROOT_ENV_PATH, atlasPath = ATLAS_ENV_PATH } = {}) {
  const requestedProfile = env.URBANKART_DB_PROFILE || 'local';
  if (!['local', 'atlas-demo'].includes(requestedProfile)) {
    throw new Error('URBANKART_DB_PROFILE must be local or atlas-demo.');
  }

  if (requestedProfile === 'atlas-demo') {
    if (!fs.existsSync(atlasPath)) throw new Error('Atlas profile selected, but the local Atlas environment file is missing.');
    // Atlas settings intentionally replace root .env values so selecting this
    // profile cannot silently inherit the local/demo database target.
    Object.assign(env, dotenv.parse(fs.readFileSync(atlasPath)));
    if (env.URBANKART_DB_PROFILE !== 'atlas-demo') throw new Error('Atlas environment file does not select atlas-demo.');
    return { profile: requestedProfile, envFile: atlasPath };
  } else if (fs.existsSync(rootPath)) {
    const rootValues = dotenv.parse(fs.readFileSync(rootPath));
    for (const [key, value] of Object.entries(rootValues)) {
      if (env[key] === undefined) env[key] = value;
    }
  }

  return { profile: requestedProfile, envFile: requestedProfile === 'atlas-demo' ? atlasPath : rootPath };
}

module.exports = { ROOT_ENV_PATH, ATLAS_ENV_PATH, loadSelectedDatabaseEnvironment };
