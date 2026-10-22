// Thin fetch wrapper for the same-origin API.
// Errors are normalised to ApiError with a stable `code` the UI can branch on.

export class ApiError extends Error {
  constructor({ status = 0, code = 'NETWORK', message, fields }) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields ?? {};
  }
}

const NETWORK_MESSAGE = 'We could not reach the server. Check your internet connection and try again. Nothing you entered has been lost.';

export async function api(path, { method = 'GET', body, signal, raw = false } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'fetch',
        ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError({ message: NETWORK_MESSAGE });
  }

  if (raw && res.ok) return res;

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // Non-JSON response (e.g. a proxy error page).
  }
  if (!res.ok || !payload?.ok) {
    const e = payload?.error;
    throw new ApiError({
      status: res.status,
      code: e?.code ?? (res.status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN'),
      message: e?.message ?? (res.status >= 500 ? 'The service is temporarily unavailable. Please try again shortly.' : 'Something went wrong. Please try again.'),
      fields: e?.details?.fields,
    });
  }
  return payload.meta ? { data: payload.data, meta: payload.meta } : payload.data;
}

export const get = (path, opts) => api(path, opts);
export const post = (path, body) => api(path, { method: 'POST', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const put = (path, body) => api(path, { method: 'PUT', body });
export const del = (path) => api(path, { method: 'DELETE' });
