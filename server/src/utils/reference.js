import crypto from 'node:crypto';

// Crockford-style alphabet without easily confused characters (0/O, 1/I/L, U).
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomChunk(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// LAG-7K3M-9QPX: ~30^8 (6.5e11) combinations; uniqueness is still enforced by a DB index.
export function generateReference(prefix = 'LAG') {
  return `${prefix}-${randomChunk(4)}-${randomChunk(4)}`;
}

export function generateNumericCode(length = 6) {
  return String(crypto.randomInt(0, 10 ** length)).padStart(length, '0');
}

export function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}
