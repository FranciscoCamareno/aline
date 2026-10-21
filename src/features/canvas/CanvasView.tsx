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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { displayedCanvasBackground } from '../../app/schemes.ts';
import { linkFocus, useUiStore } from '../../app/store.ts';
import { activeScheme, useTheme } from '../../app/theme.ts';
import { Icon } from '../../app/ui/Icon.tsx';
import { useAutosave } from '../../app/useAutosave.ts';
import { internalLink, parseInternalLink } from '../../domain/links.ts';
import type { EditSession, VaultService } from '../../application/VaultService.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import type { CanvasExtensions } from '../../domain/sidecar.ts';
import { LinkPicker } from '../knowledge/LinkPicker.tsx';
import { ExportDialog } from './ExportDialog.tsx';
import { insertSticker, STICKER_DRAG_TYPE, STICKER_NAMES, type StickerName } from './stickers.ts';
import { removeExternalLinksFromEngineDialogs } from './engineDialogs.ts';
import {
  applyCanvasWikiLink,
  watchCanvasWikiLinks,
  type CanvasWikiTarget,
} from './canvasWikiLink.ts';
import { attachStickerLayer } from './stickerLayer.ts';
import { watchStickyText } from './stickyText.ts';
import { cardText, insertNoteCard, noteEmbedsOf, refreshNoteCards } from './noteCards.ts';
import {
  applyProjection,
  createChild,
  hiddenIds,
  isMindNode,
  liveDescendants,
  revealElement,
  startEditingSelected,
  toggleCollapse,
} from './mindMapCanvas.ts';
import { attachCanvasCursors } from './canvasCursors.ts';
import { TemplatesPanel } from './TemplatesPanel.tsx';
import { insertTemplate, TEMPLATE_DRAG_TYPE } from './templates.ts';
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
  /** Hay al menos un elemento seleccionado (para «Guardar selección» en Plantillas). */
  const [anySelected, setAnySelected] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const selectionKey = useRef('');
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Selector de la nota para una tarjeta nueva (plan 9.24). */
  const [cardPickerOpen, setCardPickerOpen] = useState(false);
  const documents = useUiStore((s) => s.documents);
  /** Árbol del mapa mental vigente (copia en estado del sidecar, para pintar sus botones). */
  const [mindMap, setMindMapState] = useState<CanvasExtensions['mindMap'] | null>(null);
  /** Cambia el árbol en el sidecar (lo que se guardará) y en la interfaz. */
  const setMindMap = useCallback((next: CanvasExtensions['mindMap']) => {
    const extensions = extensionsRef.current;
    if (!extensions) return;
    extensionsRef.current = { ...extensions, mindMap: next };
    setMindMapState(next);
  }, []);
  /** Texto en el que se escribió `[[`, con su selector abierto (plan 9.5). */
  const [wikiTarget, setWikiTarget] = useState<CanvasWikiTarget | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const openExport = () => setExportOpen(true);
  const navigate = useUiStore((s) => s.navigate);
  const focus = useUiStore((s) => s.focus);
  const hostRef = useRef<HTMLDivElement>(null);
  const stickerLayer = useRef<ReturnType<typeof attachStickerLayer> | null>(null);
  const { scheme } = useTheme();
  /**
   * Fondo del lienzo (DESIGN.md §2.5): `stored` es el de la escena guardada y `shown` el que se
   * pinta con el esquema activo. Guardar y exportar usan siempre `stored`.
   */
  const backgroundRef = useRef<{ stored: string; shown: string } | null>(null);
  /** Modo Zen del motor: la aplicación oculta su barra lateral y su cabecera. */
  const zenRef = useRef(false);
  useEffect(() => () => useUiStore.getState().setZen(false), []);

  // Stickers sin filtro de tema en oscuro (ver stickerLayer.ts).
  useEffect(() => {
    if (!api || !hostRef.current) return;
    const layer = attachStickerLayer(api, hostRef.current);
    stickerLayer.current = layer;
    layer.setDark(theme === 'dark');
    return () => {
      layer.dispose();
      stickerLayer.current = null;
    };
    // El tema se aplica en el efecto siguiente; aquí solo cuenta el motor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);
  useEffect(() => {
    stickerLayer.current?.setDark(theme === 'dark');
  }, [theme]);

  // Sin los enlaces externos del diálogo de ayuda del motor (ver engineDialogs.ts).
  useEffect(() => removeExternalLinksFromEngineDialogs(), []);
  /** Las órdenes anteriores al montaje no se ejecutan. */
  const handledCommand = useRef(useUiStore.getState().viewCommand?.seq ?? 0);

  // Órdenes de la cabecera: exportar (diálogo propio) y ayuda de atajos del motor.
  useEffect(
    () =>
      useUiStore.subscribe(({ viewCommand }) => {
        if (!api || !viewCommand || viewCommand.documentId !== documentId) return;
        if (viewCommand.seq <= handledCommand.current) return;
        handledCommand.current = viewCommand.seq;
        if (viewCommand.kind === 'export') openExport();
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
      // El fondo se pinta con el del esquema activo, sin cambiar lo guardado (ni la firma).
      const stored = scene.appState.viewBackgroundColor ?? '#ffffff';
      const shown = displayedCanvasBackground(stored, activeScheme());
      backgroundRef.current = { stored, shown };
      scene.appState = { ...scene.appState, viewBackgroundColor: shown };
      extensionsRef.current = opened.extensions;
      setMindMapState(opened.extensions.mindMap);
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
    // Si lo oculta una rama plegada, se despliega (plan 9.23).
    const extensions = extensionsRef.current;
    if (extensions) {
      const revealed = revealElement(api, extensions.mindMap, elementId);
      if (revealed) setMindMap(revealed);
    }
    // Fuera del ciclo de onChange del motor.
    setTimeout(() => {
      api.scrollToContent(element, { animate: false });
      api.updateScene({
        appState: { selectedElementIds: { [element.id]: true } },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }, 0);
  }, [api, setMindMap]);

  const projectionQueued = useRef(false);
  const scheduleProjection = useCallback(() => {
    if (!api || projectionQueued.current) return;
    projectionQueued.current = true;
    requestAnimationFrame(() => {
      projectionQueued.current = false;
      const extensions = extensionsRef.current;
      if (!extensions || api.getAppState().newElement) return;
      const projected = applyProjection(api, extensions.mindMap);
      if (projected) setMindMap(projected);
    });
  }, [api, setMindMap]);

  const lastDraftAt = useRef(0);
  const onChange = useCallback<NonNullable<Parameters<typeof Excalidraw>[0]['onChange']>>(
    (elements, appState, files) => {
      if (appState.zenModeEnabled !== zenRef.current) {
        zenRef.current = appState.zenModeEnabled;
        useUiStore.getState().setZen(appState.zenModeEnabled);
      }
      if (pendingFocus.current) applyPendingFocus();
      // Selección actual, para ofrecer «Vincular» cuando hay un solo elemento.
      const ids = Object.keys(appState.selectedElementIds).filter(
        (id) => appState.selectedElementIds[id],
      );
      const key = ids.join(',');
      if (key !== selectionKey.current) {
        selectionKey.current = key;
        setSelection(ids.length === 1 ? (elements.find((e) => e.id === ids[0]) ?? null) : null);
        setAnySelected(ids.length > 0);
      }
      if (session?.readOnly) return;
      // Ramas plegadas: lo nuevo bajo ellas y lo que el menú del motor desbloquee se vuelve a
      // ocultar, y los contadores siguen a su nodo (un pase por fotograma como mucho).
      if (extensionsRef.current?.mindMap.collapsedNodeIds.length) scheduleProjection();
      // Trazo en curso: borrador periódico en lugar de revisiones (diseño §7.1).
      if (appState.newElement) {
        const now = Date.now();
        if (now - lastDraftAt.current >= DRAFT_INTERVAL_MS) {
          lastDraftAt.current = now;
          void service.saveStrokeDraft(documentId, appState.newElement).catch(() => undefined);
        }
        return;
      }
      // Un fondo distinto del que pintamos lo eligió el usuario en el motor: pasa a ser el guardado.
      if (backgroundRef.current && appState.viewBackgroundColor !== backgroundRef.current.shown) {
        const chosen = appState.viewBackgroundColor;
        backgroundRef.current = { stored: chosen, shown: chosen };
      }
      const stored = backgroundRef.current?.stored ?? appState.viewBackgroundColor;
      const scene: EngineScene = {
        elements,
        appState:
          stored === appState.viewBackgroundColor
            ? appState
            : { ...appState, viewBackgroundColor: stored },
        files,
      };
      const signature = excalidrawCanvasAdapter.contentSignature(scene);
      // Desplazamiento, zoom y selección no generan revisiones de contenido.
      // En solo lectura no se guarda nada (versión desconocida o contenido inválido).
      if (signature === signatureRef.current || session?.readOnly) return;
      signatureRef.current = signature;
      autosave.push(scene);
    },
    [autosave, session, service, documentId, applyPendingFocus, scheduleProjection],
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

  // Al cambiar de esquema, el fondo pintado cambia con él (sin crear una revisión).
  useEffect(() => {
    const background = backgroundRef.current;
    if (!api || !background) return;
    const shown = displayedCanvasBackground(background.stored, scheme);
    if (shown === background.shown) return;
    backgroundRef.current = { stored: background.stored, shown };
    api.updateScene({
      appState: { viewBackgroundColor: shown },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [api, scheme, loaded]);

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

  useEffect(() => (api ? watchCanvasWikiLinks(api, setWikiTarget) : undefined), [api]);
  useEffect(() => (api ? watchStickyText(api) : undefined), [api]);
  // Tab con un nodo seleccionado: hijo conectado, listo para escribir (RF-14, CA-04).
  useEffect(() => {
    const host = hostRef.current;
    if (!api || !host || loaded?.session.readOnly) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const appState = api.getAppState();
      if (appState.editingTextElement || appState.newElement) return;
      const ids = Object.keys(appState.selectedElementIds).filter(
        (id) => appState.selectedElementIds[id],
      );
      const node = ids.length === 1 ? api.getSceneElements().find((e) => e.id === ids[0]) : null;
      const extensions = extensionsRef.current;
      if (!node || !isMindNode(node) || !extensions) return;
      event.preventDefault();
      event.stopPropagation();
      const created = createChild(api, extensions.mindMap, node.id);
      if (!created) return;
      setMindMap(created.mindMap);
      // El motor ya tiene el hijo seleccionado: Intro empieza a escribir en él.
      setTimeout(() => startEditingSelected(host), 0);
    };
    host.addEventListener('keydown', onKeyDown, true);
    return () => host.removeEventListener('keydown', onKeyDown, true);
  }, [api, loaded, setMindMap]);
  /** Inserta la tarjeta de una nota (RF-18): su texto se lee de la versión vigente de la nota. */
  const insertCard = async (noteId: string, title: string) => {
    setCardPickerOpen(false);
    const extensions = extensionsRef.current;
    if (!api || !extensions) return;
    const text = cardText(title, await service.exportNoteMarkdown(noteId));
    const embed = insertNoteCard(api, { id: noteId, title }, text);
    if (!embed) return;
    const current = extensionsRef.current ?? extensions;
    extensionsRef.current = { ...current, noteEmbeds: [...current.noteEmbeds, embed] };
  };
  // Las tarjetas siguen a su nota: al abrir el lienzo y cuando cambian su título o su texto.
  const embeddedKey = useMemo(() => {
    const ids = new Set(noteEmbedsOf(loaded?.extensions.noteEmbeds ?? []).map((e) => e.documentId));
    return documents
      .filter((d) => ids.has(d.id) || d.kind === 'note' || d.kind === 'mddoc')
      .map((d) => `${d.id}:${d.headRevisionIds.join('.')}:${d.title}`)
      .join('|');
  }, [documents, loaded]);
  useEffect(() => {
    if (!api || !loaded || loaded.session.readOnly) return;
    let cancelled = false;
    void (async () => {
      const embeds = noteEmbedsOf(extensionsRef.current?.noteEmbeds ?? []);
      if (!embeds.length) return;
      const texts = new Map<string, string>();
      for (const id of new Set(embeds.map((e) => e.documentId))) {
        const doc = useUiStore.getState().documents.find((d) => d.id === id && !d.deleted);
        if (!doc) continue;
        try {
          texts.set(id, cardText(doc.title, await service.exportNoteMarkdown(id)));
        } catch {
          // Una nota ilegible deja su tarjeta como estaba.
        }
      }
      if (!cancelled) refreshNoteCards(api, embeds, texts);
    })();
    return () => {
      cancelled = true;
    };
  }, [api, loaded, embeddedKey, service]);

  /** Plegar o desplegar la rama del nodo seleccionado (RF-15). */
  const toggleBranch = (nodeId: string) => {
    const extensions = extensionsRef.current;
    if (!api || !extensions) return;
    setMindMap(toggleCollapse(api, extensions.mindMap, nodeId));
  };
  // Nodo seleccionado con hijos: el botón de plegar muestra cuántos descendientes tiene.
  const branch =
    api && selection && isMindNode(selection) && mindMap
      ? {
          count: liveDescendants(api, mindMap, selection.id).length,
          collapsed: mindMap.collapsedNodeIds.includes(selection.id),
        }
      : null;
  useEffect(
    () => (api && hostRef.current ? attachCanvasCursors(hostRef.current) : undefined),
    [api],
  );
  /** Al cerrar el selector de `[[`, el foco vuelve al lienzo para seguir con sus atajos. */
  const closeWikiLink = () => {
    setWikiTarget(null);
    hostRef.current?.querySelector<HTMLElement>('.excalidraw')?.focus();
  };
  const finishWikiLink = (pick: { url: string; title: string }) => {
    if (api && wikiTarget) applyCanvasWikiLink(api, wikiTarget, pick);
    closeWikiLink();
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
      ref={hostRef}
      className="canvas-host"
      data-testid="canvas-host"
      // Un sticker arrastrado desde el selector se suelta donde cae (antes de que el motor
      // intente leerlo como archivo).
      onDragOverCapture={(e) => {
        const types = e.dataTransfer.types;
        if (api && (types.includes(STICKER_DRAG_TYPE) || types.includes(TEMPLATE_DRAG_TYPE))) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDropCapture={(e) => {
        const templateId = e.dataTransfer.getData(TEMPLATE_DRAG_TYPE);
        if (api && templateId && !loaded.session.readOnly) {
          e.preventDefault();
          e.stopPropagation();
          const at = viewportCoordsToSceneCoords(
            { clientX: e.clientX, clientY: e.clientY },
            api.getAppState(),
          );
          insertTemplate(api, service, templateId, at).catch((error: unknown) =>
            logDiagnostic('error', 'template-insert', describeError(error)),
          );
          return;
        }
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
        {/* Plantillas propias en lugar de la biblioteca del motor (que queda oculta). */}
        <button
          type="button"
          className="canvas-templates-button"
          aria-expanded={templatesOpen}
          data-testid="open-templates"
          disabled={!api}
          onClick={() => setTemplatesOpen((v) => !v)}
        >
          <Icon name="biblioteca" size={18} />
          {t('templates.title')}
        </button>
        {templatesOpen && api && (
          <TemplatesPanel
            api={api}
            service={service}
            selectionActive={anySelected && !loaded.session.readOnly}
            onClose={() => setTemplatesOpen(false)}
          />
        )}
        {branch && branch.count > 0 && selection && !loaded.session.readOnly && (
          <button
            type="button"
            data-testid="toggle-branch"
            aria-pressed={branch.collapsed}
            onClick={() => toggleBranch(selection.id)}
          >
            <Icon name={branch.collapsed ? 'chevron-der' : 'chevron-abajo'} size={18} />
            {t(branch.collapsed ? 'canvas.expandBranch' : 'canvas.collapseBranch', {
              count: branch.count,
            })}
          </button>
        )}
        {api && !loaded.session.readOnly && (
          <button
            type="button"
            data-testid="insert-note-card"
            onClick={() => setCardPickerOpen(true)}
          >
            <Icon name="nota" size={18} />
            {t('canvas.noteCard')}
          </button>
        )}
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
        <ExportDialog
          api={api}
          title={title}
          storedBackground={() => backgroundRef.current?.stored ?? null}
          hidden={() => hiddenIds(extensionsRef.current?.mindMap)}
          onClose={() => setExportOpen(false)}
        />
      )}
      {pickerOpen && selection && (
        <LinkPicker
          title={t('links.pickerTitle')}
          sourceId={documentId}
          service={service}
          currentLink={selection.link ?? null}
          onPick={(pick) => setElementLink(pick.url)}
          onCreateNote={(title) => {
            void onCreateNote(title).then((doc) => setElementLink(internalLink(doc.id)));
          }}
          onWeb={(url) => setElementLink(url)}
          onRemove={() => setElementLink(null)}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {cardPickerOpen && (
        <LinkPicker
          title={t('canvas.noteCardTitle')}
          sourceId={documentId}
          service={service}
          kinds={['note', 'mddoc']}
          onPick={(pick) => {
            const target = parseInternalLink(pick.url);
            if (target) void insertCard(target.documentId, pick.title);
          }}
          onCreateNote={(title) => {
            void onCreateNote(title).then((doc) => insertCard(doc.id, doc.title));
          }}
          onWeb={() => undefined}
          onClose={() => setCardPickerOpen(false)}
        />
      )}
      {wikiTarget && (
        <LinkPicker
          title={t('links.pickerTitle')}
          sourceId={documentId}
          service={service}
          onPick={finishWikiLink}
          onCreateNote={(title) => {
            void onCreateNote(title).then((doc) =>
              finishWikiLink({ url: internalLink(doc.id), title }),
            );
          }}
          onWeb={(url) => finishWikiLink({ url, title: url })}
          onClose={closeWikiLink}
        />
      )}
      <Excalidraw
        excalidrawAPI={setApi}
        onLinkOpen={(element, event) => {
          const target = element.link ? parseInternalLink(element.link) : null;
          if (!target) return; // Enlace web: lo abre el motor en otra pestaña.
          event.preventDefault();
          navigate(linkFocus(target));
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
          <MainMenu.Item onSelect={openExport}>{t('export.open')}</MainMenu.Item>
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}
