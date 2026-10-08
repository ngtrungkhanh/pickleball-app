import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    include: ['src/**/*.test.{ts,tsx}'],
    pool: 'threads',
    maxWorkers: 1,
    fileParallelism: false,
  },
});
