// Seeds clearly labelled SAMPLE data for demonstrations.
//   npm run seed           add sample volunteers, opportunities and announcements
//   npm run seed:reset     remove every sample record (real registrations are untouched)
//
// Every record created here has isSample: true, sample volunteers use DEMO-
// references and example.com addresses, and no messages are ever sent to them.
// Refuses to run against a production database unless DEMO_MODE=true and
// --allow-demo are both given (for a dedicated demo database only).
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../src/config/env.js';
import { connectDb, setMongoUri, dbConfigured } from '../src/config/db.js';
import { startDevDatabase, stopDevDatabase } from '../src/config/devDb.js';
import { Volunteer } from '../src/models/Volunteer.js';
import { Opportunity } from '../src/models/Opportunity.js';
import { Announcement } from '../src/models/misc.js';
import { generateReference } from '../src/utils/reference.js';
import { LAGOS_AREAS } from '../../shared/lagos.js';
import { AGENT_TYPES, INTERESTS, SKILLS, AVAILABILITY, CONTACT_METHODS, PRIVACY_NOTICE_VERSION, valuesOf } from '../../shared/options.js';
import { STATE_NAMES, lgasOfState } from '../../shared/nigeria.js';
import { wardsFor, pollingUnitsFor, resolveElectoral } from '../src/services/electoral.js';

const args = new Set(process.argv.slice(2));
const reset = args.has('--reset');

if (env.isProd && !(env.demoMode && args.has('--allow-demo'))) {
  console.error('Refusing to seed a production environment. Use a dedicated demo database with DEMO_MODE=true and --allow-demo.');
  process.exit(1);
}

const FIRST = ['Adebayo', 'Chiamaka', 'Oluwaseun', 'Ngozi', 'Ibrahim', 'Funmilayo', 'Emeka', 'Aisha', 'Tunde', 'Folake', 'Yusuf', 'Kemi', 'Chinedu', 'Bisola', 'Musa', 'Temitope', 'Ifeoma', 'Babatunde', 'Zainab', 'Segun', 'Amaka', 'Olumide', 'Halima', 'Kunle', 'Nkechi', 'Damilola', 'Sadiq', 'Yetunde', 'Obinna', 'Ronke'];
const LAST = ['Adeyemi', 'Okafor', 'Balogun', 'Eze', 'Bello', 'Ogunleye', 'Nwosu', 'Lawal', 'Adeleke', 'Okonkwo', 'Salami', 'Afolabi', 'Abubakar', 'Oyelaran', 'Chukwu', 'Olawale', 'Ibekwe', 'Akande', 'Danjuma', 'Fashola', 'Onyeka', 'Ajayi', 'Oladipo', 'Uche', 'Sanni'];
// Weighted toward the most populous LGAs.
const LGA_WEIGHTS = { Alimosho: 9, 'Ikorodu': 6, 'Oshodi-Isolo': 5, Kosofe: 5, Ojo: 4, Mushin: 4, Surulere: 4, 'Eti-Osa': 4, Ikeja: 4, Agege: 3, 'Ifako-Ijaiye': 3, 'Amuwo-Odofin': 3, 'Lagos Mainland': 3, Shomolu: 3, 'Ajeromi-Ifelodun': 3, Badagry: 2, Epe: 2, 'Ibeju-Lekki': 2, 'Lagos Island': 2, Apapa: 1 };

let seed = 20261022;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (list) => list[Math.floor(rand() * list.length)];
const some = (list, min, max) => {
  const n = min + Math.floor(rand() * (max - min + 1));
  return [...list].sort(() => rand() - 0.5).slice(0, n);
};
const weightedLga = () => {
  const total = Object.values(LGA_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [lga, w] of Object.entries(LGA_WEIGHTS)) { r -= w; if (r <= 0) return lga; }
  return 'Ikeja';
};

function sampleVolunteers(count) {
  const now = Date.now();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const firstName = pick(FIRST);
    const lastName = pick(LAST);
    const lga = weightedLga();
    const lcdas = LAGOS_AREAS.find((a) => a.lga === lga).lcdas;
    const origin = rand() < 0.45 ? 'Lagos' : pick(STATE_NAMES);
    // Ward and polling unit come from the official data, resolved like a real registration.
    const ward = pick(wardsFor('Lagos', lga).wards);
    const unit = pick(pollingUnitsFor('Lagos', lga, ward.code));
    const electoral = resolveElectoral({ state: 'Lagos', lga, wardCode: ward.code, pollingUnitCode: unit.code }).fields;
    // More registrations in recent days, to give the trend chart a shape.
    const daysAgo = Math.floor(Math.pow(rand(), 1.6) * 45);
    const createdAt = new Date(now - daysAgo * 86400000 - Math.floor(rand() * 86400000));
    const ageDays = (now - createdAt) / 86400000;
    const roll = rand();
    const status = ageDays < 3 ? 'pending' : roll < 0.62 ? 'approved' : roll < 0.8 ? 'pending' : 'rejected';
    const hasEmail = rand() < 0.7;
    const contactMethod = hasEmail ? pick(valuesOf(CONTACT_METHODS)) : pick(['whatsapp', 'sms', 'call']);
    const history = [{ from: null, to: 'pending', reason: 'Application submitted', at: createdAt }];
    if (status !== 'pending') history.push({ from: 'pending', to: status, reason: 'Sample review', byName: 'Sample reviewer', at: new Date(createdAt.getTime() + 2 * 86400000) });
    out.push({
      reference: generateReference('DEMO'),
      firstName,
      lastName,
      email: hasEmail ? `${firstName}.${lastName}.${i}@example.com`.toLowerCase() : undefined,
      phone: `+23480${String(10000000 + i * 7919).slice(-8)}`,
      contactMethod,
      agentType: pick(valuesOf(AGENT_TYPES)),
      stateOfOrigin: origin,
      lgaOfOrigin: pick(lgasOfState(origin)),
      state: 'Lagos',
      lga,
      lcda: rand() < 0.5 ? pick(lcdas) : undefined,
      ...electoral,
      interests: some(valuesOf(INTERESTS), 1, 3),
      skills: some(valuesOf(SKILLS), 0, 3),
      availability: some(valuesOf(AVAILABILITY), 1, 3),
      participationFormat: pick(['in_person', 'remote', 'either', 'either']),
      consent: { processing: true, communications: rand() < 0.6, ageConfirmed: true, noticeVersion: PRIVACY_NOTICE_VERSION, at: createdAt },
      status,
      statusHistory: history,
      reviewedAt: status === 'pending' ? undefined : history[1].at,
      isSample: true,
      createdAt,
      updatedAt: createdAt,
    });
  }
  return out;
}

const day = (n) => new Date(Date.now() + n * 86400000);

const SAMPLE_OPPORTUNITIES = [
  { title: 'Community listening sessions', summary: 'Help host small neighbourhood conversations where residents share local priorities.', category: 'community_outreach', skills: ['public_speaking', 'community_mobilisation', 'translation'], location: { lga: 'Alimosho', venue: 'Community halls across Alimosho', isRemote: false }, startDate: day(9), endDate: day(30), commitment: 'Two Saturdays a month' },
  { title: 'Event welcome and accessibility team', summary: 'Greet attendees, guide seating and make sure older people and people with disabilities can take part comfortably.', category: 'event_support', skills: ['event_planning', 'first_aid'], location: { lga: 'Ikeja', venue: 'Ikeja venues (shared on assignment)', isRemote: false }, startDate: day(14), commitment: 'One day, 8am–3pm' },
  { title: 'Civic education explainers', summary: 'Turn plain-language civic information into short posts and leaflets for your community.', category: 'civic_education', skills: ['writing', 'graphic_design', 'translation'], location: { isRemote: true }, startDate: day(5), endDate: day(60), commitment: '3–4 hours a week, remote' },
  { title: 'Digital communications desk', summary: 'Support the programme’s social media team with photography, captions and community replies.', category: 'digital_communications', skills: ['social_media', 'photography_video', 'writing'], location: { isRemote: true }, startDate: day(3), commitment: 'Flexible, remote' },
  { title: 'Volunteer records and data entry', summary: 'Help the coordination team keep volunteer schedules and activity records accurate and up to date.', category: 'administration', skills: ['data_entry', 'tech_support'], location: { lga: 'Lagos Island', venue: 'Coordination office', isRemote: false }, startDate: day(7), commitment: 'Weekday afternoons' },
  { title: 'Youth engagement forum crew', summary: 'Plan and run a forum where young people in Ikorodu meet programme volunteers and share ideas.', category: 'youth_engagement', skills: ['event_planning', 'social_media', 'public_speaking'], location: { lga: 'Ikorodu', venue: 'Ikorodu town hall area', isRemote: false }, startDate: day(21), commitment: 'Three planning evenings plus event day' },
];

const SAMPLE_ANNOUNCEMENTS = [
  { title: 'Welcome to the volunteer programme', body: 'Thank you for registering. Approved volunteers will see activities that match their interests here first. Keep your communication preferences up to date so the team can reach you.' },
  { title: 'Orientation sessions this month', body: 'Short online orientation sessions will cover how activities are organised, safety guidance and how to report concerns. Details are shared with approved volunteers by their preferred contact method.' },
];

async function main() {
  if (!dbConfigured()) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const uri = await startDevDatabase(path.join(root, '.data', 'mongo'));
    if (!uri) throw new Error('No database available. Set MONGODB_URI or allow the development database to start.');
    setMongoUri(uri);
  }
  await connectDb();

  const removed = await Promise.all([
    Volunteer.deleteMany({ isSample: true }),
    Opportunity.deleteMany({ isSample: true }),
    Announcement.deleteMany({ isSample: true }),
  ]);
  console.info(`Removed sample records: ${removed[0].deletedCount} volunteers, ${removed[1].deletedCount} opportunities, ${removed[2].deletedCount} announcements.`);

  if (!reset) {
    await Volunteer.syncIndexes();
    const volunteers = sampleVolunteers(Number(process.env.SEED_VOLUNTEERS) || 186);
    await Volunteer.insertMany(volunteers, { ordered: false });
    const opps = await Opportunity.insertMany(SAMPLE_OPPORTUNITIES.map((o) => ({ ...o, status: 'published', publishedAt: new Date(), isSample: true })));
    await Announcement.insertMany(SAMPLE_ANNOUNCEMENTS.map((a, i) => ({ ...a, status: 'published', publishedAt: new Date(Date.now() - i * 86400000), isSample: true })));

    // Give some approved sample volunteers interest in / assignments to activities.
    const approved = await Volunteer.find({ isSample: true, status: 'approved' }).limit(60);
    for (const v of approved) {
      const opp = pick(opps);
      v.assignments.push({ opportunity: opp._id, status: rand() < 0.4 ? 'assigned' : 'interested' });
      await v.save();
    }
    console.info(`Added ${volunteers.length} sample volunteers, ${opps.length} opportunities and ${SAMPLE_ANNOUNCEMENTS.length} announcements (all marked as sample data).`);
  }
  await mongoose.disconnect();
  await stopDevDatabase();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  await stopDevDatabase();
  process.exit(1);
});
