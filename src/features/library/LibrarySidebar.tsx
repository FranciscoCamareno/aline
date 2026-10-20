import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore, type Section } from '../../app/store.ts';
import { useTheme } from '../../app/theme.ts';
import { Icon, KindIcon, type IconName } from '../../app/ui/Icon.tsx';
import { Menu } from '../../app/ui/Menu.tsx';
import { effectiveFolder, RECOVERY_FOLDER, wouldCreateCycle } from '../../domain/folders.ts';
import { planReorder, sortByKey } from '../../domain/order.ts';
import type { DocumentKind, DocumentRecord } from '../../domain/revision.ts';
import { hasConflict, isContentKind, isDocsKind, isFolderKind } from '../../domain/revision.ts';
import { tagKey } from '../../domain/tags.ts';
import type { EventColor } from '../../domain/calendar.ts';
import { CalendarSidebar } from '../calendar/CalendarSidebar.tsx';
import type { SettingsSection } from '../status/SettingsDialog.tsx';
import { ProfileMenu } from './ProfileMenu.tsx';
import { RenameableTitle } from './RenameableTitle.tsx';
import { schemeLogo } from '../../app/schemes.ts';

interface Props {
  onCreate: (kind: DocumentKind, folderId: string | null) => Promise<void>;
  onCreateFolder: (
    title: string,
    parentId: string | null,
    kind: 'folder' | 'docfolder',
  ) => Promise<void>;
  onRename: (documentId: string, title: string) => Promise<void>;
  onTrash: (documentId: string) => Promise<void>;
  /** RF-34, RF-35: archivos sueltos o una carpeta, dentro de la carpeta seleccionada. */
  onImport: (files: File[], folderId: string | null) => Promise<void>;
  /** Mover un documento o una carpeta a una carpeta (o a la raíz con null), arrastrándolo. */
  onMove: (documentId: string, folderId: string | null) => Promise<void>;
  /** Orden manual: claves nuevas (`planReorder`) y, si cambia de carpeta, el movimiento. */
  onReorder: (
    changes: ReadonlyMap<string, string>,
    move?: { documentId: string; folderId: string | null },
  ) => Promise<void>;
  /** Archivar o desarchivar desde el menú «⋯» de la fila. */
  onArchive: (documentId: string, archived: boolean) => Promise<void>;
  onCreateCalendar: (title: string) => Promise<void>;
  /** Color de un calendario, elegido por el usuario. */
  onSetCalendarColor: (documentId: string, color: EventColor) => Promise<void>;
  /** Documento nuevo de la sección «Documentos»: con formato (Tiptap) o Markdown (Milkdown). */
  onCreateDoc: (editor: DocEditorKind, folderId: string | null) => Promise<void>;
  /** Abre Configuración en una sección (menú de Perfil del pie). */
  onOpenSettings: (section: SettingsSection) => void;
}

/** Editor de un documento nuevo: Tiptap (formato libre, JSON) o Milkdown (Markdown). */
export type DocEditorKind = 'tiptap' | 'milkdown';

const RECENT_COUNT = 5;
const SECTION_ICONS = {
  library: 'biblioteca',
  calendar: 'calendario',
  documents: 'documento',
} as const satisfies Record<Section, IconName>;
/** Tipo del arrastre de un documento dentro de la biblioteca. */
const DOCUMENT_DRAG_TYPE = 'application/x-aline-document';
/** Destino del arrastre: el id de una carpeta o la raíz. */
/**
 * Destino de un arrastre: dentro de una carpeta (o de la raíz), o antes o después de una fila
 * para colocarla en ese lugar (orden manual).
 */
interface DropTarget {
  id: string | 'root';
  place: 'into' | 'before' | 'after';
}

const sameTarget = (a: DropTarget | null, b: DropTarget) =>
  a !== null && a.id === b.id && a.place === b.place;

/**
 * Biblioteca (diseño §4.1, RF-25): carpetas, etiquetas, recientes y papelera. Las carpetas no
 * borran en cascada: lo que apunta a una carpeta retirada aparece en «Recuperación».
 *
 * Estructura (DESIGN.md §6): logotipo y botón para plegarla; «Nuevo» como único botón principal,
 * con un desplegable (lienzo, nota, carpeta, importar); buscador de títulos; pestañas «Todos» y
 * «Recientes»; acciones de cada fila en su menú «⋯»; y, abajo, el menú de Perfil.
 */
export function LibrarySidebar({
  onCreate,
  onCreateFolder,
  onRename,
  onTrash,
  onImport,
  onMove,
  onReorder,
  onArchive,
  onCreateCalendar,
  onSetCalendarColor,
  onCreateDoc,
  onOpenSettings,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const documents = useUiStore((s) => s.documents);
  const activeId = useUiStore((s) => s.activeId);
  const setActiveDocument = useUiStore((s) => s.setActive);
  const toggleLibrary = useUiStore((s) => s.toggleLibrary);
  const selectedFolder = useUiStore((s) => s.selectedFolder);
  const setSelectedFolder = useUiStore((s) => s.setSelectedFolder);
  const section = useUiStore((s) => s.section);
  const setSection = useUiStore((s) => s.setSection);
  /** En pantallas estrechas la biblioteca tapa el lienzo: abrir un documento la cierra. */
  const closeIfNarrow = () => {
    if (window.matchMedia('(max-width: 820px)').matches) toggleLibrary();
  };
  const setActive = (id: string) => {
    setActiveDocument(id);
    closeIfNarrow();
  };
  const create = (kind: DocumentKind) => void onCreate(kind, selected).then(closeIfNarrow);
  const createDoc = (editor: DocEditorKind) =>
    void onCreateDoc(editor, selected).then(closeIfNarrow);
  // «Notas» y «Documentos» comparten este panel; cada una con sus documentos y sus carpetas.
  const inDocs = section === 'documents';
  const folderKind = inDocs ? 'docfolder' : 'folder';
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [tab, setTab] = useState<'all' | 'recent'>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  /** Fila cuyo título se está renombrando (desde su menú «⋯») y número de petición. */
  const [renaming, setRenaming] = useState<{ id: string; seq: number } | null>(null);

  const live = useMemo(() => documents.filter((d) => !d.deleted), [documents]);
  /** Lo archivado no aparece en la barra (sigue en la búsqueda y en Configuración → Archivo). */
  const visible = useMemo(() => live.filter((d) => !d.archived), [live]);
  const folders = useMemo(
    () => new Map(documents.filter((d) => d.kind === folderKind).map((d) => [d.id, d])),
    [documents, folderKind],
  );
  const content = useMemo(
    () => visible.filter((d) => (inDocs ? isDocsKind(d.kind) : isContentKind(d.kind))),
    [visible, inDocs],
  );
  const recent = content.slice(0, RECENT_COUNT);

  const tags = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const d of content)
      for (const tag of d.tags) if (!byKey.has(tagKey(tag))) byKey.set(tagKey(tag), tag);
    return [...byKey].sort((a, b) => a[1].localeCompare(b[1]));
  }, [content]);

  /** Orden por defecto de los documentos: el de la lista (recientes primero). */
  const position = useMemo(() => new Map(content.map((d, i) => [d.id, i])), [content]);
  // Orden manual primero (clave fraccional); sin él, carpetas por título y documentos por fecha.
  const childrenOf = (parent: string | null) => ({
    folders: sortByKey(
      visible.filter((d) => d.kind === folderKind && effectiveFolder(d, folders) === parent),
      (a, b) => a.title.localeCompare(b.title),
    ),
    docs: sortByKey(
      content.filter((d) => effectiveFolder(d, folders) === parent),
      (a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0),
    ),
  });
  const recovery = content.filter((d) => effectiveFolder(d, folders) === RECOVERY_FOLDER);
  const selected =
    selectedFolder && folders.get(selectedFolder) && !folders.get(selectedFolder)!.deleted
      ? selectedFolder
      : null;

  // Arrastrar lienzos y notas entre carpetas (y fuera de ellas). La alternativa sin arrastre es
  // «Carpeta» en el panel de Detalles.
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  /** Fila con su título en edición: mientras tanto no se arrastra (el ratón selecciona texto). */
  const [editingId, setEditingId] = useState<string | null>(null);

  const endDrag = () => {
    setDragging(null);
    setDropTarget(null);
  };

  /** ¿Puede ir `doc` dentro de `folderId`? Una carpeta no entra en sí misma ni en sus hijas. */
  const canMoveInto = (doc: DocumentRecord, folderId: string | null) =>
    !folderId ||
    (folderId !== doc.id &&
      (!isFolderKind(doc.kind) || !wouldCreateCycle(documents, doc.id, folderId)));

  const moveTo = (documentId: string, folderId: string | null) => {
    const doc = documents.find((d) => d.id === documentId);
    if (!doc || doc.folderId === folderId || !canMoveInto(doc, folderId)) return;
    if (folderId) setExpanded((prev) => new Set(prev).add(folderId));
    void onMove(documentId, folderId);
  };

  /** Carpeta en la que se ve una fila (la raíz si su carpeta no existe). */
  const parentOf = (doc: DocumentRecord) => {
    const parent = effectiveFolder(doc, folders);
    return parent === RECOVERY_FOLDER ? null : parent;
  };

  /** Hermanos del mismo grupo (carpetas o documentos) en el orden en que se ven. */
  const groupOf = (doc: DocumentRecord, parent: string | null) => {
    const children = childrenOf(parent);
    return isFolderKind(doc.kind) ? children.folders : children.docs;
  };

  /**
   * Colocar `moving` en el lugar `index` de su grupo dentro de `parent`, moviéndolo de carpeta si
   * hace falta. Solo se crean revisiones para lo que cambia.
   */
  const place = (moving: DocumentRecord, parent: string | null, index: number) => {
    if (!canMoveInto(moving, parent)) return;
    const siblings = groupOf(moving, parent).filter((d) => d.id !== moving.id);
    const changes = planReorder(siblings, moving.id, index);
    const move =
      parentOf(moving) !== parent ? { documentId: moving.id, folderId: parent } : undefined;
    if (!changes.size && !move) return;
    if (parent) setExpanded((prev) => new Set(prev).add(parent));
    void onReorder(changes, move);
  };

  /** Soltar junto a una fila: antes o después de ella, en su carpeta. */
  const dropBeside = (movingId: string, target: DocumentRecord, side: 'before' | 'after') => {
    const moving = documents.find((d) => d.id === movingId);
    if (!moving || moving.id === target.id) return;
    const parent = parentOf(target);
    const siblings = groupOf(moving, parent).filter((d) => d.id !== moving.id);
    let index: number;
    if (isFolderKind(moving.kind) === isFolderKind(target.kind)) {
      index = siblings.findIndex((d) => d.id === target.id) + (side === 'after' ? 1 : 0);
    } else {
      // Carpetas y documentos van en grupos separados: al lado de una fila del otro grupo,
      // la carpeta queda al final de las carpetas y el documento al principio de los documentos.
      index = isFolderKind(moving.kind) ? siblings.length : 0;
    }
    place(moving, parent, index);
  };

  /** Subir o bajar una fila entre sus hermanos (menú «⋯»; alternativa táctil al arrastre). */
  const shift = (doc: DocumentRecord, step: -1 | 1) => {
    const parent = parentOf(doc);
    const siblings = groupOf(doc, parent);
    const at = siblings.findIndex((d) => d.id === doc.id);
    const index = at + step;
    if (at < 0 || index < 0 || index >= siblings.length) return;
    place(doc, parent, index);
  };

  /** Propiedades de una fila que acepta arrastres junto a ella (y dentro, si es carpeta). */
  const rowDrop = (target: DocumentRecord) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DOCUMENT_DRAG_TYPE)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      const box = e.currentTarget.getBoundingClientRect();
      const y = (e.clientY - box.top) / Math.max(box.height, 1);
      const where: DropTarget['place'] = isFolderKind(target.kind)
        ? y < 0.25
          ? 'before'
          : y > 0.75
            ? 'after'
            : 'into'
        : y < 0.5
          ? 'before'
          : 'after';
      const next = { id: target.id, place: where };
      if (!sameTarget(dropTarget, next)) setDropTarget(next);
    },
    onDrop: (e: DragEvent) => {
      const id = e.dataTransfer.getData(DOCUMENT_DRAG_TYPE);
      const where = dropTarget?.id === target.id ? dropTarget.place : 'into';
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      endDrag();
      if (where === 'into') moveTo(id, target.id);
      else dropBeside(id, target, where);
    },
  });

  const dropClass = (id: string) =>
    dropTarget?.id === id
      ? ` drop-${dropTarget.place === 'into' ? 'target' : dropTarget.place}`
      : '';

  /** Propiedades de un destino: una carpeta (su fila y su contenido) o la raíz. */
  const dropZone = (id: string | 'root') => {
    const target: DropTarget = { id, place: 'into' };
    return {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(DOCUMENT_DRAG_TYPE)) return;
        e.preventDefault();
        // La carpeta más interior gana: el evento no sube a la carpeta padre ni a la raíz.
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        if (!sameTarget(dropTarget, target)) setDropTarget(target);
      },
      onDragLeave: (e: DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDropTarget((current) => (current?.id === id ? null : current));
      },
      onDrop: (e: DragEvent) => {
        const dragged = e.dataTransfer.getData(DOCUMENT_DRAG_TYPE);
        if (!dragged) return;
        e.preventDefault();
        e.stopPropagation();
        endDrag();
        moveTo(dragged, id === 'root' ? null : id);
      },
    };
  };

  const kindIcon = (kind: DocumentRecord['kind'], isActive = false) => (
    <span
      className="kind-label"
      role="img"
      aria-label={
        kind === 'canvas'
          ? t('library.kindCanvas')
          : kind === 'note'
            ? t('library.kindNote')
            : kind === 'doc'
              ? t('docs.kindRich')
              : kind === 'mddoc'
                ? t('docs.kindMarkdown')
                : t('library.kindFolder')
      }
    >
      <KindIcon kind={kind} on={isActive} />
    </span>
  );

  /** Menú «⋯» de una fila: renombrar, subir y bajar, archivar y enviar a la papelera. */
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
          id: `${prefix}-move-up`,
          label: t('library.moveUp'),
          icon: 'chevron-arriba',
          onSelect: () => shift(doc, -1),
        },
        {
          id: `${prefix}-move-down`,
          label: t('library.moveDown'),
          icon: 'chevron-abajo',
          onSelect: () => shift(doc, 1),
        },
        {
          id: `${prefix}-archive`,
          label: t('library.archive'),
          icon: 'archivar',
          onSelect: () => void onArchive(doc.id, true),
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
      className={`${doc.id === activeId ? 'active' : ''}${dragging === doc.id ? ' dragging' : ''}${dropClass(doc.id)}`}
      data-testid="library-item"
      data-document-id={doc.id}
      style={{ paddingLeft: 8 + depth * 14 }}
      draggable={editingId !== doc.id}
      onDragStart={(e) => {
        e.dataTransfer.setData(DOCUMENT_DRAG_TYPE, doc.id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(doc.id);
      }}
      onDragEnd={endDrag}
      {...rowDrop(doc)}
      onFocus={(e) => {
        if (e.target instanceof HTMLInputElement) setEditingId(doc.id);
      }}
      onBlur={(e) => {
        if (e.target instanceof HTMLInputElement) setEditingId(null);
      }}
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
        {...dropZone(folder.id)}
      >
        <div
          className={`folder-row ${selected === folder.id ? 'selected' : ''}${dropClass(folder.id)}${
            dragging === folder.id ? ' dragging' : ''
          }`}
          style={{ paddingLeft: 4 + depth * 14 }}
          draggable={editingId !== folder.id}
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData(DOCUMENT_DRAG_TYPE, folder.id);
            e.dataTransfer.effectAllowed = 'move';
            setDragging(folder.id);
          }}
          onDragEnd={endDrag}
          onFocus={(e) => {
            if (e.target instanceof HTMLInputElement) setEditingId(folder.id);
          }}
          onBlur={(e) => {
            if (e.target instanceof HTMLInputElement) setEditingId(null);
          }}
          {...rowDrop(folder)}
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
        <img className="brand" src={schemeLogo(scheme)} alt={t('app.name')} height={24} />
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

      {/* Secciones: notas (lienzos y notas), documentos y calendario. */}
      <div className="library-sections" role="tablist" aria-label={t('library.sections')}>
        {(['library', 'documents', 'calendar'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={section === key}
            data-testid={`section-${key}`}
            className={`section-tab${section === key ? ' is-active' : ''}`}
            onClick={() => setSection(key)}
          >
            <Icon name={SECTION_ICONS[key]} size={18} on={section === key} />
            {key === 'library'
              ? t('library.sectionNotes')
              : key === 'calendar'
                ? t('calendar.title')
                : t('docs.title')}
          </button>
        ))}
      </div>

      {section === 'calendar' ? (
        <CalendarSidebar
          onCreateCalendar={onCreateCalendar}
          onSetColor={onSetCalendarColor}
          onRename={onRename}
          onTrash={onTrash}
        />
      ) : (
        <>
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
              items={
                inDocs
                  ? [
                      {
                        id: 'new-doc-rich',
                        label: t('docs.kindRich'),
                        icon: 'documento',
                        onSelect: () => createDoc('tiptap'),
                      },
                      {
                        id: 'new-doc-markdown',
                        label: t('docs.kindMarkdown'),
                        icon: 'documento-md',
                        onSelect: () => createDoc('milkdown'),
                      },
                      {
                        id: 'new-folder',
                        label: t('library.kindFolder'),
                        icon: 'carpeta',
                        separated: true,
                        onSelect: () => setNewFolder(''),
                      },
                    ]
                  : [
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
                    ]
              }
            />
            {newFolder !== null && (
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const title = newFolder.trim();
                  setNewFolder(null);
                  if (title) void onCreateFolder(title, selected, folderKind);
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
                className={`library-scroll${dropTarget?.id === 'root' ? ' drop-target' : ''}`}
                role="tabpanel"
                id="library-tabpanel"
                aria-labelledby={`library-tab-${tab}`}
                data-testid="library-drop-root"
                // Soltar fuera de cualquier carpeta saca el documento a la raíz.
                {...(tab === 'all' && !tagFilter ? dropZone('root') : {})}
              >
                {tab === 'all' ? allPanel : recentPanel}
              </div>
            </>
          )}
        </>
      )}

      {/* Pie: solo Perfil, con su menú (configuración, temas, idioma, papelera y estado). */}
      <div className="library-foot">
        <ProfileMenu onOpenSettings={onOpenSettings} />
      </div>
    </nav>
  );
}
