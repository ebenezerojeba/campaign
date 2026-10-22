// Nigerian states and Local Government Areas, used for State and LGA of origin.
// Single source: pollingunit/nigeria-states-lgas.json (generated from the
// programme's 36 States, FCT and LGAs workbook). Edit that file, not this one.
//
// Known gap, kept as supplied: the source lists 773 LGAs. Niger State has 24,
// and Bida LGA is missing. Applicants from Bida cannot choose it until the
// source file is corrected.
import data from '../pollingunit/nigeria-states-lgas.json' with { type: 'json' };

export const STATES_LGAS = data;

export const STATE_NAMES = Object.keys(data);

export const stateLabel = (state) => (state === 'FCT' ? 'Federal Capital Territory (FCT)' : state);

export function lgasOfState(state) {
  return Object.hasOwn(data, state) ? data[state] : [];
}

export function isValidStateLga(state, lga) {
  return lgasOfState(state).includes(lga);
}
