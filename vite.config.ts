import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '0.0.0.0' },
  build: {
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom'], chain: ['viem'] } },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
