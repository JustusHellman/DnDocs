import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // The Gemini key is ONLY exposed in local development. Anything defined here for a
  // production build ends up in public JavaScript on GitHub Pages.
  const devApiKey = mode === 'development' ? process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || '' : '';

  return {
    base: mode === 'production' ? '/DnDocs/' : '/',
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(devApiKey),
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR can be disabled (e.g. in AI Studio) via DISABLE_HMR=true.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            react: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
  };
});
