const dateFmt = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });
const dateTimeFmt = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' });
const shortFmt = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
const numberFmt = new Intl.NumberFormat('en-NG');

export const formatDate = (d) => (d ? dateFmt.format(new Date(d)) : '');
export const formatDateTime = (d) => (d ? dateTimeFmt.format(new Date(d)) : '');
export const formatShortDate = (d) => (d ? shortFmt.format(new Date(d)) : '');
export const formatNumber = (n) => numberFmt.format(n ?? 0);

export function formatPhone(e164) {
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164 || '');
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164 || '';
}

export function relativeTime(d) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return formatDate(d);
}

export const cx = (...parts) => parts.filter(Boolean).join(' ');
