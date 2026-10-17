import { Extension } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/**
 * Paginación de la vista «Hoja» (fase 8.3): divide la hoja A4 en páginas sin tocar el documento.
 * Mide los bloques de texto ya pintados y, delante del primero que no cabe en la página, pone una
 * decoración que rellena lo que falta de la página, añade su margen inferior, la separación
 * entre hojas (con el número de página) y el margen superior de la siguiente. Se recalcula tras
 * cada cambio; si el resultado es el mismo, no hace nada (no hay bucle).
 *
 * Un bloque más alto que una página no se parte: ocupa las páginas que necesite.
 */

const MM = 96 / 25.4;
/** Medidas de `.layout-page .doc-sheet`: A4 con márgenes de 25 mm arriba y abajo. */
export const PAGE = {
  height: 297 * MM,
  marginTop: 25 * MM,
  marginBottom: 25 * MM,
  /** Separación visible entre dos hojas. */
  gap: 24,
};
export const PAGE_CONTENT_HEIGHT = PAGE.height - PAGE.marginTop - PAGE.marginBottom;

export interface PageBreak {
  /** Posición del bloque que empieza la página nueva. */
  pos: number;
  /** Altura de la decoración (relleno + márgenes + separación). */
  height: number;
  /** Espacio libre al final de la página que se cierra. */
  fill: number;
  /** Número de la página que se cierra. */
  page: number;
}

interface PaginationState {
  enabled: boolean;
  breaks: PageBreak[];
  /** Relleno tras el último bloque para completar la última página. */
  endFill: number;
  pages: number;
}

export const paginationKey = new PluginKey<PaginationState>('pagination');

/** Bloque medido, en píxeles CSS de la hoja, sin contar las decoraciones de salto. */
export interface MeasuredBlock {
  pos: number;
  top: number;
  height: number;
}

/**
 * Saltos de página para unos bloques ya medidos (función pura, probada aparte). Los bloques van
 * en orden y su `top` no incluye decoraciones.
 */
export function planPages(
  blocks: readonly MeasuredBlock[],
  contentHeight = PAGE_CONTENT_HEIGHT,
): { breaks: PageBreak[]; endFill: number; pages: number } {
  const breaks: PageBreak[] = [];
  let pageEnd = contentHeight;
  let page = 1;
  let firstOnPage = true;
  let bottom = 0;
  for (const block of blocks) {
    const blockBottom = block.top + block.height;
    if (blockBottom > pageEnd && !firstOnPage && block.height <= contentHeight) {
      const fill = Math.max(0, pageEnd - block.top);
      breaks.push({
        pos: block.pos,
        fill,
        height: fill + PAGE.marginBottom + PAGE.gap + PAGE.marginTop,
        page,
      });
      page++;
      pageEnd = block.top + contentHeight;
    }
    // Un bloque más alto que la página ocupa las que necesite.
    while (blockBottom > pageEnd) {
      pageEnd += contentHeight;
      page++;
    }
    firstOnPage = false;
    bottom = Math.max(bottom, blockBottom);
  }
  return { breaks, endFill: Math.max(0, pageEnd - bottom), pages: page };
}

/** Posiciones de los bloques que se miden: bloques de texto y bloques atómicos (separadores). */
function blockPositions(state: EditorState): number[] {
  const positions: number[] = [];
  state.doc.descendants((node, pos) => {
    if (node.isTextblock || (node.isBlock && node.isAtom)) {
      positions.push(pos);
      return false;
    }
    return true;
  });
  return positions;
}

function measure(view: EditorView, state: PaginationState): MeasuredBlock[] {
  const root = view.dom as HTMLElement;
  const rootTop = root.getBoundingClientRect().top;
  // La hoja puede tener zoom (propiedad CSS `zoom`): se vuelve a píxeles de la hoja.
  const zoom = sheetZoom(root);
  const blocks: MeasuredBlock[] = [];
  let spacer = 0;
  let next = 0;
  for (const pos of blockPositions(view.state)) {
    while (next < state.breaks.length && state.breaks[next]!.pos <= pos) {
      spacer += state.breaks[next]!.height;
      next++;
    }
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) continue;
    const box = dom.getBoundingClientRect();
    blocks.push({ pos, top: (box.top - rootTop) / zoom - spacer, height: box.height / zoom });
  }
  return blocks;
}

/** Zoom de la hoja que contiene el editor (propiedad CSS `zoom`, 1 si no hay). */
function sheetZoom(el: HTMLElement): number {
  const sheet = el.closest<HTMLElement>('.doc-sheet');
  const zoom = sheet ? Number.parseFloat(getComputedStyle(sheet).zoom) : 1;
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

function same(a: PaginationState, b: Omit<PaginationState, 'enabled'>): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < 1;
  return (
    a.pages === b.pages &&
    close(a.endFill, b.endFill) &&
    a.breaks.length === b.breaks.length &&
    a.breaks.every((x, i) => x.pos === b.breaks[i]!.pos && close(x.height, b.breaks[i]!.height))
  );
}

function breakWidget(item: PageBreak, label: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'doc-page-break';
  el.contentEditable = 'false';
  el.setAttribute('aria-hidden', 'true');
  el.dataset['page'] = String(item.page);
  el.style.height = `${item.height}px`;
  const gap = document.createElement('div');
  gap.className = 'doc-page-gap';
  gap.style.top = `${item.fill + PAGE.marginBottom}px`;
  gap.style.height = `${PAGE.gap}px`;
  const number = document.createElement('span');
  number.className = 'doc-page-number';
  number.textContent = label;
  gap.append(number);
  el.append(gap);
  // La banda cubre la hoja entera aunque el salto caiga dentro de una lista con sangría.
  requestAnimationFrame(() => {
    const sheet = el.closest<HTMLElement>('.doc-sheet');
    if (!sheet) return;
    const zoom = sheetZoom(sheet);
    const offset = (el.getBoundingClientRect().left - sheet.getBoundingClientRect().left) / zoom;
    gap.style.left = `${-offset}px`;
    gap.style.width = `${sheet.getBoundingClientRect().width / zoom}px`;
  });
  return el;
}

export const Pagination = Extension.create<{ pageLabel: (page: number) => string }>({
  name: 'pagination',

  addOptions() {
    return { pageLabel: (page: number) => String(page) };
  },

  addProseMirrorPlugins() {
    const { pageLabel } = this.options;
    return [
      new Plugin<PaginationState>({
        key: paginationKey,
        state: {
          init: () => ({ enabled: false, breaks: [], endFill: 0, pages: 1 }),
          apply(tr, value) {
            const meta = tr.getMeta(paginationKey) as Partial<PaginationState> | undefined;
            if (meta) return { ...value, ...meta };
            if (!tr.docChanged) return value;
            // Hasta medir de nuevo, los saltos siguen a sus bloques.
            return {
              ...value,
              breaks: value.breaks.map((b) => ({ ...b, pos: tr.mapping.map(b.pos) })),
            };
          },
        },
        props: {
          decorations(state) {
            const value = paginationKey.getState(state);
            if (!value?.enabled) return null;
            const widgets = value.breaks
              .filter((b) => b.pos <= state.doc.content.size)
              .map((b) =>
                Decoration.widget(b.pos, () => breakWidget(b, pageLabel(b.page)), {
                  side: -1,
                  key: `page-${b.page}-${Math.round(b.height)}`,
                  ignoreSelection: true,
                }),
              );
            widgets.push(
              Decoration.widget(
                state.doc.content.size,
                () => {
                  const el = document.createElement('div');
                  el.className = 'doc-page-end';
                  el.setAttribute('aria-hidden', 'true');
                  el.style.height = `${value.endFill}px`;
                  return el;
                },
                { side: 1, key: `page-end-${Math.round(value.endFill)}` },
              ),
            );
            return DecorationSet.create(state.doc, widgets);
          },
        },
        view: (view) => {
          let frame = 0;
          const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              const value = paginationKey.getState(view.state);
              if (!value?.enabled || view.isDestroyed) return;
              const plan = planPages(measure(view, value));
              if (!same(value, plan)) {
                view.dispatch(view.state.tr.setMeta(paginationKey, plan).setMeta('addToHistory', false));
              }
            });
          };
          const observer = new ResizeObserver(schedule);
          observer.observe(view.dom);
          schedule();
          return {
            update: (_view, previous) => {
              const before = paginationKey.getState(previous);
              const now = paginationKey.getState(view.state);
              if (view.state.doc !== previous.doc || before?.enabled !== now?.enabled) schedule();
            },
            destroy: () => {
              cancelAnimationFrame(frame);
              observer.disconnect();
            },
          };
        },
      }),
    ];
  },
});

/** Activa o desactiva la paginación (vista «Hoja» en pantallas anchas). */
export function setPagination(view: EditorView, enabled: boolean): void {
  const value = paginationKey.getState(view.state);
  if (value?.enabled === enabled) return;
  view.dispatch(
    view.state.tr
      .setMeta(paginationKey, enabled ? { enabled } : { enabled, breaks: [], endFill: 0, pages: 1 })
      .setMeta('addToHistory', false),
  );
}
