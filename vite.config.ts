import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: { sourcemap: true, chunkSizeWarningLimit: 1000 },
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'], exclude: ['tests/e2e/**','node_modules/**','dist/**'] },
});
