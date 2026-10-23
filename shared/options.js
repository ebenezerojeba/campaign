// Option lists shared by the registration form, the API validators and the admin filters.
// Values are stable identifiers stored in the database; labels are display text.

// Chosen by the applicant. Never assigned automatically.
export const AGENT_CATEGORIES = [
  { value: 'agent', label: 'Agent' },
  { value: 'canvasser', label: 'Canvasser' },
  { value: 'mobilizer', label: 'Mobilizer' },
  { value: 'pu_agent', label: 'PU Agent' },
];

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

export const PRIVACY_NOTICE_VERSION = '2026-10-agents';

export const labelFor = (list, value) => list.find((o) => o.value === value)?.label ?? value;
export const valuesOf = (list) => list.map((o) => o.value);
