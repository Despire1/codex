import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'react-day-picker': path.resolve(__dirname, 'src/shared/day-picker'),
      'react-router-dom': path.resolve(__dirname, 'src/shared/lib/router.tsx'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
