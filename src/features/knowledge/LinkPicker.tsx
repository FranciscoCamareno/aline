import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import { KindIcon } from '../../app/ui/Icon.tsx';
import type { DocumentRecord } from '../../domain/revision.ts';
import { normalizeForSearch } from '../../application/searchIndex.ts';

interface Props {
  /** Documento desde el que se enlaza (no se ofrece como destino). */
  sourceId: string;
  currentLink: string | null;
  onPick: (doc: DocumentRecord) => void;
  /** FA-03a: el destino no existe y se crea en el momento. */
  onCreateNote: (title: string) => void;
  onWeb: (url: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Valida una dirección web: solo http(s), sin esquemas peligrosos (diseño §13). */
export function validWebUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Selector de destino para vincular un elemento del lienzo (RF-20, FP-03). */
export function LinkPicker({
  sourceId,
  currentLink,
  onPick,
  onCreateNote,
  onWeb,
  onRemove,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const [query, setQuery] = useState('');
  const [web, setWeb] = useState('');

  const candidates = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    return documents
      .filter((d) => !d.deleted && d.kind !== 'folder' && d.id !== sourceId)
      .filter((d) => !q || normalizeForSearch(d.title).includes(q))
      .slice(0, 30);
  }, [documents, query, sourceId]);
  const webUrl = validWebUrl(web);

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('links.pickerTitle')}
        data-testid="link-picker"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2>{t('links.pickerTitle')}</h2>
        {currentLink && (
          <p className="muted small">
            {t('links.current')} <span className="mono">{currentLink}</span>{' '}
            <button type="button" onClick={onRemove} data-testid="link-remove">
              {t('links.remove')}
            </button>
          </p>
        )}
        <input
          autoFocus
          value={query}
          placeholder={t('links.searchPlaceholder')}
          aria-label={t('links.searchPlaceholder')}
          data-testid="link-search"
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="picker-list">
          {candidates.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="link-button"
                data-testid="link-candidate"
                onClick={() => onPick(d)}
              >
                <KindIcon kind={d.kind} /> {d.title}
              </button>
            </li>
          ))}
          {query.trim() && (
            <li>
              <button
                type="button"
                className="link-button"
                data-testid="link-create"
                onClick={() => onCreateNote(query.trim())}
              >
                + {t('links.createNote', { title: query.trim() })}
              </button>
            </li>
          )}
        </ul>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (webUrl) onWeb(webUrl);
          }}
        >
          <input
            value={web}
            placeholder="https://…"
            aria-label={t('links.web')}
            onChange={(e) => setWeb(e.target.value)}
          />
          <button type="submit" disabled={!webUrl}>
            {t('links.webAction')}
          </button>
        </form>
        <button type="button" onClick={onClose}>
          {t('statusPanel.close')}
        </button>
      </div>
    </div>
  );
}
