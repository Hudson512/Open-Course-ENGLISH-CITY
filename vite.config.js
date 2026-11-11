import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = name => fileURLToPath(new URL(`./client/${name}`, import.meta.url));

const PORT = process.env.PORT || 8787;

export default defineConfig({
  root: 'client',
  build: {
    outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { game: page('index.html'), viewer: page('viewer.html') } }   // the game and the city viewer
  },
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${PORT}`,
      '/ws': { target: `ws://localhost:${PORT}`, ws: true }
    }
  }
});
