import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 120000,
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./setup.ts'],
    server: {
      deps: {
        inline: ['@assemblyscript/loader'],
      },
    },
  },
});
