// Development-only fallback: when MONGODB_URI is unset, run a local MongoDB
// binary (via mongodb-memory-server) that stores data in .data/mongo so it
// survives restarts. Never used in production.
import fs from 'node:fs';
import net from 'node:net';

const PORT = 27027;
const DB_NAME = 'apc_lagos_dev';

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(800);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

let running = null;

// Graceful shutdown: lets mongod flush its journal so recent writes persist.
export async function stopDevDatabase() {
  if (running) await running.stop({ doCleanup: false }).catch(() => {});
  running = null;
}

export async function startDevDatabase(dbPath) {
  // Reuse the development database if another process (e.g. the API) already runs it.
  if (await portOpen(PORT)) return `mongodb://127.0.0.1:${PORT}/${DB_NAME}`;
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server-core');
    fs.mkdirSync(dbPath, { recursive: true });
    const server = await MongoMemoryServer.create({
      instance: { dbPath, storageEngine: 'wiredTiger', port: PORT },
      binary: { version: process.env.MONGOMS_VERSION || '7.0.14' },
    });
    running = server;
    const uri = server.getUri(DB_NAME);
    console.info(`[db] development database running at ${uri} (data in ${dbPath})`);
    const stop = async () => { await stopDevDatabase(); process.exit(0); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    return uri;
  } catch (err) {
    console.warn('[db] could not start the development database:', err.message);
    return null;
  }
}
