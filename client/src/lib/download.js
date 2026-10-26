// Downloads a report from the API as a file. Uses the signed-in session; on an
// error the server's message is thrown instead of saving a broken file.
export async function downloadFile(path) {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } });
  if (!res.ok) {
    let message = 'The download could not be created. Try again.';
    try { message = (await res.json()).error?.message ?? message; } catch { /* not JSON */ }
    throw new Error(message);
  }
  const blob = await res.blob();
  const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'report';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return name;
}
