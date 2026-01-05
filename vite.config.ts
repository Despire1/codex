import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'react-day-picker': path.resolve(__dirname, 'src/shared/day-picker'),
      'react-router-dom': path.resolve(__dirname, 'src/shared/lib/router.tsx'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev'],
  },
});
