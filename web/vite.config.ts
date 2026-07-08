import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  publicDir: resolve(__dirname, '..'),
  server: {
    port: 5173,
    open: true,
    proxy: {
      // Forward /api and /audio requests to the Express server
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/audio': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
