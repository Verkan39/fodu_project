import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * The page calls `/api/...` on its own origin and Vite forwards it to the API (`npm start` in
 * `apps/server`, which listens on 127.0.0.1:3001 by default). So the page needs no server address
 * and no CORS. Set API_URL to point somewhere else.
 */
const api = { '/api': process.env.API_URL ?? 'http://127.0.0.1:3001' };

export default defineConfig({
  plugins: [react()],
  server: {
    // The browser reuses the server's parser (`apps/server/src/script.ts`), which lives outside
    // this folder. Without this Vite refuses to serve it.
    fs: { allow: ['../..'] },
    proxy: api,
  },
  preview: { proxy: api },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
