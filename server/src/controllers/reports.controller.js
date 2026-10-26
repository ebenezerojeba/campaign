// Reports and downloads centre (admins with reports:export).
import { ApiError, send } from '../utils/ApiError.js';
import { audit } from '../services/audit.js';
import { REPORTS, reportById, streamReport, describeFilters } from '../services/reports.js';

export function listReports(_req, res) {
  send(res, REPORTS);
}

// Streams one report. Errors before the first byte return a normal error; an
// error part-way through aborts the download, so a broken file is never
// presented as a finished one. Every attempt is audited without its contents.
export async function downloadReport(req, res) {
  const { format, ...filters } = req.validatedQuery;
  const def = reportById(req.params.type);
  if (!def) throw ApiError.notFound('This report does not exist');
  for (const key of Object.keys(filters)) if (filters[key] && !def.filters.includes(key)) delete filters[key];
  let rows = null;
  let outcome = 'failed';
  try {
    rows = await streamReport(res, def.id, format, filters, req.user);
    outcome = 'downloaded';
  } catch (err) {
    console.error('[reports] generation failed', def.id, err?.name, String(err?.message ?? '').slice(0, 120));
    if (!res.headersSent) throw new ApiError(500, 'REPORT_FAILED', 'The report could not be generated. Try again, or narrow the filters.');
    res.destroy(err);
  } finally {
    await audit(req, {
      action: 'report.exported',
      summary: `${def.title} (${format}): ${outcome}${rows !== null ? `, ${rows} records` : ''}`,
      meta: { report: def.id, format, filters: describeFilters(filters), outcome, rows },
    });
  }
}
