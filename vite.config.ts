
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const MIME: Record<string, string> = {
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.opus': 'audio/ogg', '.svg': 'image/svg+xml', '.png': 'image/png',
};

/** Serves ./content at /content in dev and copies it into dist at build (content is static data, never bundled). */
function contentPlugin(dir = 'content'): Plugin {
  const root = resolve(dir);
  return {
    name: 'learnerscare-content',
    configureServer(server) {
      server.middlewares.use('/content', (req, res, next) => {
        const file = normalize(join(root, decodeURIComponent((req.url ?? '').split('?')[0])));
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
        const size = statSync(file).size;
        res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');
        const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
        if (range) {
          const start = Number(range[1]);
          const end = range[2] ? Number(range[2]) : size - 1;
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
          res.setHeader('Content-Length', end - start + 1);
          createReadStream(file, { start, end }).pipe(res);
        } else {
          res.setHeader('Content-Length', size);
          createReadStream(file).pipe(res);
        }
      });
    },
    closeBundle() {
      if (process.env.VITEST) return;
      cpSync(root, resolve('dist/content'), {
        recursive: true,
        filter: (src) => !/ingest-report\.md$|audio-commands\.log$/.test(src),
      });
    },
  };
}

export default defineConfig({
  base: './',
  resolve: { alias: { '@': resolve('src') } },
  plugins: [
    react(),
    contentPlugin(process.env.CONTENT_DIR ?? 'content'),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      // the web app manifest is a real file in public/manifest.webmanifest (editable for branding)
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        globIgnores: ['content/**'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // unit content: cache-first; audio is cached as full files so range requests work offline
            urlPattern: ({ url }) => url.pathname.includes('/content/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'unit-content',
              rangeRequests: true,
              cacheableResponse: { statuses: [200] },
              matchOptions: { ignoreSearch: true, ignoreVary: true },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(id)) return 'motion';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Tests that check the Unit 1 book content only run where that (rights-restricted) content is present.
    exclude: ['node_modules/**', ...(existsSync('content/units/unit-001/unit.json') ? [] : ['tests/answer.test.ts', 'tests/content-coverage.test.ts', 'tests/evaluate.test.ts', 'tests/conversation-machine.test.ts', 'tests/conversation-content.test.ts', 'tests/brain.test.ts'])],
    testTimeout: 120000,
  },
});
