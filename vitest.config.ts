import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.ts'],
    // Env vars must be set before publish.ts is imported (top-level env check)
    env: {
      WP_URL: 'https://test.wp.com',
      WP_AUTH_USER: 'testuser',
      WP_AUTH_PASSWORD: 'testpassword',
    },
  },
});
