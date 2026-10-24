// Checks and stores uploaded registration documents.
//
// What the checks prove: each file really is a JPEG, PNG, WebP or PDF (judged
// by its bytes, not its name or the browser's claimed type), is structurally
// complete, is within the size and pixel limits, and (for PDFs) carries no
// scripts, launch actions or embedded files. Photo metadata such as GPS
// location is removed from JPEGs. The checks cannot tell whether a voter's
// card is genuine: staff verify that separately.
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import mongoose from 'mongoose';
import multer from 'multer';
import { DOCUMENT_RULES, formatBytes } from '../../../shared/agentForm.js';
import { ApiError } from '../utils/ApiError.js';
import * as cloud from './cloudinary.js';

const BUCKET = 'agentDocuments';
const MAX_FILE = Math.max(...Object.values(DOCUMENT_RULES).map((r) => r.maxBytes));

// Multipart parsing for the registration form: files stay in memory (no disk
// writes on serverless). The JSON form fields arrive in a "data" field.
export const registrationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE, files: 3, fields: 2, fieldSize: 32 * 1024, parts: 6 },
}).fields(Object.keys(DOCUMENT_RULES).map((name) => ({ name, maxCount: 1 })));

// ---------- Format detection from file content ----------

const startsWith = (buf, bytes, at = 0) => bytes.every((b, i) => buf[at + i] === b);

function sniff(buf) {
  if (buf.length < 12) return null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

class Invalid extends Error {}

// Walks the JPEG segments up to the image data, reads the frame size and drops
// metadata segments (EXIF/XMP in APP1, IPTC in APP13, comments).
function inspectJpeg(buf) {
  const kept = [buf.subarray(0, 2)];
  let i = 2;
  let width = 0;
  let height = 0;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Invalid('corrupt');
    const marker = buf[i + 1];
    if (marker === 0xff) { i += 1; continue; } // fill byte
    if (marker === 0xd9) throw new Invalid('no image data');
    if (marker >= 0xd0 && marker <= 0xd7) { kept.push(buf.subarray(i, i + 2)); i += 2; continue; }
    if (i + 4 > buf.length) throw new Invalid('truncated');
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) throw new Invalid('truncated');
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      height = buf.readUInt16BE(i + 5);
      width = buf.readUInt16BE(i + 7);
    }
    const strip = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!strip) kept.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
    if (marker === 0xda) {
      // Start of scan: the rest is image data up to the end-of-image marker.
      let end = buf.length;
      while (end > i && buf[end - 1] === 0x00) end -= 1;
      if (buf[end - 2] !== 0xff || buf[end - 1] !== 0xd9) throw new Invalid('truncated');
      kept.push(buf.subarray(i, end));
      if (!width || !height) throw new Invalid('no frame');
      return { width, height, buffer: Buffer.concat(kept) };
    }
  }
  throw new Invalid('truncated');
}

// Validates every PNG chunk and drops text and EXIF chunks.
function inspectPng(buf) {
  const kept = [buf.subarray(0, 8)];
  let i = 8;
  let width = 0;
  let height = 0;
  let sawEnd = false;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    if (i + 12 + len > buf.length) throw new Invalid('truncated');
    const crc = buf.readUInt32BE(i + 8 + len);
    if (zlib.crc32(buf.subarray(i + 4, i + 8 + len)) !== crc) throw new Invalid('corrupt');
    if (type === 'IHDR') { width = buf.readUInt32BE(i + 8); height = buf.readUInt32BE(i + 12); }
    if (!['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(type)) kept.push(buf.subarray(i, i + 12 + len));
    i += 12 + len;
    if (type === 'IEND') { sawEnd = true; break; }
  }
  if (!sawEnd || !width || !height) throw new Invalid('truncated');
  return { width, height, buffer: Buffer.concat(kept) };
}

function inspectWebp(buf) {
  if (buf.readUInt32LE(4) + 8 > buf.length) throw new Invalid('truncated');
  const chunk = buf.toString('latin1', 12, 16);
  let width = 0;
  let height = 0;
  if (chunk === 'VP8X') {
    width = 1 + buf.readUIntLE(24, 3);
    height = 1 + buf.readUIntLE(27, 3);
  } else if (chunk === 'VP8 ') {
    if (!startsWith(buf, [0x9d, 0x01, 0x2a], 23)) throw new Invalid('corrupt');
    width = buf.readUInt16LE(26) & 0x3fff;
    height = buf.readUInt16LE(28) & 0x3fff;
  } else if (chunk === 'VP8L') {
    if (buf[20] !== 0x2f) throw new Invalid('corrupt');
    const bits = buf.readUInt32LE(21);
    width = (bits & 0x3fff) + 1;
    height = ((bits >> 14) & 0x3fff) + 1;
  } else {
    throw new Invalid('corrupt');
  }
  return { width, height, buffer: buf };
}

const PDF_DANGER = /\/(JavaScript|JS|Launch|EmbeddedFile|EmbeddedFiles|RichMedia|XFA)\b/;

// Scans the PDF and its compressed streams for active content.
function inspectPdf(buf) {
  const text = buf.toString('latin1');
  if (!text.slice(-1024).includes('%%EOF')) throw new Invalid('truncated');
  if (/\/Encrypt\b/.test(text)) throw new Invalid('encrypted');
  if (PDF_DANGER.test(text)) throw new Invalid('active content');
  const streams = /stream\r?\n/g;
  let match;
  let inflated = 0;
  while ((match = streams.exec(text))) {
    const start = match.index + match[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) break;
    try {
      const out = zlib.inflateSync(buf.subarray(start, end), { maxOutputLength: 4 * 1024 * 1024 });
      inflated += out.length;
      if (PDF_DANGER.test(out.toString('latin1'))) throw new Invalid('active content');
    } catch (err) {
      if (err instanceof Invalid) throw err;
      // Not a Flate stream (e.g. an embedded JPEG): nothing to scan.
    }
    if (inflated > 20 * 1024 * 1024) throw new Invalid('too complex');
    streams.lastIndex = end;
  }
  return { width: undefined, height: undefined, buffer: buf };
}

const INSPECT = { 'image/jpeg': inspectJpeg, 'image/png': inspectPng, 'image/webp': inspectWebp, 'application/pdf': inspectPdf };

const TYPE_WORDS = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP', 'application/pdf': 'PDF' };
const allowedWords = (types) => types.map((t) => TYPE_WORDS[t]).join(', ').replace(/, ([^,]*)$/, ' or $1');

// Returns { contentType, buffer, bytes, width, height, sha256 } or throws a
// 422 with a message for the applicant.
export function checkDocument(kind, file) {
  const rules = DOCUMENT_RULES[kind];
  const fail = (message) => { throw new ApiError(422, 'VALIDATION_FAILED', 'Some details need attention', { fields: { [kind]: message } }); };
  if (!file?.buffer?.length) fail(`Upload your ${rules.label.toLowerCase()}`);
  if (file.buffer.length > rules.maxBytes) fail(`${rules.label} must be ${formatBytes(rules.maxBytes)} or smaller`);

  const contentType = sniff(file.buffer);
  if (!contentType || !rules.types.includes(contentType)) {
    fail(`${rules.label} must be a ${allowedWords(rules.types)} file. This file's content is not one of those formats.`);
  }

  let info;
  try {
    info = INSPECT[contentType](file.buffer);
  } catch (err) {
    if (!(err instanceof Invalid)) throw err;
    const why = {
      encrypted: 'is password-protected. Upload an unprotected PDF or a photo of the card.',
      'active content': 'contains scripts or attachments, which are not allowed. Upload a plain PDF or a photo of the card.',
    }[err.message] ?? 'appears damaged or incomplete. Take or export the file again and retry.';
    fail(`${rules.label} ${why}`);
  }

  if (info.width !== undefined) {
    if (info.width < rules.minWidth || info.height < rules.minHeight) {
      fail(`${rules.label} is too small (${info.width} × ${info.height} pixels). Use a clearer photo of at least ${rules.minWidth} × ${rules.minHeight} pixels.`);
    }
    const aspect = info.width / info.height;
    if (rules.minAspect && (aspect < rules.minAspect || aspect > rules.maxAspect)) {
      fail(`${rules.label} should be a portrait or square head-and-shoulders photo, not a wide or very tall image.`);
    }
  }

  return {
    contentType,
    buffer: info.buffer,
    bytes: info.buffer.length,
    width: info.width,
    height: info.height,
    sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
  };
}

// ---------- Storage ----------
// New documents go to Cloudinary when CLOUDINARY_URL is set, as private
// ("authenticated") assets that can only be fetched with a signed URL. The
// server fetches them itself and streams them to authorised staff, so no
// Cloudinary URL ever reaches a browser. Without CLOUDINARY_URL, and for files
// not yet moved, documents live in the MongoDB GridFS bucket.

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

export const hasDocument = (d) => Boolean(d?.fileId || d?.cloudinary?.publicId);
export const cloudinaryEnabled = () => cloud.enabled();

async function storeInGridFs(kind, checked, reference) {
  const upload = bucket().openUploadStream(`${reference}-${kind}.${EXT[checked.contentType]}`, {
    metadata: { kind, reference, contentType: checked.contentType, sha256: checked.sha256 },
  });
  await new Promise((resolve, reject) => {
    Readable.from(checked.buffer).pipe(upload).on('finish', resolve).on('error', reject);
  });
  return { fileId: upload.id };
}

export async function storeDocument(kind, checked, reference) {
  const where = cloud.enabled()
    ? { cloudinary: await cloud.upload(checked.buffer, { kind, contentType: checked.contentType, ext: EXT[checked.contentType] }) }
    : await storeInGridFs(kind, checked, reference);
  return {
    ...where,
    contentType: checked.contentType,
    bytes: checked.bytes,
    width: checked.width,
    height: checked.height,
    sha256: checked.sha256,
    uploadedAt: new Date(),
  };
}

// A readable stream of the document's bytes, wherever it is stored.
export async function openDocument(doc) {
  if (doc?.cloudinary?.publicId) return cloud.download(doc.cloudinary);
  return bucket().openDownloadStream(new mongoose.Types.ObjectId(String(doc.fileId)));
}

// The whole document in memory (for checks and moving files).
export async function readDocument(doc) {
  const stream = await openDocument(doc);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function deleteGridFsFile(fileId) {
  await bucket().delete(new mongoose.Types.ObjectId(String(fileId))).catch((err) => {
    if (!/FileNotFound/i.test(err?.message ?? '')) console.error('[documents] delete failed', String(fileId), err.message);
  });
}

// Deletes documents from wherever they are stored. Accepts document records
// (or bare GridFS ids, from older callers).
export async function deleteDocuments(docs) {
  await Promise.all(docs.filter(Boolean).map(async (d) => {
    if (d instanceof mongoose.Types.ObjectId || typeof d === 'string') return deleteGridFsFile(d);
    const jobs = [];
    if (d.cloudinary?.publicId) jobs.push(cloud.destroy(d.cloudinary).catch((err) => console.error('[documents] cloud delete failed', err?.message)));
    if (d.fileId) jobs.push(deleteGridFsFile(d.fileId));
    return Promise.all(jobs);
  }));
}
