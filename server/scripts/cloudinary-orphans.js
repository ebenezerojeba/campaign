// Finds (and optionally removes) Cloudinary files in the registration
// documents folder that no registration links to: for example copies left
// behind when a move was interrupted between uploading and recording.
//
//   npm run docs:orphans                 preview: counts only, nothing changes
//   npm run docs:orphans -- --confirm    delete the unlinked files
//   options: --min-age-hours 1  --public-dns
//
// Never touches files outside the documents folder, files any registration
// links to, or files younger than --min-age-hours (default 1), so a
// registration being saved at this moment is safe.
import dns from 'node:dns';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : fallback; };
if (args.includes('--public-dns')) dns.setServers(['8.8.8.8', '1.1.1.1']);
const confirm = args.includes('--confirm');
const minAgeMs = Number(opt('min-age-hours', 1)) * 3600e3;
const FOLDER = 'apc-agent-documents/';

const { connectDb, dbConfigured } = await import('../src/config/db.js');
const cloud = await import('../src/services/cloudinary.js');
if (!dbConfigured() || !cloud.enabled()) { console.error('Set MONGODB_URI and CLOUDINARY_URL.'); process.exit(1); }
await connectDb();

// Every public ID a registration links to.
const linked = new Set();
for await (const a of mongoose.connection.db.collection('agents').find({}, { projection: { 'documents.passport.cloudinary.publicId': 1, 'documents.pvc.cloudinary.publicId': 1, 'documents.selfie.cloudinary.publicId': 1 } })) {
  for (const k of ['passport', 'pvc', 'selfie']) { const id = a.documents?.[k]?.cloudinary?.publicId; if (id) linked.add(id); }
}

const cutoff = Date.now() - minAgeMs;
const orphans = { image: [], raw: [] };
let scanned = 0;
let bytes = 0;
for (const resourceType of ['image', 'raw']) {
  let cursor;
  do {
    const page = await cloudinary.api.resources({ type: 'authenticated', resource_type: resourceType, prefix: FOLDER, max_results: 500, next_cursor: cursor });
    for (const r of page.resources) {
      scanned += 1;
      if (!r.public_id.startsWith(FOLDER) || linked.has(r.public_id)) continue;
      if (new Date(r.created_at).getTime() > cutoff) continue;
      orphans[resourceType].push(r.public_id);
      bytes += r.bytes ?? 0;
    }
    cursor = page.next_cursor;
  } while (cursor);
}
const count = orphans.image.length + orphans.raw.length;
console.info(`Scanned ${scanned} files in ${FOLDER}; ${linked.size} linked to registrations; ${count} unlinked and older than ${minAgeMs / 3600e3} h (${(bytes / 1048576).toFixed(0)} MB).`);
if (!confirm) {
  console.info('Preview only. Re-run with --confirm to delete them.');
} else {
  let deleted = 0;
  for (const resourceType of ['image', 'raw']) {
    const ids = orphans[resourceType];
    for (let i = 0; i < ids.length; i += 100) {
      const res = await cloudinary.api.delete_resources(ids.slice(i, i + 100), { type: 'authenticated', resource_type: resourceType, invalidate: true });
      deleted += Object.values(res.deleted).filter((v) => v === 'deleted').length;
    }
  }
  console.info(`Deleted ${deleted} unlinked files.`);
}
await mongoose.disconnect();
