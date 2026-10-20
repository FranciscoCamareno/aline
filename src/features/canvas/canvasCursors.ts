import { CURSOR_KEYWORDS } from '../../app/cursors.ts';

/**
 * Punteros de «aline» en el lienzo (plan 9.17). El motor escribe el puntero en línea sobre su
 * canvas interactivo (`style.cursor`: «move» sobre un elemento, «grab» con la mano, los de
 * cambiar tamaño…) y nunca lo vuelve a leer. Aquí, cada vez que lo cambia, una palabra clave con
 * puntero propio pasa a `var(--cursor-…, palabra)`: con la preferencia «del sistema» la variable
 * no existe y queda la palabra. Las herramientas de dibujo conservan los suyos: la cruz de las
 * formas y los dibujados del lápiz y el borrador (que no son palabras clave).
 */
const KEEP = new Set(['crosshair']);

function mapped(value: string): string | null {
  const keyword = value.trim() || 'default';
  if (KEEP.has(keyword) || !CURSOR_KEYWORDS.has(keyword)) return null;
  return `var(--cursor-${keyword}, ${keyword})`;
}

/** Vigila el canvas interactivo del lienzo de `host`. Devuelve la función que deja de vigilar. */
export function attachCanvasCursors(host: HTMLElement): () => void {
  let observer: MutationObserver | null = null;
  let frame = 0;
  let attempts = 0;
  const watch = () => {
    const canvas = host.querySelector<HTMLCanvasElement>('canvas.excalidraw__canvas.interactive');
    if (!canvas) {
      // El motor monta su canvas justo después de crear la API.
      if (attempts++ < 60) frame = requestAnimationFrame(watch);
      return;
    }
    const sync = () => {
      const next = mapped(canvas.style.cursor);
      // Escribir el valor vuelve a avisar al observador: con `var(` ya no se cambia.
      if (next && canvas.style.cursor !== next) canvas.style.cursor = next;
    };
    observer = new MutationObserver(sync);
    observer.observe(canvas, { attributes: true, attributeFilter: ['style'] });
    sync();
  };
  watch();
  return () => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
  };
}
