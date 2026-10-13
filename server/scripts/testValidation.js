// Preserve the old command path while enforcing the current local-only gate.
// All writes and exact-ID cleanup live in this explicitly targeted verifier.
const { verify } = require('./testDatabaseValidation');

if (require.main === module) verify();
module.exports = { verify };
