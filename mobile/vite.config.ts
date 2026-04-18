import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target:    'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target:    'http://localhost:3000',
        ws:        true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir:     'dist',
    sourcemap:  false,
    target:     'es2020',
  },
  define: {
    'import.meta.env.VITE_BACKEND_URL': JSON.stringify(process.env['VITE_BACKEND_URL'] ?? 'http://localhost:3000'),
    'import.meta.env.VITE_WS_URL':      JSON.stringify(process.env['VITE_WS_URL']      ?? 'ws://localhost:3000'),
    'import.meta.env.VITE_ACCESS_TOKEN': JSON.stringify(process.env['VITE_ACCESS_TOKEN'] ?? ''),
  },
});
