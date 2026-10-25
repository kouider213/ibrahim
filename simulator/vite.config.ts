import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
  base: process.env['VITE_BASE_PATH'] ?? '/ibrahim/',
  // 2 pages : l'app Dzaryx (index.html) et l'appli FORME (forme/index.html → /ibrahim/forme/)
  build: { outDir: 'dist', sourcemap: false, rollupOptions: { input: { main: resolve(__dirname, 'index.html'), forme: resolve(__dirname, 'forme/index.html') } } },
});
