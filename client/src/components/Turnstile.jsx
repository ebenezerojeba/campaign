import { useEffect, useRef } from 'react';
import { useConfig } from '../lib/config.jsx';

// Cloudflare Turnstile security check. Renders nothing until the server
// publishes a site key (TURNSTILE_SITE_KEY), so it can be switched on without
// a new build. Calls onToken with a fresh token, or '' when it expires.
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading;
function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => { loading = undefined; reject(new Error('Turnstile could not load')); };
    document.head.appendChild(s);
  });
  return loading;
}

export const useCaptchaSiteKey = () => useConfig().captchaSiteKey || '';

export function Turnstile({ onToken, resetKey }) {
  const siteKey = useCaptchaSiteKey();
  const box = useRef(null);
  const tokenRef = useRef(onToken);
  tokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !box.current) return undefined;
    let widget;
    let cancelled = false;
    loadScript().then((turnstile) => {
      if (cancelled || !box.current) return;
      widget = turnstile.render(box.current, {
        sitekey: siteKey,
        action: 'registration',
        callback: (token) => tokenRef.current(token),
        'expired-callback': () => tokenRef.current(''),
        'error-callback': () => tokenRef.current(''),
      });
    }).catch(() => tokenRef.current(''));
    return () => {
      cancelled = true;
      if (widget !== undefined) window.turnstile?.remove(widget);
    };
  }, [siteKey, resetKey]);

  if (!siteKey) return null;
  return <div ref={box} className="min-h-[65px]" aria-label="Security check" />;
}
