// Reads the text on a voter's card photo in the browser (Tesseract), so the
// VIN can be compared with what was typed. Loaded only when needed; every
// file comes from our own domain (/vendor, see scripts/copy-vendor.mjs).
// Nothing is sent anywhere by this module.
import { vinCandidates } from '../../../shared/cardCheck.js';

let workerPromise;
function getWorker() {
  workerPromise ??= import('tesseract.js').then(({ createWorker }) => createWorker('eng', 1, {
    workerPath: '/vendor/tesseract/worker.min.js',
    corePath: '/vendor/tesseract/core',
    langPath: '/vendor/tesseract/lang',
    workerBlobURL: false,
    gzip: true,
  })).catch((err) => { workerPromise = undefined; throw err; });
  return workerPromise;
}

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

// Draws the photo larger, in greyscale with more contrast, optionally rotated:
// small card print reads much better this way.
async function prepare(blob, rotate) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(2.2, 2000 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const sideways = rotate % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;
  const ctx = canvas.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.5)';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  bitmap.close();
  return canvas;
}

// Returns { text, candidates } or throws if reading is not possible here.
// Cards are landscape: a portrait photo is tried turned both ways.
export async function readCard(blob, { timeoutMs = 60000 } = {}) {
  const worker = await withTimeout(getWorker(), timeoutMs);
  const probe = await createImageBitmap(blob);
  const portrait = probe.height > probe.width;
  probe.close();
  let text = '';
  for (const rotate of portrait ? [90, 270] : [0, 180]) {
    const { data } = await withTimeout(worker.recognize(await prepare(blob, rotate)), timeoutMs);
    text = data.text ?? '';
    const candidates = vinCandidates(text);
    if (candidates.length) return { text, candidates };
  }
  return { text, candidates: [] };
}
