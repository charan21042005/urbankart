const readline = require('node:readline/promises');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const { loadSelectedDatabaseEnvironment } = require('../config/databaseEnvironment');
const safety = require('./databaseSafety');

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== 'function') return reject(new Error('Run this command in an interactive PowerShell terminal.'));
    let value = '';
    process.stdout.write(question);
    input.setRawMode(true); input.resume();
    const finish = (error) => { input.setRawMode(false); input.pause(); input.removeListener('data', onData); process.stdout.write('\n'); error ? reject(error) : resolve(value); };
    const onData = (chunk) => { for (const char of chunk.toString('utf8')) {
      if (char === '\u0003') return finish(new Error('Cancelled.'));
      if (char === '\r' || char === '\n') return finish();
      if (char === '\u007f' || char === '\b') value = value.slice(0, -1); else if (char >= ' ') value += char;
    } };
    input.on('data', onData);
  });
}

async function main() {
  loadSelectedDatabaseEnvironment();
  if (process.env.URBANKART_DB_PROFILE !== 'atlas-demo') throw new safety.SafetyError('Select the atlas-demo profile before admin setup.');
  const target = await safety.connectAfterPreflight({ mode: 'atlas-demo-write', argv: process.argv.slice(2), connect: (uri) => mongoose.connect(uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10_000 }) });
  try {
    const db = mongoose.connection.db;
    const hello = await db.admin().command({ hello: 1 });
    const build = await db.admin().command({ buildInfo: 1 });
    safety.validateAtlasDemoHello(hello, build.versionArray, target.expectedTopology);
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    const email = (await prompt.question('Atlas demo admin email: ')).trim().toLowerCase(); prompt.close();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('A valid email address is required.');
    const password = await askHidden('New admin password (input hidden): ');
    const bytes = Buffer.byteLength(password, 'utf8');
    if (bytes < 8 || bytes > 72) throw new Error('Password must be 8 to 72 UTF-8 bytes.');
    if (await User.findOne({ email })) throw new Error('That email already exists; no account or role was changed.');
    const namePrompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    let name; try { name = (await namePrompt.question('Display name: ')).trim(); } finally { namePrompt.close(); }
    if (!name || name.length > 100) throw new Error('A display name of 1 to 100 characters is required.');
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role: 'admin' });
    process.stdout.write(JSON.stringify({ status: 'created', database: target.databaseName, topology: target.expectedTopology, role: user.role }) + '\n');
  } finally { await mongoose.disconnect(); }
}

main().catch((error) => {
  if (error instanceof safety.SafetyError) process.stderr.write(`Atlas admin setup refused: ${error.message}\n`);
  else process.stderr.write(`Atlas admin setup stopped: ${error?.message || 'Error'}\n`);
  process.exitCode = 1;
});
