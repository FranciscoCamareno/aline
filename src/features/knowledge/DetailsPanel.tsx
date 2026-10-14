import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore, type FocusTarget } from '../../app/store.ts';
import { Icon, KindIcon } from '../../app/ui/Icon.tsx';
import type { KnowledgeService, ResolvedLink } from '../../application/KnowledgeService.ts';
import { folderPath, wouldCreateCycle } from '../../domain/folders.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import { tagKey } from '../../domain/tags.ts';

interface Props {
  document: DocumentRecord;
  knowledge: KnowledgeService;
  onMove: (folderId: string | null) => Promise<void>;
  onSetTags: (tags: string[]) => Promise<void>;
  onClose: () => void;
}

/**
 * Detalles del documento (diseño §4.1, panel derecho): carpeta, etiquetas, backlinks (RF-22),
 * enlaces salientes y enlaces rotos del almacén (RF-24). Los backlinks no se editan (RN-10).
 */
export function DetailsPanel({ document, knowledge, onMove, onSetTags, onClose }: Props) {
  const { t } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const version = useUiStore((s) => s.knowledgeVersion);
  const navigate = useUiStore((s) => s.navigate);
  const [backlinks, setBacklinks] = useState<ResolvedLink[]>([]);
  const [outgoing, setOutgoing] = useState<ResolvedLink[]>([]);
  const [broken, setBroken] = useState<ResolvedLink[]>([]);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      knowledge.backlinks(document.id),
      knowledge.outgoing(document.id),
      knowledge.brokenLinks(),
    ]).then(([b, o, r]) => {
      if (cancelled) return;
      setBacklinks(b);
      setOutgoing(o);
      setBroken(r);
    });
    return () => {
      cancelled = true;
    };
  }, [knowledge, document.id, document.updatedAt, version, documents]);

  const folders = useMemo(
    () => new Map(documents.filter((d) => d.kind === 'folder' && !d.deleted).map((d) => [d.id, d])),
    [documents],
  );
  const folderOptions = [...folders.values()]
    .filter((f) => !(document.kind === 'folder' && wouldCreateCycle(documents, document.id, f.id)))
    .map((f) => ({ id: f.id, label: [...folderPath(f.folderId, folders), f.title].join(' / ') }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const goToSource = (r: ResolvedLink) => {
    if (!r.source) return;
    const focus: FocusTarget = {
      documentId: r.source.id,
      elementId: r.link.sourceElementId,
      text: r.source.kind === 'note' ? r.link.label : null,
    };
    navigate(focus);
  };

  const addTag = () => {
    const tag = newTag.trim();
    setNewTag('');
    if (!tag || document.tags.some((x) => tagKey(x) === tagKey(tag))) return;
    void onSetTags([...document.tags, tag]);
  };

  const status = (r: ResolvedLink) =>
    r.status === 'ok' ? '' : ` · ${t(`links.status.${r.status}`)}`;

  return (
    <aside className="side-panel" aria-label={t('details.title')} data-testid="details-panel">
      <header>
        <h2>{t('details.title')}</h2>
        <button type="button" onClick={onClose}>
          {t('statusPanel.close')}
        </button>
      </header>

      <section>
        <h3>{t('details.folder')}</h3>
        <select
          value={document.folderId && folders.has(document.folderId) ? document.folderId : ''}
          aria-label={t('details.folder')}
          data-testid="move-folder"
          onChange={(e) => void onMove(e.target.value || null)}
        >
          <option value="">{t('details.root')}</option>
          {folderOptions.map((f) => (
            <option key={f.id} value={f.id} disabled={f.id === document.id}>
              {f.label}
            </option>
          ))}
        </select>
      </section>

      {document.kind !== 'folder' && (
        <section>
          <h3>{t('details.tags')}</h3>
          <div className="tag-filter" data-testid="tag-list">
            {document.tags.map((tag) => (
              <span key={tag} className="chip">
                #{tag}
                <button
                  type="button"
                  className="chip-remove"
                  aria-label={t('details.removeTag', { tag })}
                  onClick={() => void onSetTags(document.tags.filter((x) => x !== tag))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              addTag();
            }}
          >
            <input
              value={newTag}
              placeholder={t('details.addTag')}
              aria-label={t('details.addTag')}
              data-testid="tag-input"
              maxLength={60}
              onChange={(e) => setNewTag(e.target.value)}
            />
            <button type="submit" disabled={!newTag.trim()}>
              +
            </button>
          </form>
        </section>
      )}

      {document.kind !== 'folder' && (
        <>
          <section>
            <h3>{t('details.backlinks', { count: backlinks.length })}</h3>
            {backlinks.length === 0 && <p className="muted">{t('details.noBacklinks')}</p>}
            <ul className="link-list-panel" data-testid="backlinks">
              {backlinks.map((r, i) => (
                <li key={i}>
                  <button type="button" className="link-button" onClick={() => goToSource(r)}>
                    {r.source && <KindIcon kind={r.source.kind} />} {r.source?.title}
                    {r.link.label ? <span className="muted"> — {r.link.label}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>{t('details.outgoing', { count: outgoing.length })}</h3>
            <ul className="link-list-panel" data-testid="outgoing-links">
              {outgoing.map((r, i) => (
                <li key={i} className={r.status === 'ok' ? '' : 'broken'}>
                  {r.target && r.status === 'ok' ? (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        navigate({ documentId: r.target!.id, elementId: r.link.targetElementId })
                      }
                    >
                      <Icon name="enlace" size={16} /> {r.target.title}
                    </button>
                  ) : (
                    <span>
                      <Icon name="enlace" size={16} /> {r.link.label || r.target?.title || '?'}
                      {status(r)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section>
        <h3>{t('details.broken', { count: broken.length })}</h3>
        {broken.length === 0 && <p className="muted">{t('details.noBroken')}</p>}
        <ul className="link-list-panel" data-testid="broken-links">
          {broken.map((r, i) => (
            <li key={i} className="broken">
              <button type="button" className="link-button" onClick={() => goToSource(r)}>
                {r.source?.title}: {r.link.label || '?'}
                {status(r)}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
