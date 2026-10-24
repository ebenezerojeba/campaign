// Option lists shared by the registration form, the API validators and the admin filters.
// Values are stable identifiers stored in the database; labels are display text.

// Chosen by the applicant. Never assigned automatically.
export const AGENT_CATEGORIES = [
  { value: 'agent_1', label: 'Agent 1' },
  { value: 'agent_2', label: 'Agent 2' },
  { value: 'canvasser', label: 'Canvasser' },
  { value: 'mobilizer', label: 'Mobilizer' },
  // { value: 'pu_agent', label: 'PU Agent' },
  // Kept for existing registrations and admin filters; no longer offered to applicants.
  { value: 'agent', label: 'Agent' },
];

// The only agent types offered on the form. Older values above stay valid
// for registrations made before the change.
export const REGISTRATION_CATEGORIES = AGENT_CATEGORIES.filter(({ value }) => ['agent_1', 'agent_2'].includes(value));

// Commercial, non-interest and widely used microfinance banks licensed in
// Nigeria. Review against the CBN list periodically.
export const NIGERIAN_BANKS = [
  'Access Bank',
  'Citibank Nigeria',
  'Ecobank Nigeria',
  'FairMoney Microfinance Bank',
  'Fidelity Bank',
  'First Bank of Nigeria',
  'First City Monument Bank',
  'Globus Bank',
  'Guaranty Trust Bank',
  'Jaiz Bank',
  'Keystone Bank',
  'Kuda Microfinance Bank',
  'Lotus Bank',
  'Moniepoint Microfinance Bank',
  'OPay',
  'Optimus Bank',
  'PalmPay',
  'Parallex Bank',
  'Polaris Bank',
  'PremiumTrust Bank',
  'Providus Bank',
  'Signature Bank',
  'Stanbic IBTC Bank',
  'Standard Chartered Bank Nigeria',
  'Sterling Bank',
  'SunTrust Bank Nigeria',
  'TAJBank',
  'The Alternative Bank',
  'Titan Trust Bank',
  'Union Bank of Nigeria',
  'United Bank for Africa',
  'Unity Bank',
  'VFD Microfinance Bank',
  'Wema Bank',
  'Zenith Bank',
].map((name) => ({ value: name, label: name }));

export const REGISTRATION_STATUSES = [
  { value: 'pending', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Not approved' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Statuses that hold a polling-unit position (Agent 1 or Agent 2). Rejected
// and cancelled registrations release it.
export const POSITION_HOLDING_STATUSES = ['pending', 'approved'];
export const POSITION_CATEGORIES = ['agent_1', 'agent_2'];

export const DOCUMENT_KINDS = [
  { value: 'passport', label: 'Passport photograph' },
  { value: 'pvc', label: "Voter's card (PVC)" },
  { value: 'selfie', label: 'Selfie' },
];

export const PRIVACY_NOTICE_VERSION = '2026-10-agents-v4';

export const labelFor = (list, value) => list.find((o) => o.value === value)?.label ?? value;
export const valuesOf = (list) => list.map((o) => o.value);
