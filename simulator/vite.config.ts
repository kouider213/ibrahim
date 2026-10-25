import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
  base: process.env['VITE_BASE_PATH'] ?? '/ibrahim/',
  // 3 pages : l'app Dzaryx (index.html), l'appli FORME (forme/ → /ibrahim/forme/) et le jeu de Fennou (run/ → /ibrahim/run/)
  build: { outDir: 'dist', sourcemap: false, target: 'es2022', rollupOptions: { input: { main: resolve(__dirname, 'index.html'), forme: resolve(__dirname, 'forme/index.html'), run: resolve(__dirname, 'run/index.html'), oeil: resolve(__dirname, 'oeil/index.html'), gardiens: resolve(__dirname, 'gardiens/index.html'), folie: resolve(__dirname, 'folie/index.html'), jeux: resolve(__dirname, 'jeux/index.html') } } },
});
