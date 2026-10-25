/**
 * Edición de las imágenes de los documentos con formato (plan 10.8): tamaño, giro en pasos de 90°
 * y recorte, **sin tocar el original** (el archivo del almacén no cambia; lo editado son atributos
 * opcionales del nodo `image`, formato §2.5.3). El recorte se guarda en fracciones de la imagen
 * original, antes de girarla; al exportar se genera la imagen ya recortada y girada.
 */

export type ImageRotation = 0 | 90 | 180 | 270;

/** Rectángulo en fracciones (0–1) de una imagen. */
export interface ImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageEdit {
  /** Ancho mostrado en píxeles de CSS; null = tamaño natural (sin pasar del ancho de la hoja). */
  width: number | null;
  rotation: ImageRotation;
  crop: ImageCrop | null;
}

export const MIN_IMAGE_WIDTH = 48;
/** Lado mínimo de un recorte, en fracción de la imagen. */
export const MIN_CROP = 0.05;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Atributos de un nodo saneados: lo que no es válido se trata como no editado. */
export function readImageEdit(attrs: Record<string, unknown> | null | undefined): ImageEdit {
  const width = attrs?.['width'];
  const rotation = attrs?.['rotation'];
  return {
    width: finite(width) && width >= MIN_IMAGE_WIDTH ? Math.round(width) : null,
    rotation: rotation === 90 || rotation === 180 || rotation === 270 ? rotation : 0,
    crop: validCrop(attrs?.['crop']),
  };
}

function validCrop(value: unknown): ImageCrop | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y, width, height } = value as Record<string, unknown>;
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) return null;
  return clampCrop({ x, y, width, height });
}

/** Recorte dentro de la imagen y con el tamaño mínimo; null si es la imagen entera. */
export function clampCrop(crop: ImageCrop): ImageCrop | null {
  const width = Math.min(1, Math.max(MIN_CROP, crop.width));
  const height = Math.min(1, Math.max(MIN_CROP, crop.height));
  const x = Math.min(1 - width, Math.max(0, crop.x));
  const y = Math.min(1 - height, Math.max(0, crop.y));
  const round = (n: number) => Math.round(n * 10_000) / 10_000;
  const result = { x: round(x), y: round(y), width: round(width), height: round(height) };
  const whole =
    result.x <= 0.001 && result.y <= 0.001 && result.width >= 0.999 && result.height >= 0.999;
  return whole ? null : result;
}

/** ¿Hay que generar otra imagen al exportar (recorte o giro)? El tamaño solo no cuenta. */
export function needsBaking(edit: ImageEdit): boolean {
  return edit.rotation !== 0 || edit.crop !== null;
}

export function isEdited(edit: ImageEdit): boolean {
  return edit.width !== null || needsBaking(edit);
}

export function rotateBy(rotation: ImageRotation, delta: 90 | -90): ImageRotation {
  return ((((rotation + delta) % 360) + 360) % 360) as ImageRotation;
}

/** Un punto normalizado de la imagen original, en la imagen girada `rotation` (sentido horario). */
function rotatePoint([x, y]: [number, number], rotation: ImageRotation): [number, number] {
  switch (rotation) {
    case 90:
      return [1 - y, x];
    case 180:
      return [1 - x, 1 - y];
    case 270:
      return [y, 1 - x];
    default:
      return [x, y];
  }
}

function rotateRect(rect: ImageCrop, rotation: ImageRotation): ImageCrop {
  const [ax, ay] = rotatePoint([rect.x, rect.y], rotation);
  const [bx, by] = rotatePoint([rect.x + rect.width, rect.y + rect.height], rotation);
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}

/** Recorte (del original) visto sobre la imagen ya girada: lo que muestra el diálogo. */
export function cropToRotated(crop: ImageCrop, rotation: ImageRotation): ImageCrop {
  return rotateRect(crop, rotation);
}

/** Rectángulo elegido sobre la imagen girada, en fracciones del original (lo que se guarda). */
export function cropFromRotated(rect: ImageCrop, rotation: ImageRotation): ImageCrop {
  return rotateRect(rect, ((360 - rotation) % 360) as ImageRotation);
}

const swaps = (rotation: ImageRotation) => rotation === 90 || rotation === 270;

/** Tamaño en píxeles de la imagen resultante (recortada y girada) a partir del original. */
export function editedSize(
  natural: { width: number; height: number },
  edit: Pick<ImageEdit, 'rotation' | 'crop'>,
): { width: number; height: number } {
  const crop = edit.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const w = natural.width * crop.width;
  const h = natural.height * crop.height;
  return swaps(edit.rotation) ? { width: h, height: w } : { width: w, height: h };
}

/**
 * Cómo pintar la imagen con CSS dentro de su marco (que tiene la proporción de `editedSize`): una
 * caja con el recorte, del tamaño del marco (con los lados cambiados si gira 90° o 270°), girada
 * en el centro, y dentro la imagen entera desplazada para que se vea solo el recorte.
 */
export function imageLayout(edit: Pick<ImageEdit, 'rotation' | 'crop'>): {
  swap: boolean;
  image: { left: number; top: number; width: number; height: number };
} {
  const crop = edit.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  return {
    swap: swaps(edit.rotation),
    // Porcentajes de la caja del recorte.
    image: {
      left: (-crop.x / crop.width) * 100,
      top: (-crop.y / crop.height) * 100,
      width: 100 / crop.width,
      height: 100 / crop.height,
    },
  };
}
