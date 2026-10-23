// Prepares a chosen file for upload. Photos are decoded, checked, shrunk and
// re-saved as JPEG in the browser: this keeps uploads small on mobile data,
// fixes sideways phone photos and drops metadata such as GPS location.
// The server re-checks everything; these checks only give faster feedback.
import { DOCUMENT_RULES, formatBytes } from '../../../shared/agentForm.js';

export class FileProblem extends Error {}

const typeWords = (types) => types.map((t) => ({ 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP', 'application/pdf': 'PDF' }[t])).join(', ').replace(/, ([^,]*)$/, ' or $1');

export const describeRules = (kind) => {
  const r = DOCUMENT_RULES[kind];
  return `${typeWords(r.types)}, up to ${formatBytes(r.maxBytes)}`;
};

export const acceptFor = (kind) => DOCUMENT_RULES[kind].types.join(',');

async function startsWithPdf(file) {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === '%PDF-';
}

const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

export async function prepareFile(kind, file) {
  const rules = DOCUMENT_RULES[kind];
  const label = rules.label;

  if (rules.types.includes('application/pdf') && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
    if (!(await startsWithPdf(file))) throw new FileProblem(`This file is named like a PDF but is not one. Upload a real PDF or a photo of your card.`);
    if (file.size > rules.maxBytes) throw new FileProblem(`This PDF is ${formatBytes(file.size)}. ${label} must be ${formatBytes(rules.maxBytes)} or smaller: take a photo of the card instead.`);
    return { blob: file, filename: `${kind}.pdf`, type: 'application/pdf', bytes: file.size, previewUrl: null, originalName: file.name };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new FileProblem(`We could not open this file as a photo. Use a ${typeWords(rules.types)} file. On iPhone, choose a photo from your library or take a new one.`);
  }
  const { width, height } = bitmap;
  if (width < rules.minWidth || height < rules.minHeight) {
    bitmap.close();
    throw new FileProblem(`This photo is too small (${width} × ${height} pixels). Use a clearer photo of at least ${rules.minWidth} × ${rules.minHeight} pixels.`);
  }
  const aspect = width / height;
  if (rules.minAspect && (aspect < rules.minAspect || aspect > rules.maxAspect)) {
    bitmap.close();
    throw new FileProblem('Use a portrait or square head-and-shoulders photo. Crop out extra background before uploading.');
  }

  const scale = Math.min(1, rules.resizeTo / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // transparent PNGs become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let blob = await toBlob(canvas, 0.88);
  if (blob && blob.size > rules.maxBytes) blob = await toBlob(canvas, 0.72);
  if (!blob) throw new FileProblem('Your browser could not prepare this photo. Try another photo or browser.');
  if (blob.size > rules.maxBytes) throw new FileProblem(`This photo is still too large after compression. Use a smaller photo.`);

  return { blob, filename: `${kind}.jpg`, type: 'image/jpeg', bytes: blob.size, width: canvas.width, height: canvas.height, previewUrl: URL.createObjectURL(blob), originalName: file.name };
}
