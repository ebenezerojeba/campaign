import { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const notify = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        <AnimatePresence>
          {toasts.map((t) => (
            <m.div
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl bg-forest-900 px-4 py-3 text-[15px] font-medium text-white shadow-lift"
            >
              {t.tone === 'error' ? <XCircle className="size-5 text-[#ff9c92]" aria-hidden /> : <CheckCircle2 className="size-5 text-gold-500" aria-hidden />}
              {t.message}
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
