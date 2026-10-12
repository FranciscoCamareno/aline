import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Banco de la fase 0, separado del producto. Compila en modo producción para que las medidas
 * de rendimiento no se hagan con la versión de desarrollo de React y Excalidraw.
 * En el iPad: `pnpm spike:fase0 --host` y abrir http://<IP-del-PC>:4174 en Safari.
 */
export default defineConfig({
  root: fileURLToPath(new URL('./spikes/fase0', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./dist-spike', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
  preview: { port: 4174, strictPort: true },
});
