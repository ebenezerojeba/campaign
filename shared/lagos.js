// Lagos State administrative areas.
// 20 constitutionally recognised Local Government Areas (LGAs) and the
// 37 Local Council Development Areas (LCDAs) created under them.
// The programme team should verify this list (and add ward lists) before
// production use. Ward lists are optional: when an LGA has no configured
// wards, the ward field accepts free text.

export const STATE = 'Lagos';

export const LAGOS_AREAS = [
  { lga: 'Agege', lcdas: ['Orile Agege'] },
  { lga: 'Ajeromi-Ifelodun', lcdas: ['Ifelodun'] },
  { lga: 'Alimosho', lcdas: ['Agbado/Oke-Odo', 'Ayobo/Ipaja', 'Egbe/Idimu', 'Ikotun/Igando', 'Mosan/Okunola'] },
  { lga: 'Amuwo-Odofin', lcdas: ['Oriade'] },
  { lga: 'Apapa', lcdas: ['Apapa-Iganmu'] },
  { lga: 'Badagry', lcdas: ['Badagry West', 'Olorunda'] },
  { lga: 'Epe', lcdas: ['Eredo', 'Ikosi-Ejirin'] },
  { lga: 'Eti-Osa', lcdas: ['Eti-Osa East', 'Ikoyi-Obalende', 'Iru/Victoria Island'] },
  { lga: 'Ibeju-Lekki', lcdas: ['Lekki'] },
  { lga: 'Ifako-Ijaiye', lcdas: ['Ojokoro'] },
  { lga: 'Ikeja', lcdas: ['Ojodu', 'Onigbongbo'] },
  { lga: 'Ikorodu', lcdas: ['Igbogbo/Bayeku', 'Ijede', 'Ikorodu North', 'Ikorodu West', 'Imota'] },
  { lga: 'Kosofe', lcdas: ['Agboyi-Ketu', 'Ikosi-Isheri'] },
  { lga: 'Lagos Island', lcdas: ['Lagos Island East'] },
  { lga: 'Lagos Mainland', lcdas: ['Yaba'] },
  { lga: 'Mushin', lcdas: ['Odi-Olowo/Ojuwoye'] },
  { lga: 'Ojo', lcdas: ['Iba', 'Oto-Awori'] },
  { lga: 'Oshodi-Isolo', lcdas: ['Ejigbo', 'Isolo'] },
  { lga: 'Shomolu', lcdas: ['Bariga'] },
  { lga: 'Surulere', lcdas: ['Coker-Aguda', 'Itire-Ikate'] },
];

// Optional: configured ward lists keyed by LGA name, e.g. { Ikeja: ['Ward A', ...] }.
export const LAGOS_WARDS = {};

export const LGA_NAMES = LAGOS_AREAS.map((a) => a.lga);

export function lcdasFor(lga) {
  return LAGOS_AREAS.find((a) => a.lga === lga)?.lcdas ?? [];
}

export function wardsFor(lga) {
  return LAGOS_WARDS[lga] ?? [];
}

// An LCDA is valid if empty, if it names the LGA's own core area, or if it belongs to the LGA.
export function isValidLcda(lga, lcda) {
  if (!lcda) return true;
  if (lcda === lga) return true;
  return lcdasFor(lga).includes(lcda);
}

export function isValidWard(lga, ward) {
  if (!ward) return true;
  const list = wardsFor(lga);
  return list.length === 0 || list.includes(ward);
}
