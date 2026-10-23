// One-shot admin seeder with the credentials filled in.
// Run: node server/scripts/create-admin-direct.js
import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']); // fixes "querySrv EBADRESP" by skipping your ISP's DNS

import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDb, setMongoUri, dbConfigured } from '../src/config/db.js';
import { startDevDatabase, stopDevDatabase } from '../src/config/devDb.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

const EMAIL = 'their@email.com';
const NAME = 'Emma';
const ROLE = 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Emma123456789'; // must be 12+ characters

async function main() {
  if (PASSWORD.length < 12) {
    throw new Error('The password must be at least 12 characters.');
  }

  if (!dbConfigured()) {
    if (env.isProd) throw new Error('Set MONGODB_URI.');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    setMongoUri(await startDevDatabase(path.join(root, '.data', 'mongo')));
  }
  await connectDb();
  console.info('Connected to the database.');

  const passwordHash = await User.hashPassword(PASSWORD);
  const existing = await User.findOne({ email: EMAIL });

  if (existing) {
    existing.set({ name: NAME, role: ROLE, passwordHash, active: true, tokenVersion: existing.tokenVersion + 1 });
    await existing.save();
    console.info(`Updated ${ROLE} account for ${EMAIL}. Old sessions were signed out.`);
  } else {
    await User.create({ email: EMAIL, name: NAME, role: ROLE, passwordHash });
    console.info(`Created ${ROLE} account for ${EMAIL}.`);
  }

  await mongoose.disconnect();
  await stopDevDatabase();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Failed:', err);
  await mongoose.disconnect().catch(() => {});
  await stopDevDatabase();
  process.exit(1);
});