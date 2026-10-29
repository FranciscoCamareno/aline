import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_NOTEBOOK,
  PAGE_ORIENTATIONS,
  PAGE_SIZES,
  pageSize,
  type NotebookLayout,
} from '../../domain/notebook.ts';

/**
 * «Nuevo → Cuaderno» (plan 13.2): tamaño de página (A4 o Carta) y orientación, con una vista
 * previa de la proporción. Se elige al crear; después se puede convertir (13.7).
 */
export function NewNotebookDialog({
  onCreate,
  onClose,
}: {
  onCreate: (layout: NotebookLayout) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<NotebookLayout>(DEFAULT_NOTEBOOK);
  const { width, height } = pageSize(layout);
  const scale = 120 / Math.max(width, height);

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <form
        className="dialog new-notebook-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-notebook-title"
        data-testid="new-notebook-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(layout);
        }}
      >
        <h2 id="new-notebook-title">{t('notebook.newTitle')}</h2>
        <div className="new-notebook-body">
          <div className="new-notebook-options">
            <fieldset>
              <legend>{t('notebook.size')}</legend>
              {PAGE_SIZES.map((size) => (
                <label key={size} className="inline-option">
                  <input
                    type="radio"
                    name="notebook-size"
                    checked={layout.size === size}
                    data-testid={`notebook-size-${size}`}
                    onChange={() => setLayout({ ...layout, size })}
                  />
                  {t(`notebook.sizes.${size}`)}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>{t('notebook.orientation')}</legend>
              {PAGE_ORIENTATIONS.map((orientation) => (
                <label key={orientation} className="inline-option">
                  <input
                    type="radio"
                    name="notebook-orientation"
                    checked={layout.orientation === orientation}
                    data-testid={`notebook-orientation-${orientation}`}
                    onChange={() => setLayout({ ...layout, orientation })}
                  />
                  {t(`notebook.orientations.${orientation}`)}
                </label>
              ))}
            </fieldset>
          </div>
          <span
            className="new-notebook-preview"
            aria-hidden="true"
            style={{ width: width * scale, height: height * scale }}
          />
        </div>
        <div className="dialog-actions">
          <span className="topbar-spacer" />
          <button type="button" onClick={onClose}>
            {t('title.cancel')}
          </button>
          <button type="submit" className="primary" data-testid="new-notebook-create" autoFocus>
            {t('notebook.create')}
          </button>
        </div>
      </form>
    </div>
  );
}
