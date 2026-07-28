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
      '/api':   { target: 'http://localhost:3001', changeOrigin: true },
      '/audio': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: {
    minify: 'esbuild',
  },
  esbuild: {
    // Remove console.* e debugger do bundle de produção
    drop: ['console', 'debugger'],
  },
});

