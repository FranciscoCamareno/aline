import { restoreElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';

/**
 * Nota adhesiva del lienzo (docs/DESIGN.md §3.5). Solo usa primitivas del motor, agrupadas, así
 * que se guarda en la escena como cualquier otro elemento y pasa por el filtro del tema oscuro.
 * Capas, de abajo arriba: cuerpo, banda adhesiva, triángulo «recorte» del color del lienzo y
 * esquina doblada. El texto no se crea de antemano (el motor descarta los textos vacíos): al
 * pulsar Intro o hacer doble clic sobre la nota, el motor crea el texto ligado al cuerpo.
 */
export type StickyColor = 'mantequilla' | 'agua' | 'rosa' | 'brote' | 'durazno' | 'lavanda';

/** Relleno, banda (7 % de tinta) y doblez (16 % de tinta), de la tabla de §3.5. */
export const STICKY_COLORS: Record<StickyColor, { fill: string; band: string; fold: string }> = {
  mantequilla: { fill: '#FFE380', band: '#F0D579', fold: '#DCC46F' },
  agua: { fill: '#BFDFE2', band: '#B4D2D4', fold: '#A7C1C2' },
  rosa: { fill: '#F7AFCB', band: '#E8A5BE', fold: '#D698AE' },
  brote: { fill: '#A8D5A2', band: '#9FC898', fold: '#93B88C' },
  durazno: { fill: '#FFC9A8', band: '#F0BD9E', fold: '#DCAE91' },
  lavanda: { fill: '#D8CCF0', band: '#CCC0E1', fold: '#BCB1CD' },
};

const INK = '#262118';
export const STICKY_SIZE = 200;
const BAND = 24;
const FOLD = 28;

interface Options {
  /** Esquina superior izquierda en coordenadas de la escena. */
  x: number;
  y: number;
  color?: StickyColor;
  /** Fondo de la escena: el triángulo que recorta la esquina toma este color. */
  canvasColor: string;
  /** Generador de ids (inyectable para las pruebas). */
  newId?: () => string;
}

export interface StickyNote {
  elements: ExcalidrawElement[];
  groupId: string;
  bodyId: string;
}

export function buildStickyNote({
  x,
  y,
  color = 'mantequilla',
  canvasColor,
  newId = () => crypto.randomUUID(),
}: Options): StickyNote {
  const palette = STICKY_COLORS[color];
  const groupId = newId();
  const bodyId = newId();
  const common = {
    angle: 0,
    roughness: 0,
    roundness: null,
    opacity: 100,
    strokeStyle: 'solid',
    fillStyle: 'solid',
    groupIds: [groupId],
    locked: false,
    link: null,
  };
  const s = STICKY_SIZE;
  const partial = [
    {
      ...common,
      id: bodyId,
      type: 'rectangle',
      x,
      y,
      width: s,
      height: s,
      strokeColor: INK,
      backgroundColor: palette.fill,
      strokeWidth: 2,
      boundElements: null,
    },
    {
      ...common,
      id: newId(),
      type: 'rectangle',
      x: x + 1,
      y: y + 1,
      width: s - 2,
      height: BAND,
      strokeColor: 'transparent',
      backgroundColor: palette.band,
      strokeWidth: 1,
    },
    {
      ...common,
      id: newId(),
      type: 'line',
      x: x + s - FOLD,
      y: y + s + 1,
      width: FOLD + 1,
      height: FOLD + 1,
      strokeColor: 'transparent',
      backgroundColor: canvasColor,
      strokeWidth: 1,
      points: [
        [0, 0],
        [FOLD + 1, 0],
        [FOLD + 1, -(FOLD + 1)],
        [0, 0],
      ],
    },
    {
      ...common,
      id: newId(),
      type: 'line',
      x: x + s - FOLD,
      y: y + s,
      width: FOLD,
      height: FOLD,
      strokeColor: INK,
      backgroundColor: palette.fold,
      strokeWidth: 2,
      points: [
        [0, 0],
        [FOLD, -FOLD],
        [0, -FOLD],
        [0, 0],
      ],
    },
  ];
  // El motor completa los campos que faltan (semilla, versión, índice…) sin cambiar los ids.
  const elements = restoreElements(partial as unknown as ExcalidrawElement[], null, {
    refreshDimensions: false,
    repairBindings: true,
  }) as ExcalidrawElement[];
  return { elements, groupId, bodyId };
}
