import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    // Same origin as in production: the browser calls /api, Vite forwards it to the API.
    proxy: { '/api': 'http://localhost:3001' },
  },
});
