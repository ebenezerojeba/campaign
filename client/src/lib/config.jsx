import { createContext, useContext, useEffect, useState } from 'react';
import { get } from './api.js';

const DEFAULT = {
  loaded: false,
  reachable: true,
  registrationOpen: true,
  emailEnabled: false,
  demoMode: false,
  contact: { email: '', phone: '', whatsapp: '', address: '' },
};

const ConfigContext = createContext(DEFAULT);

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT);
  useEffect(() => {
    get('/config')
      .then((c) => setConfig({ ...DEFAULT, ...c, loaded: true, reachable: true }))
      .catch(() => setConfig({ ...DEFAULT, loaded: true, reachable: false }));
  }, []);
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export const useConfig = () => useContext(ConfigContext);

export function whatsappLink(number, text) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
