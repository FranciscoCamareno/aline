import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { allStickerDataUrls } from './stickers.ts';

/**
 * Capa de stickers sin filtro de tema (DESIGN.md, «Selector de stickers»).
 *
 * En oscuro el motor aplica a cada <canvas> `invert(93%) hue-rotate(180deg)`. Esa cadena no puede
 * mostrar un amarillo saturado (el mantequilla de la marca necesitaría un azul negativo antes del
 * filtro), así que ningún ajuste previo del color lo arregla: la gama de salida no lo contiene.
 * Los stickers tienen que quedar fuera del filtro.
 *
 * El motor dibuja cada imagen en un canvas propio del elemento y lo compone sobre el canvas
 * estático. Aquí, solo en oscuro y solo para los stickers de la marca, esa composición se sustituye
 * por dibujar la imagen original en un canvas hermano sin filtro, con la misma transformación.
 *
 * Límites conocidos: los stickers quedan por encima del resto de elementos del lienzo (la capa
 * está sobre el canvas estático y bajo el interactivo, así que la selección se ve encima), no
 * respetan el recorte de un marco, y la exportación en oscuro sigue pasando por el filtro del
 * motor. Depende de cómo el motor 0.18.1 compone elementos; `tests/e2e/stickers.spec.ts` mide el
 * color mostrado y falla si una actualización lo cambia.
 */

interface Learned {
  image: HTMLImageElement;
  /** Argumentos con los que el motor dibujó la imagen en el canvas del elemento. */
  args: unknown[];
  transform: DOMMatrix;
  alpha: number;
}

/** Canvas de elemento → cómo se dibujó su imagen. Se rellena para toda imagen de mapa de bits. */
const learned = new WeakMap<HTMLCanvasElement, Learned>();
const stickerCache = new WeakMap<HTMLImageElement, boolean>();

let active: StickerLayer | null = null;
type DrawImage = CanvasRenderingContext2D['drawImage'];
/** `drawImage` original del navegador, guardado antes de sustituirlo. */
let originalDrawImage: DrawImage | null = null;

function patchPrototype(): DrawImage | null {
  if (originalDrawImage || typeof CanvasRenderingContext2D === 'undefined') {
    return originalDrawImage;
  }
  const proto = CanvasRenderingContext2D.prototype;
  const drawImage = proto.drawImage;
  originalDrawImage = drawImage;
  const fillRect = proto.fillRect;
  const clearRect = proto.clearRect;

  proto.drawImage = function patchedDrawImage(
    this: CanvasRenderingContext2D,
    ...args: unknown[]
  ): void {
    const layer = active;
    if (layer) {
      try {
        if (layer.intercept(this, args, drawImage)) return;
      } catch {
        // Si la capa falla, el motor dibuja como siempre (con el color del filtro).
      }
    }
    Reflect.apply(drawImage, this, args);
  } as DrawImage;

  // Cada render estático empieza rellenando o limpiando el canvas entero: ahí se vacía la capa.
  proto.fillRect = function patchedFillRect(this: CanvasRenderingContext2D, ...args: number[]) {
    if (active) active.maybeBeginFrame(this, args);
    return Reflect.apply(fillRect, this, args) as void;
  };
  proto.clearRect = function patchedClearRect(this: CanvasRenderingContext2D, ...args: number[]) {
    if (active) active.maybeBeginFrame(this, args);
    return Reflect.apply(clearRect, this, args) as void;
  };
  return drawImage;
}

class StickerLayer {
  private readonly staticCanvas: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly overlayContext: CanvasRenderingContext2D;
  private sources: Set<string> | null = null;
  private dark = false;

  constructor(staticCanvas: HTMLCanvasElement) {
    this.staticCanvas = staticCanvas;
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'excalidraw__canvas sticker-layer';
    this.overlay.setAttribute('aria-hidden', 'true');
    const context = this.overlay.getContext('2d');
    if (!context) throw new Error('Sin contexto 2D para la capa de stickers');
    this.overlayContext = context;
    // Entre el canvas estático y el interactivo: la selección queda encima de los stickers.
    staticCanvas.after(this.overlay);
    this.syncSize();
  }

  setSources(sources: Set<string>): void {
    this.sources = sources;
  }

  setDark(dark: boolean): void {
    this.dark = dark;
    if (!dark) this.clear();
  }

  dispose(): void {
    this.overlay.remove();
  }

  /** Mismo tamaño, en píxeles y en CSS, que el canvas estático. */
  private syncSize(): void {
    const { width, height } = this.staticCanvas;
    // Asignar width/height vacía el canvas: solo cuando cambian.
    if (this.overlay.width !== width) this.overlay.width = width;
    if (this.overlay.height !== height) this.overlay.height = height;
    const { width: cssWidth, height: cssHeight } = this.staticCanvas.style;
    if (this.overlay.style.width !== cssWidth) this.overlay.style.width = cssWidth;
    if (this.overlay.style.height !== cssHeight) this.overlay.style.height = cssHeight;
  }

  private clear(): void {
    this.overlayContext.setTransform(1, 0, 0, 1, 0, 0);
    this.overlayContext.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  maybeBeginFrame(context: CanvasRenderingContext2D, args: number[]): void {
    if (context.canvas !== this.staticCanvas) return;
    const [x = 0, y = 0, width = 0] = args;
    if (x !== 0 || y !== 0) return;
    // El render del motor rellena o limpia el canvas completo, ya escalado.
    if (width * context.getTransform().a < this.staticCanvas.width - 1) return;
    this.syncSize();
    this.clear();
  }

  private isSticker(image: HTMLImageElement): boolean {
    const known = stickerCache.get(image);
    if (known !== undefined) return known;
    // Hasta que se conocen los stickers no se decide (y no se guarda el «no»).
    if (!this.sources) return false;
    const result = this.sources.has(image.src);
    stickerCache.set(image, result);
    return result;
  }

  /** Devuelve true si la llamada se ha atendido aquí y el motor no debe dibujar. */
  intercept(context: CanvasRenderingContext2D, args: unknown[], drawImage: DrawImage): boolean {
    const source = args[0];
    if (context.canvas === this.staticCanvas) {
      if (!this.dark || !(source instanceof HTMLCanvasElement)) return false;
      const info = learned.get(source);
      if (!info || !this.isSticker(info.image)) return false;
      // Formas `(canvas, dx, dy)` y `(canvas, dx, dy, dw, dh)`.
      const [, dx, dy, dw = source.width, dh = source.height] = args as number[];
      if (args.length !== 3 && args.length !== 5) return false;
      if (typeof dx !== 'number' || typeof dy !== 'number' || !source.width || !source.height) {
        return false;
      }
      const matrix = context
        .getTransform()
        .translate(dx, dy)
        .scale(dw / source.width, dh / source.height)
        .multiply(info.transform);
      const target = this.overlayContext;
      target.save();
      target.setTransform(matrix);
      target.globalAlpha = context.globalAlpha * info.alpha;
      target.globalCompositeOperation = context.globalCompositeOperation;
      Reflect.apply(drawImage, target, info.args);
      target.restore();
      return true;
    }
    // Cualquier otro canvas: si es una imagen de mapa de bits, se anota cómo se dibujó.
    if (source instanceof HTMLImageElement && context.canvas instanceof HTMLCanvasElement) {
      learned.set(context.canvas, {
        image: source,
        args: [...args],
        transform: context.getTransform(),
        alpha: context.globalAlpha,
      });
    }
    return false;
  }
}

/**
 * Activa la capa de stickers para el lienzo abierto. Devuelve la función que la desmonta.
 * `setDark` la enciende o la apaga según el tema; en claro no cambia nada.
 */
export function attachStickerLayer(
  api: ExcalidrawImperativeAPI,
  host: HTMLElement,
): { setDark: (dark: boolean) => void; dispose: () => void } {
  if (!patchPrototype()) return { setDark: () => undefined, dispose: () => undefined };
  let layer: StickerLayer | null = null;
  let disposed = false;
  let dark = false;
  let attempts = 0;

  const mount = () => {
    if (disposed || layer) return;
    const canvas = host.querySelector<HTMLCanvasElement>('canvas.excalidraw__canvas.static');
    if (!canvas) {
      // El motor monta su canvas justo después de crear la API.
      if (attempts++ < 60) requestAnimationFrame(mount);
      return;
    }
    layer = new StickerLayer(canvas);
    layer.setDark(dark);
    active = layer;
    void allStickerDataUrls()
      .then((sources) => {
        if (disposed || !layer) return;
        layer.setSources(sources);
        // Los elementos ya dibujados no cambian de versión: se fuerza un render para que
        // los stickers pasen a la capa.
        if (dark) api.updateScene({ elements: api.getSceneElementsIncludingDeleted() });
      })
      .catch(() => {
        // Sin las imágenes de referencia no se reconoce ningún sticker: queda el color del motor.
      });
  };
  mount();

  return {
    setDark(next) {
      if (next === dark) return;
      dark = next;
      layer?.setDark(next);
      if (layer && next) api.updateScene({ elements: api.getSceneElementsIncludingDeleted() });
    },
    dispose() {
      disposed = true;
      if (layer && active === layer) active = null;
      layer?.dispose();
      layer = null;
    },
  };
}
