import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Presentación de un documento de la sección «Documentos»: texto corrido o una hoja A4. Es una
 * preferencia de este navegador (no contenido): no crea revisiones. La comparten Tiptap y Milkdown.
 */
export type DocLayout = 'continuous' | 'page';
const LAYOUT_KEY = 'mindnote.docLayout';

function readLayout(): DocLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'continuous' ? 'continuous' : 'page';
  } catch {
    return 'page';
  }
}

export function useDocLayout(): [DocLayout, (layout: DocLayout) => void] {
  const [layout, setLayout] = useState<DocLayout>(readLayout);
  const change = (next: DocLayout) => {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Sin almacenamiento del navegador: la preferencia dura lo que la pestaña.
    }
  };
  return [layout, change];
}

/** Selector «Continuo · Hoja» de la barra del documento. */
export function LayoutToggle({
  layout,
  onChange,
}: {
  layout: DocLayout;
  onChange: (layout: DocLayout) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="segmented" role="group" aria-label={t('docs.layout')}>
      {(['continuous', 'page'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={layout === value}
          data-testid={`doc-layout-${value}`}
          className={`segmented-option${layout === value ? ' is-active' : ''}`}
          onClick={() => onChange(value)}
        >
          {t(`docs.layout_${value}`)}
        </button>
      ))}
    </div>
  );
}
