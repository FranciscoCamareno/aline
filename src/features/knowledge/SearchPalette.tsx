import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import { KindIcon } from '../../app/ui/Icon.tsx';
import type { SearchHit } from '../../application/searchIndex.ts';

interface Props {
  search: (query: string) => Promise<{ hits: SearchHit[]; ms: number }>;
  onClose: () => void;
}

/**
 * Paleta de búsqueda (RF-26, CA-09): texto completo en notas, títulos, etiquetas y texto de los
 * lienzos. Al elegir un resultado se abre el documento y se centra el elemento o el texto.
 */
export function SearchPalette({ search, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useUiStore((s) => s.navigate);
  const indexing = useUiStore((s) => s.indexing);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ hits: SearchHit[]; ms: number; query: string } | null>(
    null,
  );
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void search(q).then((r) => {
        if (cancelled) return;
        setResult({ ...r, query: q });
        setCursor(0);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, search]);

  const hits = query.trim() && result?.query === query.trim() ? result.hits : [];

  const open = (hit: SearchHit, elementId?: string) => {
    const element = elementId ?? hit.elementIds[0] ?? null;
    navigate({
      documentId: hit.documentId,
      elementId: hit.kind === 'canvas' ? element : null,
      // En un calendario, los «elementos» son sus eventos.
      eventId: hit.kind === 'calendar' ? element : null,
      text: hit.kind === 'note' || hit.kind === 'mddoc' || hit.kind === 'doc' ? query.trim() : null,
    });
    onClose();
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog search-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title')}
        data-testid="search-palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, Math.max(hits.length - 1, 0)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === 'Enter' && hits[cursor]) {
            e.preventDefault();
            open(hits[cursor]);
          }
        }}
      >
        <input
          autoFocus
          type="search"
          value={query}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          data-testid="search-input"
          onChange={(e) => setQuery(e.target.value)}
        />
        {indexing && (
          <p className="muted small" role="status" data-testid="search-indexing">
            {t('search.indexing', { done: indexing.done, total: indexing.total })}
          </p>
        )}
        {query.trim() && result?.query === query.trim() && (
          <p className="muted small" data-testid="search-meta">
            {t('search.meta', { count: hits.length, ms: result.ms.toFixed(1) })}
          </p>
        )}
        <ul className="search-results" role="listbox" aria-label={t('search.results')}>
          {hits.map((hit, i) => (
            <li key={hit.documentId} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                className={`search-hit ${i === cursor ? 'selected' : ''}`}
                data-testid="search-hit"
                onClick={() => open(hit)}
              >
                <strong>
                  <KindIcon kind={hit.kind} /> {hit.title}
                </strong>
                <span className="muted">{hit.snippet}</span>
              </button>
              {hit.kind === 'canvas' && hit.elementIds.length > 1 && (
                <span className="muted small">
                  {t('search.elements', { count: hit.elementIds.length })}
                </span>
              )}
            </li>
          ))}
          {query.trim() && result?.query === query.trim() && hits.length === 0 && (
            <li className="muted">{t('search.empty')}</li>
          )}
        </ul>
      </div>
    </div>
  );
}
