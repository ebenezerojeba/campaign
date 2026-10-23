// Queues registration confirmations that were never accepted by the mail
// server (for example during the 23 October rate limiting), so the paced
// outbox can deliver them within the provider's limits.
//
//   npm run email:recover                       preview only: counts, nothing changes
//   npm run email:recover -- --confirm          queue them
//   options: --since 2026-10-23T00:00:00Z  --limit 500  --include-admin-alerts  --public-dns
//
// Nothing is sent by this script: it only adds outbox entries. Entries that
// already exist are skipped, so running it twice queues nothing new.
import dns from 'node:dns';
import mongoose from 'mongoose';
import { connectDb, dbConfigured } from '../src/config/db.js';
import { Agent } from '../src/models/Agent.js';
import { EmailOutbox } from '../src/models/EmailOutbox.js';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : undefined; };
if (args.includes('--public-dns')) dns.setServers(['8.8.8.8', '1.1.1.1']);
const confirm = args.includes('--confirm');
const since = opt('since') ? new Date(opt('since')) : new Date(0);
const limit = Number(opt('limit')) || 5000;
const types = ['registration_confirmation', ...(args.includes('--include-admin-alerts') ? ['admin_alert'] : [])];

if (!dbConfigured()) { console.error('Set MONGODB_URI to the database to recover.'); process.exit(1); }
await connectDb();

let candidates = 0;
let alreadyQueued = 0;
let queued = 0;
for (const type of types) {
  // Registrations with no accepted email of this type.
  const rows = await Agent.find({ isSample: { $ne: true }, createdAt: { $gte: since }, notifications: { $not: { $elemMatch: { type, status: 'sent' } } } })
    .select('_id reference').sort({ createdAt: 1 }).limit(limit).lean();
  candidates += rows.length;
  const existing = new Set((await EmailOutbox.find({ key: { $in: rows.map((r) => `${r._id}:${type}`) } }).select('key').lean()).map((e) => e.key));
  const fresh = rows.filter((r) => !existing.has(`${r._id}:${type}`));
  alreadyQueued += rows.length - fresh.length;
  if (confirm && fresh.length) {
    try {
      const res = await EmailOutbox.insertMany(fresh.map((r) => ({ key: `${r._id}:${type}`, type, agent: r._id, reference: r.reference, priority: type === 'registration_confirmation' ? 4 : 6 })), { ordered: false });
      queued += res.length;
    } catch (err) {
      if (err?.code !== 11000) throw err;
      queued += err.insertedDocs?.length ?? 0;
    }
  }
  console.info(`${type}: ${rows.length} without an accepted email, ${rows.length - fresh.length} already in the outbox, ${fresh.length} ${confirm ? 'queued' : 'would be queued'}`);
}
console.info(confirm ? `Queued ${queued}. They will be sent within the configured limits.` : `Preview only: ${candidates - alreadyQueued} would be queued. Re-run with --confirm to queue them.`);
await mongoose.disconnect();
