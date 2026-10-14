import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type AppLanguage } from '../../app/i18n.ts';
import { useUiStore } from '../../app/store.ts';
import { setThemePreference, useTheme } from '../../app/theme.ts';
import { Icon, KindIcon } from '../../app/ui/Icon.tsx';
import { Menu } from '../../app/ui/Menu.tsx';
import { effectiveFolder, RECOVERY_FOLDER } from '../../domain/folders.ts';
import type { DocumentKind, DocumentRecord } from '../../domain/revision.ts';
import { hasConflict } from '../../domain/revision.ts';
import { tagKey } from '../../domain/tags.ts';
import { RenameableTitle } from './RenameableTitle.tsx';
import logoDark from '../../../brand/aline-logo-dark.svg?url';
import logoLight from '../../../brand/aline-logo.svg?url';

interface Props {
  onCreate: (kind: DocumentKind, folderId: string | null) => Promise<void>;
  onCreateFolder: (title: string, parentId: string | null) => Promise<void>;
  onRename: (documentId: string, title: string) => Promise<void>;
  onTrash: (documentId: string) => Promise<void>;
  onRestoreFromTrash: (documentId: string) => Promise<void>;
  onPurge: (documentId: string) => Promise<void>;
  /** RF-34, RF-35: archivos sueltos o una carpeta, dentro de la carpeta seleccionada. */
  onImport: (files: File[], folderId: string | null) => Promise<void>;
}

const RECENT_COUNT = 5;

/**
 * Biblioteca (diseño §4.1, RF-25): carpetas, etiquetas, recientes y papelera. Las carpetas no
 * borran en cascada: lo que apunta a una carpeta retirada aparece en «Recuperación».
 *
 * Estructura (DESIGN.md §6): logotipo y botón para plegarla; «Nuevo» como único botón principal,
 * con un desplegable (lienzo, nota, carpeta, importar); buscador de títulos; pestañas «Todos» y
 * «Recientes»; acciones de cada fila en su menú «⋯»; y, abajo, papelera, preferencias y ayuda.
 */
export function LibrarySidebar({
  onCreate,
  onCreateFolder,
  onRename,
  onTrash,
  onRestoreFromTrash,
  onPurge,
  onImport,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const { t, i18n } = useTranslation();
  const { theme, preference } = useTheme();
  const documents = useUiStore((s) => s.documents);
  const activeId = useUiStore((s) => s.activeId);
  const setActiveDocument = useUiStore((s) => s.setActive);
  const toggleLibrary = useUiStore((s) => s.toggleLibrary);
  const selectedFolder = useUiStore((s) => s.selectedFolder);
  const setSelectedFolder = useUiStore((s) => s.setSelectedFolder);
  const sendViewCommand = useUiStore((s) => s.sendViewCommand);
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
  const [tab, setTab] = useState<'all' | 'recent'>('all');
  const [query, setQuery] = useState('');
  const [trashOpen, setTrashOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  /** Fila cuyo título se está renombrando (desde su menú «⋯») y número de petición. */
  const [renaming, setRenaming] = useState<{ id: string; seq: number } | null>(null);

  const live = useMemo(() => documents.filter((d) => !d.deleted), [documents]);
  const folders = useMemo(
    () => new Map(documents.filter((d) => d.kind === 'folder').map((d) => [d.id, d])),
    [documents],
  );
  const content = useMemo(() => live.filter((d) => d.kind !== 'folder'), [live]);
  const trashed = documents.filter((d) => d.deleted);
  const recent = content.slice(0, RECENT_COUNT);
  const active = documents.find((d) => d.id === activeId);

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

  const kindIcon = (kind: DocumentRecord['kind'], isActive = false) => (
    <span
      className="kind-label"
      role="img"
      aria-label={
        kind === 'canvas'
          ? t('library.kindCanvas')
          : kind === 'note'
            ? t('library.kindNote')
            : t('library.kindFolder')
      }
    >
      <KindIcon kind={kind} on={isActive} />
    </span>
  );

  /** Menú «⋯» de una fila: renombrar y enviar a la papelera. */
  const rowMenu = (doc: DocumentRecord, prefix: 'library' | 'folder') => (
    <Menu
      className="row-menu"
      trigger={<Icon name="mas-opciones" size={18} />}
      label={`${t('library.actions')}: ${doc.title}`}
      triggerClassName="icon-button"
      testId={`${prefix}-actions`}
      placement="bottom-end"
      items={[
        {
          id: `${prefix}-title-rename`,
          label: t('library.rename'),
          icon: 'editar',
          onSelect: () => setRenaming((r) => ({ id: doc.id, seq: (r?.seq ?? 0) + 1 })),
        },
        {
          id: `${prefix}-trash`,
          label: prefix === 'folder' ? t('library.trashFolder') : t('library.trash'),
          icon: 'eliminar',
          danger: true,
          onSelect: () => void onTrash(doc.id),
        },
      ]}
    />
  );

  const docItem = (doc: DocumentRecord, depth: number) => (
    <li
      key={doc.id}
      className={doc.id === activeId ? 'active' : ''}
      data-testid="library-item"
      data-document-id={doc.id}
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      {kindIcon(doc.kind, doc.id === activeId)}
      <RenameableTitle
        title={doc.title}
        testId="library-title"
        showRenameButton={false}
        editRequest={renaming?.id === doc.id ? renaming.seq : 0}
        onOpen={() => setActive(doc.id)}
        onRename={(title) => onRename(doc.id, title)}
      />
      {hasConflict(doc) && <span className="badge">{t('library.conflict')}</span>}
      {rowMenu(doc, 'library')}
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
          style={{ paddingLeft: 4 + depth * 14 }}
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
            <Icon name={open ? 'chevron-abajo' : 'chevron-der'} size={16} />
            <Icon
              name={open ? 'carpeta-abierta' : 'carpeta'}
              size={16}
              on={selected === folder.id}
            />
          </button>
          <RenameableTitle
            title={folder.title}
            testId="folder-title"
            showRenameButton={false}
            editRequest={renaming?.id === folder.id ? renaming.seq : 0}
            onOpen={() => {
              setSelectedFolder(selected === folder.id ? null : folder.id);
              setExpanded((prev) => new Set(prev).add(folder.id));
            }}
            onRename={(title) => onRename(folder.id, title)}
          />
          {rowMenu(folder, 'folder')}
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
  const needle = query.trim().toLocaleLowerCase();
  const results = needle
    ? content.filter((d) => d.title.toLocaleLowerCase().includes(needle))
    : null;

  const allPanel = (
    <>
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
    </>
  );

  const recentPanel =
    recent.length === 0 ? (
      <p className="muted">{t('library.empty')}</p>
    ) : (
      <ul className="library-list recent-list" data-testid="recent-list">
        {recent.map((d) => (
          <li key={d.id} className={d.id === activeId ? 'active' : ''} data-testid="recent-item">
            {kindIcon(d.kind, d.id === activeId)}
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
    );

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
      <div className="library-head">
        <img
          className="brand"
          src={theme === 'dark' ? logoDark : logoLight}
          alt={t('app.name')}
          height={24}
        />
        <button
          type="button"
          className="icon-button"
          aria-label={t('app.toggleLibrary')}
          title={t('app.toggleLibrary')}
          aria-expanded={true}
          onClick={toggleLibrary}
        >
          <Icon name="panel-lateral" />
        </button>
      </div>

      <div className="library-actions">
        {/* La única acción principal de la vista (DESIGN.md §6). */}
        <Menu
          className="new-menu"
          trigger={
            <>
              <Icon name="mas" size={18} />
              <span className="new-menu-label">{t('library.new')}</span>
              <Icon name="chevron-abajo" size={16} />
            </>
          }
          label={t('library.new')}
          triggerClassName="primary"
          testId="new-menu"
          items={[
            {
              id: 'new-canvas',
              label: t('library.kindCanvas'),
              icon: 'lienzo',
              onSelect: () => create('canvas'),
            },
            {
              id: 'new-note',
              label: t('library.kindNote'),
              icon: 'nota',
              onSelect: () => create('note'),
            },
            {
              id: 'new-folder',
              label: t('library.kindFolder'),
              icon: 'carpeta',
              onSelect: () => setNewFolder(''),
            },
            {
              id: 'import-files',
              label: t('library.importFiles'),
              icon: 'subir',
              separated: true,
              onSelect: () => fileInput.current?.click(),
            },
            {
              id: 'import-folder',
              label: t('library.importFolder'),
              icon: 'carpeta-abierta',
              onSelect: () => folderInput.current?.click(),
            },
          ]}
        />
        {newFolder !== null && (
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
            <button type="submit" className="icon-button" aria-label={t('library.newFolder')}>
              <Icon name="check" size={18} />
            </button>
          </form>
        )}
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
        {selected && (
          <p className="muted small" data-testid="selected-folder">
            {t('library.createInside', { folder: folders.get(selected)?.title })}
          </p>
        )}
      </div>

      <label className="library-search">
        <Icon name="buscar" size={18} />
        <input
          type="search"
          value={query}
          placeholder={t('library.searchPlaceholder')}
          aria-label={t('library.searchPlaceholder')}
          data-testid="library-search"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
        />
      </label>

      {results ? (
        <div className="library-scroll">
          <ul className="library-list" data-testid="library-results">
            {results.map((d) => docItem(d, 0))}
          </ul>
          {results.length === 0 && <p className="muted">{t('library.noResults')}</p>}
        </div>
      ) : (
        <>
          <div className="library-tabs" role="tablist" aria-label={t('library.title')}>
            {(['all', 'recent'] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`library-tab-${key}`}
                aria-selected={tab === key}
                aria-controls="library-tabpanel"
                data-testid={`library-tab-${key}`}
                className={`library-tab${tab === key ? ' is-active' : ''}`}
                onClick={() => setTab(key)}
              >
                {key === 'all' ? t('library.all') : t('library.recent')}
              </button>
            ))}
          </div>
          <div
            className="library-scroll"
            role="tabpanel"
            id="library-tabpanel"
            aria-labelledby={`library-tab-${tab}`}
          >
            {tab === 'all' ? allPanel : recentPanel}
          </div>
        </>
      )}

      {trashOpen && (
        <section className="trash" aria-label={t('library.trashTitle', { count: trashed.length })}>
          <ul className="library-list trash-list" data-testid="trash-list">
            {trashed.length === 0 && <li className="muted">{t('library.trashEmpty')}</li>}
            {trashed.map((doc) => (
              <li key={doc.id} data-testid="trash-item" data-document-id={doc.id}>
                {kindIcon(doc.kind)}
                <span className="renameable-text">{doc.title}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${t('library.restore')}: ${doc.title}`}
                  title={t('library.restore')}
                  data-testid="trash-restore"
                  onClick={() => void onRestoreFromTrash(doc.id)}
                >
                  <Icon name="restaurar" size={18} />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={`${t('library.purge')}: ${doc.title}`}
                  title={t('library.purge')}
                  data-testid="trash-purge"
                  onClick={() => {
                    if (window.confirm(t('library.purgeConfirm', { title: doc.title }))) {
                      void onPurge(doc.id);
                    }
                  }}
                >
                  <Icon name="eliminar" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {prefsOpen && (
        <section
          className="preferences"
          aria-label={t('preferences.title')}
          data-testid="preferences"
        >
          <h3 className="section-title">{t('preferences.title')}</h3>
          <label className="preference-row">
            <Icon name="idioma" size={18} />
            <span>{t('app.language')}</span>
            <select
              aria-label={t('app.language')}
              value={i18n.language.startsWith('en') ? 'en' : 'es'}
              onChange={(e) => setLanguage(e.target.value as AppLanguage)}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          {/* «Seguir al sistema» vive aquí; el interruptor de la cabecera pasa a modo manual. */}
          <label className="preference-row">
            <Icon name="tema-sistema" size={18} />
            <span>{t('preferences.followSystem')}</span>
            <input
              type="checkbox"
              checked={preference === 'system'}
              data-testid="theme-system"
              onChange={(e) => setThemePreference(e.target.checked ? 'system' : theme)}
            />
          </label>
        </section>
      )}

      <div className="library-foot">
        <button
          type="button"
          className="foot-button"
          aria-expanded={trashOpen}
          data-testid="trash-toggle"
          onClick={() => setTrashOpen((v) => !v)}
        >
          <Icon name="eliminar" size={18} />
          <span>{t('library.trashShort')}</span>
          <span className="foot-count">({trashed.length})</span>
        </button>
        <button
          type="button"
          className="foot-button"
          aria-expanded={prefsOpen}
          data-testid="open-preferences"
          onClick={() => setPrefsOpen((v) => !v)}
        >
          <Icon name="ajustes" size={18} />
          <span>{t('preferences.title')}</span>
        </button>
        {/* Ayuda de atajos del motor: solo existe con un lienzo abierto. */}
        <button
          type="button"
          className="foot-button"
          data-testid="open-help"
          disabled={active?.kind !== 'canvas'}
          title={active?.kind === 'canvas' ? t('help.title') : t('help.onlyCanvas')}
          onClick={() => active && sendViewCommand(active.id, 'help')}
        >
          <Icon name="ayuda" size={18} />
          <span>{t('help.title')}</span>
        </button>
      </div>
    </nav>
  );
}
