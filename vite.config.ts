import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },

  server: {
    proxy: {
      '/api/dynmap': {
        target: 'https://satellite.ria.red',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/dynmap/, '/map'),
      },
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');

          // Keep heavyweight third-party modules out of the initial app chunk.
          // JSZip is only loaded by import/export package flows and should remain async.
          if (normalized.includes('/node_modules/jszip/')) {
            return 'vendor-jszip';
          }

          if (normalized.includes('/node_modules/')) {
            return 'vendor-main';
          }

          // Do not chunk whole internal directories such as components/Mapping or
          // components/Legacy. Several shared helpers are intentionally imported by
          // the main map/navigation runtime. Directory-level manual chunks can create
          // production-only TDZ errors when Rollup changes module initialization order.
          // Instead, pin only the actual lazy entry roots; Rollup will keep their
          // exclusive dependencies in async chunks and leave shared utilities where
          // the dependency graph requires them.
          const isMeasuringEntry =
            normalized.endsWith('/src/entrypoints/measuringEntry.ts') ||
            normalized.endsWith('/src/components/Mapping/core/MeasuringModule.tsx') ||
            normalized.endsWith('/src/components/Mapping/core/Mtools.tsx');
          if (isMeasuringEntry) {
            return 'measuring-ext';
          }

          const isLegacyEntry =
            normalized.endsWith('/src/entrypoints/legacyEntry.ts') ||
            normalized.endsWith('/src/components/Legacy/map/RailwayLayer.tsx') ||
            normalized.endsWith('/src/components/Legacy/map/LandmarkLayer.tsx') ||
            normalized.endsWith('/src/components/Legacy/detail/LineDetailCard.tsx') ||
            normalized.endsWith('/src/components/Legacy/detail/PointDetailCard.tsx') ||
            normalized.endsWith('/src/components/Legacy/lines/LinesPage.tsx') ||
            normalized.endsWith('/src/components/Legacy/data/pathfinding.ts') ||
            normalized.endsWith('/src/components/Legacy/data/toriiTeleport.ts');
          if (isLegacyEntry) {
            return 'legacy-ext';
          }
        },
      },
    },
  },
});
