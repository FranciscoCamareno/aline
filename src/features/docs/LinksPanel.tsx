import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { linkFocus, useUiStore } from '../../app/store.ts';
import { Icon, KindIcon } from '../../app/ui/Icon.tsx';
import type { KnowledgeService, LinkStatus } from '../../application/KnowledgeService.ts';
import type { VaultService } from '../../application/VaultService.ts';
import { internalLink, parseInternalLink, type InternalTarget } from '../../domain/links.ts';
import { LinkPreview } from '../knowledge/LinkPreview.tsx';

/** Un enlace del documento: dónde está (pestaña y orden dentro de ella) y a dónde lleva. */
export interface PanelLink {
  href: string;
  text: string;
  /** Pestaña del documento con formato (título ya listo para mostrar); null en los Markdown. */
  tab: { id: string; title: string } | null;
  /** Posición entre los enlaces de su pestaña (para seleccionarlo al ir al texto). */
  index: number;
}

/** Forma única de un enlace interno, para casarlo con lo que tiene el índice. */
function canonical(target: InternalTarget): string {
  return internalLink(target.documentId, target);
}

/**
 * Enlaces del documento (plan 10.5): cada uno con su texto, el destino y su estado, «Ir al texto»
 * (lo selecciona en el editor) y abrir el destino; al pasar o enfocar uno se ve una vista previa
 * del destino. La lista sigue al documento abierto; el estado de las anclas sale del índice.
 */
export function LinksPanel({
  documentId,
  links,
  service,
  knowledge,
  onGoToText,
  onClose,
}: {
  documentId: string;
  links: PanelLink[];
  service: VaultService;
  knowledge: KnowledgeService;
  onGoToText: (link: PanelLink) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const version = useUiStore((s) => s.knowledgeVersion);
  const navigate = useUiStore((s) => s.navigate);
  const [indexed, setIndexed] = useState<Map<string, LinkStatus>>(new Map());
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void knowledge.outgoing(documentId).then((resolved) => {
      if (cancelled) return;
      const statuses = new Map<string, LinkStatus>();
      for (const r of resolved) {
        const { link } = r;
        if (!link.targetDocumentId) continue;
        statuses.set(
          canonical({
            documentId: link.targetDocumentId,
            elementId: link.targetElementId,
            blockId: link.targetBlockId ?? null,
            eventId: link.targetEventId ?? null,
            text: link.targetQuote ?? null,
          }),
          r.status,
        );
      }
      setIndexed(statuses);
    });
    return () => {
      cancelled = true;
    };
  }, [knowledge, documentId, version]);

  const rows = useMemo(
    () =>
      links.map((link) => {
        const target = parseInternalLink(link.href);
        const document = target ? (documents.find((d) => d.id === target.documentId) ?? null) : null;
        let status: LinkStatus | 'web' = 'web';
        if (target) {
          status = !document
            ? 'missing'
            : document.deleted
              ? 'trashed'
              : (indexed.get(canonical(target)) ?? 'ok');
        }
        return { link, target, document: document && !document.deleted ? document : null, status };
      }),
    [links, documents, indexed],
  );

  const open = (row: (typeof rows)[number]) => {
    if (row.target) {
      if (row.document) navigate(linkFocus(row.target));
    } else if (/^https?:/i.test(row.link.href)) {
      window.open(row.link.href, '_blank', 'noopener,noreferrer');
    }
  };

  const multipleTabs = new Set(links.map((l) => l.tab?.id)).size > 1;

  return (
    <aside className="doc-links" aria-label={t('docs.links')} data-testid="doc-links-panel">
      <header>
        <h2>{t('docs.linksCount', { count: links.length })}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('docs.linksClose')}
          title={t('docs.linksClose')}
          onClick={onClose}
        >
          <Icon name="cerrar" size={16} />
        </button>
      </header>
      {links.length === 0 && <p className="muted small">{t('docs.linksEmpty')}</p>}
      <ul className="doc-links-list" role="list">
        {rows.map((row, i) => {
          const previous = rows[i - 1];
          const tabHeading =
            multipleTabs && row.link.tab && previous?.link.tab?.id !== row.link.tab.id;
          return (
            <li
              key={i}
              className="doc-links-item"
              data-testid="doc-link-item"
              onMouseEnter={() => setPreview(i)}
              onFocus={() => setPreview(i)}
            >
              {tabHeading && (
                <p className="muted small doc-links-tab">{row.link.tab!.title}</p>
              )}
              <div className="doc-links-row">
                <button
                  type="button"
                  className="link-button doc-links-open"
                  data-testid="doc-link-open"
                  disabled={row.target !== null && row.document === null}
                  onClick={() => open(row)}
                >
                  {row.document ? (
                    <KindIcon kind={row.document.kind} />
                  ) : (
                    <Icon name={row.target ? 'aviso' : 'externo'} size={16} />
                  )}
                  <span className="doc-links-text">
                    <span className="doc-links-target">
                      {row.document?.title ?? (row.target ? t('links.status.missing') : row.link.href)}
                    </span>
                    <span className="muted small">
                      «{row.link.text.trim() || row.link.href}»
                      {row.status !== 'ok' && row.status !== 'web' && (
                        <span data-testid="doc-link-status"> · {t(`links.status.${row.status}`)}</span>
                      )}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t('docs.linksGoToText')}
                  title={t('docs.linksGoToText')}
                  data-testid="doc-link-go"
                  onClick={() => onGoToText(row.link)}
                >
                  <Icon name="cita" size={16} />
                </button>
              </div>
              {preview === i && (
                <LinkPreview
                  href={row.link.href}
                  target={row.target}
                  document={row.document}
                  service={service}
                  knowledge={knowledge}
                />
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
