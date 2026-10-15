import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
// The app's version, from its own `package.json`, for the footer: no request needed, offline too.
import packageJson from './package.json' with { type: 'json' };

const { version } = packageJson;

export default defineConfig({
  plugins: [svelte()],
  define: {
    __NOTKA_VERSION__: JSON.stringify(version)
  },
  server: {
    port: 5173,
    strictPort: false,
    // The SPA and the API share an origin in production. In development Vite
    // stands in for Ktor's static file handler, so proxy the API instead of enabling CORS.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: false
      }
    }
  },
  build: {
    // Lists every chunk the build made: the service worker caches them all from it, the editor's
    // and the zip library's included, so the installed app has them offline.
    manifest: true,
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
