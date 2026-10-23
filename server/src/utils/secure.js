// Field-level encryption for highly sensitive values (NIN). AES-256-GCM with a
// key from DATA_ENCRYPTION_KEY, so a database copy alone does not reveal them.
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

const key = () => {
  if (!env.dataEncryptionKey) throw ApiError.unavailable('Secure storage is not configured on this server', 'ENCRYPTION_NOT_CONFIGURED');
  return crypto.createHash('sha256').update(env.dataEncryptionKey).digest();
};

export function encryptField(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decryptField(token) {
  const [version, iv, tag, data] = String(token).split('.');
  if (version !== 'v1') throw new Error('Unknown encryption format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
