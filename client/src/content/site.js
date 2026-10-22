// Editable site copy. The programme team should review every statement here
// before launch: describe only activities the organisation has approved.

export const site = {
  brand: {
    name: 'APC Lagos',
    programme: 'Volunteer Programme',
    // Path to an approved official logo, e.g. '/brand/apc-lagos-logo.svg' (place the file in client/public/brand/).
    logoUrl: '',
  },

  // Approved photography for the hero, e.g. [{ src: '/images/outreach.jpg', alt: 'Volunteers ...' }].
  // Place files in client/public/images/. When empty, the hero shows the Adire cloth wall only.
  heroPhotos: [],

  nav: [
    { label: 'About', href: '/#about' },
    { label: 'Opportunities', href: '/#opportunities' },
    { label: 'How it works', href: '/#how-it-works' },
    { label: 'FAQ', href: '/#faq' },
    { label: 'Contact', href: '/#contact' },
  ],

  hero: {
    headline: ['Your Community.', 'Your Voice.', 'Your Impact.'],
    body: 'Join a network of volunteers contributing their time, skills, and ideas to community engagement and civic participation across Lagos State.',
    primary: 'Become a Volunteer',
    secondary: 'Learn About the Programme',
  },

  about: {
    title: 'A programme built around the people of Lagos',
    body: 'The APC Lagos Volunteer Programme brings together residents who want to take part in community life across the state’s 20 local government areas. Volunteers choose the kind of work that suits them, from speaking with neighbours to helping behind the scenes, and the programme team matches them with activities near them or online.',
    areas: [
      { icon: 'Users', title: 'Community engagement', body: 'Meet residents, listen to local priorities and help organise neighbourhood conversations in your area.' },
      { icon: 'Sprout', title: 'Volunteer development', body: 'Orientation sessions and guidance so every volunteer knows how activities run and how to take part safely.' },
      { icon: 'CalendarCheck', title: 'Event support', body: 'Welcome attendees, guide seating, support accessibility and keep events running on time.' },
      { icon: 'BookOpenText', title: 'Civic education', body: 'Share clear, plain-language information about civic participation with your community.' },
    ],
  },

  steps: [
    { title: 'Complete your application', body: 'Tell us who you are, where you live in Lagos and how you would like to help. It takes about five minutes on a phone.' },
    { title: 'Receive your confirmation', body: 'You get a registration reference straight away. If you gave an email address, we send it there too.' },
    { title: 'Follow the next steps', body: 'The programme team reviews your application and contacts you by your preferred method with what happens next.' },
  ],

  faq: [
    { q: 'Who can register?', a: 'Anyone aged 18 or over who lives in Lagos State and wants to contribute time to community activities. You do not need previous experience.' },
    { q: 'What information do you ask for?', a: 'Your name, phone number, preferred contact method, your local government area, and the kind of activities you are interested in. Email is optional. We do not ask for your voter card, bank details, identity documents or your exact address.' },
    { q: 'How are applications reviewed?', a: 'Members of the programme team read each application and approve volunteers for activities that match their interests and availability. You can check your status any time with your registration reference and phone number.' },
    { q: 'How will I receive updates?', a: 'By the contact method you choose: WhatsApp, text message, phone call or email. Approved volunteers with an email address can also sign in to their volunteer account to see announcements and opportunities.' },
    { q: 'How is my information protected?', a: 'Your details are used only to organise the volunteer programme. Access is limited to authorised staff, every administrative action is logged, and we never sell your information. You can ask us to correct or delete your record at any time.' },
    { q: 'Do I have to take part in every activity?', a: 'No. You choose the activities you are interested in, and you can update your availability and preferences whenever your circumstances change.' },
    { q: 'I made a mistake in my application. What should I do?', a: 'Sign in to your volunteer account to update your interests, availability and contact preferences, or send a correction request. If you did not give an email address, contact the programme team with your reference.' },
  ],
};

export const privacyNotice = {
  version: '2026-10',
  summary: [
    'We collect the details in this form to register you as a volunteer, contact you about the programme and organise activities.',
    'Only authorised programme staff can see your record. Every administrative action is logged.',
    'We keep your record while you remain a volunteer and for up to 12 months after you leave, then delete it.',
    'You can ask to see, correct, export or delete your information at any time.',
    'We do not sell your information or share it with third parties for marketing.',
  ],
};
