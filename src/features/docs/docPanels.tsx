import { useEditorState, type Editor } from '@tiptap/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../app/ui/Icon.tsx';
import { Menu } from '../../app/ui/Menu.tsx';
import { RenameableTitle } from '../library/RenameableTitle.tsx';

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

/** Zoom de la hoja como desplegable, el primero de la barra (como Drive). */
export function ZoomSelect({ zoom, onChange }: { zoom: number; onChange: (zoom: number) => void }) {
  const { t } = useTranslation();
  return (
    <select
      className="doc-zoom-select"
      aria-label={t('docs.zoom')}
      title={t('docs.zoom')}
      data-testid="doc-zoom"
      value={zoom}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {ZOOM_STEPS.map((step) => (
        <option key={step} value={step}>
          {step} %
        </option>
      ))}
    </select>
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

/** Pestaña tal como la muestra el panel. */
export interface TabSummary {
  id: string;
  title: string;
}

/**
 * «Pestañas del documento» (como Google Docs): las pestañas del documento, una nueva con «+»,
 * cada una con su menú (renombrar, duplicar, eliminar) y, bajo la activa, sus capítulos
 * (títulos de nivel 1–3, calculados al vuelo: no se guardan ni se añaden ids a los títulos),
 * con el capítulo del cursor marcado. Pulsar un capítulo desplaza la hoja hasta él.
 */
export function DocTabsPanel({
  editor,
  tabs,
  activeId,
  readOnly,
  onSwitch,
  onAdd,
  onRename,
  onDuplicate,
  onDelete,
  onClose,
}: {
  editor: Editor;
  tabs: TabSummary[];
  activeId: string;
  readOnly: boolean;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState<{ id: string; seq: number } | null>(null);
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
  const label = (tab: TabSummary, index: number) =>
    tab.title || t('docs.tabUntitled', { n: index + 1 });

  return (
    <aside className="doc-outline doc-tabs" aria-label={t('docs.outline')} data-testid="doc-outline">
      <header>
        <h2>{t('docs.outline')}</h2>
        <span className="doc-tabs-actions">
          {!readOnly && (
            <button
              type="button"
              className="icon-button"
              aria-label={t('docs.tabAdd')}
              title={t('docs.tabAdd')}
              data-testid="doc-tab-add"
              onClick={onAdd}
            >
              <Icon name="mas" size={16} />
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label={t('docs.outlineClose')}
            title={t('docs.outlineClose')}
            onClick={onClose}
          >
            <Icon name="cerrar" size={16} />
          </button>
        </span>
      </header>
      <ul className="doc-tab-list" role="list">
        {tabs.map((tab, index) => {
          const active = tab.id === activeId;
          return (
            <li key={tab.id} className={`doc-tab${active ? ' is-active' : ''}`} data-testid="doc-tab">
              <div className="doc-tab-row">
                <Icon name="documento" size={16} on={active} />
                <RenameableTitle
                  title={label(tab, index)}
                  testId="doc-tab-title"
                  showRenameButton={false}
                  editRequest={renaming?.id === tab.id ? renaming.seq : 0}
                  onOpen={() => onSwitch(tab.id)}
                  onRename={async (title) => onRename(tab.id, title.trim())}
                />
                {!readOnly && (
                  <Menu
                    className="row-menu"
                    trigger={<Icon name="mas-opciones-v" size={16} />}
                    label={`${t('library.actions')}: ${label(tab, index)}`}
                    triggerClassName="icon-button doc-tab-menu"
                    testId="doc-tab-actions"
                    placement="bottom-end"
                    items={[
                      {
                        id: 'doc-tab-rename',
                        label: t('library.rename'),
                        icon: 'editar',
                        onSelect: () => setRenaming((r) => ({ id: tab.id, seq: (r?.seq ?? 0) + 1 })),
                      },
                      {
                        id: 'doc-tab-duplicate',
                        label: t('docs.tabDuplicate'),
                        icon: 'duplicar',
                        onSelect: () => onDuplicate(tab.id),
                      },
                      ...(tabs.length > 1
                        ? [
                            {
                              id: 'doc-tab-delete',
                              label: t('docs.tabDelete'),
                              icon: 'eliminar' as const,
                              danger: true,
                              onSelect: () => onDelete(tab.id),
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
              </div>
              {active &&
                (items.length === 0 ? (
                  <p className="muted small doc-outline-empty">{t('docs.outlineEmpty')}</p>
                ) : (
                  <ol className="doc-outline-items">
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
                ))}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
