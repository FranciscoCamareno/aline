import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Nunito, la fuente de la interfaz (DESIGN.md §4), servida desde el propio origen: solo el
// subconjunto latino y los pesos del sistema (400, 600, 700 y la cursiva de los captions).
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-400-italic.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import { App } from './app/App.tsx';
import { installFontFaces } from './app/fonts.ts';
import './app/i18n.ts';
import { initTheme } from './app/theme.ts';
import './app/styles.css';
import { registerCanvasFonts } from './features/canvas/canvasFonts.ts';

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

// Fuentes de Excalidraw desde el mismo origen (copiadas a public/fonts), nunca desde un CDN.
window.EXCALIDRAW_ASSET_PATH = import.meta.env.BASE_URL;

// Fuentes adicionales (fase 8.2): declaradas para documentos y registradas en el lienzo antes
// de montar el motor. No se descarga ninguna hasta que un texto la usa.
installFontFaces();
registerCanvasFonts();

initTheme();

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
