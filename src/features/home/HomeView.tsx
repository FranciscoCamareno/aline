import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import { Icon, KindIcon } from '../../app/ui/Icon.tsx';
import { Menu } from '../../app/ui/Menu.tsx';
import type { AppServices } from '../../app/services.ts';
import {
  canJoinWorkspace,
  HOME_FILTERS,
  homeItems,
  homeRecent,
  homeWorkspaces,
  moveTargets,
  workspaceItems,
  type HomeFilter,
  type HomeSort,
} from '../../application/home.ts';
import { EVENT_COLORS, type EventColor } from '../../domain/calendar.ts';
import { withoutMembers } from '../../domain/workspace.ts';
import { folderPath } from '../../domain/folders.ts';
import { isFolderKind, type DocumentRecord } from '../../domain/revision.ts';
import { RenameableTitle } from '../library/RenameableTitle.tsx';
import { HomeThumb } from './HomeThumb.tsx';
import {
  AddToWorkspaceDialog,
  ImportWorkspaceDialog,
  ShareWorkspaceDialog,
} from './WorkspaceDialogs.tsx';

const PAGE = 120;
const RECENT_COUNT = 6;
const PREFS_KEY = 'mindnote.home';

type HomeLayout = 'grid' | 'list';

/** Vista y orden de Inicio: preferencias de este navegador (no son contenido). */
function readPrefs(): { layout: HomeLayout; sort: HomeSort } {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Record<string, unknown>;
    return {
      layout: raw['layout'] === 'list' ? 'list' : 'grid',
      sort: raw['sort'] === 'name' ? 'name' : 'modified',
    };
  } catch {
    return { layout: 'grid', sort: 'modified' };
  }
}

function savePrefs(prefs: { layout: HomeLayout; sort: HomeSort }): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Sin almacenamiento del navegador: la preferencia dura lo que la pestaña.
  }
}

export interface HomeActions {
  onRename: (id: string, title: string) => Promise<void>;
  onMove: (id: string, folderId: string | null) => Promise<void>;
  onArchive: (id: string, archived: boolean) => Promise<void>;
  onTrash: (id: string) => Promise<void>;
}

/**
 * Inicio (plan 11): todos los documentos en un solo sitio, como «Mi unidad». Carpetas de las dos
 * secciones con miga de pan, cuadrícula o lista, filtro por tipo, orden, búsqueda por título,
 * miniaturas, «Recientes» y acciones sobre uno o varios. Usa las mismas operaciones que la barra
 * lateral; no crea revisiones por mirar. Desde el plan 12, también los entornos de trabajo: su
 * bloque, su vista (sus miembros), añadir y quitar, compartir e importar.
 */
export function HomeView({ services, actions }: { services: AppServices; actions: HomeActions }) {
  const { service, knowledge } = services;
  const { t, i18n } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const setActive = useUiStore((s) => s.setActive);
  const navigate = useUiStore((s) => s.navigate);
  const [prefs, setPrefs] = useState(readPrefs);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HomeFilter>('all');
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<{ id: string; seq: number } | null>(null);
  const [moving, setMoving] = useState<DocumentRecord[] | null>(null);
  /** Entorno abierto en Inicio (plan 12) y sus miembros (null mientras se leen). */
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [members, setMembers] = useState<string[] | null>(null);
  const [adding, setAdding] = useState<DocumentRecord[] | null>(null);
  const [sharing, setSharing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState<string | null>(null);

  const changePrefs = (next: Partial<typeof prefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    savePrefs(merged);
  };

  // Una carpeta que desaparece (papelera, otro dispositivo) devuelve a la raíz.
  const folders = useMemo(
    () => new Map(documents.filter((d) => isFolderKind(d.kind)).map((d) => [d.id, d])),
    [documents],
  );
  const byId = useMemo(() => new Map(documents.map((d) => [d.id, d])), [documents]);
  // Un entorno que se borra (o se archiva) también devuelve a la raíz.
  const workspace = workspaceId ? byId.get(workspaceId) : undefined;
  const openWorkspace = workspace && !workspace.deleted && !workspace.archived ? workspace : null;
  const current =
    !openWorkspace && folderId && folders.get(folderId)?.deleted === false ? folderId : null;

  // Los miembros se leen al entrar y cada vez que el entorno cambia (su fecha de modificación).
  const workspaceVersion = openWorkspace?.updatedAt;
  useEffect(() => {
    if (!openWorkspace) return;
    let cancelled = false;
    service.readWorkspace(openWorkspace.id).then(
      (read) => !cancelled && setMembers(read.workspace.members),
      () => !cancelled && setMembers([]),
    );
    return () => {
      cancelled = true;
    };
    // `openWorkspace` cambia de objeto en cada lista; cuentan su id y su versión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openWorkspace?.id, workspaceVersion, service]);

  const items = useMemo(
    () =>
      openWorkspace
        ? workspaceItems(documents, members ?? [], { query, filter, sort: prefs.sort })
        : homeItems(documents, { folderId: current, query, filter, sort: prefs.sort }),
    [documents, openWorkspace, members, current, query, filter, prefs.sort],
  );
  const recent = useMemo(() => homeRecent(documents, RECENT_COUNT), [documents]);
  const workspaces = useMemo(() => homeWorkspaces(documents), [documents]);
  // Color de cada tarjeta de entorno: está en su contenido, no en el registro del documento.
  const [colors, setColors] = useState<Map<string, EventColor>>(new Map());
  const workspacesKey = workspaces.map((w) => `${w.id}:${w.updatedAt}`).join();
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      workspaces.map(async (w) => {
        const read = await service.readWorkspace(w.id).catch(() => null);
        return [w.id, read?.workspace.color ?? 'agua'] as const;
      }),
    ).then((pairs) => !cancelled && setColors(new Map(pairs)));
    return () => {
      cancelled = true;
    };
    // La clave resume la lista: ids y versiones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacesKey, service]);
  const chosen = [...selected].map((id) => byId.get(id)).filter((d): d is DocumentRecord => !!d);
  const atRoot = !current && !openWorkspace && !query.trim();
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  const enter = (id: string | null) => {
    setFolderId(id);
    setWorkspaceId(null);
    setQuery('');
    setShown(PAGE);
    setSelected(new Set());
  };
  const enterWorkspace = (id: string) => {
    setWorkspaceId(id);
    setMembers(null);
    setFolderId(null);
    setQuery('');
    setShown(PAGE);
    setSelected(new Set());
  };
  const createWorkspace = async (title: string) => {
    const color = EVENT_COLORS[workspaces.length % EVENT_COLORS.length]!;
    const created = await service.createWorkspace(title, color);
    useUiStore.getState().upsertDocument(created);
    enterWorkspace(created.id);
  };
  const removeFromWorkspace = async (ids: string[]) => {
    if (!openWorkspace) return;
    const result = await service.updateWorkspace(openWorkspace.id, (w) => withoutMembers(w, ids));
    useUiStore.getState().upsertDocument(result.document);
    setSelected(new Set());
  };
  const open = (doc: DocumentRecord) => {
    if (isFolderKind(doc.kind)) enter(doc.id);
    // Un calendario se abre en su sección; lo demás, como desde la barra lateral.
    else if (doc.kind === 'calendar') navigate({ documentId: doc.id });
    else setActive(doc.id);
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const forAll = async (run: (id: string) => Promise<void>) => {
    for (const doc of chosen) await run(doc.id);
    setSelected(new Set());
  };

  const kindName = (doc: DocumentRecord) => t(`home.kinds.${doc.kind}`);

  const card = (doc: DocumentRecord) => {
    const isSelected = selected.has(doc.id);
    return (
      <li
        key={doc.id}
        className={`home-item${isSelected ? ' is-selected' : ''}`}
        data-testid="home-item"
        data-document-id={doc.id}
      >
        <input
          type="checkbox"
          className="home-select"
          checked={isSelected}
          aria-label={t('home.select', { title: doc.title })}
          data-testid="home-select"
          onChange={() => toggle(doc.id)}
        />
        <button
          type="button"
          className="home-open"
          aria-label={`${kindName(doc)}: ${doc.title}`}
          data-testid="home-open"
          onClick={() => open(doc)}
        >
          {prefs.layout === 'grid' && (
            <HomeThumb doc={doc} service={service} knowledge={knowledge} />
          )}
        </button>
        <div className="home-item-meta">
          <KindIcon kind={doc.kind} />
          <RenameableTitle
            title={doc.title}
            testId="home-title"
            showRenameButton={false}
            editRequest={renaming?.id === doc.id ? renaming.seq : 0}
            onOpen={() => open(doc)}
            onRename={(title) => actions.onRename(doc.id, title)}
          />
          <Menu
            className="row-menu"
            trigger={<Icon name="mas-opciones" size={16} />}
            label={`${t('library.actions')}: ${doc.title}`}
            triggerClassName="icon-button"
            testId="home-actions"
            placement="bottom-end"
            items={[
              {
                id: 'home-open-item',
                label: t('home.open'),
                icon: isFolderKind(doc.kind) ? 'carpeta-abierta' : 'externo',
                onSelect: () => open(doc),
              },
              {
                id: 'home-rename',
                label: t('library.rename'),
                icon: 'editar',
                onSelect: () => setRenaming((r) => ({ id: doc.id, seq: (r?.seq ?? 0) + 1 })),
              },
              ...(moveTargets(documents, [doc])
                ? [
                    {
                      id: 'home-move',
                      label: t('home.move'),
                      icon: 'carpeta' as const,
                      onSelect: () => setMoving([doc]),
                    },
                  ]
                : []),
              ...(canJoinWorkspace(doc)
                ? [
                    {
                      id: 'home-add-workspace',
                      label: t('workspaces.addTo'),
                      icon: 'entorno' as const,
                      onSelect: () => setAdding([doc]),
                    },
                  ]
                : []),
              ...(openWorkspace
                ? [
                    {
                      id: 'home-remove-workspace',
                      label: t('workspaces.remove'),
                      icon: 'cerrar' as const,
                      onSelect: () => void removeFromWorkspace([doc.id]),
                    },
                  ]
                : []),
              {
                id: 'home-archive',
                label: t('library.archive'),
                icon: 'archivar',
                onSelect: () => void actions.onArchive(doc.id, true),
              },
              {
                id: 'home-trash',
                label: t('library.trash'),
                icon: 'eliminar',
                danger: true,
                separated: true,
                onSelect: () => void actions.onTrash(doc.id),
              },
            ]}
          />
        </div>
        <span className="home-item-detail muted small">
          {kindName(doc)} · {date.format(new Date(doc.updatedAt))}
        </span>
      </li>
    );
  };

  return (
    <div className="home-view" data-testid="home-view">
      <header className="home-head">
        <h1>{t('home.title')}</h1>
        <label className="library-search home-search">
          <Icon name="buscar" size={18} />
          <input
            name="home-search"
            type="search"
            value={query}
            placeholder={t('home.searchPlaceholder')}
            aria-label={t('home.searchPlaceholder')}
            data-testid="home-search"
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          />
        </label>
        <button
          type="button"
          data-testid="home-import-workspace"
          onClick={() => setImporting(true)}
        >
          <Icon name="subir" size={18} />
          {t('workspaces.import.title')}
        </button>
      </header>

      <div className="home-toolbar">
        <div className="home-filters" role="group" aria-label={t('home.filter')}>
          {HOME_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className={`chip${filter === value ? ' selected' : ''}`}
              aria-pressed={filter === value}
              data-testid={`home-filter-${value}`}
              onClick={() => {
                setFilter(value);
                setShown(PAGE);
              }}
            >
              {t(`home.filters.${value}`)}
            </button>
          ))}
        </div>
        <span className="topbar-spacer" />
        <Menu
          trigger={
            <>
              <Icon name="ordenar" size={18} />
              {t(`home.sort.${prefs.sort}`)}
            </>
          }
          label={t('home.sortLabel')}
          testId="home-sort"
          placement="bottom-end"
          items={(['modified', 'name'] as const).map((value) => ({
            id: `home-sort-${value}`,
            label: t(`home.sort.${value}`),
            ...(prefs.sort === value ? { icon: 'check' as const } : {}),
            onSelect: () => changePrefs({ sort: value }),
          }))}
        />
        <div className="segmented" role="group" aria-label={t('home.layout')}>
          {(['grid', 'list'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`segmented-option${prefs.layout === value ? ' is-active' : ''}`}
              aria-pressed={prefs.layout === value}
              aria-label={t(`home.layouts.${value}`)}
              title={t(`home.layouts.${value}`)}
              data-testid={`home-layout-${value}`}
              onClick={() => changePrefs({ layout: value })}
            >
              <Icon name={value === 'grid' ? 'cuadricula' : 'lista'} size={18} />
            </button>
          ))}
        </div>
      </div>

      {chosen.length > 0 && (
        <div className="home-bulk" role="toolbar" data-testid="home-bulk">
          <span>{t('home.selected', { count: chosen.length })}</span>
          <button
            type="button"
            disabled={!moveTargets(documents, chosen)}
            title={moveTargets(documents, chosen) ? undefined : t('home.moveMixed')}
            data-testid="home-bulk-move"
            onClick={() => setMoving(chosen)}
          >
            <Icon name="carpeta" size={18} />
            {t('home.move')}
          </button>
          <button
            type="button"
            disabled={!chosen.every(canJoinWorkspace)}
            data-testid="home-bulk-add-workspace"
            onClick={() => setAdding(chosen)}
          >
            <Icon name="entorno" size={18} />
            {t('workspaces.addTo')}
          </button>
          {openWorkspace && (
            <button
              type="button"
              data-testid="home-bulk-remove-workspace"
              onClick={() => void removeFromWorkspace(chosen.map((d) => d.id))}
            >
              <Icon name="cerrar" size={18} />
              {t('workspaces.remove')}
            </button>
          )}
          <button
            type="button"
            data-testid="home-bulk-archive"
            onClick={() => void forAll((id) => actions.onArchive(id, true))}
          >
            <Icon name="archivar" size={18} />
            {t('library.archive')}
          </button>
          <button
            type="button"
            className="danger"
            data-testid="home-bulk-trash"
            onClick={() => void forAll(actions.onTrash)}
          >
            <Icon name="eliminar" size={18} />
            {t('library.trash')}
          </button>
          <button type="button" onClick={() => setSelected(new Set())}>
            {t('home.clearSelection')}
          </button>
        </div>
      )}

      <div className="home-scroll">
        {atRoot && filter === 'all' && recent.length > 0 && (
          <section className="home-section" aria-labelledby="home-recent-title">
            <h2 id="home-recent-title" className="section-title">
              {t('library.recent')}
            </h2>
            <ul className="home-recent" data-testid="home-recent">
              {recent.map((doc) => (
                <li key={doc.id}>
                  <button type="button" className="home-recent-item" onClick={() => open(doc)}>
                    <HomeThumb doc={doc} service={service} knowledge={knowledge} />
                    <span className="home-recent-title">
                      <KindIcon kind={doc.kind} /> {doc.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {atRoot && filter === 'all' && (
          <section className="home-section" aria-labelledby="home-workspaces-title">
            <h2 id="home-workspaces-title" className="section-title">
              {t('workspaces.title')}
            </h2>
            <ul className="home-workspaces" data-testid="home-workspaces">
              {workspaces.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    className={`home-workspace event-${colors.get(w.id) ?? 'agua'}`}
                    data-testid="home-workspace"
                    onClick={() => enterWorkspace(w.id)}
                  >
                    <Icon name="entorno" size={20} />
                    <span>{w.title}</span>
                  </button>
                </li>
              ))}
              <li>
                {newWorkspace === null ? (
                  <button
                    type="button"
                    className="home-workspace home-workspace--new"
                    data-testid="home-new-workspace"
                    onClick={() => setNewWorkspace('')}
                  >
                    <Icon name="mas" size={20} />
                    <span>{t('workspaces.new')}</span>
                  </button>
                ) : (
                  <form
                    className="inline-form home-workspace-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const title = newWorkspace.trim();
                      setNewWorkspace(null);
                      if (title) void createWorkspace(title);
                    }}
                  >
                    <input
                      name="new-workspace"
                      autoFocus
                      value={newWorkspace}
                      maxLength={300}
                      placeholder={t('workspaces.newPlaceholder')}
                      aria-label={t('workspaces.newPlaceholder')}
                      data-testid="home-new-workspace-input"
                      onChange={(e) => setNewWorkspace(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setNewWorkspace(null)}
                    />
                    <button type="submit" className="icon-button" aria-label={t('workspaces.new')}>
                      <Icon name="check" size={18} />
                    </button>
                  </form>
                )}
              </li>
            </ul>
          </section>
        )}

        <section className="home-section" aria-labelledby="home-all-title">
          <nav className="home-crumbs" aria-label={t('home.path')} data-testid="home-crumbs">
            <button
              type="button"
              className="link-button"
              id="home-all-title"
              onClick={() => enter(null)}
            >
              {query.trim() ? t('home.results') : t('home.all')}
            </button>
            {openWorkspace && (
              <span className="home-crumb">
                <Icon name="chevron-der" size={14} />
                <Icon name="entorno" size={16} />
                <strong>{openWorkspace.title}</strong>
              </span>
            )}
            {current &&
              pathTo(current, folders).map((folder, i, list) => (
                <span key={folder.id} className="home-crumb">
                  <Icon name="chevron-der" size={14} />
                  {i === list.length - 1 ? (
                    <strong>{folder.title}</strong>
                  ) : (
                    <button type="button" className="link-button" onClick={() => enter(folder.id)}>
                      {folder.title}
                    </button>
                  )}
                </span>
              ))}
          </nav>
          {openWorkspace && (
            <div className="home-workspace-head" data-testid="home-workspace-head">
              <RenameableTitle
                title={openWorkspace.title}
                testId="workspace-title"
                onRename={(title) => actions.onRename(openWorkspace.id, title)}
              />
              <span className="topbar-spacer" />
              <button
                type="button"
                className="primary"
                data-testid="workspace-share"
                onClick={() => setSharing(true)}
              >
                <Icon name="compartir" size={18} />
                {t('workspaces.share.button')}
              </button>
              <Menu
                className="row-menu"
                trigger={<Icon name="mas-opciones" size={16} />}
                label={`${t('library.actions')}: ${openWorkspace.title}`}
                triggerClassName="icon-button"
                testId="workspace-actions"
                placement="bottom-end"
                items={[
                  ...EVENT_COLORS.map((color) => ({
                    id: `workspace-color-${color}`,
                    label: t(`calendar.colors.${color}`),
                    icon: 'color' as const,
                    onSelect: () =>
                      void service
                        .updateWorkspace(openWorkspace.id, (w) => ({ ...w, color }))
                        .then((r) => useUiStore.getState().upsertDocument(r.document)),
                  })),
                  {
                    id: 'workspace-trash',
                    label: t('workspaces.delete'),
                    icon: 'eliminar',
                    danger: true,
                    separated: true,
                    onSelect: () => void actions.onTrash(openWorkspace.id).then(() => enter(null)),
                  },
                ]}
              />
            </div>
          )}
          {openWorkspace && members === null ? (
            <p className="muted home-empty">{t('workspaces.loading')}</p>
          ) : items.length === 0 ? (
            <p className="muted home-empty" data-testid="home-empty">
              {query.trim()
                ? t('library.noResults')
                : openWorkspace
                  ? t('workspaces.empty')
                  : t('home.emptyFolder')}
            </p>
          ) : (
            <ul className={`home-items home-items--${prefs.layout}`} data-testid="home-items">
              {items.slice(0, shown).map(card)}
            </ul>
          )}
          {items.length > shown && (
            <button
              type="button"
              className="link-button home-more"
              data-testid="home-more"
              onClick={() => setShown((n) => n + PAGE)}
            >
              {t('library.showMore', { count: Math.min(items.length - shown, PAGE) })}
            </button>
          )}
        </section>
      </div>

      {adding && (
        <AddToWorkspaceDialog
          services={services}
          items={adding}
          onDone={() => {
            setAdding(null);
            setSelected(new Set());
            void service.listDocuments().then(useUiStore.getState().setDocuments);
          }}
          onClose={() => setAdding(null)}
        />
      )}
      {sharing && openWorkspace && (
        <ShareWorkspaceDialog
          services={services}
          workspace={openWorkspace}
          members={items}
          onClose={() => {
            setSharing(false);
            void service.listDocuments().then(useUiStore.getState().setDocuments);
          }}
        />
      )}
      {importing && (
        <ImportWorkspaceDialog
          services={services}
          onImported={(id) => {
            setImporting(false);
            enterWorkspace(id);
          }}
          onClose={() => setImporting(false)}
        />
      )}
      {moving && (
        <MoveDialog
          items={moving}
          targets={moveTargets(documents, moving) ?? []}
          folders={folders}
          onMove={async (target) => {
            const list = moving;
            setMoving(null);
            for (const doc of list) await actions.onMove(doc.id, target);
            setSelected(new Set());
          }}
          onClose={() => setMoving(null)}
        />
      )}
    </div>
  );
}

/** Carpetas desde la raíz hasta `id` (incluida), para la miga de pan. */
function pathTo(id: string, folders: ReadonlyMap<string, DocumentRecord>): DocumentRecord[] {
  const path: DocumentRecord[] = [];
  const seen = new Set<string>();
  let current: string | null = id;
  while (current && !seen.has(current)) {
    seen.add(current);
    const folder = folders.get(current);
    if (!folder) break;
    path.unshift(folder);
    current = folder.folderId;
  }
  return path;
}

/** «Mover a…»: la raíz o una carpeta de su sección (con su ruta), como en Detalles. */
function MoveDialog({
  items,
  targets,
  folders,
  onMove,
  onClose,
}: {
  items: DocumentRecord[];
  targets: DocumentRecord[];
  folders: ReadonlyMap<string, DocumentRecord>;
  onMove: (folderId: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState('');
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-move-title"
        data-testid="home-move-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2 id="home-move-title">
          {items.length === 1
            ? t('home.moveOne', { title: items[0]!.title })
            : t('home.moveMany', { count: items.length })}
        </h2>
        <select
          name="home-move-target"
          aria-label={t('details.folder')}
          data-testid="home-move-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">{t('details.root')}</option>
          {targets.map((f) => (
            <option key={f.id} value={f.id}>
              {[...folderPath(f.folderId, folders), f.title].join(' / ')}
            </option>
          ))}
        </select>
        <div className="dialog-actions">
          <span className="topbar-spacer" />
          <button type="button" onClick={onClose}>
            {t('title.cancel')}
          </button>
          <button
            type="button"
            className="primary"
            data-testid="home-move-confirm"
            onClick={() => void onMove(target || null)}
          >
            {t('home.move')}
          </button>
        </div>
      </div>
    </div>
  );
}
