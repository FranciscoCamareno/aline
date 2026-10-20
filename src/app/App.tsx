import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { DomainError } from '../domain/errors.ts';
import type { ConflictChoice } from '../application/VaultService.ts';
import { hasConflict, isContentKind, isDocsKind, type DocumentKind } from '../domain/revision.ts';
import { ConflictPanel } from '../features/history/ConflictPanel.tsx';
import { DetailsPanel } from '../features/knowledge/DetailsPanel.tsx';
import { SearchPalette } from '../features/knowledge/SearchPalette.tsx';
import { KnowledgeRuntime } from './knowledgeRuntime.ts';
import { RemoteChip } from './RemoteChip.tsx';
import { SyncRuntime } from './syncRuntime.ts';
import { HistoryPanel } from '../features/history/HistoryPanel.tsx';
import { CanvasView } from '../features/canvas/CanvasView.tsx';
import { LibrarySidebar } from '../features/library/LibrarySidebar.tsx';
import { RenameableTitle } from '../features/library/RenameableTitle.tsx';
import { NoteView } from '../features/notes/NoteView.tsx';
import { SettingsDialog, type SettingsSection } from '../features/status/SettingsDialog.tsx';
import { QUOTA_WARNING_RATIO, quotaRatio, StatusPanel } from '../features/status/StatusPanel.tsx';
import { describeError } from '../ports/Diagnostics.ts';
import { RemoteError } from '../ports/RemoteStore.ts';
import { runEmergencyExport } from './emergency.ts';
import { ImportReportDialog } from '../features/library/ImportReportDialog.tsx';
import { exportMarkdownZip, importFiles, type ImportReport } from './importExport.ts';
import { PwaPrompt } from './PwaPrompt.tsx';
import { flushAllWrites, logDiagnostic } from './runtime.ts';
import { bootstrap, type AppServices } from './services.ts';
import { StartupError } from './StartupError.tsx';
import { shouldShowWelcome, WelcomeDialog } from './WelcomeDialog.tsx';
import { useSidebarCollapse } from './sidebarPref.ts';
import { LibraryRail } from '../features/library/LibraryRail.tsx';
import { EVENT_COLORS } from '../domain/calendar.ts';
import { CalendarView } from '../features/calendar/CalendarView.tsx';
import { DocView } from '../features/docs/DocView.tsx';
import { MarkdownDocView } from '../features/docs/MarkdownDocView.tsx';
import type { DocEditorKind } from '../features/library/LibrarySidebar.tsx';
import { useCalendarStore } from '../features/calendar/calendarStore.ts';
import { useUiStore } from './store.ts';
import { useTheme } from './theme.ts';
import { Icon } from './ui/Icon.tsx';
import { Menu } from './ui/Menu.tsx';
import { ThemeSwitch } from './ui/ThemeSwitch.tsx';
import { schemeLogo } from './schemes.ts';
import stickerA from '../../brand/stickers/sticker-a.svg?url';

/** Abre el almacén y elige el documento inicial: el último abierto, o el más reciente. */
async function loadApp(firstCanvasTitle: string, temporary: boolean) {
  const app = await bootstrap(firstCanvasTitle, { temporary });
  const docs = await app.service.listDocuments();
  const lastId = await app.service.lastOpenedDocumentId();
  const visible = docs.filter((d) => !d.deleted && isContentKind(d.kind));
  // El último abierto puede ser un documento de texto (se abre en su sección, «Documentos»).
  const last = docs.find(
    (d) => d.id === lastId && !d.deleted && (isContentKind(d.kind) || isDocsKind(d.kind)),
  );
  return {
    app,
    docs,
    activeId: last?.id ?? visible[0]?.id ?? null,
  };
}

export function App() {
  const { t } = useTranslation();
  const { theme, scheme } = useTheme();
  const [services, setServices] = useState<AppServices | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [panel, setPanel] = useState<
    'status' | 'settings' | 'history' | 'conflict' | 'details' | null
  >(null);
  const [searchOpen, setSearchOpen] = useState(false);
  /** Índices de enlaces y búsqueda del almacén abierto. */
  const [runtime, setRuntime] = useState<KnowledgeRuntime | null>(null);
  /** Sincronización con la carpeta conectada (plan 4.2). */
  const [sync, setSync] = useState<SyncRuntime | null>(null);
  /** Contador por documento: al cambiarlo, la vista se monta de nuevo con el contenido guardado. */
  const [reloads, setReloads] = useState<Record<string, number>>({});
  /** Documento abierto que otra pestaña acaba de modificar. */
  const [changedElsewhere, setChangedElsewhere] = useState<string | null>(null);
  const [quotaHigh, setQuotaHigh] = useState(false);
  /** Bienvenida de la primera apertura: idioma y tema (se recuerda en este navegador). */
  const [welcomeOpen, setWelcomeOpen] = useState(shouldShowWelcome);
  const zenMode = useUiStore((s) => s.zen);
  const sidebarCollapse = useSidebarCollapse();
  const { documents, activeId, saveStatus, libraryOpen, selectedFolder, section } = useUiStore(
    useShallow((s) => ({
      documents: s.documents,
      activeId: s.activeId,
      saveStatus: s.saveStatus,
      libraryOpen: s.libraryOpen,
      selectedFolder: s.selectedFolder,
      section: s.section,
    })),
  );
  const {
    setDocuments,
    upsertDocument,
    removeDocument,
    setActive,
    setSaveStatus,
    toggleLibrary,
    sendViewCommand,
  } = useUiStore.getState();
  const statusOpen = panel === 'status';
  /** Sección abierta de Configuración (menú de Perfil o estado remoto de la cabecera). */
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('storage');
  const openSettings = useCallback((section: SettingsSection) => {
    setSettingsSection(section);
    setPanel('settings');
  }, []);
  const reloadView = useCallback(
    (documentId: string) => setReloads((r) => ({ ...r, [documentId]: (r[documentId] ?? 0) + 1 })),
    [],
  );
  /**
   * El documento abierto cambió en otra pestaña, otro dispositivo o fuera de la aplicación: si no
   * hay cambios sin guardar se recarga solo; si los hay, se avisa y no se pisa nada.
   */
  const showRemoteChange = useCallback(
    (documentId: string) => {
      if (useUiStore.getState().saveStatus === 'pending-changes') setChangedElsewhere(documentId);
      else reloadView(documentId);
    },
    [reloadView],
  );

  const reportError = useCallback(
    (error: unknown) => {
      console.error(error);
      logDiagnostic('error', 'action-failed', describeError(error));
      // Los fallos de los destinos remotos traen su propio código (plan 9.2).
      if (error instanceof RemoteError) setActionError(t(`storage.errors.${error.code}`));
      else setActionError(t(`errors.${error instanceof DomainError ? error.code : 'unknown'}`));
    },
    [t],
  );

  // Primera apertura (diseño §1.2): almacén local y lienzo vacío inmediatos, sin cuenta ni Drive.
  // Abre el último documento abierto en este dispositivo (FP-01, paso 2).
  const start = useCallback(
    (temporary: boolean) => {
      loadApp(t('library.untitledCanvas'), temporary).then(
        ({ app, docs, activeId: initial }) => {
          setDocuments(docs);
          setActive(initial);
          setServices(app);
          const knowledge = new KnowledgeRuntime(app);
          knowledge.start();
          setRuntime(knowledge);
          const syncRuntime = new SyncRuntime(
            app,
            (status) => useUiStore.getState().setRemote(status),
            (documentIds) => {
              // Cambios llegados de otro dispositivo o de una edición externa.
              void app.service.listDocuments().then(setDocuments);
              for (const id of documentIds) knowledge.schedule(id);
              const current = useUiStore.getState().activeId;
              if (current && documentIds.includes(current)) showRemoteChange(current);
            },
          );
          void syncRuntime.start();
          setSync(syncRuntime);
          void app.storage.then((report) => {
            const ratio = quotaRatio(report);
            if (ratio !== null && ratio >= QUOTA_WARNING_RATIO) {
              setQuotaHigh(true);
              logDiagnostic('warn', 'quota-high', `uso=${(ratio * 100).toFixed(1)} %`);
            }
          });
        },
        (error: unknown) => {
          console.error(error);
          setStartupError(describeError(error));
        },
      );
    },
    [t, setDocuments, setActive, showRemoteChange],
  );

  useEffect(() => {
    start(false);
  }, [start]);

  useEffect(() => () => runtime?.stop(), [runtime]);
  useEffect(() => () => sync?.stop(), [sync]);
  const runSearch = useCallback(
    (query: string) => runtime?.search(query) ?? Promise.resolve({ hits: [], ms: 0 }),
    [runtime],
  );

  // Búsqueda: Ctrl+Mayús+F (Cmd+Mayús+F en Mac), además del botón de búsqueda.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (services && activeId)
      void services.service.rememberLastOpened(activeId).catch(() => undefined);
  }, [services, activeId]);

  // Aviso entre pestañas (plan 2.7): cada commit se anuncia; la otra pestaña refresca la
  // biblioteca y, si tiene abierto ese documento, ofrece recargarlo antes de seguir editando.
  useEffect(() => {
    if (!services || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(`mindnote:${services.dbName ?? 'temporal'}`);
    const unsubscribe = services.service.onCommit((result) =>
      channel.postMessage({ documentId: result.document.id, revisionId: result.revision.id }),
    );
    channel.onmessage = (event: MessageEvent<{ documentId: string }>) => {
      void services.service.listDocuments().then(setDocuments);
      runtime?.schedule(event.data.documentId);
      if (event.data.documentId === useUiStore.getState().activeId) {
        showRemoteChange(event.data.documentId);
      }
    };
    return () => {
      unsubscribe();
      channel.close();
    };
  }, [services, runtime, setDocuments, showRemoteChange]);

  /** Operaciones que reescriben la cabeza: antes se vacían los guardados pendientes del editor. */
  const runOnDocument = useCallback(
    async (documentId: string, task: () => Promise<void>) => {
      try {
        await flushAllWrites();
        await task();
        reloadView(documentId);
        setSaveStatus('saved-local');
      } catch (error) {
        reportError(error);
      }
    },
    [reloadView, setSaveStatus, reportError],
  );

  const trashDocument = useCallback(
    (documentId: string) =>
      runOnDocument(documentId, async () => {
        const result = await services!.service.trashDocument(documentId);
        upsertDocument(result.document);
        if (useUiStore.getState().activeId === documentId) {
          const next = useUiStore
            .getState()
            .documents.find((d) => !d.deleted && d.id !== documentId);
          setActive(next?.id ?? null);
        }
      }),
    [services, runOnDocument, upsertDocument, setActive],
  );

  const restoreFromTrash = useCallback(
    (documentId: string) =>
      runOnDocument(documentId, async () => {
        const result = await services!.service.restoreFromTrash(documentId);
        upsertDocument(result.document);
        setActive(documentId);
      }),
    [services, runOnDocument, upsertDocument, setActive],
  );

  const purgeDocument = useCallback(
    async (documentId: string) => {
      try {
        const result = await services!.service.purgeDocument(documentId);
        removeDocument(documentId);
        runtime?.schedule(documentId);
        logDiagnostic(
          'info',
          'document-purged',
          `revisiones=${result.revisions} bytes=${result.freedBytes}`,
        );
      } catch (error) {
        reportError(error);
      }
    },
    [services, runtime, removeDocument, reportError],
  );

  const restoreRevision = useCallback(
    (documentId: string, revisionId: string) =>
      runOnDocument(documentId, async () => {
        const result = await services!.service.restoreRevision(documentId, revisionId);
        upsertDocument(result.document);
      }),
    [services, runOnDocument, upsertDocument],
  );

  const resolveConflict = useCallback(
    (documentId: string, choice: ConflictChoice) =>
      runOnDocument(documentId, async () => {
        const { result, duplicate } = await services!.service.resolveConflict(documentId, choice);
        upsertDocument(result.document);
        if (duplicate) upsertDocument(duplicate);
        setPanel(null);
      }),
    [services, runOnDocument, upsertDocument],
  );

  const createDocument = useCallback(
    async (kind: DocumentKind, folderId: string | null = null) => {
      if (!services) return;
      try {
        const title = kind === 'canvas' ? t('library.untitledCanvas') : t('library.untitledNote');
        const doc = await services.service.createDocument(kind, title, folderId);
        upsertDocument(doc);
        setActive(doc.id);
        setSaveStatus('saved-local');
      } catch (error) {
        reportError(error);
      }
    },
    [services, t, upsertDocument, setActive, setSaveStatus, reportError],
  );

  /**
   * Documento nuevo de la sección «Documentos»: con formato (Tiptap, JSON) o Markdown (Milkdown,
   * mismo formato que una nota). Se abre en su sección.
   */
  const createDocsDocument = useCallback(
    async (editor: DocEditorKind, folderId: string | null = null) => {
      if (!services) return;
      try {
        const doc =
          editor === 'tiptap'
            ? await services.service.createRichDoc(t('docs.untitled'), folderId)
            : await services.service.createMarkdownDoc(t('docs.untitled'), folderId);
        upsertDocument(doc);
        setActive(doc.id);
        setSaveStatus('saved-local');
      } catch (error) {
        reportError(error);
      }
    },
    [services, t, upsertDocument, setActive, setSaveStatus, reportError],
  );

  const createFolder = useCallback(
    async (title: string, parentId: string | null, kind: 'folder' | 'docfolder' = 'folder') => {
      try {
        upsertDocument(await services!.service.createFolder(title, parentId, kind));
      } catch (error) {
        reportError(error);
      }
    },
    [services, upsertDocument, reportError],
  );

  /** RF-34, RF-35: importar archivos; el informe lista lo que no se importó o cambió. */
  const importDocuments = useCallback(
    async (files: File[], folderId: string | null) => {
      try {
        const report = await importFiles(services!, files, folderId);
        setDocuments(await services!.service.listDocuments());
        const first = report.created.find((d) => d.kind !== 'folder');
        if (first) setActive(first.id);
        setImportReport(report);
      } catch (error) {
        reportError(error);
      }
    },
    [services, setDocuments, setActive, reportError],
  );

  const exportMarkdown = useCallback(
    async (folderId: string | null) => {
      try {
        await flushAllWrites();
        const count = await exportMarkdownZip(services!, folderId, {
          documentsDir: t('export.documentsDir'),
          tabLabel: (n) => t('docs.tabUntitled', { n }),
        });
        if (!count) setActionError(t('export.noNotes'));
      } catch (error) {
        reportError(error);
      }
    },
    [services, reportError, t],
  );

  /** FA-03a: crear la nota de destino al enlazar, sin abandonar el documento actual. */
  const createNoteForLink = useCallback(
    async (title: string) => {
      const doc = await services!.service.createDocument('note', title);
      upsertDocument(doc);
      return doc;
    },
    [services, upsertDocument],
  );

  const moveDocument = useCallback(
    async (documentId: string, folderId: string | null) => {
      try {
        upsertDocument((await services!.service.moveDocument(documentId, folderId)).document);
      } catch (error) {
        reportError(error);
      }
    },
    [services, upsertDocument, reportError],
  );

  /** Orden manual de la barra lateral (y movimiento de carpeta, si lo hay). */
  const reorderDocuments = useCallback(
    async (
      changes: ReadonlyMap<string, string>,
      move?: { documentId: string; folderId: string | null },
    ) => {
      try {
        await services!.service.reorderDocuments(changes, move);
        const ids = new Set([...changes.keys(), ...(move ? [move.documentId] : [])]);
        const fresh = await services!.service.listDocuments();
        for (const doc of fresh) if (ids.has(doc.id)) upsertDocument(doc);
      } catch (error) {
        reportError(error);
      }
    },
    [services, upsertDocument, reportError],
  );

  const setArchived = useCallback(
    async (documentId: string, archived: boolean) => {
      try {
        upsertDocument((await services!.service.setArchived(documentId, archived)).document);
      } catch (error) {
        reportError(error);
      }
    },
    [services, upsertDocument, reportError],
  );

  const setTags = useCallback(
    async (documentId: string, tags: string[]) => {
      try {
        upsertDocument((await services!.service.setTags(documentId, tags)).document);
      } catch (error) {
        reportError(error);
      }
    },
    [services, upsertDocument, reportError],
  );

  const renameDocument = useCallback(
    async (documentId: string, title: string) => {
      if (!services) return;
      try {
        const result = await services.service.renameDocument(documentId, title);
        upsertDocument(result.document);
        setSaveStatus(result.status === 'conflict' ? 'conflict' : 'saved-local');
      } catch (error) {
        reportError(error);
      }
    },
    [services, upsertDocument, setSaveStatus, reportError],
  );

  // Antes de activar una versión nueva: guardar todo y pausar trabajadores (diseño §14.4).
  const beforeUpdate = useCallback(async () => {
    await flushAllWrites();
    await services?.service.whenIdle();
    services?.hashWorker?.terminate();
  }, [services]);

  if (startupError) {
    return (
      <StartupError
        message={startupError}
        onRetry={() => {
          setStartupError(null);
          start(false);
        }}
        onTemporary={() => {
          setStartupError(null);
          start(true);
        }}
      />
    );
  }
  if (!services)
    return (
      <>
        <div className="view-message">{t('app.loading')}</div>
        {welcomeOpen && <WelcomeDialog onDone={() => setWelcomeOpen(false)} />}
      </>
    );

  const inCalendar = section === 'calendar';
  const inDocs = section === 'documents';
  // En el calendario no hay documento abierto: la cabecera solo deja lo general. Cada sección
  // muestra solo lo suyo: los `doc` en «Documentos» y lienzos y notas en la biblioteca.
  const activeDoc = inCalendar ? null : (documents.find((d) => d.id === activeId) ?? null);
  const active = activeDoc && isDocsKind(activeDoc.kind) === inDocs ? activeDoc : null;
  // Zen solo cuenta con un lienzo abierto (lo fija su vista).
  const zen = zenMode && active?.kind === 'canvas';
  /** Carpeta elegida en la biblioteca, si sigue viva: la exportación de Markdown se limita a ella. */
  const exportFolder =
    selectedFolder && documents.some((d) => d.id === selectedFolder && !d.deleted)
      ? selectedFolder
      : null;
  /** Barra lateral plegada en «solo iconos» (plan 9.19). */
  const rail = !libraryOpen && !zen && sidebarCollapse === 'rail';
  const storageAlert =
    saveStatus === 'out-of-space' ? 'outOfSpace' : quotaHigh ? 'quotaHigh' : null;

  return (
    <div
      className={`shell ${libraryOpen ? 'library-open' : ''}${zen ? ' zen' : ''}${rail ? ' library-rail-on' : ''}`}
    >
      {/* En el modo Zen del lienzo no hay cabecera ni barra lateral; vuelven al salir. */}
      {!zen && (
        <header className="topbar">
          {!libraryOpen && (
            <>
              {/* Con la barra de iconos, su botón y el logotipo sobran aquí (salvo en estrecho). */}
              <button
                type="button"
                className="icon-button topbar-library-toggle"
                aria-label={t('app.toggleLibrary')}
                title={t('app.toggleLibrary')}
                aria-expanded={false}
                onClick={toggleLibrary}
              >
                <Icon name="panel-lateral" />
              </button>
              <img
                className="brand topbar-brand"
                src={schemeLogo(scheme)}
                alt={t('app.name')}
                height={24}
              />
            </>
          )}
          {inCalendar && <span className="doc-title">{t('calendar.title')}</span>}
          {active && (
            <RenameableTitle
              key={active.id}
              className="doc-title"
              title={active.title}
              testId="active-title"
              onRename={(title) => renameDocument(active.id, title)}
            />
          )}
          <RemoteChip onOpen={() => openSettings('storage')} />
          <span className="topbar-spacer" />
          {/* El estado de guardado va junto a Historial: es el estado de la versión. */}
          <span className={`status status-${saveStatus}`} role="status" data-testid="save-status">
            {t(`status.${saveStatus}`)}
          </span>
          {active && (
            <button
              type="button"
              className="icon-button"
              aria-label={t('history.title')}
              title={t('history.title')}
              aria-expanded={panel === 'history'}
              data-testid="open-history"
              onClick={() => setPanel((p) => (p === 'history' ? null : 'history'))}
            >
              <Icon name="historial" />
            </button>
          )}
          {active && !isDocsKind(active.kind) && (
            <button
              type="button"
              className="topbar-button"
              aria-label={t('details.title')}
              title={t('details.title')}
              aria-expanded={panel === 'details'}
              data-testid="open-details"
              onClick={() => setPanel((p) => (p === 'details' ? null : 'details'))}
            >
              <Icon name="enlace" size={18} />
              <span className="topbar-button-label">{t('nav.links')}</span>
            </button>
          )}
          <Menu
            trigger={
              <>
                <span className="topbar-button-label">{t('nav.export')}</span>
                <Icon name="chevron-abajo" size={16} />
              </>
            }
            label={t('nav.export')}
            triggerClassName="topbar-button"
            testId="export-menu"
            placement="bottom-end"
            items={[
              ...(active?.kind === 'canvas'
                ? [
                    {
                      id: 'canvas-export',
                      label: t('nav.exportCanvas'),
                      icon: 'imagen' as const,
                      onSelect: () => sendViewCommand(active.id, 'export'),
                    },
                  ]
                : []),
              ...(active?.kind === 'doc'
                ? [
                    {
                      id: 'doc-export-docx',
                      label: t('nav.exportDocx'),
                      icon: 'documento' as const,
                      onSelect: () => sendViewCommand(active.id, 'export-docx'),
                    },
                    {
                      id: 'doc-export-pdf',
                      label: t('nav.exportPdf'),
                      icon: 'descargar' as const,
                      onSelect: () => sendViewCommand(active.id, 'export-pdf'),
                    },
                    {
                      id: 'doc-export-md',
                      label: t('nav.exportDocMarkdown'),
                      icon: 'documento-md' as const,
                      onSelect: () => sendViewCommand(active.id, 'export-md'),
                    },
                  ]
                : []),
              ...(active?.kind === 'note' || active?.kind === 'mddoc'
                ? [
                    {
                      id: 'note-export',
                      label: t('nav.exportNote'),
                      icon: 'nota' as const,
                      onSelect: () => sendViewCommand(active.id, 'export'),
                    },
                  ]
                : []),
              {
                id: 'export-markdown',
                label: exportFolder
                  ? t('nav.exportMarkdownFolder', {
                      folder: documents.find((d) => d.id === exportFolder)?.title,
                    })
                  : t('nav.exportMarkdownAll'),
                icon: 'descargar',
                separated:
                  active?.kind === 'canvas' ||
                  active?.kind === 'note' ||
                  active?.kind === 'mddoc' ||
                  active?.kind === 'doc',
                onSelect: () => void exportMarkdown(exportFolder),
              },
            ]}
          />
          <Menu
            trigger={<Icon name="mas-opciones" />}
            label={t('nav.more')}
            triggerClassName="icon-button"
            testId="more-menu"
            placement="bottom-end"
            items={[
              {
                id: 'open-search',
                label: t('search.title'),
                icon: 'buscar',
                hint: t('search.shortcut'),
                onSelect: () => setSearchOpen(true),
              },
              {
                id: 'open-status',
                label: t('app.openStatus'),
                icon: 'info',
                onSelect: () => setPanel((p) => (p === 'status' ? null : 'status')),
              },
            ]}
          />
          <ThemeSwitch />
        </header>
      )}

      {services.temporary && (
        <p className="banner banner-warn" role="alert" data-testid="temporary-banner">
          {t('startup.temporaryBanner')}
        </p>
      )}
      {storageAlert && (
        <p className="banner banner-danger" role="alert" data-testid="storage-alert">
          {t(`storageAlert.${storageAlert}`)}{' '}
          <button type="button" onClick={() => setPanel('status')}>
            {t('storageAlert.openStatus')}
          </button>{' '}
          <button
            type="button"
            onClick={() => void runEmergencyExport(services).catch(reportError)}
          >
            {t('storageAlert.emergencyExport')}
          </button>
        </p>
      )}

      {importReport && (
        <ImportReportDialog report={importReport} onClose={() => setImportReport(null)} />
      )}
      {actionError && (
        <div className="toast" role="alert">
          {actionError}
          <button
            type="button"
            className="icon-button"
            aria-label={t('app.dismiss')}
            onClick={() => setActionError(null)}
          >
            <Icon name="cerrar" size={18} />
          </button>
        </div>
      )}

      {libraryOpen && !zen && (
        <div className="library-backdrop" aria-hidden="true" onClick={toggleLibrary} />
      )}
      {rail && (
        <LibraryRail
          onCreate={(kind) => createDocument(kind)}
          onCreateDoc={(editor) => createDocsDocument(editor)}
          onOpenSettings={openSettings}
        />
      )}
      {libraryOpen && !zen && (
        <LibrarySidebar
          onCreate={createDocument}
          onCreateFolder={createFolder}
          onRename={renameDocument}
          onTrash={trashDocument}
          onImport={importDocuments}
          onMove={moveDocument}
          onReorder={reorderDocuments}
          onArchive={setArchived}
          onOpenSettings={openSettings}
          onCreateDoc={createDocsDocument}
          onSetCalendarColor={(id, color) =>
            useCalendarStore.getState().setCalendarColor(services.service, id, color)
          }
          onCreateCalendar={(title) =>
            useCalendarStore
              .getState()
              .createCalendar(
                services.service,
                title,
                // Cada calendario nuevo con el siguiente color de la paleta.
                EVENT_COLORS[
                  documents.filter((d) => d.kind === 'calendar').length % EVENT_COLORS.length
                ]!,
              )
              .catch(reportError)
          }
        />
      )}

      <main className="workspace">
        <div className="workspace-banners">
          {active && hasConflict(active) && (
            <p className="banner banner-danger" role="alert" data-testid="conflict-banner">
              {t('conflict.banner')}{' '}
              <button
                type="button"
                data-testid="open-conflict"
                onClick={() => setPanel('conflict')}
              >
                {t('conflict.resolve')}
              </button>
            </p>
          )}
          {active && changedElsewhere === active.id && (
            <p className="banner banner-warn" role="alert" data-testid="changed-elsewhere">
              {t('app.changedElsewhere')}{' '}
              <button
                type="button"
                onClick={() => {
                  setChangedElsewhere(null);
                  reloadView(active.id);
                }}
              >
                {t('app.reload')}
              </button>
            </p>
          )}
        </div>
        {inCalendar && <CalendarView service={services.service} />}
        {!active && inDocs && (
          <div className="empty-state" data-testid="docs-empty-state">
            <img className="sticker" src={stickerA} alt="" width={120} height={120} />
            <h2>{t('docs.emptyTitle')}</h2>
            <p>{t('docs.emptyBody')}</p>
            <div className="empty-actions">
              <button
                type="button"
                className="primary"
                data-testid="empty-new-rich"
                onClick={() => void createDocsDocument('tiptap')}
              >
                <Icon name="documento" size={18} />
                {t('docs.kindRich')}
              </button>
              <button
                type="button"
                data-testid="empty-new-markdown"
                onClick={() => void createDocsDocument('milkdown')}
              >
                <Icon name="documento-md" size={18} />
                {t('docs.kindMarkdown')}
              </button>
            </div>
          </div>
        )}
        {active?.kind === 'mddoc' && (
          <MarkdownDocView
            key={`${active.id}:${reloads[active.id] ?? 0}`}
            documentId={active.id}
            title={active.title}
            service={services.service}
            knowledge={services.knowledge}
            onCreateNote={createNoteForLink}
          />
        )}
        {active?.kind === 'doc' && (
          <DocView
            key={`${active.id}:${reloads[active.id] ?? 0}`}
            documentId={active.id}
            service={services.service}
            knowledge={services.knowledge}
            onCreateNote={createNoteForLink}
          />
        )}
        {!active && !inCalendar && !inDocs && (
          // Estado vacío (DESIGN.md §6): una invitación con el personaje de la marca.
          <div className="empty-state" data-testid="empty-state">
            <img className="sticker" src={stickerA} alt="" width={120} height={120} />
            <h2>{t('empty.title')}</h2>
            <p>{t('empty.body')}</p>
            <button
              type="button"
              className="primary"
              onClick={() => void createDocument('canvas', null)}
            >
              {t('empty.action')}
            </button>
          </div>
        )}
        {active?.kind === 'canvas' && (
          <CanvasView
            key={`${active.id}:${reloads[active.id] ?? 0}`}
            documentId={active.id}
            title={active.title}
            service={services.service}
            theme={theme}
            onCreateNote={createNoteForLink}
          />
        )}
        {active?.kind === 'note' && (
          <NoteView
            key={`${active.id}:${reloads[active.id] ?? 0}`}
            documentId={active.id}
            title={active.title}
            service={services.service}
            knowledge={services.knowledge}
            onCreateNote={createNoteForLink}
          />
        )}
      </main>
      {statusOpen && (
        <StatusPanel services={services} onClose={() => setPanel(null)} onError={reportError} />
      )}
      {panel === 'settings' && (
        <SettingsDialog
          section={settingsSection}
          onSection={setSettingsSection}
          services={services}
          sync={sync}
          onRestoreFromTrash={restoreFromTrash}
          onPurge={purgeDocument}
          onUnarchive={(documentId) => setArchived(documentId, false)}
          onClose={() => setPanel(null)}
          onError={reportError}
        />
      )}
      {panel === 'history' && active && (
        <HistoryPanel
          key={active.id}
          document={active}
          service={services.service}
          onRestore={(revisionId) => restoreRevision(active.id, revisionId)}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'details' && active && (
        <DetailsPanel
          key={active.id}
          document={active}
          knowledge={services.knowledge}
          onMove={(folderId) => moveDocument(active.id, folderId)}
          onSetTags={(tags) => setTags(active.id, tags)}
          onClose={() => setPanel(null)}
        />
      )}
      {searchOpen && runtime && (
        <SearchPalette search={runSearch} onClose={() => setSearchOpen(false)} />
      )}
      {panel === 'conflict' && active && (
        <ConflictPanel
          key={active.id}
          document={active}
          service={services.service}
          onResolve={(choice) => resolveConflict(active.id, choice)}
          onClose={() => setPanel(null)}
        />
      )}
      <PwaPrompt beforeUpdate={beforeUpdate} />
      {welcomeOpen && <WelcomeDialog onDone={() => setWelcomeOpen(false)} />}
    </div>
  );
}
