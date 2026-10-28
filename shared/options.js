// Option lists shared by the registration form, the API validators and the admin filters.
// Values are stable identifiers stored in the database; labels are display text.

// The four roles. Chosen by the applicant; never assigned automatically.
// (Canvasser, Mobilizer and the old unnumbered "Agent" were removed on
// 26 Oct 2026: no registration used them.)
export const AGENT_CATEGORIES = [
  { value: 'agent_1', label: 'Agent 1' },
  { value: 'agent_2', label: 'Agent 2' },
  { value: 'ward_collation_officer', label: 'Ward Collation Officer' },
  { value: 'lga_collation_officer', label: 'LGA Collation Officer' },
];

// The roles offered on the form: all four.
export const REGISTRATION_CATEGORIES = AGENT_CATEGORIES;

// Where each role serves: a polling unit (agents), a ward or a whole LGA.
// Decides which location fields are required and which position is claimed.
export const ROLE_LEVEL = {
  agent_1: 'pollingUnit',
  agent_2: 'pollingUnit',
  ward_collation_officer: 'ward',
  lga_collation_officer: 'lga',
};
export const levelOf = (category) => ROLE_LEVEL[category] ?? 'pollingUnit';
export const OFFICER_CATEGORIES = ['ward_collation_officer', 'lga_collation_officer'];

// Sign-in account roles, for display.
export const ACCOUNT_ROLE_LABELS = { admin: 'Admin', reviewer: 'Reviewer', lga_officer: 'LGA Collation Officer', ward_officer: 'Ward Collation Officer' };
export const accountRoleLabel = (role) => ACCOUNT_ROLE_LABELS[role] ?? role ?? '';
export const isOfficer = (category) => OFFICER_CATEGORIES.includes(category);

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
  { value: 'revoked', label: 'Revoked' },
];

// Statuses that hold a position (an Agent 1 / Agent 2 slot at a polling unit,
// or a ward or LGA collation officer post). Rejected, cancelled and revoked
// registrations release it.
export const POSITION_HOLDING_STATUSES = ['pending', 'approved'];
export const POSITION_CATEGORIES = ['agent_1', 'agent_2', 'ward_collation_officer', 'lga_collation_officer'];

export const DOCUMENT_KINDS = [
  { value: 'passport', label: 'Passport photograph' },
  { value: 'pvc', label: "Voter's card (PVC)" },
  { value: 'selfie', label: 'Selfie' },
];

// Changes whenever the privacy notice wording changes, so each consent record
// shows which version the person agreed to.
export const PRIVACY_NOTICE_VERSION = '2026-10-v6';

export const labelFor = (list, value) => list.find((o) => o.value === value)?.label ?? value;
export const valuesOf = (list) => list.map((o) => o.value);
