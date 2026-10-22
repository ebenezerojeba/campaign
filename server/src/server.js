// Long-running server entry for local development and container/VM hosting.
// On Vercel the API runs from api/index.js instead.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { env } from './config/env.js';
import { connectDb, setMongoUri, dbConfigured } from './config/db.js';
import { startDevDatabase } from './config/devDb.js';
import app from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function main() {
  if (!dbConfigured() && !env.isProd) {
    const uri = await startDevDatabase(path.join(root, '.data', 'mongo'));
    if (uri) setMongoUri(uri);
  }

  if (dbConfigured()) {
    try {
      await connectDb();
      console.info('[db] connected');
    } catch (err) {
      console.error('[db] initial connection failed, will retry per request:', err.message);
    }
  } else {
    console.warn('[db] MONGODB_URI is not set: registration and admin features will report as unavailable.');
  }

  // When hosting the API and the built SPA together on one Node server.
  const dist = path.join(root, 'dist');
  if (env.isProd && fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1y', immutable: true }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html'), { maxAge: 0 }));
  }

  app.listen(env.port, () => console.info(`[api] listening on http://localhost:${env.port} (${env.NODE_ENV})`));
}

main();
