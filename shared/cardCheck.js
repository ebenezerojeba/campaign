// Compares what text recognition read from a voter's card with what the
// applicant typed. Shared by the browser (applicant and reviewer) and the
// server (which makes the final VIN comparison against the stored value).
//
// Text recognition is imperfect, especially on phone photos of small print,
// so a reading is never proof either way:
//   match       the card shows the typed VIN (allowing look-alike characters)
//   close       one or two characters differ: a typo or a misread
//   mismatch    the card clearly shows a different VIN
//   unreadable  no VIN could be read: a reviewer checks the card by eye
export const VIN_LENGTH = 19;

// Characters text recognition often confuses, mapped to one form.
const LOOKALIKE = { O: '0', Q: '0', D: '0', I: '1', L: '1', T: '1', Z: '2', S: '5', B: '8', G: '6' };
export const normaliseVin = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const canonical = (v) => normaliseVin(v).replace(/[A-Z]/g, (c) => LOOKALIKE[c] ?? c);

export function distance(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// Possible VINs in recognised text: runs of letters and digits that, joined
// across spaces, are about 19 characters long and contain digits. Text after a
// "VIN" label is tried first.
export function vinCandidates(text, max = 6) {
  const upper = String(text ?? '').toUpperCase();
  const found = [];
  const add = (s) => { if (s.length >= VIN_LENGTH - 2 && s.length <= VIN_LENGTH + 2 && /\d/.test(s) && !found.includes(s)) found.push(s); };
  const labelled = upper.match(/V\s*[I1L]\s*N\s*[:.\-]?\s*([A-Z0-9 ]{15,40})/);
  if (labelled) {
    const joined = normaliseVin(labelled[1]);
    for (let len = VIN_LENGTH + 2; len >= VIN_LENGTH - 2; len -= 1) add(joined.slice(0, len));
  }
  for (const line of upper.split(/\n/)) {
    const tokens = line.split(/[^A-Z0-9]+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i += 1) {
      let s = '';
      for (let j = i; j < tokens.length && s.length < VIN_LENGTH + 2; j += 1) { s += tokens[j]; add(s); }
    }
  }
  return found.slice(0, max);
}

export function compareVin(typed, candidates) {
  const want = canonical(typed);
  if (!want || !candidates?.length) return { result: 'unreadable', distance: null };
  let best = Infinity;
  let bestCandidate = null;
  for (const c of candidates) {
    const d = distance(want, canonical(c));
    if (d < best) { best = d; bestCandidate = c; }
  }
  const result = best === 0 ? 'match' : best <= 2 ? 'close' : 'mismatch';
  return { result, distance: best, read: normaliseVin(bestCandidate) };
}

// Whether a name appears in the recognised text (allowing one misread letter).
export function nameFound(text, name) {
  const want = normaliseVin(name);
  if (want.length < 3) return null;
  const words = String(text ?? '').toUpperCase().split(/[^A-Z]+/).filter((w) => w.length >= 3);
  return words.some((w) => distance(w, want) <= (want.length > 5 ? 1 : 0));
}

// Whether a date of birth (YYYY-MM-DD) appears in the text in a common card format.
export function dateFound(text, isoDate) {
  const m = String(isoDate ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const flat = String(text ?? '').replace(/[^0-9]/g, '');
  return [`${d}${mo}${y}`, `${y}${mo}${d}`, `${mo}${d}${y}`].some((s) => flat.includes(s));
}

// Face similarity from the distance between two face descriptors (lower is
// more similar). Card photos are small and printed, so the bands are wide.
export function faceResult(dist) {
  if (dist === null || dist === undefined || Number.isNaN(dist)) return 'no_face';
  if (dist <= 0.5) return 'match';
  if (dist <= 0.62) return 'uncertain';
  return 'different';
}
