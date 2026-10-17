import { useEditorState, type Editor } from '@tiptap/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../app/ui/Icon.tsx';

/**
 * Piezas de los documentos con formato (fase 8.3): zoom de la hoja y panel de capítulos. Son
 * presentación: ninguna cambia el documento ni crea revisiones.
 */

/** Pasos del zoom (%). */
export const ZOOM_STEPS = [50, 67, 75, 90, 100, 110, 125, 150, 175, 200];
const ZOOM_KEY = 'mindnote.docZoom';
const OUTLINE_KEY = 'mindnote.docOutline';

function readNumber(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento del navegador: la preferencia dura lo que la pestaña.
  }
}

/** Zoom de la hoja, preferencia de este navegador (como «Continuo/Hoja»). */
export function useDocZoom(): [number, (zoom: number) => void] {
  const [zoom, setZoom] = useState(() => {
    const saved = readNumber(ZOOM_KEY, 100);
    return ZOOM_STEPS.includes(saved) ? saved : 100;
  });
  return [
    zoom,
    (next) => {
      setZoom(next);
      store(ZOOM_KEY, String(next));
    },
  ];
}

/** Panel de capítulos abierto o cerrado, preferencia de este navegador. */
export function useOutlineOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OUTLINE_KEY) === 'open';
    } catch {
      return false;
    }
  });
  return [
    open,
    (next) => {
      setOpen(next);
      store(OUTLINE_KEY, next ? 'open' : 'closed');
    },
  ];
}

export function ZoomControl({ zoom, onChange }: { zoom: number; onChange: (zoom: number) => void }) {
  const { t } = useTranslation();
  const index = ZOOM_STEPS.indexOf(zoom);
  return (
    <div className="doc-zoom" role="group" aria-label={t('docs.zoom')}>
      <button
        type="button"
        className="icon-button"
        aria-label={t('docs.zoomOut')}
        title={t('docs.zoomOut')}
        data-testid="doc-zoom-out"
        disabled={index <= 0}
        onClick={() => onChange(ZOOM_STEPS[index - 1]!)}
      >
        <Icon name="zoom-menos" size={18} />
      </button>
      <button
        type="button"
        className="doc-zoom-value"
        title={t('docs.zoomReset')}
        aria-label={t('docs.zoomReset')}
        data-testid="doc-zoom-value"
        onClick={() => onChange(100)}
      >
        {zoom}%
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={t('docs.zoomIn')}
        title={t('docs.zoomIn')}
        data-testid="doc-zoom-in"
        disabled={index >= ZOOM_STEPS.length - 1}
        onClick={() => onChange(ZOOM_STEPS[index + 1]!)}
      >
        <Icon name="zoom-mas" size={18} />
      </button>
    </div>
  );
}

export interface OutlineItem {
  pos: number;
  level: number;
  text: string;
}

/** Títulos del documento (niveles 1–3) en orden, con su posición. */
export function outlineOf(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = Number(node.attrs['level']) || 1;
      items.push({ pos, level, text: node.textContent.trim() });
      return false;
    }
    return node.isBlock;
  });
  return items;
}

/**
 * Capítulos: los títulos del documento, calculados al vuelo (no se guarda nada ni se añaden
 * ids a los títulos). Marca el capítulo donde está el cursor; al pulsar uno, la hoja se
 * desplaza hasta él.
 */
export function OutlinePanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { t } = useTranslation();
  const { items, current } = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const list = outlineOf(e);
      const from = e.state.selection.from;
      const active = list.filter((item) => item.pos < from).at(-1);
      return { items: list, current: active?.pos ?? null };
    },
  });

  const go = (item: OutlineItem) => {
    const dom = editor.view.nodeDOM(item.pos);
    if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'start', behavior: 'smooth' });
    editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(item.pos + 1).run();
  };

  return (
    <aside className="doc-outline" aria-label={t('docs.outline')} data-testid="doc-outline">
      <header>
        <h2>{t('docs.outline')}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('docs.outlineClose')}
          title={t('docs.outlineClose')}
          onClick={onClose}
        >
          <Icon name="cerrar" size={16} />
        </button>
      </header>
      {items.length === 0 ? (
        <p className="muted small">{t('docs.outlineEmpty')}</p>
      ) : (
        <ol>
          {items.map((item) => (
            <li key={item.pos} className={`doc-outline-level-${item.level}`}>
              <button
                type="button"
                className={`link-button${current === item.pos ? ' is-current' : ''}`}
                aria-current={current === item.pos ? 'location' : undefined}
                data-testid="doc-outline-item"
                onClick={() => go(item)}
              >
                {item.text || t('docs.outlineUntitled')}
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
