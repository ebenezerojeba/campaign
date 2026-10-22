// RFC 4180 CSV with formula-injection protection: cells that start with
// = + - @ (or tab/CR) are prefixed with an apostrophe so spreadsheet apps
// treat them as text.
function cell(value) {
  if (value === null || value === undefined) return '';
  let s = Array.isArray(value) ? value.join('; ') : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(columns, rows) {
  const header = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => cell(c.get(row))).join(','));
  return [header, ...body].join('\r\n');
}
