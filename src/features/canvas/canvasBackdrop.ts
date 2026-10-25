import {
  DOT_RADIUS,
  LINE_WIDTH,
  PATTERN_STEP,
  type CanvasPattern,
} from '../../domain/canvasBackground.ts';

/**
 * Capa del fondo del lienzo con su estilo (plan 10.9). Con un patrón, el motor pinta su fondo
 * transparente y esta capa, detrás del canvas, pinta el color y el patrón con gradientes de CSS,
 * alineados con el origen de la escena: el punto (x, y) de la escena está en pantalla en
 * `((x + scrollX) · zoom, (y + scrollY) · zoom)`. Se actualiza sin React en cada cambio de vista.
 */
export interface EngineView {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export function backdropStyle(
  pattern: CanvasPattern,
  ink: string,
  view: EngineView,
): Pick<CSSStyleDeclaration, 'backgroundImage' | 'backgroundSize' | 'backgroundPosition'> {
  if (pattern === 'plain')
    return { backgroundImage: 'none', backgroundSize: '', backgroundPosition: '' };
  const size = PATTERN_STEP[pattern] * view.zoom;
  const x = view.scrollX * view.zoom;
  const y = view.scrollY * view.zoom;
  const line = Math.max(1, LINE_WIDTH * view.zoom);
  if (pattern === 'dots') {
    const r = Math.max(0.8, DOT_RADIUS * view.zoom);
    return {
      backgroundImage: `radial-gradient(circle, ${ink} ${r}px, transparent ${r + 0.6}px)`,
      backgroundSize: `${size}px ${size}px`,
      // El centro de cada baldosa cae en un múltiplo del paso.
      backgroundPosition: `${x - size / 2}px ${y - size / 2}px`,
    };
  }
  const rows = `linear-gradient(to bottom, ${ink} ${line}px, transparent ${line}px)`;
  if (pattern === 'lines') {
    return {
      backgroundImage: rows,
      backgroundSize: `100% ${size}px`,
      backgroundPosition: `0 ${y}px`,
    };
  }
  return {
    backgroundImage: `${rows}, linear-gradient(to right, ${ink} ${line}px, transparent ${line}px)`,
    backgroundSize: `${size}px ${size}px, ${size}px ${size}px`,
    backgroundPosition: `${x}px ${y}px, ${x}px ${y}px`,
  };
}
