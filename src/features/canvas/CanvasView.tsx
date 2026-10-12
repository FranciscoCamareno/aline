import { Excalidraw, MainMenu } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { excalidrawCanvasAdapter, type EngineScene } from '../../adapters/excalidraw/sceneCodec.ts';
import { excalidrawLangCode } from '../../app/i18n.ts';
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
}

/**
 * Lienzo Excalidraw. La edición interactiva del motor se captura en onChange y se guarda
 * mediante el adaptador (diseño §4). El modo «Solo lápiz», el borrador de trazo en curso y la
 * pila de deshacer coordinada están PENDIENTES de la prueba de viabilidad (fase 0).
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
      if (cancelled) return;
      signatureRef.current = excalidrawCanvasAdapter.contentSignature(scene);
      setLoaded({ session: opened.session, scene });
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

  const onChange = useCallback<NonNullable<Parameters<typeof Excalidraw>[0]['onChange']>>(
    (elements, appState, files) => {
      const scene: EngineScene = { elements, appState, files };
      const signature = excalidrawCanvasAdapter.contentSignature(scene);
      // Desplazamiento, zoom y selección no generan revisiones de contenido.
      // En solo lectura no se guarda nada (versión desconocida o contenido inválido).
      if (signature === signatureRef.current || session?.readOnly) return;
      signatureRef.current = signature;
      autosave.push(scene);
    },
    [autosave, session],
  );

  // Guardar también al terminar un trazo o una manipulación. El motor emite el último onChange
  // después de pointerup, por eso el guardado se difiere un instante.
  const onPointerUp = useCallback(() => {
    setTimeout(() => {
      if (autosave.pending) void autosave.flush().catch(() => undefined);
    }, 50);
  }, [autosave]);

  if (loadError)
    return (
      <div className="view-message" role="alert">
        {loadError}
      </div>
    );
  if (!loaded) return <div className="view-message" aria-busy="true" />;

  return (
    <div className="canvas-host" data-testid="canvas-host">
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
