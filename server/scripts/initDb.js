// Keep the original entry point safe for anyone who still invokes it directly.
// Schema writes are permitted only by the local-only, explicitly confirmed initializer.
const { initialize } = require('./initLocalDatabase');

if (require.main === module) initialize();
module.exports = { initialize };
