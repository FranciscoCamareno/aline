import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../app/store.ts';
import { Icon, KindIcon } from '../../app/ui/Icon.tsx';
import { Menu } from '../../app/ui/Menu.tsx';
import {
  HOME_FILTERS,
  homeItems,
  homeRecent,
  moveTargets,
  type HomeFilter,
  type HomeSort,
} from '../../application/home.ts';
import type { KnowledgeService } from '../../application/KnowledgeService.ts';
import type { VaultService } from '../../application/VaultService.ts';
import { folderPath } from '../../domain/folders.ts';
import { isFolderKind, type DocumentRecord } from '../../domain/revision.ts';
import { RenameableTitle } from '../library/RenameableTitle.tsx';
import { HomeThumb } from './HomeThumb.tsx';

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
 * lateral; no crea revisiones por mirar.
 */
export function HomeView({
  service,
  knowledge,
  actions,
}: {
  service: VaultService;
  knowledge: KnowledgeService;
  actions: HomeActions;
}) {
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
  const current = folderId && folders.get(folderId)?.deleted === false ? folderId : null;
  const items = useMemo(
    () => homeItems(documents, { folderId: current, query, filter, sort: prefs.sort }),
    [documents, current, query, filter, prefs.sort],
  );
  const recent = useMemo(() => homeRecent(documents, RECENT_COUNT), [documents]);
  const byId = useMemo(() => new Map(documents.map((d) => [d.id, d])), [documents]);
  const chosen = [...selected].map((id) => byId.get(id)).filter((d): d is DocumentRecord => !!d);
  const atRoot = !current && !query.trim();
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  const enter = (id: string | null) => {
    setFolderId(id);
    setQuery('');
    setShown(PAGE);
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
          {items.length === 0 ? (
            <p className="muted home-empty" data-testid="home-empty">
              {query.trim() ? t('library.noResults') : t('home.emptyFolder')}
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
