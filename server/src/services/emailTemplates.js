import { env } from '../config/env.js';
import { labelFor, INTERESTS } from '../../../shared/options.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const C = { forest: '#0E2A1C', green: '#12813C', gold: '#C9A227', mist: '#EEF4EF', ink: '#17201B', grey: '#5B665F', line: '#DCE4DE' };

// Table-based layout with inline styles for broad email-client support.
function layout({ preheader, heading, bodyHtml, cta }) {
  const button = cta
    ? `<tr><td style="padding:8px 0 4px"><a href="${esc(cta.href)}" style="display:inline-block;background:${C.green};color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;font-size:15px">${esc(cta.label)}</a></td></tr>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;background:${C.mist};font-family:Segoe UI,Helvetica,Arial,sans-serif;color:${C.ink}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.mist};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid ${C.line}">
<tr><td style="background:${C.forest};padding:22px 28px;border-bottom:4px solid ${C.gold}">
<div style="color:#fff;font-size:18px;font-weight:800;letter-spacing:-0.2px">APC Lagos</div>
<div style="color:#BFD6C6;font-size:13px;margin-top:2px">Volunteer Programme</div></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:${C.forest}">${esc(heading)}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bodyHtml}${button}</table>
</td></tr>
<tr><td style="padding:18px 28px;background:#F7FAF8;border-top:1px solid ${C.line};font-size:12px;line-height:1.6;color:${C.grey}">
You are receiving this message because this email address was used to register with the APC Lagos Volunteer Programme. If that was not you, reply to this email and we will remove it.
</td></tr></table></td></tr></table></body></html>`;
}

const p = (html) => `<tr><td style="padding:0 0 14px;font-size:15px;line-height:1.6">${html}</td></tr>`;
const refBlock = (reference) =>
  `<tr><td style="padding:4px 0 18px"><div style="background:${C.mist};border:1px solid ${C.line};border-radius:12px;padding:14px 16px">
<div style="font-size:12px;color:${C.grey}">Your registration reference</div>
<div style="font-size:24px;font-weight:800;letter-spacing:1px;color:${C.forest};font-family:Consolas,Menlo,monospace">${esc(reference)}</div></div></td></tr>`;

export function registrationConfirmation(v) {
  const statusUrl = `${env.frontendUrl}/status`;
  return {
    subject: `Registration received: ${v.reference}`,
    html: layout({
      preheader: `Thank you for registering, ${v.firstName}. Keep your reference ${v.reference}.`,
      heading: `Thank you for registering, ${v.firstName}`,
      bodyHtml:
        p('We have received your application to join the APC Lagos Volunteer Programme.') +
        refBlock(v.reference) +
        p('<strong>What happens next</strong><br>The programme team reviews every application. When a decision is made, we will contact you by your preferred method. You can check your status at any time with your reference and phone number.'),
      cta: { href: statusUrl, label: 'Check application status' },
    }),
    text: `Thank you for registering, ${v.firstName}.

We have received your application to join the APC Lagos Volunteer Programme.

Your registration reference: ${v.reference}

What happens next: the programme team reviews every application. When a decision is made, we will contact you by your preferred method.

Check your status: ${statusUrl}`,
  };
}

export function decision(v) {
  const approved = v.status === 'approved';
  const portalUrl = `${env.frontendUrl}/portal`;
  const heading = approved ? `Welcome to the programme, ${v.firstName}` : `An update on your application, ${v.firstName}`;
  const body = approved
    ? p('Your volunteer application has been approved. The programme team will share activities that match your interests and availability.') +
      p('Sign in to your volunteer account to see announcements, browse opportunities and update your preferences.')
    : p('Thank you for your interest in the APC Lagos Volunteer Programme. After review, we are not able to approve your application at this time.') +
      p('If you believe some of your details were incorrect, reply to this email and the team will look into it.');
  return {
    subject: approved ? `Application approved: ${v.reference}` : `Application update: ${v.reference}`,
    html: layout({ preheader: heading, heading, bodyHtml: refBlock(v.reference) + body, cta: approved ? { href: portalUrl, label: 'Open your volunteer account' } : null }),
    text: `${heading}

Reference: ${v.reference}

${approved
    ? `Your volunteer application has been approved. Sign in to your volunteer account: ${portalUrl}`
    : 'After review, we are not able to approve your application at this time. If you believe some of your details were incorrect, reply to this email.'}`,
  };
}

export function adminAlert(v) {
  const url = `${env.frontendUrl}/admin/volunteers/${v._id}`;
  const interests = (v.interests || []).map((i) => labelFor(INTERESTS, i)).join(', ');
  return {
    subject: `New volunteer registration: ${v.reference} (${v.lga})`,
    html: layout({
      preheader: `New registration from ${v.lga} LGA`,
      heading: 'New volunteer registration',
      bodyHtml:
        refBlock(v.reference) +
        p(`<strong>LGA:</strong> ${esc(v.lga)}<br><strong>Interests:</strong> ${esc(interests)}`) +
        p('Personal details are only shown in the admin dashboard.'),
      cta: { href: url, label: 'Review application' },
    }),
    text: `New volunteer registration ${v.reference}
LGA: ${v.lga}
Interests: ${interests}

Review: ${url}`,
  };
}

export function signInCode(v, code) {
  return {
    subject: `Your sign-in code: ${code}`,
    html: layout({
      preheader: `Your APC Lagos volunteer sign-in code is ${code}`,
      heading: 'Your sign-in code',
      bodyHtml:
        p(`Hello ${esc(v.firstName)}, use this code to sign in to your volunteer account. It expires in 10 minutes.`) +
        `<tr><td style="padding:4px 0 18px"><div style="font-size:34px;font-weight:800;letter-spacing:8px;color:${C.forest};font-family:Consolas,Menlo,monospace">${esc(code)}</div></td></tr>` +
        p('If you did not request this code, you can ignore this email.'),
    }),
    text: `Hello ${v.firstName}, your APC Lagos volunteer sign-in code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`,
  };
}
