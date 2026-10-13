import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import { effectiveFolder, RECOVERY_FOLDER } from '../../domain/folders.ts';
import type { DocumentKind, DocumentRecord } from '../../domain/revision.ts';
import { hasConflict } from '../../domain/revision.ts';
import { tagKey } from '../../domain/tags.ts';
import { RenameableTitle } from './RenameableTitle.tsx';

interface Props {
  onCreate: (kind: DocumentKind, folderId: string | null) => Promise<void>;
  onCreateFolder: (title: string, parentId: string | null) => Promise<void>;
  onRename: (documentId: string, title: string) => Promise<void>;
  onTrash: (documentId: string) => Promise<void>;
  onRestoreFromTrash: (documentId: string) => Promise<void>;
  onPurge: (documentId: string) => Promise<void>;
  /** RF-34, RF-35: archivos sueltos o una carpeta, dentro de la carpeta seleccionada. */
  onImport: (files: File[], folderId: string | null) => Promise<void>;
  /** RF-35: notas de la carpeta seleccionada (o de todo el almacén) en un ZIP de Markdown. */
  onExportMarkdown: (folderId: string | null) => Promise<void>;
}

const RECENT_COUNT = 5;

/**
 * Biblioteca (diseño §4.1, RF-25): carpetas, etiquetas, recientes y papelera. Las carpetas no
 * borran en cascada: lo que apunta a una carpeta retirada aparece en «Recuperación».
 */
export function LibrarySidebar({
  onCreate,
  onCreateFolder,
  onRename,
  onTrash,
  onRestoreFromTrash,
  onPurge,
  onImport,
  onExportMarkdown,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const activeId = useUiStore((s) => s.activeId);
  const setActiveDocument = useUiStore((s) => s.setActive);
  const toggleLibrary = useUiStore((s) => s.toggleLibrary);
  /** En pantallas estrechas la biblioteca tapa el lienzo: abrir un documento la cierra. */
  const closeIfNarrow = () => {
    if (window.matchMedia('(max-width: 820px)').matches) toggleLibrary();
  };
  const setActive = (id: string) => {
    setActiveDocument(id);
    closeIfNarrow();
  };
  const create = (kind: DocumentKind) => void onCreate(kind, selected).then(closeIfNarrow);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);

  const live = useMemo(() => documents.filter((d) => !d.deleted), [documents]);
  const folders = useMemo(
    () => new Map(documents.filter((d) => d.kind === 'folder').map((d) => [d.id, d])),
    [documents],
  );
  const content = useMemo(() => live.filter((d) => d.kind !== 'folder'), [live]);
  const trashed = documents.filter((d) => d.deleted);
  const recent = content.slice(0, RECENT_COUNT);

  const tags = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const d of content)
      for (const tag of d.tags) if (!byKey.has(tagKey(tag))) byKey.set(tagKey(tag), tag);
    return [...byKey].sort((a, b) => a[1].localeCompare(b[1]));
  }, [content]);

  const childrenOf = (parent: string | null) => ({
    folders: live
      .filter((d) => d.kind === 'folder' && effectiveFolder(d, folders) === parent)
      .sort((a, b) => a.title.localeCompare(b.title)),
    docs: content.filter((d) => effectiveFolder(d, folders) === parent),
  });
  const recovery = content.filter((d) => effectiveFolder(d, folders) === RECOVERY_FOLDER);
  const selected =
    selectedFolder && folders.get(selectedFolder) && !folders.get(selectedFolder)!.deleted
      ? selectedFolder
      : null;

  const kindIcon = (kind: DocumentRecord['kind']) => (
    <span
      className="kind-icon"
      role="img"
      aria-label={
        kind === 'canvas'
          ? t('library.kindCanvas')
          : kind === 'note'
            ? t('library.kindNote')
            : t('library.kindFolder')
      }
    >
      {kind === 'canvas' ? '◇' : kind === 'note' ? '¶' : '▸'}
    </span>
  );

  const docItem = (doc: DocumentRecord, depth: number) => (
    <li
      key={doc.id}
      className={doc.id === activeId ? 'active' : ''}
      data-testid="library-item"
      data-document-id={doc.id}
      style={{ paddingLeft: 6 + depth * 14 }}
    >
      {kindIcon(doc.kind)}
      <RenameableTitle
        title={doc.title}
        testId="library-title"
        onOpen={() => setActive(doc.id)}
        onRename={(title) => onRename(doc.id, title)}
      />
      {hasConflict(doc) && <span className="badge">{t('library.conflict')}</span>}
      <button
        type="button"
        className="icon-button"
        aria-label={`${t('library.trash')}: ${doc.title}`}
        title={t('library.trash')}
        data-testid="library-trash"
        onClick={() => void onTrash(doc.id)}
      >
        🗑
      </button>
    </li>
  );

  const folderItem = (folder: DocumentRecord, depth: number): ReactNode => {
    const open = expanded.has(folder.id);
    const { folders: subFolders, docs } = childrenOf(folder.id);
    return (
      <li
        key={folder.id}
        className="folder-node"
        data-testid="folder-item"
        data-folder-id={folder.id}
      >
        <div
          className={`folder-row ${selected === folder.id ? 'selected' : ''}`}
          style={{ paddingLeft: 6 + depth * 14 }}
        >
          <button
            type="button"
            className="icon-button folder-toggle"
            aria-expanded={open}
            aria-label={`${open ? t('library.collapse') : t('library.expand')}: ${folder.title}`}
            onClick={() =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (open) next.delete(folder.id);
                else next.add(folder.id);
                return next;
              })
            }
          >
            {open ? '▾' : '▸'}
          </button>
          <RenameableTitle
            title={folder.title}
            testId="folder-title"
            onOpen={() => {
              setSelectedFolder(selected === folder.id ? null : folder.id);
              setExpanded((prev) => new Set(prev).add(folder.id));
            }}
            onRename={(title) => onRename(folder.id, title)}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`${t('library.trashFolder')}: ${folder.title}`}
            title={t('library.trashFolder')}
            data-testid="folder-trash"
            onClick={() => void onTrash(folder.id)}
          >
            🗑
          </button>
        </div>
        {open && (
          <ul className="library-list nested">
            {subFolders.map((f) => folderItem(f, depth + 1))}
            {docs.map((d) => docItem(d, depth + 1))}
            {!subFolders.length && !docs.length && (
              <li className="muted" style={{ paddingLeft: 20 + depth * 14 }}>
                {t('library.folderEmpty')}
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  const root = childrenOf(null);
  const filtered = tagFilter
    ? content.filter((d) => d.tags.some((tag) => tagKey(tag) === tagFilter))
    : null;

  return (
    <nav
      className="library"
      aria-label={t('library.title')}
      // Deslizar hacia la izquierda con el dedo cierra el panel (uso táctil, plan 5.4).
      onPointerDown={(e) => {
        swipe.current = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY } : null;
      }}
      onPointerUp={(e) => {
        const start = swipe.current;
        swipe.current = null;
        if (!start) return;
        const dx = e.clientX - start.x;
        if (dx < -60 && Math.abs(dx) > Math.abs(e.clientY - start.y) * 1.5) toggleLibrary();
      }}
    >
      <h2>{t('library.title')}</h2>
      <div className="library-actions">
        <button type="button" data-testid="new-canvas" onClick={() => create('canvas')}>
          + {t('library.newCanvas')}
        </button>
        <button type="button" data-testid="new-note" onClick={() => create('note')}>
          + {t('library.newNote')}
        </button>
        {newFolder === null ? (
          <button type="button" data-testid="new-folder" onClick={() => setNewFolder('')}>
            + {t('library.newFolder')}
          </button>
        ) : (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const title = newFolder.trim();
              setNewFolder(null);
              if (title) void onCreateFolder(title, selected);
            }}
          >
            <input
              autoFocus
              value={newFolder}
              placeholder={t('library.folderName')}
              aria-label={t('library.folderName')}
              data-testid="new-folder-input"
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setNewFolder(null)}
            />
            <button type="submit">✓</button>
          </form>
        )}
        <details className="library-more">
          <summary>{t('library.importExport')}</summary>
          <button
            type="button"
            data-testid="import-files"
            onClick={() => fileInput.current?.click()}
          >
            {t('import.files')}
          </button>
          <button
            type="button"
            data-testid="import-folder"
            onClick={() => folderInput.current?.click()}
          >
            {t('import.folder')}
          </button>
          <button
            type="button"
            data-testid="export-markdown"
            onClick={() => void onExportMarkdown(selected)}
          >
            {selected
              ? t('export.markdownFolder', { folder: folders.get(selected)?.title })
              : t('export.markdownAll')}
          </button>
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept=".md,.markdown,.txt,.excalidraw,.json,text/markdown,text/plain,application/json"
            data-testid="import-files-input"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) void onImport(files, selected);
            }}
          />
          <input
            ref={folderInput}
            type="file"
            hidden
            multiple
            {...{ webkitdirectory: '' }}
            data-testid="import-folder-input"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) void onImport(files, selected);
            }}
          />
        </details>
        {selected && (
          <p className="muted small" data-testid="selected-folder">
            {t('library.createInside', { folder: folders.get(selected)?.title })}
          </p>
        )}
      </div>

      {tags.length > 0 && (
        <div className="tag-filter" role="group" aria-label={t('library.tags')}>
          {tags.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`chip ${tagFilter === key ? 'selected' : ''}`}
              aria-pressed={tagFilter === key}
              data-testid="tag-chip"
              onClick={() => setTagFilter(tagFilter === key ? null : key)}
            >
              #{label}
            </button>
          ))}
        </div>
      )}

      {filtered ? (
        <section>
          <h3 className="section-title">
            {t('library.filteredBy', { tag: tags.find(([k]) => k === tagFilter)?.[1] })}
          </h3>
          <ul className="library-list" data-testid="tag-results">
            {filtered.map((d) => docItem(d, 0))}
          </ul>
        </section>
      ) : (
        <>
          {recent.length > 0 && (
            <section>
              <button
                type="button"
                className="link-button section-title"
                aria-expanded={recentOpen}
                onClick={() => setRecentOpen((v) => !v)}
              >
                {t('library.recent')}
              </button>
              {recentOpen && (
                <ul className="library-list recent-list" data-testid="recent-list">
                  {recent.map((d) => (
                    <li key={d.id} className={d.id === activeId ? 'active' : ''}>
                      {kindIcon(d.kind)}
                      <button
                        type="button"
                        className="renameable-text link-button"
                        onClick={() => setActive(d.id)}
                      >
                        {d.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <h3 className="section-title">{t('library.all')}</h3>
          {root.folders.length === 0 && root.docs.length === 0 && recovery.length === 0 ? (
            <p className="muted">{t('library.empty')}</p>
          ) : (
            <ul className="library-list" data-testid="library-list">
              {root.folders.map((f) => folderItem(f, 0))}
              {root.docs.map((d) => docItem(d, 0))}
            </ul>
          )}
          {recovery.length > 0 && (
            <section>
              <h3 className="section-title" title={t('library.recoveryHint')}>
                {t('library.recovery')}
              </h3>
              <ul className="library-list" data-testid="recovery-list">
                {recovery.map((d) => docItem(d, 0))}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="trash">
        <button
          type="button"
          className="link-button"
          aria-expanded={trashOpen}
          data-testid="trash-toggle"
          onClick={() => setTrashOpen((v) => !v)}
        >
          {t('library.trashTitle', { count: trashed.length })}
        </button>
        {trashOpen && (
          <ul className="library-list trash-list" data-testid="trash-list">
            {trashed.length === 0 && <li className="muted">{t('library.trashEmpty')}</li>}
            {trashed.map((doc) => (
              <li key={doc.id} data-testid="trash-item" data-document-id={doc.id}>
                {kindIcon(doc.kind)}
                <span className="renameable-text">{doc.title}</span>
                <button
                  type="button"
                  data-testid="trash-restore"
                  onClick={() => void onRestoreFromTrash(doc.id)}
                >
                  {t('library.restore')}
                </button>
                <button
                  type="button"
                  className="danger"
                  data-testid="trash-purge"
                  onClick={() => {
                    if (window.confirm(t('library.purgeConfirm', { title: doc.title }))) {
                      void onPurge(doc.id);
                    }
                  }}
                >
                  {t('library.purge')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}
