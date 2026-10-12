import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { DomainError } from '../domain/errors.ts';
import type { DocumentKind } from '../domain/revision.ts';
import { CanvasView } from '../features/canvas/CanvasView.tsx';
import { LibrarySidebar } from '../features/library/LibrarySidebar.tsx';
import { RenameableTitle } from '../features/library/RenameableTitle.tsx';
import { NoteView } from '../features/notes/NoteView.tsx';
import { QUOTA_WARNING_RATIO, quotaRatio, StatusPanel } from '../features/status/StatusPanel.tsx';
import { describeError } from '../ports/Diagnostics.ts';
import { runEmergencyExport } from './emergency.ts';
import { LANGUAGES, setLanguage, type AppLanguage } from './i18n.ts';
import { PwaPrompt } from './PwaPrompt.tsx';
import { flushAllWrites, logDiagnostic } from './runtime.ts';
import { bootstrap, type AppServices } from './services.ts';
import { StartupError } from './StartupError.tsx';
import { useUiStore } from './store.ts';

const darkQuery = '(prefers-color-scheme: dark)';
function subscribeTheme(callback: () => void) {
  const mq = window.matchMedia(darkQuery);
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}
function useSystemTheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribeTheme, () =>
    window.matchMedia(darkQuery).matches ? 'dark' : 'light',
  );
}

/** Abre el almacén y elige el documento inicial: el último abierto, o el más reciente. */
async function loadApp(firstCanvasTitle: string, temporary: boolean) {
  const app = await bootstrap(firstCanvasTitle, { temporary });
  const docs = await app.service.listDocuments();
  const lastId = await app.service.lastOpenedDocumentId();
  const visible = docs.filter((d) => !d.deleted);
  return {
    app,
    docs,
    activeId: visible.find((d) => d.id === lastId)?.id ?? visible[0]?.id ?? null,
  };
}

export function App() {
  const { t, i18n } = useTranslation();
  const theme = useSystemTheme();
  const [services, setServices] = useState<AppServices | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [quotaHigh, setQuotaHigh] = useState(false);
  const { documents, activeId, saveStatus, libraryOpen } = useUiStore();
  const { setDocuments, upsertDocument, setActive, setSaveStatus, toggleLibrary } =
    useUiStore.getState();

  const reportError = useCallback(
    (error: unknown) => {
      console.error(error);
      logDiagnostic('error', 'action-failed', describeError(error));
      const code = error instanceof DomainError ? error.code : 'unknown';
      setActionError(t(`errors.${code}`));
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
    [t, setDocuments, setActive],
  );

  useEffect(() => {
    start(false);
  }, [start]);

  useEffect(() => {
    if (services && activeId)
      void services.service.rememberLastOpened(activeId).catch(() => undefined);
  }, [services, activeId]);

  const createDocument = useCallback(
    async (kind: DocumentKind) => {
      if (!services) return;
      try {
        const title = kind === 'canvas' ? t('library.untitledCanvas') : t('library.untitledNote');
        const doc = await services.service.createDocument(kind, title);
        upsertDocument(doc);
        setActive(doc.id);
        setSaveStatus('saved-local');
      } catch (error) {
        reportError(error);
      }
    },
    [services, t, upsertDocument, setActive, setSaveStatus, reportError],
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
  if (!services) return <div className="view-message">{t('app.loading')}</div>;

  const active = documents.find((d) => d.id === activeId) ?? null;
  const storageAlert =
    saveStatus === 'out-of-space' ? 'outOfSpace' : quotaHigh ? 'quotaHigh' : null;

  return (
    <div className={`shell ${libraryOpen ? 'library-open' : ''}`} data-theme={theme}>
      <header className="topbar">
        <button
          type="button"
          className="icon-button"
          aria-label={t('app.toggleLibrary')}
          aria-expanded={libraryOpen}
          onClick={toggleLibrary}
        >
          ☰
        </button>
        <span className="brand">{t('app.name')}</span>
        {active && (
          <RenameableTitle
            key={active.id}
            className="doc-title"
            title={active.title}
            testId="active-title"
            onRename={(title) => renameDocument(active.id, title)}
          />
        )}
        <span className={`status status-${saveStatus}`} role="status" data-testid="save-status">
          {t(`status.${saveStatus}`)}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={t('app.openStatus')}
          title={t('app.openStatus')}
          aria-expanded={statusOpen}
          data-testid="open-status"
          onClick={() => setStatusOpen((v) => !v)}
        >
          ⓘ
        </button>
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
      </header>

      {services.temporary && (
        <p className="banner banner-warn" role="alert" data-testid="temporary-banner">
          {t('startup.temporaryBanner')}
        </p>
      )}
      {storageAlert && (
        <p className="banner banner-danger" role="alert" data-testid="storage-alert">
          {t(`storageAlert.${storageAlert}`)}{' '}
          <button type="button" onClick={() => setStatusOpen(true)}>
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

      {actionError && (
        <div className="toast" role="alert">
          {actionError}
          <button type="button" onClick={() => setActionError(null)}>
            ✕
          </button>
        </div>
      )}

      {libraryOpen && <LibrarySidebar onCreate={createDocument} onRename={renameDocument} />}

      <main className="workspace">
        {active?.kind === 'canvas' && (
          <CanvasView
            key={active.id}
            documentId={active.id}
            service={services.service}
            theme={theme}
          />
        )}
        {active?.kind === 'note' && (
          <NoteView key={active.id} documentId={active.id} service={services.service} />
        )}
      </main>
      {statusOpen && (
        <StatusPanel
          services={services}
          onClose={() => setStatusOpen(false)}
          onError={reportError}
        />
      )}
      <PwaPrompt beforeUpdate={beforeUpdate} />
    </div>
  );
}
