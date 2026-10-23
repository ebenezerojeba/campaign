// Editable site copy. The programme team should review every statement here
// before launch.

export const site = {
  brand: {
    name: 'APC Lagos',
    programme: 'Polling Unit Agent Registration',
    title: 'APC Lagos Polling Unit Agent Registration',
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
    body: 'Register as an APC Lagos agent, canvasser, mobilizer or polling unit agent for the polling unit where you will serve. It takes about ten minutes on a phone.',
    primary: 'Start registration',
    secondary: 'See what you need',
  },

  requirements: [
    { icon: 'Mail', title: 'Email and phone number', body: 'Your confirmation and decision are sent by email, so use an address you can open.' },
    { icon: 'CalendarDays', title: 'Date of birth', body: 'You must be at least 18 years old to register.' },
    { icon: 'MapPin', title: 'Your polling unit', body: 'Choose your LGA, ward and polling unit from the official INEC list for Lagos State.' },
    { icon: 'Camera', title: 'A passport photograph', body: 'A clear, recent head-and-shoulders photo on a plain background. JPG, PNG or WebP.' },
    { icon: 'IdCard', title: 'Your voter’s card (PVC)', body: 'A sharp photo of the front of your PVC with every detail readable, or a PDF scan.' },
  ],

  steps: [
    { title: 'Fill in your details', body: 'Your name, contact details, state of origin, agent category and polling unit.' },
    { title: 'Upload your documents', body: 'Add your passport photograph and a photo or scan of your voter’s card.' },
    { title: 'Get your reference', body: 'You receive a registration reference on screen and by email. The team reviews every registration and emails you the decision.' },
  ],

  faq: [
    { q: 'Who can register?', a: 'Anyone aged 18 or over with a valid voter’s card who will serve at a polling unit in Lagos State. You will be asked for your date of birth to confirm your age.' },
    { q: 'Which categories can I register for?', a: 'Agent 1, Agent 2, Canvasser, Mobilizer or PU Agent. Choose the one you have been asked to serve as. The team may confirm or change it when reviewing your registration.' },
    { q: 'Why do you need my voter’s card?', a: 'To confirm that you are a registered voter and to match you to your polling unit. Only authorised staff can see it.' },
    { q: 'Does the upload check prove my card is genuine?', a: 'No. The system checks that each file is a real, complete image or PDF of a sensible size, and rejects files that are not. Staff then check the card itself. A file passing the upload checks does not mean the card has been verified.' },
    { q: 'What if my photo is rejected?', a: 'The form tells you why: for example, the file is not a photo, is too small, or is not a portrait. Take a new photo in good light with the whole card or your face in frame, and try again.' },
    { q: 'How do I check my registration?', a: 'Use the status page with the reference you received and the phone number you registered with.' },
    { q: 'How do I correct or delete my registration?', a: 'Contact the registration team with your reference. They will verify that the request comes from you before making any change.' },
  ],
};

export const privacyNotice = {
  version: '2026-10-agents-v2',
  summary: [
    'We collect your date of birth to confirm you meet the age requirement, and use your details, passport photograph and voter’s card to register and verify you as a polling unit agent and contact you about it.',
    'Your documents are stored securely. Only authorised registration staff can open them, and every view is logged.',
    'Upload checks confirm each file is a genuine image or PDF. They do not prove your voter’s card is authentic: staff check that separately.',
    'We keep your registration for the election period it was collected for and up to 12 months after, then delete it and your documents.',
    'You can ask to see, correct or delete your information, or withdraw consent, at any time.',
  ],
};
