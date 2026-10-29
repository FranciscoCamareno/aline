import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import { KindIcon } from '../../app/ui/Icon.tsx';
import type { KnowledgeService } from '../../application/KnowledgeService.ts';
import type { VaultService } from '../../application/VaultService.ts';
import { localDate, type CalendarEvent } from '../../domain/calendar.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import { CanvasPreview, useCanvasSnapshot } from '../canvas/CanvasPreview.tsx';

const EXCERPT = 180;
const UPCOMING = 3;

/** Pinta `children` solo cuando el elemento llega a verse (y ya no lo quita). */
function WhenVisible({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el || seen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen]);
  return (
    <div ref={host} className="home-thumb-body">
      {seen ? children : null}
    </div>
  );
}

/**
 * Miniatura de un elemento de Inicio (plan 11.3): el dibujo de un lienzo, las primeras líneas de
 * una nota o un documento (del texto indexado), los próximos eventos de un calendario o lo que
 * hay en una carpeta. Se carga al verse; nada sale a la red.
 */
export function HomeThumb({
  doc,
  service,
  knowledge,
}: {
  doc: DocumentRecord;
  service: VaultService;
  knowledge: KnowledgeService;
}) {
  return (
    <div className={`home-thumb home-thumb--${doc.kind}`} aria-hidden="true">
      <WhenVisible>
        {doc.kind === 'canvas' ? (
          // Con la fecha en la clave: un lienzo cambiado se vuelve a dibujar.
          <CanvasThumb key={doc.updatedAt} documentId={doc.id} service={service} />
        ) : doc.kind === 'calendar' ? (
          <CalendarThumb key={doc.updatedAt} documentId={doc.id} service={service} />
        ) : doc.kind === 'folder' || doc.kind === 'docfolder' ? (
          <FolderThumb doc={doc} />
        ) : (
          <TextThumb doc={doc} knowledge={knowledge} />
        )}
      </WhenVisible>
    </div>
  );
}

function CanvasThumb({ documentId, service }: { documentId: string; service: VaultService }) {
  const snapshot = useCanvasSnapshot(documentId, service);
  if (!snapshot || snapshot === 'error') return <KindIcon kind="canvas" size={32} />;
  return <CanvasPreview snapshot={snapshot} className="home-thumb-canvas" />;
}

function TextThumb({ doc, knowledge }: { doc: DocumentRecord; knowledge: KnowledgeService }) {
  const version = useUiStore((s) => s.knowledgeVersion);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void knowledge.searchDocument(doc.id).then((search) => {
      if (cancelled) return;
      let value = (search?.text ?? '').replace(/\s+/g, ' ').trim();
      // Sin el encabezado si repite el título (como las tarjetas de nota, plan 9.24).
      if (doc.title && value.startsWith(doc.title)) value = value.slice(doc.title.length).trim();
      setText(value.length > EXCERPT ? `${value.slice(0, EXCERPT)}…` : value);
    });
    return () => {
      cancelled = true;
    };
  }, [doc.id, doc.title, knowledge, version]);
  if (!text) return <KindIcon kind={doc.kind} size={32} />;
  return <p className="home-thumb-text">{text}</p>;
}

function CalendarThumb({ documentId, service }: { documentId: string; service: VaultService }) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const today = localDate(new Date());
    service.readCalendar(documentId).then(
      (data) =>
        !cancelled &&
        setEvents(
          data.events
            .filter((e) => e.endDate >= today)
            .sort((a, b) => `${a.date}${a.start ?? ''}`.localeCompare(`${b.date}${b.start ?? ''}`))
            .slice(0, UPCOMING),
        ),
      () => !cancelled && setEvents([]),
    );
    return () => {
      cancelled = true;
    };
  }, [documentId, service]);
  if (!events) return null;
  if (events.length === 0) return <p className="home-thumb-text muted">{t('home.noUpcoming')}</p>;
  return (
    <ul className="home-thumb-events">
      {events.map((e) => (
        <li key={e.id}>
          <span className="mono">{e.date.slice(5)}</span> {e.title || t('calendar.untitled')}
        </li>
      ))}
    </ul>
  );
}

function FolderThumb({ doc }: { doc: DocumentRecord }) {
  const { t } = useTranslation();
  const count = useUiStore(
    (s) => s.documents.filter((d) => d.folderId === doc.id && !d.deleted && !d.archived).length,
  );
  return (
    <span className="home-thumb-folder">
      <KindIcon kind={doc.kind} size={36} />
      <span className="muted small">{t('home.items', { count })}</span>
    </span>
  );
}
