// Collation officer dashboard and the one-time password setup.
//
// The officer's LGA or ward always comes from their account on the server,
// re-checked against their registration on every request. Nothing in the URL
// or request body can change which LGA or ward is shown.
import { ApiError, send } from '../utils/ApiError.js';
import { audit } from '../services/audit.js';
import { activeAssignment, completePasswordSetup, lgaDashboard, wardDashboard, AccessProblem } from '../services/officers.js';
import { streamOfficerReport } from '../services/reports.js';

// Middleware: resolves the signed-in officer's current assignment, or denies.
export async function requireAssignment(req, _res, next) {
  try {
    req.assignment = await activeAssignment(req.user);
    return next();
  } catch (err) {
    if (err instanceof AccessProblem) return next(ApiError.forbidden(err.message));
    return next(err);
  }
}

export async function officerDashboard(req, res) {
  const a = req.assignment;
  send(res, a.level === 'lga' ? await lgaDashboard(a) : await wardDashboard(a));
}

// The officer's own summary as Excel or CSV: counts only, no personal details.
export async function officerReport(req, res) {
  const format = req.validatedQuery.format;
  let rows = 0;
  try {
    rows = await streamOfficerReport(res, req.assignment, format, req.user);
  } finally {
    await audit(req, { action: 'officer.report_downloaded', summary: `${req.assignment.level === 'lga' ? 'LGA' : 'Ward'} summary (${format}), ${rows} rows`, meta: { format, rows } });
  }
}

// From the emailed link: sets the password once, then the link stops working.
export async function setPassword(req, res) {
  const user = await completePasswordSetup(req.body.token, req.body.password);
  if (!user) throw ApiError.badRequest('This link is invalid or has expired. Ask the coordination team for a new one.');
  req.user = user;
  await audit(req, { action: 'officer.password_set', targetType: 'User', targetId: user._id, summary: `${user.name} set their dashboard password` });
  send(res, { passwordSet: true });
}
