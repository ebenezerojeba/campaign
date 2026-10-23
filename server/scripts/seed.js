// Seeds clearly labelled SAMPLE registrations for demonstrations.
//   npm run seed           add sample agent registrations
//   npm run seed:reset     remove every sample record (real registrations are untouched)
//
// Every record created here has isSample: true, a DEMO- reference and an
// example.com address, carries no documents, and never receives messages.
// Refuses to run against a production database unless DEMO_MODE=true and
// --allow-demo are both given (for a dedicated demo database only).
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../src/config/env.js';
import { connectDb, setMongoUri, dbConfigured } from '../src/config/db.js';
import { startDevDatabase, stopDevDatabase } from '../src/config/devDb.js';
import { Agent } from '../src/models/Agent.js';
import { generateReference } from '../src/utils/reference.js';
import { AGENT_CATEGORIES, PRIVACY_NOTICE_VERSION, valuesOf } from '../../shared/options.js';
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
const LGA_WEIGHTS = { Alimosho: 9, Ikorodu: 6, 'Oshodi-Isolo': 5, Kosofe: 5, Ojo: 4, Mushin: 4, Surulere: 4, 'Eti-Osa': 4, Ikeja: 4, Agege: 3, 'Ifako-Ijaiye': 3, 'Amuwo-Odofin': 3, 'Lagos Mainland': 3, Shomolu: 3, 'Ajeromi-Ifelodun': 3, Badagry: 2, Epe: 2, 'Ibeju-Lekki': 2, 'Lagos Island': 2, Apapa: 1 };

let seed = 20261022;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (list) => list[Math.floor(rand() * list.length)];
const weightedLga = () => {
  const total = Object.values(LGA_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [lga, w] of Object.entries(LGA_WEIGHTS)) { r -= w; if (r <= 0) return lga; }
  return 'Ikeja';
};

function sampleAgents(count) {
  const now = Date.now();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const firstName = pick(FIRST);
    const lastName = pick(LAST);
    const lga = weightedLga();
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
    const history = [{ from: null, to: 'pending', reason: 'Registration submitted', at: createdAt }];
    if (status !== 'pending') history.push({ from: 'pending', to: status, reason: 'Sample review', byName: 'Sample reviewer', at: new Date(createdAt.getTime() + 2 * 86400000) });
    out.push({
      reference: generateReference('DEMO'),
      firstName,
      lastName,
      email: `${firstName}.${lastName}.${i}@example.com`.toLowerCase(),
      phone: `+23480${String(10000000 + i * 7919).slice(-8)}`,
      stateOfOrigin: origin,
      lgaOfOrigin: pick(lgasOfState(origin)),
      agentCategory: pick(valuesOf(AGENT_CATEGORIES)),
      state: 'Lagos',
      lga,
      ...electoral,
      consent: { processing: true, sensitiveData: true, declarationAccurate: true, ageConfirmed: true, noticeVersion: PRIVACY_NOTICE_VERSION, at: createdAt },
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

async function main() {
  if (!dbConfigured()) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const uri = await startDevDatabase(path.join(root, '.data', 'mongo'));
    if (!uri) throw new Error('No database available. Set MONGODB_URI or allow the development database to start.');
    setMongoUri(uri);
  }
  await connectDb();

  const removed = await Agent.deleteMany({ isSample: true });
  console.info(`Removed ${removed.deletedCount} sample registrations.`);

  if (!reset) {
    await Agent.syncIndexes();
    const agents = sampleAgents(Number(process.env.SEED_AGENTS) || 186);
    await Agent.insertMany(agents, { ordered: false });
    console.info(`Added ${agents.length} sample registrations (all marked as sample data, with no documents).`);
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
