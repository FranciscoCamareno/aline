import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { recolorSticky, stickyColorOf, stickyGroups, type StickyColor } from './stickyNote.ts';

/**
 * Paleta del lienzo (DESIGN.md §3.2, plan 9.14). El motor 0.18.1 no deja cambiar la paleta de su
 * selector, así que la barra propia lleva la suya: trazos y rellenos guardados en la escena, cada
 * uno con el color que se ve en oscuro (el filtro del motor) para que la muestra coincida con el
 * lienzo. Se aplica a la selección y a lo que se dibuje después. En una nota adhesiva, el relleno
 * recolorea la nota entera (cuerpo, banda, área de texto y doblez; §3.5) y las notas nuevas salen
 * de ese color.
 */
interface Swatch {
  name: string;
  value: string;
  /** Cómo se ve en oscuro (tabla de §3.2). */
  dark: string;
}

export const STROKES: readonly Swatch[] = [
  { name: 'ink', value: '#262118', dark: '#D4D0C8' },
  { name: 'red', value: '#B83A26', dark: '#FC907E' },
  { name: 'water', value: '#2F6F78', dark: '#6DA4AC' },
  { name: 'green', value: '#2F7D4F', dark: '#61A47C' },
  { name: 'ochre', value: '#8A5A00', dark: '#C3994C' },
  { name: 'violet', value: '#6B4FA0', dark: '#AD95DB' },
];

/** Rellenos: los de las notas adhesivas, más «sin relleno». */
export const FILLS: readonly Swatch[] = [
  { name: 'none', value: 'transparent', dark: 'transparent' },
  { name: 'butter', value: '#FFE380', dark: '#442C00' },
  { name: 'water', value: '#BFDFE2', dark: '#1D393B' },
  { name: 'pink', value: '#F7AFCB', dark: '#773951' },
  { name: 'green', value: '#A8D5A2', dark: '#264D21' },
  { name: 'peach', value: '#FFC9A8', dark: '#5F3114' },
  { name: 'lavender', value: '#D8CCF0', dark: '#3F3554' },
];

const STICKY_COLOR_KEY = 'mindnote.stickyColor';

/** Color de las notas nuevas: el último elegido para una nota (preferencia de este navegador). */
export function readStickyColor(): StickyColor {
  try {
    const value = localStorage.getItem(STICKY_COLOR_KEY);
    return value && stickyColorOf(value) ? (stickyColorOf(value) as StickyColor) : 'mantequilla';
  } catch {
    return 'mantequilla';
  }
}

function writeStickyColor(fill: string): void {
  try {
    localStorage.setItem(STICKY_COLOR_KEY, fill);
  } catch {
    // Preferencia no persistida.
  }
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function PaletteSlot({
  api,
  theme,
}: {
  api: ExcalidrawImperativeAPI;
  theme: 'light' | 'dark';
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  /**
   * La casilla solo aparece con el lápiz activo o con algo seleccionado (para recolorear, p. ej.
   * una nota adhesiva): el resto del tiempo no ocupa la barra.
   */
  const visibleFor = (state: ReturnType<ExcalidrawImperativeAPI['getAppState']>) =>
    state.activeTool.type === 'freedraw' || Object.values(state.selectedElementIds).some(Boolean);
  const [visible, setVisible] = useState(() => visibleFor(api.getAppState()));
  const [current, setCurrent] = useState(() => {
    const s = api.getAppState();
    return { stroke: s.currentItemStrokeColor, fill: s.currentItemBackgroundColor };
  });
  const cell = useRef<HTMLDivElement>(null);
  const id = useId();
  const shown = (swatch: Swatch) => (theme === 'dark' ? swatch.dark : swatch.value);

  // La muestra del botón sigue al color vigente (el de la selección, si es de un solo elemento).
  useEffect(
    () =>
      api.onChange((elements, appState) => {
        const show = visibleFor(appState);
        setVisible(show);
        if (!show) setOpen(false);
        const selected = elements.filter((e) => appState.selectedElementIds[e.id] && !e.isDeleted);
        // El color que comparte la selección; en una nota, el de su cuerpo.
        const shared = (values: string[]) =>
          values.length && values.every((v) => same(v, values[0]!)) ? values[0]! : null;
        const noteFill = selected.find(
          (e) =>
            stickyColorOf(e.backgroundColor) && FILLS.some((f) => same(f.value, e.backgroundColor)),
        )?.backgroundColor;
        const next = {
          stroke:
            shared(selected.map((e) => e.strokeColor).filter((c) => c !== 'transparent')) ??
            appState.currentItemStrokeColor,
          fill:
            noteFill ??
            shared(selected.filter((e) => e.type !== 'text').map((e) => e.backgroundColor)) ??
            appState.currentItemBackgroundColor,
        };
        setCurrent((prev) =>
          prev.stroke === next.stroke && prev.fill === next.fill ? prev : next,
        );
      }),
    [api],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!cell.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const apply = (kind: 'stroke' | 'fill', value: string) => {
    const appState = api.getAppState();
    const elements = api.getSceneElementsIncludingDeleted();
    const selected = new Set(
      Object.keys(appState.selectedElementIds).filter((key) => appState.selectedElementIds[key]),
    );
    const sticky =
      kind === 'fill' && value !== 'transparent'
        ? stickyGroups(elements, selected)
        : new Set<string>();
    const noteColor = sticky.size ? stickyColorOf(value) : null;
    if (noteColor) writeStickyColor(value);
    api.updateScene({
      elements: elements.map((e): ExcalidrawElement => {
        if (!selected.has(e.id) || e.isDeleted) return e;
        if (noteColor) {
          const patch = recolorSticky(e, sticky, noteColor);
          if (patch) return newElementWith(e, patch);
          // Las demás piezas de la nota (contorno, recorte, texto) no cambian.
          if (e.groupIds.some((g) => sticky.has(g))) return e;
        }
        if (kind === 'stroke') return newElementWith(e, { strokeColor: value });
        // Un texto no tiene relleno propio.
        return e.type === 'text' ? e : newElementWith(e, { backgroundColor: value });
      }),
      appState: {
        currentItemStrokeColor: kind === 'stroke' ? value : appState.currentItemStrokeColor,
        // Recolorear una nota no cambia el relleno de lo que se dibuje después.
        currentItemBackgroundColor:
          kind === 'fill' && !noteColor ? value : appState.currentItemBackgroundColor,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setCurrent((prev) =>
      kind === 'stroke' ? { ...prev, stroke: value } : { ...prev, fill: value },
    );
  };

  const row = (kind: 'stroke' | 'fill', swatches: readonly Swatch[]) => (
    <div className="palette-row" role="radiogroup" aria-label={t(`canvas.palette.${kind}`)}>
      {swatches.map((swatch) => {
        const checked = same(current[kind], swatch.value);
        const label = t(`canvas.palette.${kind === 'stroke' ? 'strokes' : 'fills'}.${swatch.name}`);
        return (
          <button
            key={swatch.name}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            title={label}
            className={`palette-swatch${swatch.value === 'transparent' ? ' is-none' : ''}`}
            style={{ background: shown(swatch) }}
            data-testid={`palette-${kind}-${swatch.name}`}
            onClick={() => apply(kind, swatch.value)}
          />
        );
      })}
    </div>
  );

  if (!visible) return null;
  const strokeSwatch = STROKES.find((s) => same(s.value, current.stroke));
  const fillSwatch = FILLS.find((s) => same(s.value, current.fill));
  return (
    <div className="tool-cell tool-palette" ref={cell}>
      <button
        type="button"
        className={`tool-slot palette-slot${open ? ' is-raised' : ''}`}
        aria-label={t('canvas.palette.label')}
        title={t('canvas.palette.label')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-testid="tool-palette"
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className="palette-preview"
          aria-hidden="true"
          style={{
            borderColor: strokeSwatch ? shown(strokeSwatch) : current.stroke,
            background: fillSwatch ? shown(fillSwatch) : current.fill,
          }}
        />
      </button>
      {open && (
        <div
          className="palette-popover"
          role="dialog"
          id={id}
          aria-label={t('canvas.palette.label')}
          data-testid="palette"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
              cell.current?.querySelector<HTMLButtonElement>('.tool-slot')?.focus();
            }
          }}
        >
          <h3 className="sticker-picker-title">{t('canvas.palette.stroke')}</h3>
          {row('stroke', STROKES)}
          <h3 className="sticker-picker-title">{t('canvas.palette.fill')}</h3>
          {row('fill', FILLS)}
        </div>
      )}
    </div>
  );
}
