import { env } from '../config/env.js';
import { labelFor, AGENT_CATEGORIES } from '../../../shared/options.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const C = { forest: '#0E2A1C', green: '#12813C', gold: '#C9A227', mist: '#EEF4EF', ink: '#17201B', grey: '#5B665F', line: '#DCE4DE' };

// Table-based layout with inline styles for broad email-client support.
function layout({ preheader, heading, bodyHtml, cta, footer }) {
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
<div style="color:#BFD6C6;font-size:13px;margin-top:2px">Polling Unit Agent Registration</div></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:${C.forest}">${esc(heading)}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bodyHtml}${button}</table>
</td></tr>
<tr><td style="padding:18px 28px;background:#F7FAF8;border-top:1px solid ${C.line};font-size:12px;line-height:1.6;color:${C.grey}">
${footer ?? 'You are receiving this message because this email address was used to register as an APC Lagos polling unit agent. If that was not you, reply to this email and we will look into it.'}
</td></tr></table></td></tr></table></body></html>`;
}

const p = (html) => `<tr><td style="padding:0 0 14px;font-size:15px;line-height:1.6">${html}</td></tr>`;
const refBlock = (reference) =>
  `<tr><td style="padding:4px 0 18px"><div style="background:${C.mist};border:1px solid ${C.line};border-radius:12px;padding:14px 16px">
<div style="font-size:12px;color:${C.grey}">Your registration reference</div>
<div style="font-size:24px;font-weight:800;letter-spacing:1px;color:${C.forest};font-family:Consolas,Menlo,monospace">${esc(reference)}</div></div></td></tr>`;

const category = (a) => labelFor(AGENT_CATEGORIES, a.agentCategory);
const unit = (a) => (a.pollingUnit ? `${a.pollingUnit} (${a.pollingUnitCode})` : 'Not recorded');

export function registrationConfirmation(a) {
  const statusUrl = `${env.frontendUrl}/status`;
  return {
    subject: `Registration received: ${a.reference}`,
    html: layout({
      preheader: `Thank you for registering, ${a.firstName}. Keep your reference ${a.reference}.`,
      heading: `Thank you for registering, ${a.firstName}`,
      bodyHtml:
        p(`We have received your registration as <strong>${esc(category(a))}</strong> for polling unit <strong>${esc(unit(a))}</strong>, ${esc(a.ward ?? '')} ward, ${esc(a.lga)} LGA.`) +
        refBlock(a.reference) +
        p('<strong>What happens next</strong><br>The team checks your details, passport photograph and voter’s card. We will email you when a decision is made. You can check your status at any time with your reference and phone number.') +
        p('We will never ask you to send your voter’s card, NIN or passwords by email or WhatsApp.'),
      cta: { href: statusUrl, label: 'Check registration status' },
    }),
    text: `Thank you for registering, ${a.firstName}.

We have received your registration as ${category(a)} for polling unit ${unit(a)}, ${a.ward ?? ''} ward, ${a.lga} LGA.

Your registration reference: ${a.reference}

What happens next: the team checks your details, passport photograph and voter's card. We will email you when a decision is made.

Check your status: ${statusUrl}

We will never ask you to send your voter's card, NIN or passwords by email or WhatsApp.`,
  };
}

export function decision(a) {
  const approved = a.status === 'approved';
  const heading = approved ? `Your registration is approved, ${a.firstName}` : `An update on your registration, ${a.firstName}`;
  const body = approved
    ? p(`Your registration as <strong>${esc(category(a))}</strong> for polling unit <strong>${esc(unit(a))}</strong> has been approved.`) +
      p('The coordination team will contact you with your next steps.')
    : p('Thank you for registering. After review, we are not able to approve your registration at this time.') +
      p('If you believe some of your details or documents were incorrect, reply to this email and the team will look into it.');
  return {
    subject: approved ? `Registration approved: ${a.reference}` : `Registration update: ${a.reference}`,
    html: layout({ preheader: heading, heading, bodyHtml: refBlock(a.reference) + body }),
    text: `${heading}

Reference: ${a.reference}

${approved
    ? `Your registration as ${category(a)} for polling unit ${unit(a)} has been approved. The coordination team will contact you with your next steps.`
    : 'After review, we are not able to approve your registration at this time. If you believe some of your details or documents were incorrect, reply to this email.'}`,
  };
}

// Staff notification. Identifies the registration and its polling unit only:
// contact details and documents stay in the access-controlled dashboard.
export function adminAlert(a) {
  const url = `${env.frontendUrl}/admin/agents/${a._id}`;
  const rows = [
    ['Category', category(a)],
    ['LGA', a.lga],
    ['Ward', a.ward ? `${a.ward} (${a.wardCode})` : 'Not recorded'],
    ['Polling unit', unit(a)],
    ['Senatorial district', a.senatorialDistrict ?? 'Not recorded'],
  ];
  return {
    subject: `New agent registration: ${a.reference} (${a.lga})`,
    html: layout({
      preheader: `New ${category(a)} registration from ${a.lga} LGA`,
      heading: 'New polling unit agent registration',
      bodyHtml:
        refBlock(a.reference) +
        p(rows.map(([k, v]) => `<strong>${esc(k)}:</strong> ${esc(v)}`).join('<br>')) +
        p('Personal details, the passport photograph and the voter’s card are shown only in the admin dashboard.'),
      cta: { href: url, label: 'Review registration' },
      footer: 'You receive this because your address is set as the registration notification address for APC Lagos Polling Unit Agent Registration.',
    }),
    text: `New polling unit agent registration ${a.reference}
${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}

Review: ${url}`,
  };
}
