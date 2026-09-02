import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const LOCAL_GAME_ASSET_NAMESPACES = new Set(['mana-seed', 'pixel-lands']);
const LOCAL_GAME_ASSETS_ROOT = fileURLToPath(
  new URL('./assets/runtime/game-assets/', import.meta.url),
);

function localGameAssetsPlugin(): Plugin {
  return {
    name: 'dmap-local-game-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url) {
          next();
          return;
        }

        let pathname: string;

        try {
          pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        } catch {
          response.statusCode = 400;
          response.end('Invalid asset path');
          return;
        }

        const match = /^\/game-assets\/([^/]+)\/(.+)$/.exec(pathname);
        const namespace = match?.[1];
        const relativePath = match?.[2];

        if (!namespace || !relativePath || !LOCAL_GAME_ASSET_NAMESPACES.has(namespace)) {
          next();
          return;
        }

        const pathSegments = relativePath.split('/');

        if (
          pathSegments.some(
            (segment) =>
              segment.length === 0 || segment === '.' || segment === '..' || segment.includes('\\'),
          )
        ) {
          response.statusCode = 403;
          response.end('Asset path is outside the local asset directory');
          return;
        }

        const namespaceRoot = path.resolve(LOCAL_GAME_ASSETS_ROOT, namespace);
        const assetPath = path.resolve(namespaceRoot, ...pathSegments);

        if (
          !assetPath.startsWith(`${namespaceRoot}${path.sep}`) ||
          path.extname(assetPath).toLowerCase() !== '.png'
        ) {
          response.statusCode = 403;
          response.end('Unsupported local asset path');
          return;
        }

        try {
          const asset = await readFile(assetPath);

          response.statusCode = 200;
          response.setHeader('Content-Type', 'image/png');
          response.setHeader('Content-Length', String(asset.byteLength));
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('X-Content-Type-Options', 'nosniff');
          response.end(asset);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            next();
            return;
          }

          next(error);
        }
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const localGameAssetsEnabled = command === 'serve' && env.VITE_LOCAL_GAME_ASSETS === 'true';

  return {
    plugins: [
      ...(localGameAssetsEnabled ? [localGameAssetsPlugin()] : []),
      react(),
      tailwindcss(),
      cloudflare(),
    ],
  };
});
