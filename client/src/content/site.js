// Editable site copy. The programme team should review every statement here
// before launch.

import { PRODUCT_NAME, PRODUCT_SHORT } from '../../../shared/brand.js';

export const site = {
  brand: {
    name: 'APC Lagos',
    programme: PRODUCT_SHORT,
    title: PRODUCT_NAME,
    // Path to an approved official logo, e.g. '/brand/apc-lagos-logo.svg' (place the file in client/public/brand/).
    logoUrl: '/brand/apc-logo.jpg',
  },

  // Approved photography for the hero, e.g. [{ src: '/images/agents.jpg', alt: '...' }].
  // Place files in client/public/images/. When empty, the hero shows the Adire cloth wall only.
  heroPhotos: [],

  nav: [
    { label: 'What you need', href: '/#requirements' },
    { label: 'How it works', href: '/#how-it-works' },
    { label: 'Your data', href: '/#your-data' },
    { label: 'FAQ', href: '/#faq' },
  ],

  hero: {
    headline: ['Your polling unit.', 'Your ward.', 'Your Lagos.'],
    body: 'Register for the role you have been asked to serve in: Agent 1 or Agent 2 at a polling unit, Ward Collation Officer for a ward (each ward has two), or LGA Collation Officer for an LGA. It takes about ten minutes on a phone.',
    primary: 'Start registration',
    secondary: 'See what you need',
  },

  requirements: [
    { icon: 'Mail', title: 'Email and phone number', body: 'Your confirmation and decision are sent by email, so use an address you can open.' },
    { icon: 'CalendarDays', title: 'ID and bank details', body: 'Your date of birth, NIN, VIN, APC party registration number and the bank account for any allowance.' },
    { icon: 'MapPin', title: 'Your location', body: 'From the official INEC list for Lagos State: agents choose an LGA, ward and polling unit; Ward Collation Officers an LGA and ward; LGA Collation Officers an LGA.' },
    { icon: 'Camera', title: 'A passport photograph', body: 'A clear, recent head-and-shoulders photo on a plain background. JPG, PNG or WebP.' },
    { icon: 'IdCard', title: 'Your voter’s card (PVC)', body: 'A sharp photo of the front of your PVC with every detail readable, or a PDF scan.' },
  ],

  steps: [
    { title: 'Fill in your details', body: 'Your name, contact details, role, location, identification numbers and bank details.' },
    { title: 'Upload your documents', body: 'Add your passport photograph and a photo or scan of your voter’s card.' },
    { title: 'Get your reference', body: 'You receive a registration reference on screen and by email. The coordination team reviews every registration and emails you the decision.' },
  ],

  faq: [
    { q: 'Who can register?', a: 'Anyone with a valid voter’s card who has been asked to serve in Lagos State as Agent 1 or Agent 2 at a polling unit, as a Ward Collation Officer or as an LGA Collation Officer.' },
    { q: 'Which role should I choose?', a: 'The role you have been asked to serve in. Agent 1 and Agent 2 serve at one polling unit; Ward Collation Officers cover one ward (two per ward); an LGA Collation Officer covers one LGA. If you are not sure, ask the coordination team before you register.' },
    { q: 'Why does the form say a position is already filled?', a: 'Each polling unit has one Agent 1 and one Agent 2 position, each ward two Ward Collation Officer positions, and each LGA one LGA Collation Officer position. A position is filled while a registration for it is pending review or approved. If you were asked to serve in a position that shows as filled, contact the coordination team.' },
    { q: 'Why do you need my NIN, VIN and bank details?', a: 'Your NIN, VIN and APC party registration number confirm your identity, voter registration and party membership. Your bank details are used only to pay any allowance due to you. They are encrypted, and only authorised administrators can see them. The form checks their format; it does not verify them with NIMC, INEC, APC or your bank.' },
    { q: 'Why do you need my voter’s card?', a: 'To confirm that you are a registered voter and to check it against the location you chose. Only authorised staff can see it.' },
    { q: 'Does the upload check prove my card is genuine?', a: 'No. The system checks that each file is a real, complete image or PDF of a sensible size, and rejects files that are not. Staff then check the card itself. A file passing the upload checks does not mean the card has been verified.' },
    { q: 'What if my photo is rejected?', a: 'The form tells you why: for example, the file is not a photo, is too small, or is not a portrait. Take a new photo in good light with the whole card or your face in frame, and try again.' },
    { q: 'How do I check my registration?', a: 'Use the status page with the reference you received and the phone number you registered with.' },
    { q: 'How do I correct or delete my registration?', a: 'Contact the coordination team with your reference. They will verify that the request comes from you before making any change.' },
  ],
};

export const privacyNotice = {
  version: '2026-10-v6',
  summary: [
    'We use your details, passport photograph and voter’s card to register and verify you in the role you chose (Agent 1, Agent 2, Ward Collation Officer or LGA Collation Officer) and to contact you about it.',
    'Your NIN, VIN and APC party registration number confirm your identity, voter registration and party membership. Your bank details are used only to pay any allowance due to you. All of them are encrypted, and only authorised administrators can see them in full.',
    'The form checks the format of these numbers. It does not verify them with NIMC, INEC, APC or your bank.',
    'Your documents are kept in private storage, never at a public link. Only authorised staff can open them, and every view is logged.',
    'Upload checks confirm each file is a genuine image or PDF. They do not prove your voter’s card is authentic: staff check that separately.',
    'We keep your registration for the election period it was collected for and up to 12 months after, then delete it and your documents.',
    'You can ask to see, correct or delete your information, or withdraw consent, at any time.',
  ],
};
