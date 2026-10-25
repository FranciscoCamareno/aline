import { assetHashOf, DOC_ASSET_PREFIX } from '../../domain/docAssets.ts';
import { editedSize, needsBaking, readImageEdit, type ImageEdit } from '../../domain/imageEdit.ts';
import type { RichDocData, RichNode } from '../../domain/richDoc.ts';
import { sha256Hex } from '../../shared/hash.ts';

/**
 * Imágenes editadas de un documento con formato, ya recortadas y giradas (plan 10.8). La edición
 * vive en los atributos del nodo; fuera de la aplicación (Word, Markdown) hace falta la imagen
 * resultante, que se genera aquí al exportar. El almacén no cambia.
 */
export type AssetLoader = (
  hash: string,
) => Promise<{ mimeType: string; bytes: Uint8Array } | undefined>;

export interface BakedImage {
  hash: string;
  mimeType: 'image/png';
  bytes: Uint8Array;
}

/** La imagen con su recorte y giro, en PNG; null si no se puede leer. */
export async function bakeImage(
  asset: { mimeType: string; bytes: Uint8Array },
  edit: Pick<ImageEdit, 'rotation' | 'crop'>,
): Promise<BakedImage | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([asset.bytes.slice()], { type: asset.mimeType }));
  } catch {
    return null;
  }
  const crop = edit.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const sw = Math.max(1, Math.round(bitmap.width * crop.width));
  const sh = Math.max(1, Math.round(bitmap.height * crop.height));
  const size = editedSize({ width: sw, height: sh }, { rotation: edit.rotation, crop: null });
  const canvas = new OffscreenCanvas(Math.round(size.width), Math.round(size.height));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return null;
  }
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((edit.rotation * Math.PI) / 180);
  context.drawImage(
    bitmap,
    Math.round(bitmap.width * crop.x),
    Math.round(bitmap.height * crop.y),
    sw,
    sh,
    -sw / 2,
    -sh / 2,
    sw,
    sh,
  );
  bitmap.close();
  const png = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  return { hash: await sha256Hex(png), mimeType: 'image/png', bytes: png };
}

/**
 * El documento con cada imagen recortada o girada sustituida por su versión ya generada (que
 * conserva el ancho), y un cargador que también sirve esas imágenes nuevas. Recorre todas las
 * pestañas. Una imagen que no se puede generar se deja como estaba.
 */
export async function withBakedImages(
  doc: RichDocData,
  load: AssetLoader,
): Promise<{ doc: RichDocData; load: AssetLoader }> {
  const baked = new Map<string, BakedImage>();
  const byEdit = new Map<string, BakedImage | null>();
  const copy = structuredClone(doc);
  const visit = async (node: RichNode | undefined) => {
    if (!node) return;
    if (node.type === 'image') {
      const edit = readImageEdit(node.attrs);
      const hash = assetHashOf(node.attrs?.['src']);
      if (hash && needsBaking(edit)) {
        const key = JSON.stringify([hash, edit.rotation, edit.crop]);
        if (!byEdit.has(key)) {
          const asset = await load(hash);
          byEdit.set(key, asset ? await bakeImage(asset, edit) : null);
        }
        const result = byEdit.get(key);
        if (result) {
          baked.set(result.hash, result);
          node.attrs = { ...node.attrs, src: `${DOC_ASSET_PREFIX}${result.hash}`, rotation: null, crop: null };
        }
      }
    }
    for (const child of node.content ?? []) await visit(child);
  };
  await visit(copy.content);
  for (const tab of copy.tabs ?? []) await visit(tab.content);
  return {
    doc: copy,
    load: async (hash) => baked.get(hash) ?? (await load(hash)),
  };
}
