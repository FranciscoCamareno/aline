import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import type { KnowledgeService } from '../../application/KnowledgeService.ts';
import type { VaultService } from '../../application/VaultService.ts';
import { resolveAnchor } from '../../domain/anchors.ts';
import type { CalendarEvent } from '../../domain/calendar.ts';
import type { InternalTarget } from '../../domain/links.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import { CanvasPreview, useCanvasSnapshot } from '../canvas/CanvasPreview.tsx';

/** Caracteres del extracto alrededor del fragmento enlazado, o desde el principio. */
const AROUND = 90;
const EXCERPT = 260;

/**
 * Vista previa del destino de un enlace (plan 10.5): nunca pide nada a la red (diseño §13). Una
 * dirección web se muestra tal cual; lo interno, con lo que ya hay en el almacén y en el índice.
 */
export function LinkPreview({
  href,
  target,
  document,
  service,
  knowledge,
}: {
  href: string;
  /** Enlace interno ya analizado, o null si es una dirección web. */
  target: InternalTarget | null;
  /** Documento de destino, si existe y no está en la papelera. */
  document: DocumentRecord | null;
  service: VaultService;
  knowledge: KnowledgeService;
}) {
  const { t } = useTranslation();
  if (!target) {
    return (
      <div className="link-preview" data-testid="link-preview">
        <p className="mono small link-preview-url">{href}</p>
        <p className="muted small">{t('links.preview.web')}</p>
      </div>
    );
  }
  if (!document) {
    return (
      <div className="link-preview" data-testid="link-preview">
        <p className="muted small">{t('links.preview.missing')}</p>
      </div>
    );
  }
  return (
    <div className="link-preview" data-testid="link-preview">
      {document.kind === 'canvas' ? (
        <CanvasLinkPreview document={document} elementId={target.elementId} service={service} />
      ) : document.kind === 'calendar' ? (
        <CalendarLinkPreview document={document} eventId={target.eventId} service={service} />
      ) : (
        <TextLinkPreview document={document} target={target} knowledge={knowledge} />
      )}
    </div>
  );
}

function CanvasLinkPreview({
  document,
  elementId,
  service,
}: {
  document: DocumentRecord;
  elementId: string | null;
  service: VaultService;
}) {
  const { t } = useTranslation();
  const snapshot = useCanvasSnapshot(document.id, service);
  if (snapshot === 'error') return <p className="muted small">{t('links.canvasError')}</p>;
  if (!snapshot) return <p className="muted small">{t('links.preview.loading')}</p>;
  const lost = elementId !== null && !snapshot.elements.some((e) => e.id === elementId);
  return (
    <>
      <CanvasPreview snapshot={snapshot} highlight={elementId} className="link-preview-canvas" />
      {lost && <p className="muted small">{t('links.preview.elementLost')}</p>}
    </>
  );
}

function CalendarLinkPreview({
  document,
  eventId,
  service,
}: {
  document: DocumentRecord;
  eventId: string | null;
  service: VaultService;
}) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<CalendarEvent[] | 'error' | null>(null);
  useEffect(() => {
    let cancelled = false;
    service.readCalendar(document.id).then(
      (data) => !cancelled && setEvents(data.events),
      () => !cancelled && setEvents('error'),
    );
    return () => {
      cancelled = true;
    };
  }, [document.id, service]);
  if (events === 'error') return <p className="muted small">{t('links.eventsError')}</p>;
  if (!events) return <p className="muted small">{t('links.preview.loading')}</p>;
  if (!eventId) {
    return <p className="small">{t('links.preview.events', { count: events.length })}</p>;
  }
  const event = events.find((e) => e.id === eventId);
  if (!event) return <p className="muted small">{t('links.preview.eventLost')}</p>;
  const days = event.endDate !== event.date ? `${event.date} – ${event.endDate}` : event.date;
  const hours = event.start ? ` · ${event.start}${event.end ? `–${event.end}` : ''}` : '';
  return (
    <p className="small">
      <strong>{event.title || t('calendar.untitled')}</strong>
      <br />
      <span className="mono">
        {days}
        {hours}
      </span>
    </p>
  );
}

function TextLinkPreview({
  document,
  target,
  knowledge,
}: {
  document: DocumentRecord;
  target: InternalTarget;
  knowledge: KnowledgeService;
}) {
  const { t } = useTranslation();
  const [excerpt, setExcerpt] = useState<{ before: string; mark: string; after: string } | null>(
    null,
  );
  const [state, setState] = useState<'loading' | 'ready' | 'none'>('loading');
  // El índice puede ir un paso por detrás del destino: se vuelve a leer cuando cambia.
  const version = useUiStore((s) => s.knowledgeVersion);
  useEffect(() => {
    let cancelled = false;
    void knowledge.searchDocument(document.id).then((search) => {
      if (cancelled) return;
      if (!search || !search.text.trim()) {
        setState('none');
        return;
      }
      const { text } = search;
      const found = resolveAnchor(
        { text, blocks: search.blocks ?? [], segments: [] },
        { blockId: target.blockId, text: target.text },
      );
      if (found && found.status !== 'lost') {
        const from = Math.max(0, found.from - AROUND);
        const to = Math.min(text.length, found.to + AROUND);
        setExcerpt({
          before: (from > 0 ? '…' : '') + text.slice(from, found.from),
          mark: text.slice(found.from, found.to),
          after: text.slice(found.to, to) + (to < text.length ? '…' : ''),
        });
      } else {
        const start = text.slice(0, EXCERPT);
        setExcerpt({ before: start + (text.length > EXCERPT ? '…' : ''), mark: '', after: '' });
      }
      setState('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [document.id, knowledge, target.blockId, target.text, version]);
  if (state === 'loading') return <p className="muted small">{t('links.preview.loading')}</p>;
  if (state === 'none' || !excerpt)
    return <p className="muted small">{t('links.preview.empty')}</p>;
  return (
    <p className="small link-preview-text" data-testid="link-preview-text">
      {excerpt.before}
      {excerpt.mark && <mark>{excerpt.mark}</mark>}
      {excerpt.after}
    </p>
  );
}
