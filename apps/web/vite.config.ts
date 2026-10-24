import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // The browser reuses the server's parser (`apps/server/src/script.ts`), which lives outside
    // this folder. Without this Vite refuses to serve it.
    fs: { allow: ['../..'] },
  },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
