// Which optional, sensitive fields the registration form collects, and the
// rules for uploaded files. Shared by the browser and the API so both enforce
// the same thing.
//
// Date of birth, NIN, VIN, APC party registration number and bank details
// are always required (approved by APC Lagos, October 2026) and need
// DATA_ENCRYPTION_KEY on the server. Turn an optional field on only after the
// data protection lead confirms it is necessary, and update the privacy notice.
export const OPTIONAL_FIELDS = {
  selfie: false,
};

const MB = 1024 * 1024;

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Size limits leave room for all files in one request under Vercel's 4.5 MB
// body limit. The browser shrinks photos before upload, so real photos are
// far below these limits.
export const DOCUMENT_RULES = {
  passport: {
    label: 'Passport photograph',
    types: IMAGE_TYPES,
    maxBytes: 1.5 * MB,
    minWidth: 300,
    minHeight: 300,
    // Portrait or square, like a passport photo.
    minAspect: 0.6,
    maxAspect: 1.05,
    resizeTo: 900,
  },
  pvc: {
    label: "Voter's card (PVC)",
    types: [...IMAGE_TYPES, 'application/pdf'],
    maxBytes: 2.5 * MB,
    minWidth: 500,
    minHeight: 300,
    resizeTo: 1600,
  },
  selfie: {
    label: 'Selfie',
    types: IMAGE_TYPES,
    maxBytes: 1.5 * MB,
    minWidth: 300,
    minHeight: 300,
    resizeTo: 1000,
  },
};

export const requiredDocuments = () => ['passport', 'pvc', ...(OPTIONAL_FIELDS.selfie ? ['selfie'] : [])];

export const formatBytes = (n) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
