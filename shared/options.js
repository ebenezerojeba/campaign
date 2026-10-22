// Option lists shared by the registration form, the API validators and the admin filters.
// Values are stable identifiers stored in the database; labels are display text.

export const CONTACT_METHODS = [
  { value: 'whatsapp', label: 'WhatsApp', phrase: 'on WhatsApp' },
  { value: 'sms', label: 'Text message (SMS)', phrase: 'by text message' },
  { value: 'call', label: 'Phone call', phrase: 'by phone call' },
  { value: 'email', label: 'Email', phrase: 'by email' },
];

export const INTERESTS = [
  { value: 'community_outreach', label: 'Community outreach' },
  { value: 'event_support', label: 'Event support' },
  { value: 'civic_education', label: 'Civic education' },
  { value: 'digital_communications', label: 'Digital communications' },
  { value: 'youth_engagement', label: 'Youth engagement' },
  { value: 'women_engagement', label: 'Women’s engagement' },
  { value: 'logistics', label: 'Logistics and coordination' },
  { value: 'administration', label: 'Administrative support' },
];

export const SKILLS = [
  { value: 'public_speaking', label: 'Public speaking' },
  { value: 'social_media', label: 'Social media' },
  { value: 'photography_video', label: 'Photography and video' },
  { value: 'writing', label: 'Writing and editing' },
  { value: 'graphic_design', label: 'Graphic design' },
  { value: 'event_planning', label: 'Event planning' },
  { value: 'data_entry', label: 'Data entry' },
  { value: 'first_aid', label: 'First aid' },
  { value: 'driving', label: 'Driving' },
  { value: 'translation', label: 'Yoruba, Hausa or Igbo translation' },
  { value: 'community_mobilisation', label: 'Community mobilisation' },
  { value: 'tech_support', label: 'IT and tech support' },
];

export const AVAILABILITY = [
  { value: 'weekday_mornings', label: 'Weekday mornings' },
  { value: 'weekday_afternoons', label: 'Weekday afternoons' },
  { value: 'weekday_evenings', label: 'Weekday evenings' },
  { value: 'saturdays', label: 'Saturdays' },
  { value: 'sundays', label: 'Sundays' },
];

export const PARTICIPATION_FORMATS = [
  { value: 'in_person', label: 'In person', hint: 'Activities in my area' },
  { value: 'remote', label: 'Remote', hint: 'From my phone or computer' },
  { value: 'either', label: 'Either', hint: 'Whatever is needed' },
];

// Chosen by the applicant. Never assigned automatically.
export const AGENT_TYPES = [
  { value: 'agent_1', label: 'Agent 1' },
  { value: 'agent_2', label: 'Agent 2' },
];

export const VOLUNTEER_STATUSES = [
  { value: 'pending', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Not approved' },
];

export const OPPORTUNITY_CATEGORIES = INTERESTS;

export const OPPORTUNITY_STATUSES = ['draft', 'published', 'archived'];

export const PRIVACY_NOTICE_VERSION = '2026-10';

export const labelFor = (list, value) => list.find((o) => o.value === value)?.label ?? value;
export const valuesOf = (list) => list.map((o) => o.value);
