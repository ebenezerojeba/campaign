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
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    from: process.env.EMAIL_FROM || 'APC Lagos Agent Registration <onboarding@resend.dev>',
    replyTo: process.env.EMAIL_REPLY_TO || '',
    adminTo: process.env.ADMIN_NOTIFICATION_EMAIL || '',
  },
  // Encrypts NIN values when that field is switched on (shared/agentForm.js).
  dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY || '',
  contact: {
    email: process.env.PUBLIC_CONTACT_EMAIL || '',
    phone: process.env.PUBLIC_CONTACT_PHONE || '',
    whatsapp: process.env.PUBLIC_WHATSAPP_NUMBER || '',
    address: process.env.PUBLIC_CONTACT_ADDRESS || '',
  },
};

export const emailConfigured = () => Boolean(env.resend.apiKey);
