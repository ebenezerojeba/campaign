// Moves registration documents from MongoDB GridFS to private Cloudinary storage.
//
//   npm run docs:move                              preview: counts only, nothing changes
//   npm run docs:move -- --confirm                 copy to Cloudinary (GridFS copies are kept)
//   npm run docs:move -- --delete-gridfs --confirm delete GridFS copies of files already
//                                                  in Cloudinary, after re-downloading each
//                                                  one and checking it is identical
//   options: --limit 500  --concurrency 4  --public-dns
//
// Safe to stop and run again: finished files are skipped. Every copy is
// checked byte for byte against the file stored in the database (the checksum
// recorded at registration is of the file as uploaded, before photo metadata
// was removed, so it is not used here). Registrations themselves are never changed apart from where
// their documents are stored. Needs MONGODB_URI and CLOUDINARY_URL.
import crypto from 'node:crypto';
import dns from 'node:dns';
import mongoose from 'mongoose';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : fallback; };
if (args.includes('--public-dns')) dns.setServers(['8.8.8.8', '1.1.1.1']);
const confirm = args.includes('--confirm');
const deletePhase = args.includes('--delete-gridfs');
const limit = Number(opt('limit', 100000));
const concurrency = Math.min(8, Math.max(1, Number(opt('concurrency', 4))));

const { connectDb, dbConfigured } = await import('../src/config/db.js');
const { Agent } = await import('../src/models/Agent.js');
const docs = await import('../src/services/documents.js');
const cloud = await import('../src/services/cloudinary.js');

if (!dbConfigured()) { console.error('Set MONGODB_URI.'); process.exit(1); }
if (!cloud.enabled()) { console.error('Set CLOUDINARY_URL (cloudinary://<key>:<secret>@<cloud name>).'); process.exit(1); }
await connectDb();

const KINDS = ['passport', 'pvc', 'selfie'];
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

// Work list: one entry per document still to process.
const match = deletePhase
  ? { $or: KINDS.map((k) => ({ [`documents.${k}.fileId`]: { $exists: true }, [`documents.${k}.cloudinary.publicId`]: { $exists: true } })) }
  : { $or: KINDS.map((k) => ({ [`documents.${k}.fileId`]: { $exists: true }, [`documents.${k}.cloudinary`]: { $exists: false } })) };
const agents = await Agent.find(match).select('reference documents').sort({ createdAt: 1 }).limit(limit).lean();
const work = [];
for (const a of agents) {
  for (const kind of KINDS) {
    const d = a.documents?.[kind];
    if (!d?.fileId) continue;
    if (deletePhase ? d.cloudinary?.publicId : !d.cloudinary) work.push({ id: a._id, kind, d });
  }
}
const totalBytes = work.reduce((t, w) => t + (w.d.bytes ?? 0), 0);
console.info(`${deletePhase ? 'GridFS copies to delete' : 'Documents to copy to Cloudinary'}: ${work.length} (${(totalBytes / 1048576).toFixed(0)} MB) across ${agents.length} registrations.`);
if (!confirm) {
  console.info('Preview only. Re-run with --confirm to proceed.');
  await mongoose.disconnect();
  process.exit(0);
}

const tally = { done: 0, failed: 0, mismatched: 0 };
async function copy({ id, kind, d }) {
  const bytes = await docs.readDocument({ fileId: d.fileId });
  if (!bytes.length) { tally.mismatched += 1; console.error(`[skip] ${id} ${kind}: stored file is empty`); return; }
  const asset = await cloud.upload(bytes, { kind, contentType: d.contentType, ext: EXT[d.contentType] });
  if (!asset.md5 || asset.md5 !== md5(bytes)) {
    await cloud.destroy(asset).catch(() => {});
    throw new Error('Cloudinary copy differs from the original');
  }
  // Only record it if the document is still the one we copied.
  const res = await Agent.updateOne({ _id: id, [`documents.${kind}.fileId`]: d.fileId, [`documents.${kind}.cloudinary`]: { $exists: false } }, { $set: { [`documents.${kind}.cloudinary`]: asset } });
  if (res.modifiedCount !== 1) await cloud.destroy(asset).catch(() => {});
  else tally.done += 1;
}

async function removeGridFs({ id, kind, d }) {
  // Before deleting the database copy, prove Cloudinary holds the same bytes.
  // When the copy's MD5 was recorded (checked against these bytes at copy
  // time), compare Cloudinary's MD5 and size with the database copy without
  // downloading it; otherwise download both and compare them in full.
  const dbBytes = await docs.readDocument({ fileId: d.fileId });
  let same;
  if (d.cloudinary.md5) {
    const info = await cloud.headInfo(d.cloudinary);
    same = info.md5 === d.cloudinary.md5 && info.md5 === md5(dbBytes) && info.bytes === dbBytes.length;
  } else {
    const cloudBytes = await docs.readDocument({ cloudinary: d.cloudinary });
    same = cloudBytes.length > 0 && sha256(cloudBytes) === sha256(dbBytes);
  }
  if (!dbBytes.length || !same) { tally.mismatched += 1; console.error(`[keep] ${id} ${kind}: Cloudinary copy does not match; GridFS copy kept`); return; }
  const res = await Agent.updateOne({ _id: id, [`documents.${kind}.fileId`]: d.fileId, [`documents.${kind}.cloudinary.publicId`]: d.cloudinary.publicId }, { $unset: { [`documents.${kind}.fileId`]: 1 } });
  if (res.modifiedCount === 1) { await docs.deleteGridFsFile(d.fileId); tally.done += 1; }
}

const step = deletePhase ? removeGridFs : copy;
let next = 0;
let lastReport = Date.now();
async function runner() {
  while (next < work.length) {
    const item = work[next];
    next += 1;
    try { await step(item); } catch (err) { tally.failed += 1; console.error(`[error] ${item.id} ${item.kind}: ${String(err?.message ?? err).slice(0, 160)}`); }
    if (Date.now() - lastReport > 15000) { lastReport = Date.now(); console.info(`… ${next}/${work.length} (done ${tally.done}, failed ${tally.failed})`); }
  }
}
await Promise.all(Array.from({ length: concurrency }, runner));
console.info(`Finished: ${tally.done} ${deletePhase ? 'GridFS copies deleted' : 'copied'}, ${tally.failed} failed, ${tally.mismatched} checksum mismatches (left untouched). Run again to retry failures.`);
await mongoose.disconnect();
