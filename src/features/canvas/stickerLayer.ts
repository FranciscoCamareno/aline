import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { allStickerDataUrls } from './stickers.ts';

/**
 * Capas de stickers sin filtro de tema (DESIGN.md, «Selector de stickers»).
 *
 * En oscuro el motor aplica a cada <canvas> `invert(93%) hue-rotate(180deg)`. Esa cadena no puede
 * mostrar un amarillo saturado (el mantequilla de la marca necesitaría un azul negativo antes del
 * filtro), así que ningún ajuste previo del color lo arregla: la gama de salida no lo contiene.
 * Los stickers tienen que quedar fuera del filtro.
 *
 * El motor dibuja cada elemento en un canvas propio y lo compone sobre el canvas estático con
 * `drawImage`, en orden de capas. Aquí, solo en oscuro, desde el primer sticker de cada render se
 * reparte esa composición en una pila de canvas hermanos, por encima del estático y por debajo
 * del interactivo: los stickers van a capas sin filtro y lo que se dibuja encima de ellos, a
 * capas con el filtro del motor (lo hereda de `.excalidraw.theme--dark canvas`). Así se respeta
 * el orden de capas (plan 9.15). El recorte de un marco se repite en las capas: el motor lo hace
 * con `rect`/`roundRect` + `clip` sobre el estático, y aquí se anota y se aplica igual.
 *
 * Lo que el motor dibuja directamente en el estático (contornos y nombres de marcos) queda bajo
 * las capas. La exportación no se ve afectada: siempre es en claro y el motor ya quita el filtro
 * a las imágenes. Depende de cómo compone el motor 0.18.1; `tests/e2e/stickers.spec.ts` mide el
 * color y el orden mostrados y falla si una actualización lo cambia.
 */

interface Learned {
  image: HTMLImageElement;
  /** Argumentos con los que el motor dibujó la imagen en el canvas del elemento. */
  args: unknown[];
  transform: DOMMatrix;
  alpha: number;
}

/** Recorte rectangular anotado sobre el canvas estático (el de un marco). */
interface ClipRect {
  matrix: DOMMatrix;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number | null;
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
  const { fillRect, clearRect, save, restore, beginPath, rect, clip } = proto;
  const roundRect = proto.roundRect as CanvasRenderingContext2D['roundRect'] | undefined;

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

  // Cada render estático empieza rellenando o limpiando el canvas entero: ahí se vacían las capas.
  proto.fillRect = function patchedFillRect(this: CanvasRenderingContext2D, ...args: number[]) {
    if (active) active.maybeBeginFrame(this, args);
    return Reflect.apply(fillRect, this, args) as void;
  };
  proto.clearRect = function patchedClearRect(this: CanvasRenderingContext2D, ...args: number[]) {
    if (active) active.maybeBeginFrame(this, args);
    return Reflect.apply(clearRect, this, args) as void;
  };

  // Recortes de marco en el estático: se anotan para repetirlos en las capas.
  proto.save = function patchedSave(this: CanvasRenderingContext2D) {
    if (active?.isStatic(this)) active.clips.save();
    return Reflect.apply(save, this, []) as void;
  };
  proto.restore = function patchedRestore(this: CanvasRenderingContext2D) {
    if (active?.isStatic(this)) active.clips.restore();
    return Reflect.apply(restore, this, []) as void;
  };
  proto.beginPath = function patchedBeginPath(this: CanvasRenderingContext2D) {
    if (active?.isStatic(this)) active.clips.path = null;
    return Reflect.apply(beginPath, this, []) as void;
  };
  proto.rect = function patchedRect(this: CanvasRenderingContext2D, ...args: number[]) {
    if (active?.isStatic(this)) active.clips.rect(this, args, null);
    return Reflect.apply(rect, this, args) as void;
  };
  if (roundRect) {
    proto.roundRect = function patchedRoundRect(
      this: CanvasRenderingContext2D,
      ...args: unknown[]
    ) {
      if (active?.isStatic(this)) {
        const radius = typeof args[4] === 'number' ? args[4] : 0;
        active.clips.rect(this, args.slice(0, 4) as number[], radius);
      }
      return Reflect.apply(roundRect, this, args) as void;
    } as CanvasRenderingContext2D['roundRect'];
  }
  proto.clip = function patchedClip(this: CanvasRenderingContext2D, ...args: unknown[]) {
    if (active?.isStatic(this)) active.clips.clip();
    return Reflect.apply(clip, this, args) as void;
  } as CanvasRenderingContext2D['clip'];
  return drawImage;
}

/** Pila de recortes del canvas estático, en paralelo a su save/restore. */
class ClipTracker {
  /** Último rectángulo trazado desde `beginPath` (o null si el trazado no es un rectángulo). */
  path: ClipRect | null = null;
  /** Recortes vigentes; `undefined` si se recortó con algo que no es un rectángulo. */
  private current: Array<ClipRect | undefined> = [];
  private stack: Array<Array<ClipRect | undefined>> = [];

  reset(): void {
    this.path = null;
    this.current = [];
    this.stack = [];
  }
  save(): void {
    this.stack.push([...this.current]);
  }
  restore(): void {
    this.current = this.stack.pop() ?? [];
  }
  rect(
    context: CanvasRenderingContext2D,
    [x = 0, y = 0, width = 0, height = 0]: number[],
    radius: number | null,
  ): void {
    this.path = { matrix: context.getTransform(), x, y, width, height, radius };
  }
  clip(): void {
    this.current.push(this.path ?? undefined);
  }
  /** Aplica los recortes vigentes a otro contexto. False si alguno no se puede repetir. */
  apply(target: CanvasRenderingContext2D): boolean {
    for (const clip of this.current) {
      if (!clip) return false;
      target.setTransform(clip.matrix);
      target.beginPath();
      if (clip.radius !== null && target.roundRect) {
        target.roundRect(clip.x, clip.y, clip.width, clip.height, clip.radius);
      } else {
        target.rect(clip.x, clip.y, clip.width, clip.height);
      }
      target.clip();
    }
    return true;
  }
}

interface Layer {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

class StickerLayer {
  private readonly staticCanvas: HTMLCanvasElement;
  /**
   * Pila de capas sobre el estático: las pares, sin filtro (stickers); las impares, con el filtro
   * del motor (lo que va encima de un sticker). Se crean al hacer falta y se reutilizan.
   */
  private readonly layers: Layer[] = [];
  /** Capa que recibe ahora la composición (-1: aún el canvas estático). */
  private index = -1;
  private sources: Set<string> | null = null;
  private dark = false;
  readonly clips = new ClipTracker();

  constructor(staticCanvas: HTMLCanvasElement) {
    this.staticCanvas = staticCanvas;
  }

  isStatic(context: CanvasRenderingContext2D): boolean {
    return context.canvas === this.staticCanvas;
  }

  setSources(sources: Set<string>): void {
    this.sources = sources;
  }

  setDark(dark: boolean): void {
    this.dark = dark;
    if (!dark) this.clear();
  }

  dispose(): void {
    for (const layer of this.layers) layer.canvas.remove();
    this.layers.length = 0;
  }

  /** La capa `i`, creándola tras la anterior (entre el estático y el interactivo). */
  private layer(i: number): Layer {
    let layer = this.layers[i];
    if (!layer) {
      const canvas = document.createElement('canvas');
      canvas.className = `excalidraw__canvas sticker-layer${i % 2 ? ' sticker-layer-above' : ''}`;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.dataset['layer'] = String(i);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Sin contexto 2D para la capa de stickers');
      (this.layers[i - 1]?.canvas ?? this.staticCanvas).after(canvas);
      layer = { canvas, context };
      this.layers[i] = layer;
    }
    this.syncSize(layer.canvas);
    return layer;
  }

  /** Mismo tamaño, en píxeles y en CSS, que el canvas estático. */
  private syncSize(canvas: HTMLCanvasElement): void {
    const { width, height } = this.staticCanvas;
    // Asignar width/height vacía el canvas: solo cuando cambian.
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const { width: cssWidth, height: cssHeight } = this.staticCanvas.style;
    if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
    if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
  }

  private clear(): void {
    for (const { canvas, context } of this.layers) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    this.index = -1;
  }

  maybeBeginFrame(context: CanvasRenderingContext2D, args: number[]): void {
    if (context.canvas !== this.staticCanvas) return;
    const [x = 0, y = 0, width = 0] = args;
    if (x !== 0 || y !== 0) return;
    // El render del motor rellena o limpia el canvas completo, ya escalado.
    if (width * context.getTransform().a < this.staticCanvas.width - 1) return;
    this.clear();
    this.clips.reset();
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

  /** Dibuja en la capa `target` con el estado del contexto estático y sus recortes. */
  private drawOn(
    target: CanvasRenderingContext2D,
    context: CanvasRenderingContext2D,
    matrix: DOMMatrix,
    alpha: number,
    draw: () => void,
  ): boolean {
    target.save();
    if (!this.clips.apply(target)) {
      target.restore();
      return false;
    }
    target.setTransform(matrix);
    target.globalAlpha = alpha;
    target.globalCompositeOperation = context.globalCompositeOperation;
    target.imageSmoothingEnabled = context.imageSmoothingEnabled;
    draw();
    target.restore();
    return true;
  }

  /** Devuelve true si la llamada se ha atendido aquí y el motor no debe dibujar. */
  intercept(context: CanvasRenderingContext2D, args: unknown[], drawImage: DrawImage): boolean {
    const source = args[0];
    if (context.canvas === this.staticCanvas) {
      if (!this.dark || !(source instanceof HTMLCanvasElement)) return false;
      const info = learned.get(source);
      const sticker = info !== undefined && this.isSticker(info.image);
      // Antes del primer sticker todo va al estático, como siempre.
      if (!sticker && this.index < 0) return false;
      if (sticker) {
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
        // Capa sin filtro: la actual si ya lo es, o la siguiente par.
        if (this.index < 0 || this.index % 2) this.index++;
        const target = this.layer(this.index).context;
        return this.drawOn(target, context, matrix, context.globalAlpha * info.alpha, () =>
          Reflect.apply(drawImage, target, info.args),
        );
      }
      // Encima de un sticker: a una capa con filtro, para no quedar debajo de él.
      if (this.index % 2 === 0) this.index++;
      const target = this.layer(this.index).context;
      return this.drawOn(target, context, context.getTransform(), context.globalAlpha, () =>
        Reflect.apply(drawImage, target, args),
      );
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
