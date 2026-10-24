// Stores voter's card and face check results, and makes the final VIN
// comparison on the server so the full VIN never reaches a reviewer's screen.
import { Agent } from '../models/Agent.js';
import { IdentityCheck, isFlagged } from '../models/IdentityCheck.js';
import { decryptField } from '../utils/secure.js';
import { compareVin, faceResult } from '../../../shared/cardCheck.js';

const tri = (v) => (v === true ? 'found' : v === false ? 'not_found' : 'unknown');

// From the applicant's browser at registration. Recorded as information
// only: an applicant could alter it, so a reviewer check is still needed.
export async function recordApplicantCheck(agentId, check) {
  if (!check) return null;
  const doc = {
    agent: agentId,
    source: 'applicant',
    vin: { result: check.vin ?? 'skipped', applicantConfirmed: Boolean(check.applicantConfirmed) },
  };
  return IdentityCheck.create({ ...doc, flagged: isFlagged(doc) });
}

// From a reviewer's browser: VIN candidates read from the card, whether the
// name and date of birth were seen, and the face descriptor distance.
export async function recordReviewerCheck(agentId, input, user) {
  const a = await Agent.findById(agentId).select('+identityDetails.vinEncrypted').lean();
  if (!a) return null;
  const vin = input.cardReadable === false
    ? { result: 'unreadable' }
    : compareVin(a.identityDetails?.vinEncrypted ? decryptField(a.identityDetails.vinEncrypted) : '', input.vinCandidates ?? []);
  const doc = {
    agent: a._id,
    source: 'reviewer',
    by: user._id,
    byName: user.name,
    vin: { result: vin.result, distance: vin.distance ?? undefined },
    name: tri(input.nameFound),
    dateOfBirth: tri(input.dateOfBirthFound),
    face: input.face?.skipped ? { result: 'skipped' } : { result: faceResult(input.face?.distance ?? null), distance: input.face?.distance ?? undefined },
  };
  return IdentityCheck.create({ ...doc, flagged: isFlagged(doc) });
}

// The latest check of each kind for one registration.
export async function latestChecks(agentId) {
  const [applicant, reviewer] = await Promise.all(['applicant', 'reviewer'].map((source) => IdentityCheck.findOne({ agent: agentId, source }).sort({ createdAt: -1 }).lean()));
  // Re-read stored results under the current rules, so older checks follow them too.
  const view = (c) => {
    if (!c) return c;
    const face = typeof c.face?.distance === 'number' ? { ...c.face, result: faceResult(c.face.distance) } : c.face;
    const current = { ...c, face };
    return { ...current, flagged: isFlagged(current) };
  };
  return { applicant: view(applicant), reviewer: view(reviewer) };
}
