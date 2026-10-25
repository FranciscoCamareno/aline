import type { CanvasExtensions } from '../domain/sidecar.ts';

/**
 * Elementos de un lienzo que se pueden elegir como destino de un enlace (plan 10.6). Se calcula
 * sobre el JSON de la escena guardada, sin el motor: textos, formas, marcos, imágenes, dibujos y
 * flechas con etiqueta. Un texto dentro de una forma cuenta como la forma; un grupo (una nota
 * adhesiva) cuenta como un solo destino; lo oculto por una rama plegada y los contadores «+N» no
 * se ofrecen.
 */
export type CanvasTargetKind = 'text' | 'shape' | 'frame' | 'image' | 'arrow' | 'line' | 'drawing';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasLinkTarget {
  elementId: string;
  kind: CanvasTargetKind;
  /** Texto del elemento (o del grupo, o el nombre del marco); vacío si no tiene. */
  label: string;
  /** Caja que lo contiene en coordenadas de la escena (girada si el elemento lo está). */
  bounds: Bounds;
}

interface SceneElement {
  id?: unknown;
  type?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  angle?: unknown;
  points?: unknown;
  text?: unknown;
  name?: unknown;
  containerId?: unknown;
  groupIds?: unknown;
  isDeleted?: unknown;
}

const KINDS: Record<string, CanvasTargetKind> = {
  rectangle: 'shape',
  ellipse: 'shape',
  diamond: 'shape',
  text: 'text',
  frame: 'frame',
  magicframe: 'frame',
  image: 'image',
  arrow: 'arrow',
  line: 'line',
  freedraw: 'drawing',
};

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** Caja de un elemento: puntos de las líneas, o el rectángulo girado alrededor de su centro. */
export function elementBounds(el: SceneElement): Bounds {
  const x = num(el.x);
  const y = num(el.y);
  if (Array.isArray(el.points) && el.points.length > 0) {
    const xs = el.points.map((p) => num((p as unknown[])[0]));
    const ys = el.points.map((p) => num((p as unknown[])[1]));
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: x + minX,
      y: y + minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY,
    };
  }
  const width = num(el.width);
  const height = num(el.height);
  const angle = num(el.angle);
  if (!angle) return { x, y, width, height };
  const cx = x + width / 2;
  const cy = y + height / 2;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const w = width * cos + height * sin;
  const h = width * sin + height * cos;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

function union(boxes: Bounds[]): Bounds {
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Ids que el selector no ofrece: lo oculto por ramas plegadas y los contadores generados. */
export function hiddenElementIds(extensions: CanvasExtensions | null): Set<string> {
  const mindMap = extensions?.mindMap;
  return new Set([...Object.keys(mindMap?.hidden ?? {}), ...Object.values(mindMap?.badges ?? {})]);
}

export function canvasLinkTargets(
  sceneJson: string | null,
  extensions: CanvasExtensions | null,
): CanvasLinkTarget[] {
  let raw: SceneElement[];
  try {
    raw = (JSON.parse(sceneJson ?? '{}') as { elements?: SceneElement[] }).elements ?? [];
  } catch {
    return [];
  }
  const hidden = hiddenElementIds(extensions);
  const elements = raw.filter(
    (e): e is SceneElement & { id: string; type: string } =>
      typeof e.id === 'string' &&
      typeof e.type === 'string' &&
      e.type in KINDS &&
      !e.isDeleted &&
      !hidden.has(e.id),
  );
  const ids = new Set(elements.map((e) => e.id));

  // El texto de una forma o de una flecha es su etiqueta: se cuenta en el contenedor.
  const labels = new Map<string, string[]>();
  const bound = new Set<string>();
  for (const el of elements) {
    if (el.type !== 'text' || typeof el.text !== 'string') continue;
    const owner =
      typeof el.containerId === 'string' && ids.has(el.containerId) ? el.containerId : null;
    if (owner) bound.add(el.id);
    const key = owner ?? el.id;
    labels.set(key, [...(labels.get(key) ?? []), el.text]);
  }
  const labelOf = (el: { id: string; type: string; name?: unknown }) =>
    (labels.get(el.id) ?? []).join(' ').trim() ||
    (el.type === 'frame' || el.type === 'magicframe'
      ? typeof el.name === 'string'
        ? el.name.trim()
        : ''
      : '');

  // Un grupo (el más exterior de cada elemento) es un solo destino.
  const groups = new Map<string, typeof elements>();
  const loose: typeof elements = [];
  for (const el of elements) {
    if (bound.has(el.id)) continue;
    const groupIds = Array.isArray(el.groupIds) ? el.groupIds : [];
    const outer = groupIds.at(-1);
    if (typeof outer === 'string') groups.set(outer, [...(groups.get(outer) ?? []), el]);
    else loose.push(el);
  }

  const targets: CanvasLinkTarget[] = [];
  for (const el of loose) {
    const kind = KINDS[el.type]!;
    const label = labelOf(el);
    // Una flecha o línea sin etiqueta es un conector: no se ofrece.
    if ((kind === 'arrow' || kind === 'line') && !label) continue;
    targets.push({ elementId: el.id, kind, label, bounds: elementBounds(el) });
  }
  for (const members of groups.values()) {
    // Destino del grupo: el miembro con texto (su área de texto), o el primero.
    const target = members.find((m) => labels.has(m.id)) ?? members[0]!;
    const label = members
      .map(labelOf)
      .filter((l) => l)
      .join(' ');
    targets.push({
      elementId: target.id,
      kind: KINDS[target.type]!,
      label,
      bounds: union(members.map(elementBounds)),
    });
  }
  // Orden de lectura: de arriba abajo y de izquierda a derecha.
  return targets.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
}
