// Copies the in-browser OCR and face-matching files into client/public/vendor,
// so they are served from our own domain (the CSP allows no other script or
// data origins). Runs before every build.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'client/public/vendor');
const nm = (...p) => path.join(root, 'node_modules', ...p);
const files = [
  [nm('tesseract.js/dist/worker.min.js'), 'tesseract/worker.min.js'],
  ...['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']
    .map((f) => [nm('tesseract.js-core', f), `tesseract/core/${f}`]),
  [nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), 'tesseract/lang/eng.traineddata.gz'],
  ...['ssd_mobilenetv1_model', 'face_landmark_68_model', 'face_recognition_model'].flatMap((m) => [
    [nm('@vladmandic/face-api/model', `${m}-weights_manifest.json`), `face-models/${m}-weights_manifest.json`],
    [nm('@vladmandic/face-api/model', `${m}.bin`), `face-models/${m}.bin`],
  ]),
];
for (const [from, to] of files) {
  const dest = path.join(out, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(from, dest);
}
console.log(`vendor: copied ${files.length} files to client/public/vendor`);
