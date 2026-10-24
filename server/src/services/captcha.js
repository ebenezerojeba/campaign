// Cloudflare Turnstile check, used only when TURNSTILE_SECRET_KEY and
// TURNSTILE_SITE_KEY are set. Turnstile being unreachable never blocks a
// registration on its own: the request is allowed and the outage is logged
// (the shared rate limits still apply).
import { env } from '../config/env.js';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const captchaEnabled = () => Boolean(env.captcha.secretKey && env.captcha.siteKey);

export async function verifyCaptcha(token, ip, fetchImpl = fetch) {
  if (!captchaEnabled()) return { ok: true, skipped: true };
  if (!token || typeof token !== 'string' || token.length > 2048) return { ok: false };
  try {
    const body = new URLSearchParams({ secret: env.captcha.secretKey, response: token, ...(ip ? { remoteip: ip } : {}) });
    const res = await fetchImpl(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return { ok: Boolean(data.success) };
  } catch (err) {
    console.error('[captcha] verification unavailable, request allowed', err?.name);
    return { ok: true, unavailable: true };
  }
}
