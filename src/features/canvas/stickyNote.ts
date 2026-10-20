import { restoreElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';

/**
 * Nota adhesiva del lienzo (docs/DESIGN.md §3.5). Solo usa primitivas del motor, agrupadas, así
 * que se guarda en la escena como cualquier otro elemento y pasa por el filtro del tema oscuro.
 * Capas, de abajo arriba: cuerpo, banda adhesiva, área de texto, triángulo «recorte» del color
 * del lienzo y esquina doblada. El texto no se crea de antemano (el motor descarta los textos
 * vacíos): al hacer doble clic sobre la nota, el motor crea el texto ligado al área de texto, un
 * rectángulo sin borde del mismo color que la nota (invisible, pero se puede pulsar) con los
 * márgenes de §3.5, y `watchStickyText` lo alinea arriba a la izquierda (plan 9.13). Las notas
 * anteriores al 20/10/2026 no tienen área de texto: su texto va ligado al cuerpo, centrado.
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
/** Margen del texto (§3.5): 16 px a los lados y bajo la banda. */
const TEXT_MARGIN = 16;

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
      type: 'rectangle',
      x: x + TEXT_MARGIN,
      y: y + BAND + TEXT_MARGIN / 2,
      width: s - 2 * TEXT_MARGIN,
      height: s - BAND - TEXT_MARGIN / 2 - FOLD,
      strokeColor: 'transparent',
      backgroundColor: palette.fill,
      strokeWidth: 1,
      boundElements: null,
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

/** Papel de cada color de la tabla de §3.5 (en minúsculas): de qué nota y qué parte es. */
const ROLES = new Map<string, { color: StickyColor; part: 'fill' | 'band' | 'fold' }>(
  (
    Object.entries(STICKY_COLORS) as Array<[StickyColor, (typeof STICKY_COLORS)[StickyColor]]>
  ).flatMap(([color, parts]) =>
    (['fill', 'band', 'fold'] as const).map((part) => [parts[part].toLowerCase(), { color, part }]),
  ),
);

/** Color de nota de un relleno, si es uno de la tabla (cuerpo, banda o doblez). */
export function stickyColorOf(backgroundColor: string): StickyColor | null {
  return ROLES.get(backgroundColor.toLowerCase())?.color ?? null;
}

/** ¿Es el área de texto de una nota? Rectángulo agrupado, sin borde y con el relleno de una nota. */
export function isStickyTextArea(element: ExcalidrawElement): boolean {
  return (
    element.type === 'rectangle' &&
    element.strokeColor === 'transparent' &&
    element.groupIds.length > 0 &&
    ROLES.get(element.backgroundColor.toLowerCase())?.part === 'fill'
  );
}

/**
 * Grupos de la selección que son notas adhesivas: tienen un cuerpo (relleno de nota con borde
 * tinta) y una banda del mismo color. Sirve para recolorear la nota entera desde la paleta.
 */
export function stickyGroups(
  elements: readonly ExcalidrawElement[],
  selected: ReadonlySet<string>,
): Set<string> {
  const groups = new Set<string>();
  for (const element of elements) {
    if (element.isDeleted || !selected.has(element.id)) continue;
    for (const groupId of element.groupIds) {
      const members = elements.filter((e) => !e.isDeleted && e.groupIds.includes(groupId));
      const roles = members.map((e) => ROLES.get(e.backgroundColor.toLowerCase())?.part);
      if (roles.includes('fill') && roles.includes('band')) groups.add(groupId);
    }
  }
  return groups;
}

/** La nota de cada grupo de `groups`, en el color `color`: cuerpo, banda, área de texto y doblez. */
export function recolorSticky<T extends ExcalidrawElement>(
  element: T,
  groups: ReadonlySet<string>,
  color: StickyColor,
): Partial<T> | null {
  if (!element.groupIds.some((g) => groups.has(g))) return null;
  const role = ROLES.get(element.backgroundColor.toLowerCase());
  if (!role) return null;
  return { backgroundColor: STICKY_COLORS[color][role.part] } as Partial<T>;
}
