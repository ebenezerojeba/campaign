// Transactional email templates for APC Lagos.
//
// Every message is built from the same small set of components so all email
// shares one design: a white header with the APC logo, a title, the body,
// and a footer that identifies the official sender. Layout uses tables and
// inline styles for broad email-client support, at most 600px wide and
// fluid below that. Each template returns { subject, html, text }.
//
// Only values passed through esc() reach the HTML. Messages never contain
// NIN, VIN, party registration numbers, bank details or documents.
import { env } from '../config/env.js';
import { labelFor, AGENT_CATEGORIES } from '../../../shared/options.js';

export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ORG = 'APC Lagos';
const SERVICE = 'Polling Unit Agent Registration';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = {
  page: '#F3F5F4',
  card: '#FFFFFF',
  green: '#12813C',
  forest: '#0E2A1C',
  ink: '#1F2A24',
  body: '#3B4740',
  muted: '#6B7570',
  line: '#E2E7E4',
  panel: '#F6F8F7',
};

const site = () => env.frontendUrl;
const siteHost = () => site().replace(/^https?:\/\//, '');
const senderAddress = () => {
  const m = env.smtp.from.match(/<([^>]+)>/);
  return (m ? m[1] : env.smtp.from).trim() || env.smtp.user;
};

// ---------- Components (HTML) ----------

const header = () => `
<tr><td style="border-top:4px solid ${C.green};padding:24px 32px 20px;background:${C.card}">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding-right:14px;vertical-align:middle"><img src="${esc(site())}/brand/apc-logo.jpg" width="48" height="43" alt="APC" style="display:block;border:0;border-radius:4px"></td>
    <td style="vertical-align:middle;font-family:${FONT}">
      <div style="font-size:17px;line-height:22px;font-weight:700;color:${C.forest}">${ORG}</div>
      <div style="font-size:13px;line-height:18px;color:${C.muted}">${SERVICE}</div>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:0 32px"><div style="height:1px;line-height:1px;background:${C.line}">&nbsp;</div></td></tr>`;

const title = (text) => `<tr><td style="padding:28px 32px 4px;font-family:${FONT};font-size:20px;line-height:28px;font-weight:700;color:${C.forest}">${esc(text)}</td></tr>`;

const paragraph = (html) => `<tr><td style="padding:12px 32px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${C.body}">${html}</td></tr>`;

const greeting = (name) => paragraph(`Dear ${esc(name)},`);

const reference = (ref) => `
<tr><td style="padding:20px 32px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.panel};border:1px solid ${C.line};border-radius:6px">
    <tr><td style="padding:14px 18px;font-family:${FONT}">
      <div style="font-size:12px;line-height:18px;color:${C.muted}">Registration reference</div>
      <div style="font-size:20px;line-height:28px;font-weight:700;letter-spacing:1px;color:${C.forest};font-family:Consolas,'Courier New',monospace">${esc(ref)}</div>
    </td></tr>
  </table>
</td></tr>`;

// Non-breaking hyphens keep codes such as 24-20-02-002 on one line.
const keepCodesTogether = (html) => html.replace(/(\d)-(?=\d)/g, '$1&#8209;');

const details = (rows) => {
  const body = rows.filter(([, v]) => v).map(([label, value], i) => `
    <tr>
      <td style="padding:10px 0;${i ? `border-top:1px solid ${C.line};` : ''}width:38%;vertical-align:top;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted}">${esc(label)}</td>
      <td style="padding:10px 0;${i ? `border-top:1px solid ${C.line};` : ''}vertical-align:top;font-family:${FONT};font-size:14px;line-height:20px;color:${C.ink}">${keepCodesTogether(esc(value))}</td>
    </tr>`).join('');
  return `<tr><td style="padding:20px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table></td></tr>`;
};

const subheading = (text) => `<tr><td style="padding:24px 32px 0;font-family:${FONT};font-size:15px;line-height:22px;font-weight:700;color:${C.forest}">${esc(text)}</td></tr>`;

const button = ({ href, label }) => `
<tr><td style="padding:24px 32px 0">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background:${C.green};border-radius:6px">
      <a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:6px">${esc(label)}</a>
    </td>
  </tr></table>
</td></tr>`;

const note = (html) => `<tr><td style="padding:20px 32px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted}">${html}</td></tr>`;

const footer = (reason) => `
<tr><td style="padding:32px 32px 0"><div style="height:1px;line-height:1px;background:${C.line}">&nbsp;</div></td></tr>
<tr><td style="padding:16px 32px 28px;font-family:${FONT};font-size:12px;line-height:19px;color:${C.muted}">
  <div style="font-weight:600;color:${C.body}">${ORG}</div>
  <div>${SERVICE}</div>
  <div><a href="mailto:${esc(senderAddress())}" style="color:${C.muted};text-decoration:underline">${esc(senderAddress())}</a> &nbsp;|&nbsp; <a href="${esc(site())}" style="color:${C.muted};text-decoration:underline">${esc(siteHost())}</a></div>
  <div style="padding-top:10px">${esc(reason)}</div>
</td></tr>`;

function shell({ preheader, rows, reason }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${ORG}</title>
<style>
  @media only screen and (max-width:620px) {
    .wrap { padding:0 !important; }
    .card { border-radius:0 !important; border-left:0 !important; border-right:0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}">
  <tr><td class="wrap" align="center" style="padding:24px 12px">
    <table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${C.card};border:1px solid ${C.line};border-radius:8px;overflow:hidden">
      ${header()}
      ${rows.join('')}
      ${footer(reason)}
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ---------- Components (plain text) ----------

const textFooter = (reason) => `--
${ORG}
${SERVICE}
${senderAddress()} | ${siteHost()}

${reason}`;
const textDetails = (rows) => rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');

// ---------- Shared values ----------

const agentType = (a) => labelFor(AGENT_CATEGORIES, a.agentCategory);
const pollingUnit = (a) => (a.pollingUnit ? `${a.pollingUnit} (${a.pollingUnitCode})` : 'Not recorded');
const ward = (a) => (a.ward ? `${a.ward}${a.wardCode ? ` (${a.wardCode})` : ''}` : 'Not recorded');
const titleCase = (s = '') => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const applicantReason = 'You are receiving this email because this address was used to register as an APC Lagos polling unit agent. If you did not register, reply to this email.';

// ---------- Templates ----------

export function registrationConfirmation(a) {
  const statusUrl = `${site()}/status`;
  const rows = [
    ['Agent type', agentType(a)],
    ['Polling unit', pollingUnit(a)],
    ['Ward', ward(a)],
    ['LGA', a.lga ? `${a.lga}, Lagos State` : ''],
  ];
  return {
    subject: `${ORG}: Registration Confirmation (${a.reference})`,
    html: shell({
      preheader: `Your registration reference is ${a.reference}.`,
      reason: applicantReason,
      rows: [
        title('Registration received'),
        greeting(a.firstName),
        paragraph('We have received your registration as a polling unit agent. Your details are below.'),
        reference(a.reference),
        details(rows),
        subheading('What happens next'),
        paragraph('The registration team will review your details, passport photograph and voter’s card. We will email you when a decision has been made. You can check your status at any time using your reference and the phone number you registered with.'),
        button({ href: statusUrl, label: 'Check registration status' }),
        note('APC Lagos will never ask you to send your voter’s card, NIN, bank details or passwords by email or WhatsApp.'),
      ],
    }),
    text: `Registration received

Dear ${a.firstName},

We have received your registration as a polling unit agent.

Registration reference: ${a.reference}
${textDetails(rows)}

What happens next
The registration team will review your details, passport photograph and voter's card. We will email you when a decision has been made. You can check your status at any time using your reference and the phone number you registered with:
${statusUrl}

APC Lagos will never ask you to send your voter's card, NIN, bank details or passwords by email or WhatsApp.

${textFooter(applicantReason)}`,
  };
}

export function decision(a) {
  const approved = a.status === 'approved';
  const heading = approved ? 'Registration approved' : 'Registration not approved';
  const rows = [['Agent type', agentType(a)], ['Polling unit', pollingUnit(a)]];
  const bodyHtml = approved
    ? [paragraph('Your registration as a polling unit agent has been approved.'), reference(a.reference), details(rows), paragraph('The coordination team will contact you with your next steps.')]
    : [paragraph('Thank you for registering. After review, we are unable to approve your registration at this time.'), reference(a.reference), paragraph('If you believe any of your details or documents were incorrect, reply to this email and the team will look into it.')];
  const bodyText = approved
    ? `Your registration as a polling unit agent has been approved.

Registration reference: ${a.reference}
${textDetails(rows)}

The coordination team will contact you with your next steps.`
    : `Thank you for registering. After review, we are unable to approve your registration at this time.

Registration reference: ${a.reference}

If you believe any of your details or documents were incorrect, reply to this email and the team will look into it.`;
  return {
    subject: `${ORG}: ${approved ? 'Registration Approved' : 'Registration Update'} (${a.reference})`,
    html: shell({
      preheader: approved ? `Your registration ${a.reference} has been approved.` : `An update on your registration ${a.reference}.`,
      reason: applicantReason,
      rows: [title(heading), greeting(a.firstName), ...bodyHtml],
    }),
    text: `${heading}

Dear ${a.firstName},

${bodyText}

${textFooter(applicantReason)}`,
  };
}

// Staff notification. Identifies the registration and its polling unit only:
// contact, identity and bank details stay in the access-controlled dashboard.
export function adminAlert(a) {
  const url = `${site()}/admin/agents/${a._id}`;
  const rows = [
    ['Reference', a.reference],
    ['Agent type', agentType(a)],
    ['LGA', a.lga],
    ['Ward', ward(a)],
    ['Polling unit', pollingUnit(a)],
    ['Senatorial district', a.senatorialDistrict ? titleCase(a.senatorialDistrict) : ''],
  ];
  const reason = 'You are receiving this email because this address is set to receive new-registration notifications for APC Lagos Polling Unit Agent Registration.';
  return {
    subject: `${ORG}: New Agent Registration (${a.reference})`,
    html: shell({
      preheader: `New ${agentType(a)} registration for ${a.lga} LGA.`,
      reason,
      rows: [
        title('New agent registration'),
        paragraph('A new polling unit agent registration has been submitted and is awaiting review.'),
        details(rows),
        button({ href: url, label: 'Review registration' }),
        note('Contact details, identification, bank details and documents are available only in the administration dashboard after signing in.'),
      ],
    }),
    text: `New agent registration

A new polling unit agent registration has been submitted and is awaiting review.

${textDetails(rows)}

Review registration: ${url}

Contact details, identification, bank details and documents are available only in the administration dashboard after signing in.

${textFooter(reason)}`,
  };
}
