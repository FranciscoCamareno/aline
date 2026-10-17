import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import { KindIcon } from '../../app/ui/Icon.tsx';
import { normalizeForSearch } from '../../application/searchIndex.ts';
import type { VaultService } from '../../application/VaultService.ts';
import type { CalendarEvent } from '../../domain/calendar.ts';
import { internalLink } from '../../domain/links.ts';
import { isLinkableKind, type DocumentRecord } from '../../domain/revision.ts';

/** Destino elegido: el enlace interno y un título para usarlo como texto si no hay selección. */
export interface LinkPick {
  url: string;
  title: string;
}

interface Props {
  /** Título del diálogo: «Vincular elemento» en el lienzo, «Enlazar selección» en el texto. */
  title: string;
  /** Documento desde el que se enlaza (no se ofrece como destino). */
  sourceId: string;
  service: VaultService;
  currentLink?: string | null;
  onPick: (pick: LinkPick) => void;
  /** FA-03a: el destino no existe y se crea en el momento. */
  onCreateNote: (title: string) => void;
  onWeb: (url: string) => void;
  onRemove?: () => void;
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

/**
 * Selector de destino de un enlace (RF-20, FP-03): cualquier nota, lienzo, documento o
 * calendario, y dentro de un calendario, uno de sus eventos.
 */
export function LinkPicker({
  title,
  sourceId,
  service,
  currentLink = null,
  onPick,
  onCreateNote,
  onWeb,
  onRemove,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const copied = useUiStore((s) => s.copiedLink);
  const [query, setQuery] = useState('');
  const [web, setWeb] = useState('');
  /** Calendario elegido: se ofrecen sus eventos. */
  const [calendar, setCalendar] = useState<DocumentRecord | null>(null);

  const candidates = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    return (
      documents
        // Lo archivado no se ofrece (se sigue pudiendo enlazar con «Enlazar con lo copiado»).
        .filter((d) => !d.deleted && !d.archived && isLinkableKind(d.kind) && d.id !== sourceId)
        .filter((d) => !q || normalizeForSearch(d.title).includes(q))
        .slice(0, 30)
    );
  }, [documents, query, sourceId]);
  const webUrl = validWebUrl(web);

  const pickDocument = (doc: DocumentRecord) => {
    if (doc.kind === 'calendar') {
      setCalendar(doc);
      setQuery('');
    } else {
      onPick({ url: internalLink(doc.id), title: doc.title });
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="link-picker"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2>{title}</h2>
        {currentLink && (
          <p className="muted small">
            {t('links.current')} <span className="mono">{currentLink}</span>{' '}
            {onRemove && (
              <button type="button" onClick={onRemove} data-testid="link-remove">
                {t('links.remove')}
              </button>
            )}
          </p>
        )}
        {calendar ? (
          <EventStep
            calendar={calendar}
            service={service}
            onPick={onPick}
            onBack={() => setCalendar(null)}
          />
        ) : (
          <>
            <input
              autoFocus
              value={query}
              placeholder={t('links.searchPlaceholder')}
              aria-label={t('links.searchPlaceholder')}
              data-testid="link-search"
              onChange={(e) => setQuery(e.target.value)}
            />
            <ul className="picker-list">
              {copied && !query.trim() && (
                <li>
                  <button
                    type="button"
                    className="link-button"
                    data-testid="link-copied"
                    onClick={() => onPick({ url: copied.url, title: copied.label })}
                  >
                    {t('links.useCopied', { label: copied.label, title: copied.documentTitle })}
                  </button>
                </li>
              )}
              {candidates.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className="link-button"
                    data-testid="link-candidate"
                    onClick={() => pickDocument(d)}
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
          </>
        )}
        <button type="button" onClick={onClose}>
          {t('statusPanel.close')}
        </button>
      </div>
    </div>
  );
}

/** Segundo paso con un calendario: el calendario entero o uno de sus eventos. */
function EventStep({
  calendar,
  service,
  onPick,
  onBack,
}: {
  calendar: DocumentRecord;
  service: VaultService;
  onPick: (pick: LinkPick) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    service.openCalendar(calendar.id).then(
      (opened) =>
        !cancelled &&
        setEvents(
          [...opened.calendar.events].sort((a, b) =>
            `${a.date}${a.start ?? ''}`.localeCompare(`${b.date}${b.start ?? ''}`),
          ),
        ),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [calendar.id, service]);

  const q = normalizeForSearch(query.trim());
  const shown = (events ?? [])
    .filter((e) => !q || normalizeForSearch(e.title).includes(q))
    .slice(0, 50);

  return (
    <>
      <p className="picker-step">
        <button type="button" onClick={onBack} data-testid="link-back">
          {t('links.back')}
        </button>{' '}
        <strong>{calendar.title}</strong>
      </p>
      <input
        autoFocus
        value={query}
        placeholder={t('links.searchEvents')}
        aria-label={t('links.searchEvents')}
        data-testid="link-event-search"
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="picker-list" aria-busy={events === null && !failed}>
        <li>
          <button
            type="button"
            className="link-button"
            data-testid="link-whole-calendar"
            onClick={() => onPick({ url: internalLink(calendar.id), title: calendar.title })}
          >
            <KindIcon kind="calendar" /> {t('links.wholeCalendar')}
          </button>
        </li>
        {shown.map((event) => (
          <li key={event.id}>
            <button
              type="button"
              className="link-button"
              data-testid="link-event"
              onClick={() =>
                onPick({
                  url: internalLink(calendar.id, { eventId: event.id }),
                  title: event.title || t('calendar.untitled'),
                })
              }
            >
              <span className="mono">{event.date}</span> {event.title || t('calendar.untitled')}
            </button>
          </li>
        ))}
      </ul>
      {failed && <p className="muted small">{t('links.eventsError')}</p>}
      {events?.length === 0 && <p className="muted small">{t('links.noEvents')}</p>}
    </>
  );
}
