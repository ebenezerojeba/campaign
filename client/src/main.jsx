import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';
import { ConfigProvider } from './lib/config.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { App } from './App.jsx';
import './styles/index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      {/* LazyMotion keeps the animation runtime small; reducedMotion respects the OS setting. */}
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <ConfigProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </ConfigProvider>
        </MotionConfig>
      </LazyMotion>
    </BrowserRouter>
  </StrictMode>,
);
