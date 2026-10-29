import { exportToSvg } from '@excalidraw/excalidraw';
import type {
  ExcalidrawElement,
  ExcalidrawFrameElement,
  NonDeletedExcalidrawElement,
} from '@excalidraw/excalidraw/element/types';
import type { BinaryFiles } from '@excalidraw/excalidraw/types';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../app/ui/Icon.tsx';

/**
 * Barra del cuaderno (plan 13.3): página actual de cuántas, anterior y siguiente, añadir una
 * página detrás de la actual y abrir el panel de páginas.
 */
export function NotebookBar({
  current,
  total,
  readOnly,
  onGo,
  onAdd,
  onPages,
  pagesOpen,
}: {
  current: number;
  total: number;
  readOnly: boolean;
  onGo: (index: number) => void;
  onAdd: () => void;
  onPages: () => void;
  pagesOpen: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="notebook-bar" role="toolbar" aria-label={t('notebook.pages')}>
      <button
        type="button"
        className="icon-button"
        aria-label={t('notebook.previous')}
        title={t('notebook.previous')}
        data-testid="notebook-previous"
        disabled={current <= 0}
        onClick={() => onGo(current - 1)}
      >
        <Icon name="chevron-izq" size={18} />
      </button>
      <span className="notebook-count" data-testid="notebook-count">
        {t('notebook.pageOf', { page: current + 1, total })}
      </span>
      <button
        type="button"
        className="icon-button"
        aria-label={t('notebook.next')}
        title={t('notebook.next')}
        data-testid="notebook-next"
        disabled={current >= total - 1}
        onClick={() => onGo(current + 1)}
      >
        <Icon name="chevron-der" size={18} />
      </button>
      {!readOnly && (
        <button
          type="button"
          className="icon-button"
          aria-label={t('notebook.addPage')}
          title={t('notebook.addPage')}
          data-testid="notebook-add-page"
          onClick={onAdd}
        >
          <Icon name="mas" size={18} />
        </button>
      )}
      <button
        type="button"
        className="icon-button"
        aria-pressed={pagesOpen}
        aria-label={t('notebook.pages')}
        title={t('notebook.pages')}
        data-testid="notebook-pages-toggle"
        onClick={onPages}
      >
        <Icon name="cuaderno" size={18} />
      </button>
    </div>
  );
}

/** Miniatura de una página: su contenido recortado al marco, sobre papel claro. */
function PageThumb({
  page,
  content,
  files,
  version,
}: {
  page: ExcalidrawFrameElement;
  content: readonly ExcalidrawElement[];
  files: BinaryFiles;
  version: string;
}) {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    void exportToSvg({
      elements: [page, ...content] as NonDeletedExcalidrawElement[],
      appState: { exportBackground: false, exportPadding: 0 },
      files,
      exportingFrame: page,
    }).then(
      (svg: SVGSVGElement) => {
        if (cancelled) return;
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        el.replaceChildren(svg);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
    // Se vuelve a dibujar cuando cambia el contenido de la página (su «versión»).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  return (
    <span
      ref={host}
      className="notebook-thumb"
      style={{ aspectRatio: `${page.width} / ${page.height}` }}
      aria-hidden="true"
    />
  );
}

/**
 * Panel de páginas (plan 13.4): miniaturas en orden; ir a una, subirla, bajarla, duplicarla o
 * borrarla (con confirmación y nunca la última). Cada operación es un paso de deshacer.
 */
export function NotebookPagesPanel({
  pages,
  elements,
  files,
  current,
  readOnly,
  onGo,
  onMove,
  onDuplicate,
  onDelete,
  onClose,
}: {
  pages: readonly ExcalidrawFrameElement[];
  elements: readonly ExcalidrawElement[];
  files: BinaryFiles;
  current: number;
  readOnly: boolean;
  onGo: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState<number | null>(null);
  return (
    <aside className="notebook-panel" aria-label={t('notebook.pages')} data-testid="notebook-panel">
      <header>
        <h2>{t('notebook.pages')}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('statusPanel.close')}
          title={t('statusPanel.close')}
          onClick={onClose}
        >
          <Icon name="cerrar" size={16} />
        </button>
      </header>
      <ol className="notebook-page-list">
        {pages.map((page, i) => {
          const content = elements.filter((e) => !e.isDeleted && e.frameId === page.id);
          const version = `${page.version}:${content.map((e) => e.version).join(',')}`;
          return (
            <li
              key={page.id}
              className={`notebook-page${i === current ? ' is-current' : ''}`}
              data-testid="notebook-page"
            >
              <button
                type="button"
                className="notebook-page-go"
                aria-label={t('notebook.goTo', { page: i + 1 })}
                aria-current={i === current ? 'page' : undefined}
                onClick={() => onGo(i)}
              >
                <PageThumb page={page} content={content} files={files} version={version} />
                <span className="notebook-page-number">{i + 1}</span>
              </button>
              {!readOnly &&
                (confirming === i ? (
                  <div className="notebook-page-actions">
                    <button
                      type="button"
                      className="danger"
                      data-testid="notebook-page-delete-confirm"
                      onClick={() => {
                        setConfirming(null);
                        onDelete(i);
                      }}
                    >
                      {t('notebook.deleteConfirm')}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)}>
                      {t('title.cancel')}
                    </button>
                  </div>
                ) : (
                  <div className="notebook-page-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('notebook.moveUp')}
                      title={t('notebook.moveUp')}
                      data-testid="notebook-page-up"
                      disabled={i === 0}
                      onClick={() => onMove(i, i - 1)}
                    >
                      <Icon name="chevron-arriba" size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('notebook.moveDown')}
                      title={t('notebook.moveDown')}
                      data-testid="notebook-page-down"
                      disabled={i === pages.length - 1}
                      onClick={() => onMove(i, i + 1)}
                    >
                      <Icon name="chevron-abajo" size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('notebook.duplicate')}
                      title={t('notebook.duplicate')}
                      data-testid="notebook-page-duplicate"
                      onClick={() => onDuplicate(i)}
                    >
                      <Icon name="duplicar" size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('notebook.delete')}
                      title={t('notebook.delete')}
                      data-testid="notebook-page-delete"
                      disabled={pages.length < 2}
                      onClick={() => setConfirming(i)}
                    >
                      <Icon name="eliminar" size={16} />
                    </button>
                  </div>
                ))}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
