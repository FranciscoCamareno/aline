import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  newElementWith,
  restoreElements,
  viewportCoordsToSceneCoords,
} from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { excalidrawCanvasAdapter, type EngineScene } from '../../adapters/excalidraw/sceneCodec.ts';
import {
  currentBindings,
  deriveExtensions,
  type ArrowBindings,
} from '../../adapters/excalidraw/sidecar.ts';
import { excalidrawLangCode } from '../../app/i18n.ts';
import { logDiagnostic } from '../../app/runtime.ts';
import { describeError } from '../../ports/Diagnostics.ts';
import { useUiStore } from '../../app/store.ts';
import { Icon } from '../../app/ui/Icon.tsx';
import { useAutosave } from '../../app/useAutosave.ts';
import { internalLink, parseInternalLink } from '../../application/knowledge.ts';
import type { EditSession, VaultService } from '../../application/VaultService.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import type { CanvasExtensions } from '../../domain/sidecar.ts';
import { LinkPicker } from '../knowledge/LinkPicker.tsx';
import { ExportDialog } from './ExportDialog.tsx';
import { insertSticker, STICKER_DRAG_TYPE, STICKER_NAMES, type StickerName } from './stickers.ts';
import { ToolTray } from './ToolTray.tsx';

interface Props {
  documentId: string;
  /** Título vigente, para el nombre de los archivos exportados. */
  title: string;
  service: VaultService;
  theme: 'light' | 'dark';
  /** FA-03a: crear la nota de destino al vincular. */
  onCreateNote: (title: string) => Promise<DocumentRecord>;
}

interface Loaded {
  session: EditSession;
  scene: EngineScene;
  extensions: CanvasExtensions;
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
 * El motor activa `penMode` al detectar el lápiz (fase 0); la barra propia muestra entonces el
 * interruptor «Solo lápiz». Pendiente: interfaz propia de ese modo (fase 6) y pila de deshacer
 * coordinada con comandos propios.
 */
export function CanvasView({ documentId, title, service, theme, onCreateNote }: Props) {
  const { t, i18n } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const signatureRef = useRef<string | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  /** Sidecar vigente y extremos anclados del último guardado (para detectar conectores sueltos). */
  const extensionsRef = useRef<CanvasExtensions | null>(null);
  const bindingsRef = useRef<ArrowBindings>(new Map());
  const [dangling, setDangling] = useState<string[]>([]);
  const [selection, setSelection] = useState<ExcalidrawElement | null>(null);
  const selectionKey = useRef('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const navigate = useUiStore((s) => s.navigate);
  const focus = useUiStore((s) => s.focus);
  /** Las órdenes anteriores al montaje no se ejecutan. */
  const handledCommand = useRef(useUiStore.getState().viewCommand?.seq ?? 0);

  // Órdenes de la cabecera: exportar (diálogo propio) y ayuda de atajos del motor.
  useEffect(
    () =>
      useUiStore.subscribe(({ viewCommand }) => {
        if (!api || !viewCommand || viewCommand.documentId !== documentId) return;
        if (viewCommand.seq <= handledCommand.current) return;
        handledCommand.current = viewCommand.seq;
        if (viewCommand.kind === 'export') setExportOpen(true);
        else api.updateScene({ appState: { openDialog: { name: 'help' } } });
      }),
    [api, documentId],
  );

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
      extensionsRef.current = opened.extensions;
      bindingsRef.current = currentBindings(scene.elements);
      setDangling(opened.extensions.danglingConnectorIds);
      setLoaded({ session: opened.session, scene, extensions: opened.extensions, recoveredDraft });
    })().catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
    };
  }, [documentId, service]);

  const session = loaded?.session;
  const autosave = useAutosave<EngineScene>((scene) => {
    if (!session || !extensionsRef.current) return Promise.reject(new Error('Lienzo no cargado'));
    // El sidecar se deriva de la escena en cada guardado: enlaces y conectores sueltos (§9).
    const extensions = deriveExtensions(extensionsRef.current, scene.elements, bindingsRef.current);
    extensionsRef.current = extensions;
    bindingsRef.current = currentBindings(scene.elements);
    setDangling(extensions.danglingConnectorIds);
    return service.saveCanvas(
      session,
      excalidrawCanvasAdapter.serialize(scene).then((canvas) => ({ ...canvas, extensions })),
    );
  });

  const pendingFocus = useRef<string | null>(null);
  const applyPendingFocus = useCallback(() => {
    const elementId = pendingFocus.current;
    if (!api || !elementId) return;
    const element = api.getSceneElements().find((e) => e.id === elementId);
    if (!element) return;
    pendingFocus.current = null;
    // Fuera del ciclo de onChange del motor.
    setTimeout(() => {
      api.scrollToContent(element, { animate: false });
      api.updateScene({
        appState: { selectedElementIds: { [element.id]: true } },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }, 0);
  }, [api]);

  const lastDraftAt = useRef(0);
  const onChange = useCallback<NonNullable<Parameters<typeof Excalidraw>[0]['onChange']>>(
    (elements, appState, files) => {
      if (pendingFocus.current) applyPendingFocus();
      // Selección actual, para ofrecer «Vincular» cuando hay un solo elemento.
      const ids = Object.keys(appState.selectedElementIds).filter(
        (id) => appState.selectedElementIds[id],
      );
      const key = ids.join(',');
      if (key !== selectionKey.current) {
        selectionKey.current = key;
        setSelection(ids.length === 1 ? (elements.find((e) => e.id === ids[0]) ?? null) : null);
      }
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
    [autosave, session, service, documentId, applyPendingFocus],
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

  // Abrir un lienzo desde un enlace, un backlink o la búsqueda: centrar y resaltar el elemento.
  // El motor entrega su API antes de cargar la escena, así que el destino queda pendiente hasta
  // que el elemento exista (se reintenta en cada onChange).
  useEffect(() => {
    if (focus?.documentId !== documentId) return;
    const target = useUiStore.getState().consumeFocus(documentId);
    if (target?.elementId) pendingFocus.current = target.elementId;
    applyPendingFocus();
  }, [focus, documentId, applyPendingFocus]);

  /** Escribe el enlace en el elemento; el guardado deriva el sidecar (autoridad) a partir de él. */
  const setElementLink = (link: string | null) => {
    if (!api || !selection) return;
    const id = selection.id;
    api.updateScene({
      elements: api
        .getSceneElementsIncludingDeleted()
        .map((e) => (e.id === id ? newElementWith(e, { link }) : e)),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setPickerOpen(false);
  };

  const selectDangling = () => {
    if (!api || !dangling.length) return;
    api.updateScene({
      appState: { selectedElementIds: Object.fromEntries(dangling.map((id) => [id, true])) },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  };

  if (loadError)
    return (
      <div className="view-message" role="alert">
        {loadError}
      </div>
    );
  if (!loaded) return <div className="view-message" aria-busy="true" />;

  return (
    <div
      className="canvas-host"
      data-testid="canvas-host"
      // Un sticker arrastrado desde el selector se suelta donde cae (antes de que el motor
      // intente leerlo como archivo).
      onDragOverCapture={(e) => {
        if (api && e.dataTransfer.types.includes(STICKER_DRAG_TYPE)) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDropCapture={(e) => {
        const name = e.dataTransfer.getData(STICKER_DRAG_TYPE) as StickerName;
        if (!api || !STICKER_NAMES.includes(name) || loaded.session.readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        const at = viewportCoordsToSceneCoords(
          { clientX: e.clientX, clientY: e.clientY },
          api.getAppState(),
        );
        insertSticker(api, name, at).catch((error: unknown) =>
          logDiagnostic('error', 'sticker-insert', describeError(error)),
        );
      }}
    >
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
      {/* Barra propia (DESIGN.md §7); la del motor queda oculta por CSS. */}
      {api && !loaded.session.readOnly && <ToolTray api={api} theme={theme} />}
      <div className="canvas-tools">
        {selection && !loaded.session.readOnly && (
          <button type="button" data-testid="link-element" onClick={() => setPickerOpen(true)}>
            <Icon name="enlace" size={18} />
            {selection.link ? t('links.editLink') : t('links.linkElement')}
          </button>
        )}
        {dangling.length > 0 && (
          <button
            type="button"
            className="danger"
            data-testid="dangling-connectors"
            onClick={selectDangling}
          >
            {t('canvas.dangling', { count: dangling.length })}
          </button>
        )}
      </div>
      {exportOpen && api && (
        <ExportDialog api={api} title={title} onClose={() => setExportOpen(false)} />
      )}
      {pickerOpen && selection && (
        <LinkPicker
          sourceId={documentId}
          currentLink={selection.link ?? null}
          onPick={(doc) => setElementLink(internalLink(doc.id))}
          onCreateNote={(title) => {
            void onCreateNote(title).then((doc) => setElementLink(internalLink(doc.id)));
          }}
          onWeb={(url) => setElementLink(url)}
          onRemove={() => setElementLink(null)}
          onClose={() => setPickerOpen(false)}
        />
      )}
      <Excalidraw
        excalidrawAPI={setApi}
        onLinkOpen={(element, event) => {
          const target = element.link ? parseInternalLink(element.link) : null;
          if (!target) return; // Enlace web: lo abre el motor en otra pestaña.
          event.preventDefault();
          navigate({ documentId: target.documentId, elementId: target.elementId });
        }}
        initialData={loaded.scene}
        // Sin herramienta web ni incrustaciones (diseño §13): un elemento incrustable que llegue
        // en una escena sincronizada o importada se muestra sin cargar la página externa.
        validateEmbeddable={false}
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
          {/* Exportación propia: PNG, SVG, PDF y .excalidraw con avisos (diseño §12.1). */}
          <MainMenu.Item onSelect={() => setExportOpen(true)}>{t('export.open')}</MainMenu.Item>
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
