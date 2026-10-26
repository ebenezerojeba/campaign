// Ward and polling-unit lookups, loaded from the datasets listed in
// pollingunit/manifest.json. Nothing here invents options: an LGA without a
// configured dataset reports `configured: false` and the form says so.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { LGA_NAMES } from '../../../shared/lagos.js';

const DATA_DIR = fileURLToPath(new URL('../../../pollingunit/', import.meta.url));

// Ward and polling unit are required wherever official data is configured.
export const ELECTORAL_FIELDS_REQUIRED = true;

let cache = null;

// Builds { [state]: { [lga]: { senatorialDistrict, wards: Map(code -> { code, name, pollingUnits: Map(code -> { code, name }) }) } } }
// and fails loudly on malformed data rather than serving partial options.
function load() {
  if (cache) return cache;
  const manifest = JSON.parse(readFileSync(path.join(DATA_DIR, 'manifest.json'), 'utf8'));
  const index = {};
  for (const ds of manifest.datasets ?? []) {
    const rows = JSON.parse(readFileSync(path.join(DATA_DIR, ds.pollingUnitsFile), 'utf8'));
    const lgas = {};
    const seen = new Set();
    for (const row of rows) {
      const lga = ds.lgaNames?.[row.lga_code];
      if (!lga) throw new Error(`[electoral] ${ds.pollingUnitsFile}: LGA code ${row.lga_code} (${row.lga}) is not mapped in manifest.json`);
      if (ds.state === 'Lagos' && !LGA_NAMES.includes(lga)) throw new Error(`[electoral] manifest maps ${row.lga_code} to unknown LGA "${lga}"`);
      if (seen.has(row.code)) throw new Error(`[electoral] duplicate polling-unit code ${row.code}`);
      seen.add(row.code);
      const entry = (lgas[lga] ??= { senatorialDistrict: row.senatorial_district, wards: new Map() });
      let ward = entry.wards.get(row.ward_code);
      if (!ward) {
        ward = { code: row.ward_code, name: row.ward.trim(), pollingUnits: new Map() };
        entry.wards.set(row.ward_code, ward);
      }
      ward.pollingUnits.set(row.code, { code: row.code, name: row.polling_unit.trim() });
    }
    index[ds.state] = lgas;
  }
  cache = index;
  return cache;
}

const lgaEntry = (state, lga) => {
  const data = load();
  return Object.hasOwn(data, state) && Object.hasOwn(data[state], lga) ? data[state][lga] : null;
};

export function isConfigured(state, lga) {
  return Boolean(lgaEntry(state, lga));
}

export function wardsFor(state, lga) {
  const entry = lgaEntry(state, lga);
  if (!entry) return { configured: false, required: false, wards: [] };
  return {
    configured: true,
    required: ELECTORAL_FIELDS_REQUIRED,
    senatorialDistrict: entry.senatorialDistrict,
    wards: [...entry.wards.values()].map((w) => ({ code: w.code, name: w.name, pollingUnits: w.pollingUnits.size })),
  };
}

export function pollingUnitsFor(state, lga, wardCode) {
  const ward = lgaEntry(state, lga)?.wards.get(wardCode);
  if (!ward) return null;
  return [...ward.pollingUnits.values()];
}

// Resolves the applicant's ward and polling-unit choices against the official
// data. Returns the fields to store, or { errors } keyed by form field.
// `level` is where the role serves ('pollingUnit', 'ward' or 'lga'): only the
// location fields for that level are checked and stored.
export function resolveElectoral({ state, lga, wardCode, pollingUnitCode, ward, level = 'pollingUnit' }) {
  const entry = lgaEntry(state, lga);
  if (entry && level === 'lga') return { fields: { senatorialDistrict: entry.senatorialDistrict } };
  if (level === 'ward') pollingUnitCode = undefined;
  if (!entry) {
    if (wardCode || pollingUnitCode) {
      return { errors: { wardCode: `Ward and polling unit data is not available for ${lga} yet. Leave these blank.` } };
    }
    // No official data: keep the optional free-text ward, as before.
    return { fields: { ward: ward || undefined } };
  }
  const errors = {};
  const w = wardCode ? entry.wards.get(wardCode) : null;
  if (!wardCode) {
    if (ELECTORAL_FIELDS_REQUIRED) errors.wardCode = 'Choose your ward';
  } else if (!w) {
    errors.wardCode = `Choose a ward in ${lga} LGA`;
  }
  const pu = w && pollingUnitCode ? w.pollingUnits.get(pollingUnitCode) : null;
  if (level === 'ward') {
    // Ward officers: the ward is enough.
  } else if (!pollingUnitCode) {
    if (ELECTORAL_FIELDS_REQUIRED) errors.pollingUnitCode = 'Choose your polling unit';
  } else if (w && !pu) {
    errors.pollingUnitCode = `Choose a polling unit in ${w.name} ward`;
  } else if (!w) {
    errors.pollingUnitCode = 'Choose your ward first';
  }
  if (Object.keys(errors).length) return { errors };
  return {
    fields: {
      senatorialDistrict: entry.senatorialDistrict,
      ward: w?.name,
      wardCode: w?.code,
      pollingUnit: pu?.name,
      pollingUnitCode: pu?.code,
    },
  };
}

// Distinct senatorial districts across configured data, for admin filters.
export function senatorialDistricts() {
  const out = new Set();
  for (const lgas of Object.values(load())) for (const e of Object.values(lgas)) out.add(e.senatorialDistrict);
  return [...out].sort();
}
