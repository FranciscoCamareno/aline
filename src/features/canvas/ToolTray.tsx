import { CaptureUpdateAction } from '@excalidraw/excalidraw';
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { logDiagnostic } from '../../app/runtime.ts';
import { describeError } from '../../ports/Diagnostics.ts';
import {
  insertSticker,
  STICKER_DRAG_TYPE,
  STICKER_NAMES,
  stickerPreviewUrl,
  type StickerName,
} from './stickers.ts';
import { PaletteSlot, readStickyColor } from './PaletteSlot.tsx';
import { buildStickyNote, STICKY_SIZE } from './stickyNote.ts';
import {
  AFTER_SHAPES,
  BEFORE_SHAPES,
  GENERATE,
  isShape,
  SECONDARY,
  SHAPES,
  type ShapeTool,
  type ToolDef,
} from './tools.ts';

/** Objetos ilustrados (claro y con troquel crema para oscuro) y glifos de línea (§7.1, §7.3). */
const load = (files: Record<string, string>) =>
  new Map(
    Object.entries(files).map(([path, svg]) => [
      path.slice(path.lastIndexOf('/') + 1, -'.svg'.length),
      svg,
    ]),
  );
const OBJECTS = load(
  import.meta.glob<string>('../../../brand/icons/tools/*.svg', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);
const OBJECTS_DARK = load(
  import.meta.glob<string>('../../../brand/icons/tools-dark/*.svg', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);
const GLYPHS = load(
  import.meta.glob<string>('../../../brand/icons/glyphs/*.svg', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);

/** Pulsación larga sobre la casilla de formas: abre el menú (§7.2). */
const LONG_PRESS_MS = 450;

interface ToolState {
  type: AppState['activeTool']['type'];
  locked: boolean;
  penMode: boolean;
  penDetected: boolean;
}

function readState(state: AppState): ToolState {
  return {
    type: state.activeTool.type,
    locked: state.activeTool.locked,
    penMode: state.penMode,
    penDetected: state.penDetected,
  };
}

const sameState = (a: ToolState, b: ToolState) =>
  a.type === b.type &&
  a.locked === b.locked &&
  a.penMode === b.penMode &&
  a.penDetected === b.penDetected;

function Art({ name, theme }: { name: string; theme: 'light' | 'dark' }) {
  const svg = (theme === 'dark' ? OBJECTS_DARK : OBJECTS).get(name);
  return (
    <span
      className="tool-object"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg ?? '' }}
    />
  );
}

function Glyph({ name }: { name: string }) {
  return (
    <span
      className="icon tool-glyph"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: GLYPHS.get(name) ?? '' }}
    />
  );
}

interface Props {
  api: ExcalidrawImperativeAPI;
  theme: 'light' | 'dark';
}

/**
 * Barra de herramientas propia del lienzo (docs/DESIGN.md §7.1–7.2): objetos que asoman de una
 * bandeja, un panel secundario que abre la caja y las formas agrupadas en una casilla. Sustituye
 * a la barra del motor (oculta por CSS) y lo maneja solo con su API pública; los atajos de
 * teclado siguen siendo los del motor, y la barra refleja la herramienta activa.
 */
export function ToolTray({ api, theme }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<ToolState>(() => readState(api.getAppState()));
  const [lastShape, setLastShape] = useState<ShapeTool>(() => {
    const type = api.getAppState().activeTool.type;
    return isShape(type) ? type : 'rectangle';
  });
  const [boxOpen, setBoxOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerId = useId();
  const stickerRef = useRef<HTMLDivElement>(null);
  const secondaryId = useId();
  const menuId = useId();
  const longPress = useRef<{ timer: number; fired: boolean } | null>(null);
  const shapesRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);

  useEffect(
    () =>
      api.onChange((_elements, appState) => {
        const next = readState(appState);
        setState((prev) => (sameState(prev, next) ? prev : next));
        if (isShape(next.type)) setLastShape(next.type);
      }),
    [api],
  );

  const insertSticky = useCallback(() => {
    const appState = api.getAppState();
    const zoom = appState.zoom.value;
    // Centro de la vista en coordenadas de la escena.
    const cx = appState.width / 2 / zoom - appState.scrollX;
    const cy = appState.height / 2 / zoom - appState.scrollY;
    const note = buildStickyNote({
      x: Math.round(cx - STICKY_SIZE / 2),
      y: Math.round(cy - STICKY_SIZE / 2),
      // El color de la última nota recoloreada desde la paleta (plan 9.13).
      color: readStickyColor(),
      canvasColor: appState.viewBackgroundColor,
    });
    const selectedElementIds: Record<string, true> = {};
    for (const element of note.elements) selectedElementIds[element.id] = true;
    api.setActiveTool({ type: 'selection' });
    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), ...note.elements],
      appState: { selectedElementIds, selectedGroupIds: { [note.groupId]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }, [api]);

  const placeSticker = useCallback(
    (name: StickerName) => {
      setPickerOpen(false);
      insertSticker(api, name).catch((error: unknown) =>
        logDiagnostic('error', 'sticker-insert', describeError(error)),
      );
    },
    [api],
  );

  const openPicker = useCallback(() => {
    setPickerOpen(true);
    // El foco va al primer sticker cuando el selector ya está montado.
    requestAnimationFrame(() =>
      stickerRef.current?.querySelector<HTMLButtonElement>('.sticker-option')?.focus(),
    );
  }, []);

  const choose = useCallback(
    (tool: ToolDef['id']) => {
      if (tool === 'sticky') insertSticky();
      else if (tool === 'sticker') {
        if (pickerOpen) setPickerOpen(false);
        else openPicker();
      } else if (tool === 'mermaid') {
        api.updateScene({
          appState: { openDialog: { name: 'ttd', tab: 'mermaid' } },
        });
      } else api.setActiveTool({ type: tool });
    },
    [api, insertSticky, pickerOpen, openPicker],
  );

  // «N» inserta una nota adhesiva y «B» abre los stickers, como los atajos de una letra del motor.
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((key !== 'n' && key !== 'b') || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], .cm-editor')) return;
      const appState = api.getAppState();
      if (appState.viewModeEnabled || appState.editingTextElement || appState.openDialog) return;
      e.preventDefault();
      if (key === 'n') insertSticky();
      else openPicker();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [api, insertSticky, openPicker]);

  // El selector de stickers se cierra al pulsar fuera.
  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!stickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pickerOpen]);

  // El menú de formas se cierra al pulsar fuera.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!shapesRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  const label = (tool: ToolDef) =>
    tool.shortcut ? `${t(`toolbar.${tool.label}`)} (${tool.shortcut})` : t(`toolbar.${tool.label}`);

  const slot = (tool: ToolDef, group: 'main' | 'secondary') => {
    if (tool.id === 'sticker') return stickerSlot(tool);
    const active = tool.id === state.type;
    return (
      <div className="tool-cell" key={tool.id}>
        <button
          type="button"
          className={`tool-slot${active ? ' is-active' : ''}`}
          aria-label={label(tool)}
          title={label(tool)}
          aria-pressed={tool.id === 'sticky' || tool.id === 'mermaid' ? undefined : active}
          data-testid={`tool-${tool.id}`}
          data-group={group}
          onClick={() => choose(tool.id)}
        >
          <Art name={tool.art} theme={theme} />
        </button>
        {active && <span className="tool-dot" aria-hidden="true" />}
      </div>
    );
  };

  /** Casilla de stickers: abre el selector, que sube con la casilla como la caja abierta. */
  const stickerSlot = (tool: ToolDef) => (
    <div className="tool-cell tool-stickers" key={tool.id} ref={stickerRef}>
      <button
        type="button"
        className={`tool-slot${pickerOpen ? ' is-raised' : ''}`}
        aria-label={label(tool)}
        title={label(tool)}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        aria-controls={pickerOpen ? pickerId : undefined}
        data-testid="tool-sticker"
        onClick={() => choose('sticker')}
      >
        <Art name={tool.art} theme={theme} />
      </button>
      {pickerOpen && (
        <div
          className="sticker-picker"
          role="dialog"
          id={pickerId}
          aria-label={t('toolbar.stickers')}
          data-testid="sticker-picker"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setPickerOpen(false);
              stickerRef.current?.querySelector<HTMLButtonElement>('.tool-slot')?.focus();
            }
          }}
        >
          <h3 className="sticker-picker-title">{t('toolbar.stickers')}</h3>
          <div className="sticker-grid">
            {STICKER_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                className="sticker-option"
                aria-label={t(`stickers.${name}`)}
                title={t(`stickers.${name}`)}
                data-testid={`sticker-${name}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(STICKER_DRAG_TYPE, name);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onDragEnd={() => setPickerOpen(false)}
                onClick={() => placeSticker(name)}
              >
                <img src={stickerPreviewUrl(name)} alt="" draggable={false} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const shape = SHAPES.find((s) => s.id === lastShape)!;
  const shapeActive = isShape(state.type);

  const openMenu = () => {
    setMenuOpen(true);
    // El foco va a la forma seleccionada (o la primera) cuando el menú ya está montado.
    requestAnimationFrame(() =>
      shapesRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')
        ?.focus(),
    );
  };
  const closeMenu = (focusChevron: boolean) => {
    setMenuOpen(false);
    if (focusChevron) chevronRef.current?.focus();
  };
  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [
      ...(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []),
    ];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    }
  };

  const lockLabel = `${t('toolbar.lock')} (Q)`;

  return (
    <div
      className="tool-trays"
      role="toolbar"
      aria-label={t('toolbar.label')}
      data-testid="tool-tray"
    >
      {state.penDetected && (
        <button
          type="button"
          className="tool-pen"
          aria-pressed={state.penMode}
          data-testid="tool-pen-mode"
          onClick={() => api.updateScene({ appState: { penMode: !state.penMode } })}
        >
          <Glyph name="lapiz" />
          {t('toolbar.penMode')}
        </button>
      )}
      <div className="tool-tray">
        <div className="tool-row">
          {/* El candado es un interruptor, no una herramienta: cambia de objeto y no sube. */}
          <div className="tool-cell">
            <button
              type="button"
              className="tool-slot tool-lock"
              aria-label={lockLabel}
              title={lockLabel}
              aria-pressed={state.locked}
              data-testid="tool-lock"
              onClick={() =>
                api.setActiveTool({
                  type: state.type === 'custom' ? 'selection' : state.type,
                  locked: !state.locked,
                })
              }
            >
              <Art name={state.locked ? 'candado' : 'candado-abierto'} theme={theme} />
            </button>
          </div>
          <span className="tool-divider" aria-hidden="true" />
          {BEFORE_SHAPES.map((tool) => slot(tool, 'main'))}
          <div className="tool-cell tool-shapes" ref={shapesRef}>
            <button
              type="button"
              className={`tool-slot${shapeActive ? ' is-active' : ''}`}
              aria-label={label(shape)}
              title={label(shape)}
              aria-pressed={shapeActive}
              data-testid="tool-shape"
              onPointerDown={() => {
                const timer = window.setTimeout(() => {
                  if (longPress.current) longPress.current.fired = true;
                  openMenu();
                }, LONG_PRESS_MS);
                longPress.current = { timer, fired: false };
              }}
              onPointerUp={() => longPress.current && clearTimeout(longPress.current.timer)}
              onPointerLeave={() => longPress.current && clearTimeout(longPress.current.timer)}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => {
                if (longPress.current?.fired) {
                  longPress.current = null;
                  return;
                }
                choose(shape.id);
              }}
            >
              <Art name={shape.art} theme={theme} />
            </button>
            {shapeActive && <span className="tool-dot" aria-hidden="true" />}
            <button
              type="button"
              ref={chevronRef}
              className="tool-chevron"
              aria-label={t('toolbar.shapes')}
              title={t('toolbar.shapes')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              data-testid="tool-shapes-menu"
              onClick={() => (menuOpen ? closeMenu(false) : openMenu())}
            >
              <Glyph name="chevron" />
            </button>
            {menuOpen && (
              <div
                className="tool-menu"
                role="menu"
                id={menuId}
                aria-label={t('toolbar.shapes')}
                onKeyDown={onMenuKeyDown}
              >
                {SHAPES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={s.id === lastShape}
                    className="tool-menu-item"
                    data-testid={`tool-menu-${s.id}`}
                    onClick={() => {
                      setLastShape(s.id);
                      choose(s.id);
                      closeMenu(false);
                    }}
                  >
                    <Glyph name={s.art} />
                    <span>{t(`toolbar.${s.label}`)}</span>
                    <kbd>{s.shortcut}</kbd>
                  </button>
                ))}
              </div>
            )}
          </div>
          {AFTER_SHAPES.map((tool) => slot(tool, 'main'))}
          <span className="tool-divider" aria-hidden="true" />
          <PaletteSlot api={api} theme={theme} />
          {/* La caja abierta sube, pero sin punto: el punto marca solo la herramienta activa. */}
          <div className="tool-cell">
            <button
              type="button"
              className={`tool-slot${boxOpen ? ' is-raised' : ''}`}
              aria-label={t('toolbar.more')}
              title={t('toolbar.more')}
              aria-expanded={boxOpen}
              aria-controls={secondaryId}
              data-testid="tool-more"
              onClick={() => setBoxOpen((v) => !v)}
            >
              <Art name="caja" theme={theme} />
            </button>
          </div>
        </div>
        <span className="tool-lip" aria-hidden="true" />
      </div>
      {boxOpen && (
        <div
          className="tool-tray tool-tray-secondary"
          id={secondaryId}
          data-testid="tool-secondary"
        >
          <div className="tool-row">
            {SECONDARY.map((tool) => slot(tool, 'secondary'))}
            <span className="tool-divider" aria-hidden="true" />
            {GENERATE.map((tool) => slot(tool, 'secondary'))}
          </div>
          <span className="tool-lip" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
