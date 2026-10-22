// Visual identity for each opportunity category: an Adire motif + palette.
export const CATEGORY_ART = {
  community_outreach: { motif: 'oniko', palette: 'forest' },
  event_support: { motif: 'sun', palette: 'gold' },
  civic_education: { motif: 'stitch', palette: 'green' },
  digital_communications: { motif: 'dots', palette: 'deep' },
  youth_engagement: { motif: 'chevron', palette: 'green' },
  women_engagement: { motif: 'leaf', palette: 'gold' },
  logistics: { motif: 'checks', palette: 'forest' },
  administration: { motif: 'lagoon', palette: 'mist' },
};

export const artFor = (category) => CATEGORY_ART[category] ?? { motif: 'oniko', palette: 'forest' };
