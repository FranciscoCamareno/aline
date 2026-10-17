import Image from '@tiptap/extension-image';
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

/**
 * Nodo `image` de los documentos con formato: `src` es siempre `mindnote-asset:<sha256>`. Al
 * pegar HTML solo se aceptan imágenes del propio almacén (`img[data-asset]`); las de otras webs
 * se descartan en lugar de descargarse.
 */
export const DocImage = Image.extend<{ store: DocImageStore | null }>({
  addOptions() {
    return { ...this.parent?.(), inline: false, allowBase64: false, store: null };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-asset]',
        getAttrs: (element) => {
          const hash = (element as HTMLElement).dataset['asset'] ?? '';
          if (!assetHashOf(`${DOC_ASSET_PREFIX}${hash}`)) return false;
          return {
            src: `${DOC_ASSET_PREFIX}${hash}`,
            alt: element.getAttribute('alt'),
            title: element.getAttribute('title'),
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
    return ({ node }) => {
      const img = document.createElement('img');
      img.className = 'doc-image';
      img.draggable = false;
      const hash = assetHashOf(node.attrs['src']);
      if (hash) img.dataset['asset'] = hash;
      if (typeof node.attrs['alt'] === 'string') img.alt = node.attrs['alt'];
      if (typeof node.attrs['title'] === 'string') img.title = node.attrs['title'];
      if (hash && store) {
        void store.url(hash).then((url) => {
          if (url) img.src = url;
          else img.classList.add('is-missing');
        });
      }
      return { dom: img };
    };
  },
});
