import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../app/ui/Icon.tsx';

interface Props {
  title: string;
  onRename: (title: string) => Promise<void>;
  className?: string;
  /** Si se indica, el texto del título abre el documento. */
  onOpen?: () => void;
  /** Prefijo para identificar los controles en pruebas. */
  testId: string;
  /** Sin botón propio de renombrar: lo ofrece otro control (el menú «⋯» de la fila). */
  showRenameButton?: boolean;
  /** Cada valor nuevo distinto de 0 abre la edición del título. */
  editRequest?: number;
}

/** Título editable en línea. Renombrar conserva el UUID (diseño §5.1). */
export function RenameableTitle({
  title,
  onRename,
  className,
  onOpen,
  testId,
  showRenameButton = true,
  editRequest = 0,
}: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Abrir la edición cuando la pide otro control: sincroniza con una orden externa.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (editRequest) setDraft(title);
    // Solo cuenta la petición; el título vigente se toma en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest]);

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
        {showRenameButton && (
          <button
            type="button"
            className="icon-button"
            aria-label={`${t('library.rename')}: ${title}`}
            title={t('title.edit')}
            data-testid={`${testId}-rename`}
            onClick={() => setDraft(title)}
          >
            <Icon name="editar" size={16} />
          </button>
        )}
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
        name="title"
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
      <button type="submit" className="icon-button" disabled={busy} aria-label={t('title.save')}>
        <Icon name="check" size={18} />
      </button>
      <button
        type="button"
        className="icon-button"
        onClick={() => setDraft(null)}
        aria-label={t('title.cancel')}
      >
        <Icon name="cerrar" size={18} />
      </button>
    </form>
  );
}
