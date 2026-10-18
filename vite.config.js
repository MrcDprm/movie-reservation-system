import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

// Vercel serves a file named index.html at "/" before any rewrite, so the programme would skip
// the server that adds its search tags (server/seo.js). The built page is renamed to app.html.
const renameIndex = {
  name: 'rename-index',
  apply: 'build',
  closeBundle() {
    const dist = fileURLToPath(new URL('./dist/', import.meta.url));
    renameSync(`${dist}index.html`, `${dist}app.html`);
  },
};

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  plugins: [react(), tailwindcss(), renameIndex],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    // Same origin as in production: the browser calls /api, Vite forwards it to the API.
    proxy: { '/api': 'http://localhost:3001' },
  },
});
