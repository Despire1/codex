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
      '^/auth/session$': 'http://localhost:4000',
      '^/auth/logout$': 'http://localhost:4000',
      '^/auth/telegram/browser-config$': 'http://localhost:4000',
      '^/auth/telegram/browser-login$': 'http://localhost:4000',
      '^/auth/telegram/webapp$': 'http://localhost:4000',
      '^/auth/telegram/deep-link/.*$': 'http://localhost:4000',
    },
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.politdev.ru'],
  },
});
