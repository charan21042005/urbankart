const readline = require('node:readline/promises');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const safety = require('./databaseSafety');

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== 'function') return reject(new Error('Run this command in an interactive PowerShell terminal.'));
    let value = '';
    process.stdout.write(question);
    input.setRawMode(true);
    input.resume();
    const finish = (error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') return finish(new Error('Cancelled.'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    input.on('data', onData);
  });
}

async function main() {
  const target = await safety.connectAfterPreflight({
    mode: 'local-write', argv: process.argv.slice(2),
    connect: (uri) => mongoose.connect(uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10_000 })
  });
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    safety.validateLocalReplicaSetHello(hello, target.expectedReplicaSetName);
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    const email = (await terminal.question('Local admin email: ')).trim().toLowerCase();
    terminal.close();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('A valid email address is required.');
    const password = await askHidden('Password (input hidden): ');
    const passwordBytes = Buffer.byteLength(password, 'utf8');
    if (passwordBytes < 8 || passwordBytes > 72) throw new Error('Password must be 8 to 72 UTF-8 bytes.');
    let user = await User.findOne({ email });
    if (user) {
      if (user.isActive === false) throw new Error('That account is inactive; no change was made.');
      if (!await bcrypt.compare(password, user.passwordHash)) throw new Error('Password verification failed; no role change was made.');
      if (user.role !== 'admin') {
        const answer = await askHidden('Type PROMOTE to grant this verified local account administrator access: ');
        if (answer !== 'PROMOTE') throw new Error('Promotion cancelled; no role change was made.');
        user.role = 'admin';
        await user.save();
      }
    } else {
      const namePrompt = readline.createInterface({ input: process.stdin, output: process.stdout });
      let name;
      try { name = (await namePrompt.question('Display name: ')).trim(); }
      finally { namePrompt.close(); }
      if (!name || name.length > 100) throw new Error('A display name of 1 to 100 characters is required.');
      user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role: 'admin' });
    }
    if (user.role !== 'admin' || !await bcrypt.compare(password, user.passwordHash)) throw new Error('Admin account verification failed.');
    process.stdout.write(JSON.stringify({ status: 'verified', database: target.databaseName, replicaSet: hello.setName, role: user.role }) + '\n');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  if (error instanceof safety.SafetyError) process.stderr.write(`Local admin setup refused: ${error.message}\n`);
  else process.stderr.write(`Local admin setup stopped: ${error?.message || 'Error'}\n`);
  process.exitCode = 1;
});
