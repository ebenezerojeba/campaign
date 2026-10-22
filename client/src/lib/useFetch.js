import { useCallback, useEffect, useRef, useState } from 'react';

// Loads data on mount and whenever `key` changes. `loader` receives an AbortSignal.
export function useFetch(loader, key) {
  const [state, setState] = useState({ data: undefined, meta: undefined, error: null, loading: true });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback((signal) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    return Promise.resolve(loaderRef.current(signal))
      .then((result) => {
        if (signal?.aborted) return;
        const isPaged = result && typeof result === 'object' && 'meta' in result && 'data' in result;
        setState({ data: isPaged ? result.data : result, meta: isPaged ? result.meta : undefined, error: null, loading: false });
      })
      .catch((error) => {
        if (error?.name === 'AbortError' || signal?.aborted) return;
        setState((s) => ({ ...s, error, loading: false }));
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    run(controller.signal);
    return () => controller.abort();
  }, [run, key]);

  const reload = useCallback(() => run(), [run]);
  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload, setData };
}
