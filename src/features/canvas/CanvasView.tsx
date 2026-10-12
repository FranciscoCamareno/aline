import { Excalidraw, MainMenu, restoreElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { excalidrawCanvasAdapter, type EngineScene } from '../../adapters/excalidraw/sceneCodec.ts';
import { excalidrawLangCode } from '../../app/i18n.ts';
import { logDiagnostic } from '../../app/runtime.ts';
import { useAutosave } from '../../app/useAutosave.ts';
import type { EditSession, VaultService } from '../../application/VaultService.ts';

interface Props {
  documentId: string;
  service: VaultService;
  theme: 'light' | 'dark';
}

interface Loaded {
  session: EditSession;
  scene: EngineScene;
  /** Se recuperó un trazo que quedó a medias al cerrarse la aplicación. */
  recoveredDraft: boolean;
}

/** Intervalo del borrador del trazo en curso (diseño §7.1). */
const DRAFT_INTERVAL_MS = 1000;

function isElementLike(value: unknown): value is ExcalidrawElement {
  return typeof value === 'object' && value !== null && 'id' in value && 'type' in value;
}

/**
 * Lienzo Excalidraw. La edición interactiva del motor se captura en onChange y se guarda
 * mediante el adaptador (diseño §4). Mientras hay un trazo en curso no se crean revisiones:
 * se guarda un borrador cada segundo y la revisión llega al levantar el puntero (§7.1).
 * El motor activa `penMode` al detectar el lápiz (fase 0). Pendiente: interfaz propia del modo
 * «Solo lápiz» y pila de deshacer coordinada con comandos propios.
 */
export function CanvasView({ documentId, service, theme }: Props) {
  const { t, i18n } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const signatureRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const opened = await service.openCanvas(documentId);
      const scene = await excalidrawCanvasAdapter.deserialize(opened.sceneJson ?? '{}', (hash) =>
        service.loadAsset(hash),
      );
      const draft = opened.readOnly ? null : await service.takeStrokeDraft(documentId);
      let recoveredDraft = false;
      if (draft && isElementLike(draft.element)) {
        const element = draft.element;
        const present = scene.elements.find((e) => e.id === element.id);
        if (!present || present.version < element.version) {
          const [restored] = restoreElements([element], null);
          if (restored) {
            scene.elements = [...scene.elements.filter((e) => e.id !== element.id), restored];
            recoveredDraft = true;
            logDiagnostic('warn', 'stroke-draft-recovered', `guardado ${draft.savedAt}`);
          }
        }
      }
      if (cancelled) return;
      // Con un trazo recuperado, el primer onChange crea la revisión que faltaba.
      signatureRef.current = recoveredDraft
        ? null
        : excalidrawCanvasAdapter.contentSignature(scene);
      setLoaded({ session: opened.session, scene, recoveredDraft });
    })().catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
    };
  }, [documentId, service]);

  const session = loaded?.session;
  const autosave = useAutosave<EngineScene>((scene) => {
    if (!session) return Promise.reject(new Error('Lienzo no cargado'));
    return service.saveCanvas(session, excalidrawCanvasAdapter.serialize(scene));
  });

  const lastDraftAt = useRef(0);
  const onChange = useCallback<NonNullable<Parameters<typeof Excalidraw>[0]['onChange']>>(
    (elements, appState, files) => {
      if (session?.readOnly) return;
      // Trazo en curso: borrador periódico en lugar de revisiones (diseño §7.1).
      if (appState.newElement) {
        const now = Date.now();
        if (now - lastDraftAt.current >= DRAFT_INTERVAL_MS) {
          lastDraftAt.current = now;
          void service.saveStrokeDraft(documentId, appState.newElement).catch(() => undefined);
        }
        return;
      }
      const scene: EngineScene = { elements, appState, files };
      const signature = excalidrawCanvasAdapter.contentSignature(scene);
      // Desplazamiento, zoom y selección no generan revisiones de contenido.
      // En solo lectura no se guarda nada (versión desconocida o contenido inválido).
      if (signature === signatureRef.current || session?.readOnly) return;
      signatureRef.current = signature;
      autosave.push(scene);
    },
    [autosave, session, service, documentId],
  );

  // Guardar también al terminar un trazo o una manipulación. El motor emite el último onChange
  // después de pointerup, por eso el guardado se difiere un instante.
  const onPointerUp = useCallback(() => {
    setTimeout(() => {
      const saved = autosave.pending ? autosave.flush() : Promise.resolve();
      // El borrador solo se descarta cuando la revisión del trazo ya está guardada.
      void saved
        .then(() => {
          if (!lastDraftAt.current) return undefined;
          lastDraftAt.current = 0;
          return service.clearStrokeDraft(documentId);
        })
        .catch(() => undefined);
    }, 50);
  }, [autosave, service, documentId]);

  if (loadError)
    return (
      <div className="view-message" role="alert">
        {loadError}
      </div>
    );
  if (!loaded) return <div className="view-message" aria-busy="true" />;

  return (
    <div className="canvas-host" data-testid="canvas-host">
      {loaded.recoveredDraft && (
        <p className="notice canvas-notice" role="status" data-testid="draft-recovered">
          {t('canvas.draftRecovered')}
        </p>
      )}
      {loaded.session.readOnly && (
        <p className="notice canvas-notice" role="alert" data-testid="read-only-notice">
          {t(`readOnly.${loaded.session.readOnly}`)}
        </p>
      )}
      <Excalidraw
        initialData={loaded.scene}
        viewModeEnabled={loaded.session.readOnly !== null}
        onChange={onChange}
        onPointerUp={onPointerUp}
        langCode={excalidrawLangCode(i18n.language)}
        theme={theme}
        UIOptions={{
          canvasActions: {
            // Abrir/guardar archivos sueltos queda fuera: el almacén es la fuente de verdad.
            loadScene: false,
            saveToActiveFile: false,
          },
        }}
      >
        {/* Menú propio sin enlaces a servicios externos (diseño §13). */}
        <MainMenu>
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}
