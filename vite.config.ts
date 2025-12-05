import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@mui/material': path.resolve(__dirname, 'src/shared/mui'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
