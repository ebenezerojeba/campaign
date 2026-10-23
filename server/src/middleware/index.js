import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { connectDb, dbConfigured } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { User, PERMISSIONS } from '../models/User.js';

// ---------- Validation ----------

// Parses req[source] with a Zod schema and replaces it with the parsed value.
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    return next(new ApiError(422, 'VALIDATION_FAILED', 'Some details need attention', { fields }));
  }
  if (source === 'query') req.validatedQuery = result.data; // req.query is read-only in Express 5
  else req[source] = result.data;
  return next();
};

export const validObjectId = (param = 'id') => (req, _res, next) => {
  if (!mongoose.isValidObjectId(req.params[param])) return next(ApiError.notFound());
  return next();
};

// Removes keys that MongoDB would interpret as operators ($...) or paths (a.b).
function stripOperators(value, depth = 0) {
  if (depth > 10 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => stripOperators(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith('$') || k.includes('.')) continue;
    out[k] = stripOperators(v, depth + 1);
  }
  return out;
}

export const sanitizeBody = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') req.body = stripOperators(req.body);
  next();
};

// ---------- Database availability ----------

export const requireDb = async (_req, _res, next) => {
  if (!dbConfigured()) {
    return next(ApiError.unavailable('The registration database is not connected yet. No information has been saved.', 'DB_NOT_CONFIGURED'));
  }
  try {
    await connectDb();
    return next();
  } catch (err) {
    console.error('[db] connection failed:', err.message);
    return next(ApiError.unavailable('The registration service is temporarily unavailable. Your information has not been saved. Please try again shortly.', 'DB_UNAVAILABLE'));
  }
};

// ---------- CSRF defence ----------
// Session cookies are SameSite=Strict. In addition, every state-changing request
// to an authenticated API must carry a custom header (which a cross-site form
// cannot send without a CORS preflight) and, when present, a matching Origin.
export const csrfGuard = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'fetch') return next(ApiError.forbidden('Request blocked'));
  const origin = req.get('origin');
  if (origin) {
    const host = req.get('x-forwarded-host') || req.get('host');
    let originHost = '';
    try { originHost = new URL(origin).host; } catch { /* invalid */ }
    const devProxy = !env.isProd && /^http:\/\/localhost:\d+$/.test(origin); // Vite dev/preview proxy
    const allowed = originHost === host || env.corsOrigins.includes(origin) || origin === env.frontendUrl || devProxy;
    if (!allowed) return next(ApiError.forbidden('Request blocked'));
  }
  return next();
};

// ---------- Sessions ----------

export const STAFF_COOKIE = 'apc_staff';

const cookieOptions = (hours) => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'strict',
  path: '/api',
  maxAge: hours * 60 * 60 * 1000,
});

function requireSecret() {
  if (!env.jwtSecret) throw ApiError.unavailable('Sign-in is not configured on this server', 'AUTH_NOT_CONFIGURED');
}

export function issueStaffSession(res, user) {
  requireSecret();
  const token = jwt.sign({ sub: String(user._id), typ: 'staff', v: user.tokenVersion }, env.jwtSecret, { expiresIn: `${env.adminSessionHours}h` });
  res.cookie(STAFF_COOKIE, token, cookieOptions(env.adminSessionHours));
}

export function clearSession(res, name) {
  const { maxAge, ...opts } = cookieOptions(0);
  res.clearCookie(name, opts);
}

function readToken(req, cookie, typ) {
  const token = req.cookies?.[cookie];
  if (!token || !env.jwtSecret) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    return payload.typ === typ ? payload : null;
  } catch {
    return null;
  }
}

export const readStaffToken = (req) => readToken(req, STAFF_COOKIE, 'staff');

export const requireStaff = async (req, res, next) => {
  const payload = readToken(req, STAFF_COOKIE, 'staff');
  if (!payload) return next(ApiError.unauthorized('Your session has ended. Sign in again.'));
  const user = await User.findById(payload.sub);
  if (!user || !user.active || user.tokenVersion !== payload.v) {
    clearSession(res, STAFF_COOKIE);
    return next(ApiError.unauthorized('Your session has ended. Sign in again.'));
  }
  req.user = user;
  return next();
};

export const requirePermission = (permission) => (req, _res, next) => {
  if (!PERMISSIONS[req.user?.role]?.includes(permission)) return next(ApiError.forbidden());
  return next();
};

// ---------- Rate limits ----------
// In-memory counters: effective per server instance. For multi-instance
// production traffic, back these with a shared store (see README).

const limiter = (windowMinutes, limit, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test',
    handler: (_req, _res, next) => next(new ApiError(429, 'RATE_LIMITED', message)),
  });

export const limits = {
  api: limiter(1, 300, 'Too many requests. Wait a minute and try again.'),
  register: limiter(15, 10, 'Too many registration attempts from this connection. Wait 15 minutes and try again.'),
  login: limiter(15, 10, 'Too many sign-in attempts. Wait 15 minutes and try again.'),
  lookup: limiter(15, 20, 'Too many status checks. Wait 15 minutes and try again.'),
};

// ---------- Errors ----------

export const notFound = (_req, _res, next) => next(ApiError.notFound('This API route does not exist'));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  let error = err;
  if (err?.type === 'entity.parse.failed') error = ApiError.badRequest('The request body is not valid JSON');
  else if (err?.type === 'entity.too.large') error = new ApiError(413, 'TOO_LARGE', 'The request is too large');
  else if (err instanceof mongoose.Error.ValidationError) error = new ApiError(422, 'VALIDATION_FAILED', 'Some details need attention');
  else if (err instanceof mongoose.Error.CastError) error = ApiError.badRequest('Invalid identifier');
  else if (err?.name === 'MongoServerSelectionError' || err?.name === 'MongoNetworkError') {
    error = ApiError.unavailable('The registration service is temporarily unavailable. Please try again shortly.', 'DB_UNAVAILABLE');
  } else if (err?.name === 'MulterError') {
    error = err.code === 'LIMIT_FILE_SIZE'
      ? new ApiError(413, 'TOO_LARGE', 'One of your files is too large. Use a smaller photo or PDF and try again.')
      : ApiError.badRequest(err.code === 'LIMIT_UNEXPECTED_FILE' ? 'The form sent an unexpected file' : 'The upload could not be processed');
  }

  if (!(error instanceof ApiError)) {
    console.error('[error]', req.method, req.originalUrl, err);
    error = new ApiError(500, 'SERVER_ERROR', 'Something went wrong on our side. Please try again.');
  }
  const body = { ok: false, error: { code: error.code, message: error.message } };
  if (error.details) body.error.details = error.details;
  res.status(error.status).json(body);
};
