import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { publicRouter, portalRouter, adminRouter } from './routes/index.js';
import { sanitizeBody, notFound, errorHandler, limits } from './middleware/index.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Vercel / a single reverse proxy: req.ip is the client

  app.use(helmet({
    contentSecurityPolicy: false, // the API serves JSON; the SPA's CSP is set by the static host
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }));

  // Same-origin in the default deployment (SPA and API on one domain). Extra
  // origins are allowed only when listed in CORS_ORIGINS.
  const allowed = new Set([env.frontendUrl, ...env.corsOrigins]);
  app.use('/api', cors({
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
    maxAge: 600,
  }));

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(sanitizeBody);
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', limits.api);

  app.use('/api', publicRouter);
  app.use('/api/portal', portalRouter);
  app.use('/api/admin', adminRouter);

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}

export default createApp();
