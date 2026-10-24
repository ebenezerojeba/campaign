// Counters shared across server instances, stored in MongoDB.
import crypto from 'node:crypto';
import { RateLimit } from '../models/RateLimit.js';

// Keys can contain email addresses or IPs: store a short hash instead.
const hashed = (key) => crypto.createHash('sha256').update(String(key)).digest('base64url').slice(0, 22);
const windowOf = (windowMs, now) => Math.floor(now / windowMs);
const idFor = (name, key, windowMs, now) => `${name}:${hashed(key)}:${windowOf(windowMs, now)}`;
const resetAt = (windowMs, now) => new Date((windowOf(windowMs, now) + 1) * windowMs);

// Adds one hit and returns the total for the current window.
export async function hit(name, key, windowMs, now = Date.now()) {
  const doc = await RateLimit.findOneAndUpdate(
    { _id: idFor(name, key, windowMs, now) },
    { $inc: { hits: 1 }, $setOnInsert: { expiresAt: resetAt(windowMs, now) } },
    { upsert: true, new: true, lean: true },
  );
  return { hits: doc.hits, resetAt: resetAt(windowMs, now) };
}

export async function count(name, key, windowMs, now = Date.now()) {
  const doc = await RateLimit.findById(idFor(name, key, windowMs, now)).lean();
  return doc?.hits ?? 0;
}

export async function clear(name, key, windowMs, now = Date.now()) {
  await RateLimit.deleteOne({ _id: idFor(name, key, windowMs, now) });
}

// A store for express-rate-limit, so limits hold across Vercel instances.
export class MongoRateLimitStore {
  constructor(name) {
    this.name = name;
    this.localKeys = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const { hits, resetAt: resetTime } = await hit(this.name, key, this.windowMs);
    return { totalHits: hits, resetTime };
  }

  async decrement(key) {
    await RateLimit.updateOne({ _id: idFor(this.name, key, this.windowMs, Date.now()) }, { $inc: { hits: -1 } });
  }

  async resetKey(key) {
    await clear(this.name, key, this.windowMs);
  }
}
