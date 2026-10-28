// Reports and downloads.
//
// - Generated on request and streamed straight to the signed-in user: no file
//   is ever stored, so there is no download link to share, guess or clean up.
// - Excel files are written with ExcelJS's streaming writer and registration
//   lists are read with a database cursor in batches, so large exports never
//   sit in memory all at once.
// - Every text cell starting with = + - @ (or a tab or carriage return) is
//   prefixed with an apostrophe so spreadsheets treat it as text, not a formula.
// - No identity numbers, bank details or documents are ever included.
import ExcelJS from 'exceljs';
import { Agent } from '../models/Agent.js';
import { AGENT_CATEGORIES, REGISTRATION_STATUSES, OFFICER_CATEGORIES, labelFor } from '../../../shared/options.js';
import { LGA_NAMES } from '../../../shared/lagos.js';
import { wardsFor, pollingUnitsFor } from './electoral.js';
import { officerPosts } from './officerPosts.js';
import { positionConflicts } from './positions.js';

// "1 of 2 filled (1 approved)" for a ward's Ward Collation Officer positions.
const wardOfficerText = (o) => `${o.filled} of ${o.seats} filled${o.filled ? ` (${o.approved} approved)` : ''}${o.contested ? ', contested' : ''}`;
import { lgaDashboard, wardDashboard } from './officers.js';

export const MAX_ROWS = 30000;

export const REPORTS = [
  { id: 'summary', title: 'Overall registration summary', description: 'Registrations by role and status, and by LGA.', filters: ['from', 'to'] },
  { id: 'registrations', title: 'Registrations list', description: 'One row per registration with contact and location details. No identity, bank or document data.', filters: ['role', 'lga', 'wardCode', 'status', 'from', 'to'] },
  { id: 'lga-officers', title: 'LGA Collation Officer assignments', description: 'All 20 LGA Collation Officer positions: who fills each, the registration status and dashboard access.', filters: ['lga'] },
  { id: 'ward-officers', title: 'Ward Collation Officer assignments', description: 'All 490 Ward Collation Officer positions (two per ward): who fills each, the registration status and dashboard access.', filters: ['lga', 'wardCode'] },
  { id: 'vacancies', title: 'Filled and vacant positions', description: 'Collation officer positions, and Agent 1 and Agent 2 positions at every polling unit.', filters: ['lga', 'wardCode'] },
  { id: 'status', title: 'Registration status report', description: 'Counts by status for each role in each LGA.', filters: ['role', 'from', 'to'] },
  { id: 'lga-ward', title: 'LGA and ward summary', description: 'Per ward: polling units, Agent 1 and Agent 2 positions filled and vacant, and the two Ward Collation Officer positions.', filters: ['lga'] },
  { id: 'conflicts', title: 'Assignment conflict report', description: 'Positions with more than one active registration, for review. Nothing is changed automatically.', filters: ['role', 'lga'] },
];
export const reportById = (id) => REPORTS.find((r) => r.id === id);

// ---------- Cell safety and formatting ----------

export function safeCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
const csvCell = (value) => {
  let s = safeCell(value);
  if (s instanceof Date) s = lagosTime(s);
  s = String(s);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const LAGOS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
export const lagosTime = (d) => (d ? `${LAGOS.format(new Date(d)).replace(',', '')} WAT` : '');
const role = (c) => labelFor(AGENT_CATEGORIES, c);
const statusLabel = (s) => (s === 'vacant' ? 'Vacant' : labelFor(REGISTRATION_STATUSES, s));
const phone = (p) => (p?.startsWith('+234') ? `0${p.slice(4)}` : p);
const yesNo = (b) => (b ? 'Yes' : 'No');

// ---------- Writers ----------

// A report is metadata plus one or more sheets of rows. CSV carries the
// metadata as the first lines and the first sheet only.
function writerFor(res, format) {
  if (format === 'csv') {
    let first = true;
    let done = false;
    return {
      async begin(meta) {
        res.write('﻿');
        for (const [k, v] of meta) res.write(`${csvCell(k)},${csvCell(v)}\r\n`);
        res.write('\r\n');
      },
      sheet(_name, columns) {
        const active = first && !done;
        first = false;
        if (active) res.write(`${columns.map((c) => csvCell(c.header)).join(',')}\r\n`);
        return {
          add(row) { if (active) res.write(`${columns.map((c) => csvCell(row[c.key])).join(',')}\r\n`); },
          end() { if (active) done = true; },
        };
      },
      async finish() { res.end(); },
    };
  }
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
  wb.creator = 'APC Lagos Digital Management System';
  wb.created = new Date();
  return {
    async begin(meta) {
      const ws = wb.addWorksheet('About this report');
      ws.columns = [{ header: 'Item', key: 'k', width: 28 }, { header: 'Value', key: 'v', width: 80 }];
      ws.getRow(1).font = { bold: true };
      for (const [k, v] of meta) ws.addRow({ k: safeCell(k), v: safeCell(v) }).commit();
      ws.commit();
    },
    sheet(name, columns) {
      const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18, style: c.date ? { numFmt: 'dd/mm/yyyy hh:mm' } : undefined }));
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).commit();
      return {
        add(row) {
          const out = {};
          for (const c of columns) out[c.key] = safeCell(row[c.key]);
          ws.addRow(out).commit();
        },
        end() { ws.commit(); },
      };
    },
    async finish() { await wb.commit(); },
  };
}

// ---------- Filters ----------

function agentFilter(f) {
  const q = { isSample: { $ne: true } };
  if (f.role) q.agentCategory = f.role;
  if (f.lga) q.lga = f.lga;
  if (f.wardCode) q.wardCode = f.wardCode;
  if (f.status) q.status = f.status;
  if (f.from || f.to) {
    q.createdAt = {};
    if (f.from) q.createdAt.$gte = new Date(`${f.from}T00:00:00+01:00`);
    if (f.to) q.createdAt.$lte = new Date(`${f.to}T23:59:59.999+01:00`);
  }
  return q;
}

export function describeFilters(f) {
  const parts = [];
  if (f.role) parts.push(`Role: ${role(f.role)}`);
  if (f.lga) parts.push(`LGA: ${f.lga}`);
  if (f.wardCode) parts.push(`Ward code: ${f.wardCode}`);
  if (f.status) parts.push(`Status: ${statusLabel(f.status)}`);
  if (f.from) parts.push(`From: ${f.from}`);
  if (f.to) parts.push(`To: ${f.to}`);
  return parts.length ? parts.join('; ') : 'None (everything)';
}

// ---------- Report builders ----------
// Each returns { count, run(writer) } so the row count is known before writing.

const REG_COLUMNS = [
  { header: 'Reference', key: 'reference', width: 16 },
  { header: 'Role', key: 'role', width: 24 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'First name', key: 'firstName' },
  { header: 'Middle name', key: 'middleName' },
  { header: 'Last name', key: 'lastName' },
  { header: 'Phone', key: 'phone', width: 14 },
  { header: 'Email', key: 'email', width: 30 },
  { header: 'LGA', key: 'lga' },
  { header: 'Ward', key: 'ward', width: 24 },
  { header: 'Ward code', key: 'wardCode', width: 11 },
  { header: 'Polling unit', key: 'pollingUnit', width: 36 },
  { header: 'Polling unit code', key: 'pollingUnitCode', width: 16 },
  { header: 'Registered', key: 'createdAt', width: 18, date: true },
  { header: 'Reviewed', key: 'reviewedAt', width: 18, date: true },
];

const builders = {
  async summary(f) {
    const match = agentFilter({ from: f.from, to: f.to });
    const [byRole, byLga] = await Promise.all([
      Agent.aggregate([{ $match: match }, { $group: { _id: { c: '$agentCategory', s: '$status' }, n: { $sum: 1 } } }]),
      Agent.aggregate([{ $match: match }, { $group: { _id: { l: '$lga', c: '$agentCategory' }, n: { $sum: 1 }, approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } } } }]),
    ]);
    const statuses = REGISTRATION_STATUSES.map((s) => s.value);
    const roles = [...new Set(byRole.map((r) => r._id.c))].sort();
    const roleRows = roles.map((c) => {
      const row = { role: role(c), total: 0 };
      for (const s of statuses) { row[s] = byRole.find((r) => r._id.c === c && r._id.s === s)?.n ?? 0; row.total += row[s]; }
      return row;
    });
    const lgaRows = LGA_NAMES.map((l) => {
      const mine = byLga.filter((r) => r._id.l === l);
      return { lga: l, total: mine.reduce((t, r) => t + r.n, 0), approved: mine.reduce((t, r) => t + r.approved, 0), ...Object.fromEntries(['agent_1', 'agent_2', 'ward_collation_officer', 'lga_collation_officer'].map((c) => [c, mine.find((r) => r._id.c === c)?.n ?? 0])) };
    });
    return {
      count: roleRows.length + lgaRows.length,
      async run(w) {
        const a = w.sheet('By role and status', [{ header: 'Role', key: 'role', width: 26 }, ...statuses.map((s) => ({ header: statusLabel(s), key: s, width: 14 })), { header: 'Total', key: 'total', width: 10 }]);
        roleRows.forEach((r) => a.add(r)); a.end();
        const b = w.sheet('By LGA', [{ header: 'LGA', key: 'lga', width: 20 }, { header: 'Agent 1', key: 'agent_1' }, { header: 'Agent 2', key: 'agent_2' }, { header: 'Ward Collation Officer', key: 'ward_collation_officer', width: 22 }, { header: 'LGA Collation Officer', key: 'lga_collation_officer', width: 22 }, { header: 'Total', key: 'total' }, { header: 'Approved', key: 'approved' }]);
        lgaRows.forEach((r) => b.add(r)); b.end();
      },
    };
  },

  async registrations(f) {
    const filter = agentFilter(f);
    const total = await Agent.countDocuments(filter);
    const count = Math.min(total, MAX_ROWS);
    return {
      count,
      truncated: total > MAX_ROWS,
      async run(w) {
        const s = w.sheet('Registrations', REG_COLUMNS);
        const cursor = Agent.find(filter).select(REG_COLUMNS.map((c) => c.key).filter((k) => k !== 'role').concat('agentCategory').join(' ')).sort({ createdAt: 1 }).limit(MAX_ROWS).lean().cursor({ batchSize: 1000 });
        for await (const a of cursor) s.add({ ...a, role: role(a.agentCategory), status: statusLabel(a.status), phone: phone(a.phone) });
        s.end();
      },
    };
  },

  async 'lga-officers'(f) {
    const posts = (await officerPosts()).lga.posts.filter((p) => !f.lga || p.lga === f.lga);
    return {
      count: posts.length,
      async run(w) {
        const s = w.sheet('LGA positions', [{ header: 'LGA', key: 'lga', width: 20 }, { header: 'Status', key: 'status', width: 14 }, { header: 'Reference', key: 'reference', width: 16 }, { header: 'Name', key: 'name', width: 28 }, { header: 'Active registrations for this position', key: 'competing', width: 18 }, { header: 'Conflict', key: 'contested', width: 10 }, { header: 'Dashboard access', key: 'dashboard', width: 22 }]);
        for (const p of posts) s.add({ lga: p.lga, status: statusLabel(p.status), reference: p.holder?.reference, name: p.holder?.name, competing: p.competing, contested: yesNo(p.contested), dashboard: accessText(p.dashboard) });
        s.end();
      },
    };
  },

  async 'ward-officers'(f) {
    const posts = (await officerPosts()).ward.posts.filter((p) => (!f.lga || p.lga === f.lga) && (!f.wardCode || p.wardCode === f.wardCode));
    return {
      count: posts.length,
      async run(w) {
        const s = w.sheet('Ward positions', [{ header: 'LGA', key: 'lga', width: 20 }, { header: 'Ward', key: 'ward', width: 26 }, { header: 'Ward code', key: 'wardCode', width: 11 }, { header: 'Status', key: 'status', width: 14 }, { header: 'Reference', key: 'reference', width: 16 }, { header: 'Name', key: 'name', width: 28 }, { header: 'Active registrations for this position', key: 'competing', width: 18 }, { header: 'Conflict', key: 'contested', width: 10 }, { header: 'Dashboard access', key: 'dashboard', width: 22 }]);
        for (const p of posts) s.add({ lga: p.lga, ward: p.ward, wardCode: p.wardCode, status: statusLabel(p.status), reference: p.holder?.reference, name: p.holder?.name, competing: p.competing, contested: yesNo(p.contested), dashboard: accessText(p.dashboard) });
        s.end();
      },
    };
  },

  async vacancies(f) {
    const posts = await officerPosts();
    const officerRows = [...posts.lga.posts, ...posts.ward.posts].filter((p) => (!f.lga || p.lga === f.lga) && (!f.wardCode || !p.wardCode || p.wardCode === f.wardCode));
    const match = { agentCategory: { $in: ['agent_1', 'agent_2'] }, status: { $in: ['pending', 'approved'] }, ...(f.lga ? { lga: f.lga } : {}), ...(f.wardCode ? { wardCode: f.wardCode } : {}) };
    const slots = await Agent.aggregate([{ $match: match }, { $group: { _id: { pu: '$pollingUnitCode', c: '$agentCategory' }, approved: { $max: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } }, n: { $sum: 1 } } }]);
    const held = new Map(slots.map((s) => [`${s._id.pu}|${s._id.c}`, s]));
    const slotText = (pu, c) => { const s = held.get(`${pu}|${c}`); return s ? `${s.approved ? 'Approved' : 'Pending'}${s.n > 1 ? ` (${s.n} competing)` : ''}` : 'Vacant'; };
    const units = [];
    for (const lga of f.lga ? [f.lga] : LGA_NAMES) {
      for (const ward of wardsFor('Lagos', lga).wards ?? []) {
        if (f.wardCode && ward.code !== f.wardCode) continue;
        for (const u of pollingUnitsFor('Lagos', lga, ward.code) ?? []) units.push({ lga, ward: ward.name, wardCode: ward.code, code: u.code, name: u.name });
      }
    }
    return {
      count: officerRows.length + units.length,
      async run(w) {
        const a = w.sheet('Collation officer positions', [{ header: 'Role', key: 'role', width: 24 }, { header: 'LGA', key: 'lga', width: 20 }, { header: 'Ward', key: 'ward', width: 26 }, { header: 'Ward code', key: 'wardCode', width: 11 }, { header: 'Status', key: 'status', width: 14 }]);
        for (const p of officerRows) a.add({ role: role(p.agentCategory), lga: p.lga, ward: p.ward, wardCode: p.wardCode, status: statusLabel(p.status) });
        a.end();
        const b = w.sheet('Polling-unit agents', [{ header: 'LGA', key: 'lga', width: 20 }, { header: 'Ward', key: 'ward', width: 26 }, { header: 'Ward code', key: 'wardCode', width: 11 }, { header: 'Polling unit code', key: 'code', width: 16 }, { header: 'Polling unit', key: 'name', width: 40 }, { header: 'Agent 1', key: 'a1', width: 22 }, { header: 'Agent 2', key: 'a2', width: 22 }]);
        for (const u of units) b.add({ ...u, a1: slotText(u.code, 'agent_1'), a2: slotText(u.code, 'agent_2') });
        b.end();
      },
    };
  },

  async status(f) {
    const match = agentFilter({ role: f.role, from: f.from, to: f.to });
    const rows = await Agent.aggregate([{ $match: match }, { $group: { _id: { l: '$lga', c: '$agentCategory', s: '$status' }, n: { $sum: 1 } } }]);
    const statuses = REGISTRATION_STATUSES.map((s) => s.value);
    const keys = [...new Set(rows.map((r) => `${r._id.l}|${r._id.c}`))].sort();
    const out = keys.map((k) => {
      const [l, c] = k.split('|');
      const row = { lga: l, role: role(c), total: 0 };
      for (const s of statuses) { row[s] = rows.find((r) => r._id.l === l && r._id.c === c && r._id.s === s)?.n ?? 0; row.total += row[s]; }
      return row;
    });
    return {
      count: out.length,
      async run(w) {
        const s = w.sheet('Status by LGA and role', [{ header: 'LGA', key: 'lga', width: 20 }, { header: 'Role', key: 'role', width: 24 }, ...statuses.map((x) => ({ header: statusLabel(x), key: x, width: 14 })), { header: 'Total', key: 'total', width: 10 }]);
        out.forEach((r) => s.add(r)); s.end();
      },
    };
  },

  async 'lga-ward'(f) {
    const lgas = f.lga ? [f.lga] : LGA_NAMES;
    const dashboards = [];
    for (const lga of lgas) dashboards.push(await lgaDashboard({ lga }));
    const posts = await officerPosts();
    const lgaPost = new Map(posts.lga.posts.map((p) => [p.lga, p.status]));
    const wardRows = dashboards.flatMap((d) => d.wards.map((wd) => ({ lga: d.assignment.lga, ...wd, wardOfficer: wardOfficerText(wd.wardOfficer) })));
    const lgaRows = dashboards.map((d) => ({ lga: d.assignment.lga, ...d.totals, lgaOfficer: statusLabel(lgaPost.get(d.assignment.lga) ?? 'vacant') }));
    const cols = [{ header: 'Polling units', key: 'pollingUnits' }, { header: 'Agent 1 and Agent 2 positions', key: 'agentPositions' }, { header: 'Filled', key: 'filled' }, { header: 'Approved', key: 'approved' }, { header: 'Vacant', key: 'vacant' }];
    return {
      count: lgaRows.length + wardRows.length,
      async run(w) {
        const a = w.sheet('LGAs', [{ header: 'LGA', key: 'lga', width: 20 }, { header: 'Wards', key: 'wards' }, ...cols, { header: 'Ward Collation Officer positions filled', key: 'wardOfficersFilled', width: 22 }, { header: 'LGA Collation Officer position', key: 'lgaOfficer', width: 16 }]);
        lgaRows.forEach((r) => a.add(r)); a.end();
        const b = w.sheet('Wards', [{ header: 'LGA', key: 'lga', width: 20 }, { header: 'Ward', key: 'name', width: 26 }, { header: 'Ward code', key: 'code', width: 11 }, ...cols, { header: 'Ward Collation Officer positions', key: 'wardOfficer', width: 26 }]);
        wardRows.forEach((r) => b.add(r)); b.end();
      },
    };
  },

  async conflicts(f) {
    const categories = f.role ? [f.role] : undefined;
    const data = await positionConflicts({ limit: 100000, ...(categories ? { categories } : {}) });
    const rows = data.items.filter((i) => !f.lga || i.lga === f.lga).flatMap((i) => i.registrations.map((r) => ({
      role: role(i.agentCategory), lga: i.lga, ward: i.ward, wardCode: i.wardCode, pollingUnit: i.pollingUnit, pollingUnitCode: i.pollingUnitCode,
      reference: r.reference, name: `${r.firstName} ${r.lastName}`, status: statusLabel(r.status), createdAt: r.createdAt, holder: r.holder ? 'Holds the position' : 'Waiting for review',
    })));
    return {
      count: rows.length,
      async run(w) {
        const s = w.sheet('Conflicts', [{ header: 'Role', key: 'role', width: 24 }, { header: 'LGA', key: 'lga', width: 20 }, { header: 'Ward', key: 'ward', width: 24 }, { header: 'Ward code', key: 'wardCode', width: 11 }, { header: 'Polling unit', key: 'pollingUnit', width: 36 }, { header: 'Polling unit code', key: 'pollingUnitCode', width: 16 }, { header: 'Reference', key: 'reference', width: 16 }, { header: 'Name', key: 'name', width: 28 }, { header: 'Status', key: 'status', width: 14 }, { header: 'Registered', key: 'createdAt', width: 18, date: true }, { header: 'Position', key: 'holder', width: 20 }]);
        rows.forEach((r) => s.add(r)); s.end();
      },
    };
  },
};

function accessText(d) {
  if (!d) return 'Not given';
  if (!d.active) return 'Switched off';
  return d.passwordSet ? 'Active' : 'Invited (password not set yet)';
}

const safeName = (s) => s.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

function sendHeaders(res, filename, format) {
  res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

// Builds the report first (so failures return an error, never a broken
// file), then streams it. Returns the number of data rows written.
export async function streamReport(res, id, format, filters, user) {
  const def = reportById(id);
  const built = await builders[id](filters);
  const meta = [
    ['Report', def.title],
    ['Generated', lagosTime(new Date())],
    ['Generated by', `${user.name} (${user.role})`],
    ['Filters', describeFilters(filters)],
    ['Records', built.truncated ? `${built.count} (first ${MAX_ROWS} only: narrow the filters for the rest)` : String(built.count)],
    ['Note', 'Contains no NIN, VIN, party number, bank details or documents.'],
  ];
  sendHeaders(res, `apc-lagos-${safeName(def.id)}-${stamp()}.${format}`, format);
  const w = writerFor(res, format);
  await w.begin(meta);
  await built.run(w);
  await w.finish();
  return built.count;
}

// An officer's own summary: counts only, scoped to their assignment.
export async function streamOfficerReport(res, assignment, format, user) {
  const d = assignment.level === 'lga' ? await lgaDashboard(assignment) : await wardDashboard(assignment);
  const where = assignment.level === 'lga' ? `${assignment.lga} LGA` : `${assignment.ward} ward (${assignment.wardCode}), ${assignment.lga} LGA`;
  const rows = assignment.level === 'lga' ? d.wards : d.pollingUnits;
  const meta = [
    ['Report', `Collation summary for ${where}`],
    ['Generated', lagosTime(new Date())],
    ['Generated by', user.name],
    ['Records', String(rows.length)],
    ['Note', 'Counts only: no personal details.'],
  ];
  sendHeaders(res, `apc-lagos-${safeName(where)}-${stamp()}.${format}`, format);
  const w = writerFor(res, format);
  await w.begin(meta);
  if (assignment.level === 'lga') {
    const s = w.sheet('Wards', [{ header: 'Ward', key: 'name', width: 26 }, { header: 'Ward code', key: 'code', width: 11 }, { header: 'Polling units', key: 'pollingUnits' }, { header: 'Agent 1 and Agent 2 positions', key: 'agentPositions' }, { header: 'Filled', key: 'filled' }, { header: 'Approved', key: 'approved' }, { header: 'Vacant', key: 'vacant' }, { header: 'Ward Collation Officer positions', key: 'wardOfficer', width: 26 }]);
    for (const r of rows) s.add({ ...r, wardOfficer: wardOfficerText(r.wardOfficer) });
    s.end();
  } else {
    const s = w.sheet('Polling units', [{ header: 'Polling unit code', key: 'code', width: 16 }, { header: 'Polling unit', key: 'name', width: 40 }, { header: 'Agent 1', key: 'a1', width: 14 }, { header: 'Agent 2', key: 'a2', width: 14 }]);
    for (const r of rows) s.add({ code: r.code, name: r.name, a1: statusLabel(r.agent_1.status), a2: statusLabel(r.agent_2.status) });
    s.end();
  }
  await w.finish();
  return rows.length;
}

export { OFFICER_CATEGORIES };
