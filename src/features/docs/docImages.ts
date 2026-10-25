import Image from '@tiptap/extension-image';
import {
  editedSize,
  imageLayout,
  MIN_IMAGE_WIDTH,
  readImageEdit,
} from '../../domain/imageEdit.ts';
import {
  acceptableDocImage,
  assetHashOf,
  DOC_ASSET_PREFIX,
  DOC_IMAGE_TYPES,
} from '../../domain/docAssets.ts';
import type { CanvasAsset } from '../../ports/CanvasAdapter.ts';
import { sha256Hex } from '../../shared/hash.ts';

/**
 * Imágenes de los documentos (fase 8.4). Solo archivos del equipo: subirlos, pegarlos o
 * arrastrarlos. Se guardan como archivos del almacén y el documento los cita como
 * `mindnote-asset:<sha256>` (`domain/docAssets.ts`); en pantalla se muestran con URL `blob:`
 * locales. Nunca se carga una imagen remota (diseño §13).
 */

/** `accept` del selector de archivos. */
export const IMAGE_ACCEPT = DOC_IMAGE_TYPES.join(',');

/**
 * Imágenes de un documento abierto: las nuevas (que el guardado añade al almacén) y las URL
 * locales con que se pintan, creadas a demanda.
 */
export class DocImageStore {
  private readonly load: (hash: string) => Promise<CanvasAsset | undefined>;
  private readonly urls = new Map<string, Promise<string>>();
  /** Imágenes añadidas en esta sesión; el guardado solo usa las que el documento cita. */
  readonly added = new Map<string, CanvasAsset>();

  constructor(load: (hash: string) => Promise<CanvasAsset | undefined>) {
    this.load = load;
  }

  /** URL local de una imagen del almacén ('' si ya no existe). */
  url(hash: string): Promise<string> {
    let url = this.urls.get(hash);
    if (!url) {
      url = (async () => {
        const asset = this.added.get(hash) ?? (await this.load(hash));
        if (!asset) return '';
        return URL.createObjectURL(new Blob([asset.bytes.slice()], { type: asset.mimeType }));
      })();
      this.urls.set(hash, url);
    }
    return url;
  }

  /** Añade un archivo; null si no es una imagen admitida (tipo o tamaño). */
  async add(file: File): Promise<{ src: string; alt: string } | null> {
    if (!acceptableDocImage(file)) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = await sha256Hex(bytes);
    this.added.set(hash, { hash, mimeType: file.type, bytes });
    return { src: `${DOC_ASSET_PREFIX}${hash}`, alt: file.name.replace(/\.[^.]+$/, '') };
  }

  /** Añade una imagen ya generada (recortada o girada como copia, plan 10.8); devuelve su `src`. */
  addAsset(asset: CanvasAsset): string {
    this.added.set(asset.hash, asset);
    return `${DOC_ASSET_PREFIX}${asset.hash}`;
  }

  /** Imágenes añadidas, para el guardado. */
  newAssets(): CanvasAsset[] {
    return [...this.added.values()];
  }

  dispose(): void {
    for (const url of this.urls.values()) void url.then((u) => u && URL.revokeObjectURL(u));
    this.urls.clear();
  }
}

/** Archivos de imagen de un portapapeles o de un arrastre. */
export function imageFiles(data: DataTransfer | null): File[] {
  return [...(data?.files ?? [])].filter((f) => f.type.startsWith('image/'));
}

/** Atributo numérico o JSON de un `<img>` pegado desde la propia aplicación. */
function dataAttr(element: HTMLElement, name: string): unknown {
  const raw = element.dataset[name];
  if (raw === undefined) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Ancho útil del editor (sin su relleno): el máximo de una imagen. */
export function editorContentWidth(dom: HTMLElement): number {
  const style = getComputedStyle(dom);
  return dom.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/**
 * Nodo `image` de los documentos con formato: `src` es siempre `mindnote-asset:<sha256>`. Al
 * pegar HTML solo se aceptan imágenes del propio almacén (`img[data-asset]`); las de otras webs
 * se descartan en lugar de descargarse.
 *
 * Desde el plan 10.8 lleva además `width`, `rotation` y `crop` (`domain/imageEdit.ts`): la vista
 * de nodo pinta el recorte y el giro con CSS sobre el original y, con la imagen seleccionada,
 * muestra tiradores en las esquinas para cambiar el ancho (conservando la proporción).
 */
export const DocImage = Image.extend<{ store: DocImageStore | null }>({
  addOptions() {
    return { ...this.parent?.(), inline: false, allowBase64: false, store: null };
  },

  addAttributes() {
    const json = (name: string) => ({
      default: null,
      parseHTML: (element: HTMLElement) => dataAttr(element, name),
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs[name] ? { [`data-${name}`]: JSON.stringify(attrs[name]) } : {},
    });
    return {
      ...this.parent?.(),
      width: json('width'),
      rotation: json('rotation'),
      crop: json('crop'),
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-asset]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const hash = el.dataset['asset'] ?? '';
          if (!assetHashOf(`${DOC_ASSET_PREFIX}${hash}`)) return false;
          return {
            src: `${DOC_ASSET_PREFIX}${hash}`,
            alt: el.getAttribute('alt'),
            title: el.getAttribute('title'),
            width: dataAttr(el, 'width'),
            rotation: dataAttr(el, 'rotation'),
            crop: dataAttr(el, 'crop'),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // Sin `src` remoto en el HTML (copiar, exportar): la imagen se identifica por su hash.
    const { src, ...rest } = HTMLAttributes as Record<string, unknown>;
    return ['img', { ...rest, 'data-asset': assetHashOf(src) ?? '' }];
  },

  addNodeView() {
    const store = this.options.store;
    return ({ node: initial, getPos, editor }) => {
      let node = initial;
      const frame = document.createElement('span');
      frame.className = 'doc-image-frame';
      frame.contentEditable = 'false';
      const box = document.createElement('span');
      box.className = 'doc-image-box';
      const img = document.createElement('img');
      img.className = 'doc-image';
      img.draggable = false;
      box.append(img);
      frame.append(box);
      const handles = (['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
        const handle = document.createElement('span');
        handle.className = `doc-image-handle doc-image-handle--${corner}`;
        handle.dataset['corner'] = corner;
        frame.append(handle);
        return handle;
      });

      /** Pinta el marco con la proporción del resultado y la caja del recorte, girada. */
      const layout = () => {
        const edit = readImageEdit(node.attrs);
        if (!img.naturalWidth) return;
        const size = editedSize({ width: img.naturalWidth, height: img.naturalHeight }, edit);
        frame.style.aspectRatio = `${size.width} / ${size.height}`;
        frame.style.width = `${edit.width ?? Math.round(size.width)}px`;
        const { swap, image } = imageLayout(edit);
        const w = frame.clientWidth;
        const h = frame.clientHeight;
        box.style.width = `${swap ? h : w}px`;
        box.style.height = `${swap ? w : h}px`;
        box.style.transform = `translate(-50%, -50%) rotate(${edit.rotation}deg)`;
        img.style.left = `${image.left}%`;
        img.style.top = `${image.top}%`;
        img.style.width = `${image.width}%`;
        img.style.height = `${image.height}%`;
      };
      const observer = new ResizeObserver(layout);
      observer.observe(frame);
      img.addEventListener('load', () => {
        frame.classList.add('is-ready');
        layout();
      });

      const paint = () => {
        const hash = assetHashOf(node.attrs['src']);
        if (hash) img.dataset['asset'] = hash;
        img.alt = typeof node.attrs['alt'] === 'string' ? node.attrs['alt'] : '';
        if (typeof node.attrs['title'] === 'string') img.title = node.attrs['title'];
        if (hash && store) {
          void store.url(hash).then((url) => {
            if (!url) img.classList.add('is-missing');
            else if (img.src !== url) img.src = url;
          });
        }
        layout();
      };
      paint();

      // Tiradores: cambian el ancho mientras se arrastra y lo guardan al soltar (un paso de
      // deshacer). La hoja puede tener zoom (CSS `zoom`): se corrige con la escala medida.
      for (const handle of handles) {
        handle.addEventListener('pointerdown', (event) => {
          if (!editor.isEditable) return;
          event.preventDefault();
          event.stopPropagation();
          handle.setPointerCapture(event.pointerId);
          const startX = event.clientX;
          const startWidth = frame.offsetWidth;
          const scale = frame.getBoundingClientRect().width / Math.max(frame.offsetWidth, 1) || 1;
          const sign = handle.dataset['corner']?.endsWith('e') ? 1 : -1;
          const max = Math.max(MIN_IMAGE_WIDTH, editorContentWidth(editor.view.dom));
          let width = startWidth;
          const move = (e: PointerEvent) => {
            const next = startWidth + (sign * (e.clientX - startX)) / scale;
            width = Math.round(Math.min(max, Math.max(MIN_IMAGE_WIDTH, next)));
            frame.style.width = `${width}px`;
          };
          const up = () => {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', up);
            handle.removeEventListener('pointercancel', up);
            const pos = typeof getPos === 'function' ? getPos() : undefined;
            if (pos === undefined || width === startWidth) return;
            editor.view.dispatch(
              editor.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width }),
            );
          };
          handle.addEventListener('pointermove', move);
          handle.addEventListener('pointerup', up);
          handle.addEventListener('pointercancel', up);
        });
      }

      return {
        dom: frame,
        update: (next) => {
          if (next.type !== node.type) return false;
          node = next;
          paint();
          return true;
        },
        // Los tiradores son de la vista, no del editor; el marco se recoloca solo.
        stopEvent: (event) =>
          event.target instanceof HTMLElement && event.target.classList.contains('doc-image-handle'),
        ignoreMutation: () => true,
        destroy: () => observer.disconnect(),
      };
    };
  },
});
