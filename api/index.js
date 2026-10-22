// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json)
// and handled by the Express app. The MongoDB connection is cached on globalThis
// so warm invocations reuse it.
import app from '../server/src/app.js';

export default app;
