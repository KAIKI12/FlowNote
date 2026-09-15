import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { readFile } from "node:fs/promises";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
const FIXTURE_PREFIX = '/qualification.assets/';
const FIXTURE_ROUTE = FIXTURE_PREFIX + 'list-image.png';
const FIXTURE_IMAGE = new URL('../flownote-markdown-qualification/fixtures/qualification.assets/list-image.png', import.meta.url);

function qualificationAssets(): Plugin {
  return { name: 'flownote-qualification-assets', apply: 'serve', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = request.url?.split('?')[0] ?? '';
      if (!pathname.startsWith(FIXTURE_PREFIX)) return next();
      if (pathname !== FIXTURE_ROUTE) { response.statusCode = 404; response.end('Not found'); return; }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.statusCode = 405;
        response.setHeader('Allow', 'GET, HEAD');
        response.end('Method not allowed');
        return;
      }
      readFile(FIXTURE_IMAGE).then(bytes => {
        if (response.destroyed) return;
        response.setHeader('Content-Type', 'image/png');
        response.setHeader('Content-Length', bytes.length);
        response.setHeader('Cache-Control', 'no-cache');
        response.end(request.method === 'HEAD' ? undefined : bytes);
      }).catch(next);
    });
  } };
}

export default defineConfig({
  plugins: [react(), qualificationAssets()],
  clearScreen: false,
  server: {
    host: host || false,
    port: 1420,
    strictPort: true,
    hmr: host
      ? {
          protocol: "ws",
          host: host,
          port: 1430,
        }
      : undefined,
  },
});
