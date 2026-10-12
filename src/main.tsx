import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import './app/i18n.ts';
import './app/styles.css';

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

// Fuentes de Excalidraw desde el mismo origen (copiadas a public/fonts), nunca desde un CDN.
window.EXCALIDRAW_ASSET_PATH = import.meta.env.BASE_URL;

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
