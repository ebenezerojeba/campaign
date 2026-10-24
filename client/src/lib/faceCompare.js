// Compares the face in the passport photo with the photo printed on the
// voter's card, in the reviewer's browser (face-api). Models come from our own
// domain (/vendor/face-models). Nothing is sent anywhere by this module.
let ready;
function api() {
  ready ??= (async () => {
    const faceapi = await import('@vladmandic/face-api');
    await faceapi.tf.ready();
    const uri = '/vendor/face-models';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(uri),
      faceapi.nets.faceLandmark68Net.loadFromUri(uri),
      faceapi.nets.faceRecognitionNet.loadFromUri(uri),
    ]);
    return faceapi;
  })().catch((err) => { ready = undefined; throw err; });
  return ready;
}

// Draws part of an image (fractions of its width and height) enlarged to about
// `size` pixels on the long side.
function crop(bitmap, [x, y, w, h], size) {
  const sw = bitmap.width * w;
  const sh = bitmap.height * h;
  const scale = size / Math.max(sw, sh);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d').drawImage(bitmap, bitmap.width * x, bitmap.height * y, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// The face detector shrinks whatever it is given to a small square, so the
// tiny photo printed on a card can vanish. Searching halves and quarters of
// the card, enlarged, makes that face big enough to find.
const CARD_REGIONS = [
  [0, 0, 1, 1],
  [0, 0, 0.5, 1], [0.5, 0, 0.5, 1],
  [0, 0, 0.5, 0.6], [0, 0.4, 0.5, 0.6], [0.5, 0, 0.5, 0.6], [0.5, 0.4, 0.5, 0.6],
];

// The descriptor of the clearest face found, or null when none is found.
async function bestFace(faceapi, blob, regions) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  let best = null;
  try {
    for (const region of regions) {
      const faces = await faceapi.detectAllFaces(crop(bitmap, region, 1024), new faceapi.SsdMobilenetv1Options({ minConfidence: 0.25 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
      for (const f of faces) {
        if (!best || f.detection.score > best.detection.score) best = f;
      }
      if (best && best.detection.score > 0.8) break; // clear enough: stop searching
    }
  } finally {
    bitmap.close();
  }
  return best?.descriptor ?? null;
}

// Returns { distance } (lower = more alike) or { distance: null } with which photo had no face.
export async function compareFaces(passportBlob, cardBlob) {
  const faceapi = await api();
  const passport = await bestFace(faceapi, passportBlob, [[0, 0, 1, 1]]);
  const card = await bestFace(faceapi, cardBlob, CARD_REGIONS);
  if (!passport || !card) return { distance: null, passportFace: Boolean(passport), cardFace: Boolean(card) };
  return { distance: Math.round(faceapi.euclideanDistance(passport, card) * 1000) / 1000, passportFace: true, cardFace: true };
}
