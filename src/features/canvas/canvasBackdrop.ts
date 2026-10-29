import {
  DOT_RADIUS,
  LINE_WIDTH,
  PATTERN_STEP,
  patternInk,
  patternMarks,
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

/** Color de la mesa del cuaderno (alrededor de las páginas); en oscuro lo invierte el filtro. */
export const DESK_COLOR = '#cfc8b6';

/**
 * Fondo de un cuaderno (plan 13.3): la mesa y, encima, cada página visible con el color del papel,
 * un borde suave y el estilo de fondo recortado a la página. Se dibuja en un canvas propio (con
 * gradientes de CSS no se pueden recortar los patrones a cada página).
 */
export function drawNotebookBackdrop(
  canvas: HTMLCanvasElement,
  options: {
    view: EngineView;
    pages: readonly { x: number; y: number; width: number; height: number }[];
    paper: string;
    pattern: CanvasPattern;
  },
): void {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { view } = options;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = DESK_COLOR;
  ctx.fillRect(0, 0, width, height);
  // De la escena a la pantalla: (x + scroll) · zoom.
  ctx.translate(view.scrollX * view.zoom, view.scrollY * view.zoom);
  ctx.scale(view.zoom, view.zoom);
  const visible = {
    x: -view.scrollX,
    y: -view.scrollY,
    width: width / view.zoom,
    height: height / view.zoom,
  };
  const ink = patternInk(options.paper);
  for (const page of options.pages) {
    if (
      page.y > visible.y + visible.height ||
      page.y + page.height < visible.y ||
      page.x > visible.x + visible.width ||
      page.x + page.width < visible.x
    ) {
      continue;
    }
    ctx.fillStyle = 'rgba(38, 33, 24, 0.12)';
    ctx.fillRect(page.x + 2 / view.zoom, page.y + 3 / view.zoom, page.width, page.height);
    ctx.fillStyle = options.paper;
    ctx.fillRect(page.x, page.y, page.width, page.height);
    if (options.pattern !== 'plain') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(page.x, page.y, page.width, page.height);
      ctx.clip();
      // Relativo a la esquina de la página: cada página empieza igual.
      const marks = patternMarks(options.pattern, {
        x: 0,
        y: 0,
        width: page.width,
        height: page.height,
      });
      ctx.fillStyle = ink;
      const line = Math.max(1 / view.zoom, LINE_WIDTH);
      for (const y of marks.rows) ctx.fillRect(page.x, page.y + y, page.width, line);
      for (const x of marks.columns) ctx.fillRect(page.x + x, page.y, line, page.height);
      for (const [x, y] of marks.dots) {
        ctx.beginPath();
        ctx.arc(page.x + x, page.y + y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
