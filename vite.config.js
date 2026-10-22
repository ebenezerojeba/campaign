import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The SPA lives in client/ and builds to dist/ at the repository root, which
// is Vercel's default output directory for the Vite preset.
export default defineConfig({
  root: 'client',
  envDir: 'client', // only VITE_* variables from client/.env reach the browser; server secrets stay in /.env
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Long-cacheable vendor chunks; charts and forms load only on pages that need them.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) return 'react';
          if (/[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return 'motion';
          if (/[\\/]node_modules[\\/](react-hook-form|@hookform|zod)[\\/]/.test(id)) return 'forms';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
    fs: { allow: ['..'] }, // shared/ sits beside client/
  },
  preview: { port: 4173, proxy: { '/api': 'http://localhost:4000' } },
});
