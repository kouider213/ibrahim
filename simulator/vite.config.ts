import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
  base: process.env['VITE_BASE_PATH'] ?? '/ibrahim/',
  // 3 pages : l'app Dzaryx (index.html), l'appli FORME (forme/ → /ibrahim/forme/) et le jeu de Fennou (run/ → /ibrahim/run/)
  build: { outDir: 'dist', sourcemap: false, rollupOptions: { input: { main: resolve(__dirname, 'index.html'), forme: resolve(__dirname, 'forme/index.html'), run: resolve(__dirname, 'run/index.html') } } },
});
