import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const bool = (v, fallback = false) => (v === undefined || v === '' ? fallback : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production' || Boolean(process.env.VERCEL_ENV);
const onVercel = Boolean(process.env.VERCEL);

const JWT_SECRET = process.env.JWT_SECRET || '';
if (isProd && JWT_SECRET.length < 32) {
  // Refuse to sign sessions with a weak or missing secret in production.
  console.error('[config] JWT_SECRET must be set to at least 32 random characters in production. Sign-in is disabled.');
}

// Registrations hold encrypted identity and bank details: without a key they are refused.
if ((process.env.DATA_ENCRYPTION_KEY || '').length < 32) {
  console.error('[config] DATA_ENCRYPTION_KEY must be set to at least 32 random characters. Registration is disabled until it is.');
}

const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '';

export const env = {
  NODE_ENV,
  isProd,
  onVercel,
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: JWT_SECRET.length >= 32 || !isProd ? (JWT_SECRET || 'development-only-insecure-secret-change-me-now') : '',
  adminSessionHours: Number(process.env.ADMIN_SESSION_HOURS) || 8,
  frontendUrl: (process.env.FRONTEND_URL || vercelUrl || 'http://localhost:5173').replace(/\/$/, ''),
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  demoMode: bool(process.env.DEMO_MODE),
  // Outgoing email over SMTP (Nodemailer). Validated in services/email.js.
  smtp: {
    host: (process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT) || 587,
    // Defaults to implicit TLS on 465 and STARTTLS otherwise.
    secure: process.env.SMTP_SECURE ? bool(process.env.SMTP_SECURE) : Number(process.env.SMTP_PORT) === 465,
    user: (process.env.SMTP_USER || '').trim(),
    pass: process.env.SMTP_PASS || '',
    // EMAIL_FROM may be a bare address or "Name <address>"; MAIL_FROM is accepted for older .env files.
    from: (process.env.EMAIL_FROM || process.env.MAIL_FROM || '').trim(),
    fromName: (process.env.EMAIL_FROM_NAME || '').trim(),
    replyTo: (process.env.EMAIL_REPLY_TO || '').trim(),
    adminTo: (process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL || '').trim(),
  },
  // Outbox pacing, kept under the SMTP provider's limits. The defaults suit
  // Hostinger (about 3 a minute for apclagos.org, 23 Oct 2026); raise them with
  // EMAIL_MAX_PER_MINUTE / EMAIL_MAX_PER_HOUR to match a larger plan such as Brevo.
  outbox: {
    maxPerMinute: Number(process.env.EMAIL_MAX_PER_MINUTE) || 3,
    maxPerHour: Number(process.env.EMAIL_MAX_PER_HOUR) || 150,
    // How long all sending pauses after a rate-limit refusal (SMTP 451/421).
    rateLimitPauseSeconds: Number(process.env.EMAIL_RATE_LIMIT_PAUSE_SECONDS) || 60,
    // 'instant' sends one admin alert per registration; 'digest' sends one
    // hourly summary instead; 'off' sends no admin email at all, leaving the
    // whole sending allowance for applicants. Change only with approval.
    adminAlertMode: ['digest', 'off'].includes(process.env.ADMIN_ALERT_MODE) ? process.env.ADMIN_ALERT_MODE : 'instant',
  },
  // Cloudflare Turnstile on registration and status lookup; off unless both keys are set.
  captcha: {
    siteKey: (process.env.TURNSTILE_SITE_KEY || '').trim(),
    secretKey: (process.env.TURNSTILE_SECRET_KEY || '').trim(),
  },
  // One Agent 1 and one Agent 2 per polling unit ('on'), or no limit ('off').
  positionRule: process.env.POSITION_RULE === 'off' ? 'off' : 'on',
  // Encrypts NIN values when that field is switched on (shared/agentForm.js).
  dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY || '',
  contact: {
    email: process.env.PUBLIC_CONTACT_EMAIL || '',
    phone: process.env.PUBLIC_CONTACT_PHONE || '',
    whatsapp: process.env.PUBLIC_WHATSAPP_NUMBER || '',
    address: process.env.PUBLIC_CONTACT_ADDRESS || '',
  },
};

