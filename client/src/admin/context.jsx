import { createContext, useContext, useMemo } from 'react';
import { api, ApiError } from '../lib/api.js';

export const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);

const PREVIEW_BLOCKED = () =>
  Promise.reject(new ApiError({ status: 403, code: 'PREVIEW', message: 'Changes are switched off in the demonstration preview. Connect the database and sign in to manage real records.' }));

// Returns API helpers bound to /admin. In preview mode, reads come from fixture
// data and every write is refused.
export function useAdminApiFactory(demo, demoGet) {
  return useMemo(() => {
    if (demo) {
      return {
        get: async (path) => {
          await new Promise((r) => setTimeout(r, 180));
          return demoGet(`/admin${path}`);
        },
        post: PREVIEW_BLOCKED, patch: PREVIEW_BLOCKED, put: PREVIEW_BLOCKED, del: PREVIEW_BLOCKED, upload: PREVIEW_BLOCKED,
      };
    }
    return {
      get: (path, opts) => api(`/admin${path}`, opts),
      post: (path, body) => api(`/admin${path}`, { method: 'POST', body }),
      patch: (path, body) => api(`/admin${path}`, { method: 'PATCH', body }),
      put: (path, body) => api(`/admin${path}`, { method: 'PUT', body }),
      del: (path) => api(`/admin${path}`, { method: 'DELETE' }),
      upload: (path, formData) => api(`/admin${path}`, { method: 'POST', body: formData }),
    };
  }, [demo, demoGet]);
}

export const can = (user, permission) => Boolean(user?.permissions?.includes(permission));
