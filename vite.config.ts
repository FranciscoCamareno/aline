/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

/**
 * Las dependencias opcionales de jsPDF (HTML/SVG a PDF) no se instalan ni se distribuyen
 * (pnpm-workspace.yaml). Solo las importaciones que hace jsPDF se resuelven a un sustituto que
 * falla al usarse; dompurify sigue resolviéndose normalmente para el resto (Mermaid).
 */
const JSPDF_OPTIONAL = new Set(['canvg', 'dompurify', 'html2canvas']);
const jspdfOptional: Plugin = {
  name: 'jspdf-optional',
  enforce: 'pre',
  resolveId(source, importer) {
    if (JSPDF_OPTIONAL.has(source) && importer?.replaceAll('\\', '/').includes('/jspdf/')) {
      return fileURLToPath(new URL('./src/vendor/jspdfOptional.ts', import.meta.url));
    }
    return null;
  },
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    jspdfOptional,
    react(),
    VitePWA({
      // Actualización controlada por el usuario (diseño §14.4), nunca en mitad de una escritura.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'aline-icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'aline — mapas mentales y notas',
        short_name: 'aline',
        description: 'Mapas mentales y notas conectadas, guardados en este dispositivo.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Papel y papel viejo del sistema de diseño (docs/DESIGN.md §2.1).
        background_color: '#FFFDF4',
        theme_color: '#F8F2E1',
        icons: [
          { src: 'aline-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'aline-icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'aline-icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'aline-icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Núcleo completo precacheado, incluidas las fuentes latinas del motor y los chunks
        // que se cargan después (locales de Excalidraw, subsetting de fuentes).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json,txt}'],
        // Xiaolai (CJK, ~13 MB) se excluye del precache y se cachea al primer uso.
        globIgnores: ['**/fonts/Xiaolai/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/fonts/'),
            handler: 'CacheFirst',
            options: { cacheName: 'engine-fonts', expiration: { maxEntries: 400 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
  },
});
