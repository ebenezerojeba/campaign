// Option lists shared by the registration form, the API validators and the admin filters.
// Values are stable identifiers stored in the database; labels are display text.

// Chosen by the applicant. Never assigned automatically.
export const AGENT_CATEGORIES = [
  { value: 'agent_1', label: 'Agent 1' },
  { value: 'agent_2', label: 'Agent 2' },
  { value: 'canvasser', label: 'Canvasser' },
  { value: 'mobilizer', label: 'Mobilizer' },
  { value: 'pu_agent', label: 'PU Agent' },
  // Kept for existing registrations and admin filters; no longer offered to applicants.
  { value: 'agent', label: 'Agent' },
];

export const REGISTRATION_CATEGORIES = AGENT_CATEGORIES.filter(({ value }) => value !== 'agent');

export const NIGERIAN_BANKS = [
  'Access Bank',
  'Citibank Nigeria',
  'Ecobank Nigeria',
  'Fidelity Bank',
  'First Bank of Nigeria',
  'First City Monument Bank',
  'Globus Bank',
  'Guaranty Trust Bank',
  'Keystone Bank',
  'Kuda Microfinance Bank',
  'Lotus Bank',
  'Moniepoint Microfinance Bank',
  'OPay',
  'Optimus Bank',
  'Parallex Bank',
  'PalmPay',
  'Polaris Bank',
  'PremiumTrust Bank',
  'Providus Bank',
  'Stanbic IBTC Bank',
  'Standard Chartered Bank Nigeria',
  'Sterling Bank',
  'SunTrust Bank Nigeria',
  'TAJBank',
  'Titan Trust Bank',
  'Union Bank of Nigeria',
  'United Bank for Africa',
  'Unity Bank',
  'Wema Bank',
  'Zenith Bank',
].map((name) => ({ value: name, label: name }));

export const REGISTRATION_STATUSES = [
  { value: 'pending', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Not approved' },
];

export const DOCUMENT_KINDS = [
  { value: 'passport', label: 'Passport photograph' },
  { value: 'pvc', label: "Voter's card (PVC)" },
  { value: 'selfie', label: 'Selfie' },
];

export const PRIVACY_NOTICE_VERSION = '2026-10-agents-v3';

export const labelFor = (list, value) => list.find((o) => o.value === value)?.label ?? value;
export const valuesOf = (list) => list.map((o) => o.value);
