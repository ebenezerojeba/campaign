import mongoose from 'mongoose';
import { env } from './env.js';

// NoSQL-injection defence: every request input is parsed by a Zod schema into
// primitive types, Express 5 uses the simple query parser (no nested objects),
// and request bodies are stripped of $-prefixed keys (middleware/sanitizeBody).
mongoose.set('strictQuery', true);

// Cached across serverless invocations: the module scope survives while the
// function instance is warm, so each request reuses one connection pool.
const cache = globalThis.__apcMongo ?? (globalThis.__apcMongo = { conn: null, promise: null, uri: null });

let resolvedUri = env.mongoUri ?? cache.uri;

export function setMongoUri(uri) {
  resolvedUri = uri;
}

export function dbConfigured() {
  return Boolean(resolvedUri);
}

export async function connectDb() {
  if (!resolvedUri) return null;
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose
      .connect(resolvedUri, {
        bufferCommands: false,
        maxPoolSize: env.onVercel ? 5 : 10,
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 30000,
      })
      .then((m) => {
        cache.conn = m;
        return m;
      })
      .catch((err) => {
        cache.promise = null;
        throw err;
      });
  }
  return cache.promise;
}

export function dbState() {
  if (!resolvedUri) return 'not_configured';
  return ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] ?? 'unknown';
}
