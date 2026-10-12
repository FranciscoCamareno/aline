import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  title: string;
  onRename: (title: string) => Promise<void>;
  className?: string;
  /** Si se indica, el texto del título abre el documento. */
  onOpen?: () => void;
  /** Prefijo para identificar los controles en pruebas. */
  testId: string;
}

/** Título editable en línea. Renombrar conserva el UUID (diseño §5.1). */
export function RenameableTitle({ title, onRename, className, onOpen, testId }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (draft === null) {
    return (
      <span className={`renameable ${className ?? ''}`}>
        {onOpen ? (
          <button
            type="button"
            className="renameable-text link-button"
            data-testid={`${testId}-text`}
            onClick={onOpen}
          >
            {title}
          </button>
        ) : (
          <span className="renameable-text" data-testid={`${testId}-text`}>
            {title}
          </span>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label={`${t('library.rename')}: ${title}`}
          title={t('title.edit')}
          data-testid={`${testId}-rename`}
          onClick={() => setDraft(title)}
        >
          ✎
        </button>
      </span>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next = draft.trim();
    if (!next || next === title) {
      setDraft(null);
      return;
    }
    setBusy(true);
    try {
      await onRename(next);
      setDraft(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`renameable editing ${className ?? ''}`} onSubmit={(e) => void submit(e)}>
      <input
        autoFocus
        value={draft}
        disabled={busy}
        aria-label={t('title.edit')}
        data-testid={`${testId}-input`}
        maxLength={300}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setDraft(null);
        }}
      />
      <button type="submit" disabled={busy} aria-label={t('title.save')}>
        ✓
      </button>
      <button type="button" onClick={() => setDraft(null)} aria-label={t('title.cancel')}>
        ✕
      </button>
    </form>
  );
}
