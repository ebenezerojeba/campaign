// Private document storage in Cloudinary.
//
// - Configured by CLOUDINARY_URL (cloudinary://<key>:<secret>@<cloud name>),
//   read on the server only.
// - Files are uploaded as "authenticated" assets: they cannot be opened
//   without a signed URL, and signed URLs are only ever used by this server.
// - Public IDs are random: no names, references or other personal details go
//   to Cloudinary apart from the file itself.
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';

const FOLDER = 'apc-agent-documents';
const TIMEOUT_MS = 20000;
let configured = null;

function parseUrl() {
  const raw = (process.env.CLOUDINARY_URL || '').trim();
  const match = raw.match(/^cloudinary:\/\/([^:]+):([^@]+)@([^/?#]+)/);
  return match ? { api_key: match[1], api_secret: match[2], cloud_name: match[3] } : null;
}

export function enabled() {
  if (configured === null) {
    const creds = parseUrl();
    configured = Boolean(creds);
    if (creds) cloudinary.config({ ...creds, secure: true });
  }
  return configured;
}

// For tests: swap the SDK calls for fakes.
let sdk = {
  uploadStream: (opts, cb) => cloudinary.uploader.upload_stream(opts, cb),
  destroy: (publicId, opts) => cloudinary.uploader.destroy(publicId, opts),
  url: (publicId, opts) => cloudinary.url(publicId, opts),
  fetch: (url, opts) => fetch(url, opts),
};
export function setSdkForTests(fake) { sdk = { ...sdk, ...fake }; configured = true; }
export function resetForTests() { configured = null; }

// Uploads a checked file. Returns what is needed to fetch or delete it later.
export async function upload(buffer, { kind, contentType, ext }) {
  if (!enabled()) throw new Error('Cloudinary is not configured');
  const resourceType = contentType === 'application/pdf' ? 'raw' : 'image';
  const id = crypto.randomUUID();
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Cloudinary upload timed out')), TIMEOUT_MS);
    const stream = sdk.uploadStream({
      type: 'authenticated',
      resource_type: resourceType,
      folder: `${FOLDER}/${kind}`,
      // Raw files keep their extension in the ID; images get a format instead.
      public_id: resourceType === 'raw' ? `${id}.${ext}` : id,
      overwrite: false,
      unique_filename: false,
      use_filename: false,
    }, (err, res) => { clearTimeout(timer); return err ? reject(err) : resolve(res); });
    Readable.from(buffer).pipe(stream);
  });
  return { publicId: result.public_id, resourceType, version: result.version, format: result.format, md5: result.etag };
}

const signedUrl = (asset) => sdk.url(asset.publicId, {
  type: 'authenticated',
  resource_type: asset.resourceType,
  sign_url: true,
  secure: true,
  ...(asset.version ? { version: asset.version } : {}),
  ...(asset.resourceType === 'image' && asset.format ? { format: asset.format } : {}),
});

// A readable stream of the stored bytes, fetched by this server.
export async function download(asset) {
  if (!enabled()) throw new Error('Cloudinary is not configured');
  const res = await sdk.fetch(signedUrl(asset), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw Object.assign(new Error(`Cloudinary returned ${res.status}`), { status: res.status });
  return Readable.fromWeb(res.body);
}

export async function destroy(asset) {
  if (!enabled()) throw new Error('Cloudinary is not configured');
  await sdk.destroy(asset.publicId, { type: 'authenticated', resource_type: asset.resourceType, invalidate: true });
}
