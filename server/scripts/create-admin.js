// Provisions a staff account. There is no public admin sign-up.
//   npm run create-admin -- --email you@example.org --name "Your Name" --role admin
// The password is read from ADMIN_PASSWORD or typed at a hidden prompt; it is
// never accepted as a command-line argument (which would land in shell history).
import mongoose from 'mongoose';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { connectDb, setMongoUri, dbConfigured } from '../src/config/db.js';
import { startDevDatabase, stopDevDatabase } from '../src/config/devDb.js';
import { env } from '../src/config/env.js';
import { User, ROLES } from '../src/models/User.js';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function hiddenPrompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

async function main() {
  const email = arg('email')?.toLowerCase();
  const name = arg('name');
  const role = arg('role') || 'admin';
  if (!email || !name || !ROLES.includes(role)) {
    console.error('Usage: npm run create-admin -- --email you@example.org --name "Your Name" [--role admin|reviewer]');
    process.exit(1);
  }
  const password = process.env.ADMIN_PASSWORD || (await hiddenPrompt('Password (min 12 characters): '));
  if (!password || password.length < 12) {
    console.error('The password must be at least 12 characters.');
    process.exit(1);
  }

  if (!dbConfigured()) {
    if (env.isProd) throw new Error('Set MONGODB_URI.');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    setMongoUri(await startDevDatabase(path.join(root, '.data', 'mongo')));
  }
  await connectDb();

  const passwordHash = await User.hashPassword(password);
  const existing = await User.findOne({ email });
  if (existing) {
    existing.set({ name, role, passwordHash, active: true, tokenVersion: existing.tokenVersion + 1 });
    await existing.save();
    console.info(`Updated ${role} account for ${email}. Existing sessions were signed out.`);
  } else {
    await User.create({ email, name, role, passwordHash });
    console.info(`Created ${role} account for ${email}.`);
  }
  await mongoose.disconnect();
  await stopDevDatabase();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect().catch(() => {});
  await stopDevDatabase();
  process.exit(1);
});
