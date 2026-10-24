// Counters shared across server instances, stored in MongoDB.
import crypto from 'node:crypto';
import { RateLimit } from '../models/RateLimit.js';

// Keys can contain email addresses or IPs: store a short hash instead.
const hashed = (key) => crypto.createHash('sha256').update(String(key)).digest('base64url').slice(0, 22);
const windowOf = (windowMs, now) => Math.floor(now / windowMs);
const idFor = (name, key, windowMs, now) => `${name}:${hashed(key)}:${windowOf(windowMs, now)}`;
const resetAt = (windowMs, now) => new Date((windowOf(windowMs, now) + 1) * windowMs);

// Counts are kept for one extra window, so a limit cannot be dodged by
// spreading attempts across the boundary between two windows.
async function bump(name, key, windowMs, now) {
  const doc = await RateLimit.findOneAndUpdate(
    { _id: idFor(name, key, windowMs, now) },
    { $inc: { hits: 1 }, $setOnInsert: { expiresAt: new Date(resetAt(windowMs, now).getTime() + windowMs) } },
    { upsert: true, new: true, lean: true },
  );
  return doc.hits;
}

// Hits in this window and the previous one together.
export async function count(name, key, windowMs, now = Date.now()) {
  const docs = await RateLimit.find({ _id: { $in: [idFor(name, key, windowMs, now), idFor(name, key, windowMs, now - windowMs)] } }).lean();
  return docs.reduce((t, d) => t + d.hits, 0);
}

// Adds one hit and returns the total for this window and the previous one.
export async function hit(name, key, windowMs, now = Date.now()) {
  await bump(name, key, windowMs, now);
  return { hits: await count(name, key, windowMs, now), resetAt: resetAt(windowMs, now) };
}

export async function clear(name, key, windowMs, now = Date.now()) {
  await RateLimit.deleteMany({ _id: { $in: [idFor(name, key, windowMs, now), idFor(name, key, windowMs, now - windowMs)] } });
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
    const now = Date.now();
    return { totalHits: await bump(this.name, key, this.windowMs, now), resetTime: resetAt(this.windowMs, now) };
  }

  async decrement(key) {
    await RateLimit.updateOne({ _id: idFor(this.name, key, this.windowMs, Date.now()) }, { $inc: { hits: -1 } });
  }

  async resetKey(key) {
    await clear(this.name, key, this.windowMs);
  }
}
