import { defineConfig } from 'vite';

const PORT = process.env.PORT || 8787;

export default defineConfig({
  root: 'client',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${PORT}`,
      '/ws': { target: `ws://localhost:${PORT}`, ws: true }
    }
  }
});
