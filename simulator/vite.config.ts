import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
  base: process.env['VITE_BASE_PATH'] ?? '/',
  build: { outDir: 'dist', sourcemap: false },
});
