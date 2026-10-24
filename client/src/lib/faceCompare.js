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

async function toCanvas(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

// The descriptor of the largest face in the image, or null when none is found.
async function largestFace(faceapi, blob) {
  const faces = await faceapi.detectAllFaces(await toCanvas(blob), new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  if (!faces.length) return null;
  faces.sort((a, b) => b.detection.box.area - a.detection.box.area);
  return faces[0].descriptor;
}

// Returns { distance } (lower = more alike) or { distance: null } with which photo had no face.
export async function compareFaces(passportBlob, cardBlob) {
  const faceapi = await api();
  const passport = await largestFace(faceapi, passportBlob);
  const card = await largestFace(faceapi, cardBlob);
  if (!passport || !card) return { distance: null, passportFace: Boolean(passport), cardFace: Boolean(card) };
  return { distance: Math.round(faceapi.euclideanDistance(passport, card) * 1000) / 1000, passportFace: true, cardFace: true };
}
