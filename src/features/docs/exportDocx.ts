import type { IParagraphOptions, IRunOptions, ParagraphChild } from 'docx';
import { assetHashOf } from '../../domain/docAssets.ts';
import { parseInternalLink } from '../../domain/links.ts';
import { docTabs, type RichDocData, type RichNode } from '../../domain/richDoc.ts';
import { catalogFontFor, parsePx } from './typography.ts';

/**
 * Exportar un documento con formato a Word (.docx, fase 8.4) con la librería `docx` (MIT), que
 * se carga solo al exportar. Conserva títulos, alineación, negrita, cursiva, subrayado,
 * tachado, código, fuentes y tamaños del catálogo, listas, citas, bloques de código,
 * separadores, enlaces web e imágenes del almacén. Los enlaces internos (`aline://`) quedan
 * como texto: fuera de la aplicación no llevan a ningún sitio. Los comentarios no se exportan.
 */

/** Imagen lista para Word: PNG, JPEG o GIF con sus dimensiones en píxeles. */
export interface DocxImage {
  data: Uint8Array;
  type: 'png' | 'jpg' | 'gif';
  width: number;
  height: number;
}

export interface DocxOptions {
  title: string;
  /** Nombre de una pestaña sin título («Pestaña 2»). */
  tabLabel: (position: number) => string;
  /** Imagen del almacén por hash, convertida a un formato que Word admite (null si falta). */
  image: (hash: string) => Promise<DocxImage | null>;
}

/** A4 con los márgenes de la vista «Hoja» (25 mm arriba y abajo, 22 mm a los lados), en twips. */
const PAGE = { width: 11906, height: 16838, top: 1417, bottom: 1417, side: 1247 };
/** Ancho útil en píxeles (a 96 ppp): las imágenes más anchas se reducen. */
const CONTENT_WIDTH_PX = Math.floor(((PAGE.width - 2 * PAGE.side) / 1440) * 96);
const DEFAULT_FONT = 'Nunito';
const MONO_FONT = 'JetBrains Mono';

/** Documento de Word para un documento con formato (sin empaquetar). */
export async function buildDocx(doc: RichDocData, options: DocxOptions) {
  const docx = await import('docx');
  const { AlignmentType, BorderStyle, HeadingLevel, LevelFormat } = docx;

  const alignment = (node: RichNode) => {
    switch (node.attrs?.['textAlign']) {
      case 'center':
        return AlignmentType.CENTER;
      case 'right':
        return AlignmentType.RIGHT;
      case 'justify':
        return AlignmentType.JUSTIFIED;
      default:
        return undefined;
    }
  };

  /** Fragmentos de texto de un bloque, con sus marcas. */
  const runs = (node: RichNode, base: IRunOptions = {}): ParagraphChild[] => {
    const children: ParagraphChild[] = [];
    for (const child of node.content ?? []) {
      if (child.type === 'hardBreak') {
        children.push(new docx.TextRun({ ...base, text: '', break: 1 }));
        continue;
      }
      if (child.type !== 'text' || !child.text) continue;
      const options: { -readonly [K in keyof IRunOptions]: IRunOptions[K] } = { ...base };
      let href: string | null = null;
      for (const mark of child.marks ?? []) {
        if (mark.type === 'bold') options.bold = true;
        else if (mark.type === 'italic') options.italics = true;
        else if (mark.type === 'underline') options.underline = {};
        else if (mark.type === 'strike') options.strike = true;
        else if (mark.type === 'code') options.font = MONO_FONT;
        else if (mark.type === 'link') {
          const value = mark.attrs?.['href'];
          if (typeof value === 'string' && /^https?:\/\//i.test(value)) href = value;
          else if (typeof value === 'string' && parseInternalLink(value)) options.underline = {};
        } else if (mark.type === 'textStyle') {
          const font = catalogFontFor(mark.attrs?.['fontFamily']);
          if (font) options.font = font.name;
          const size = parsePx(mark.attrs?.['fontSize']);
          // Word mide en medios puntos: 1 px = 0,75 pt.
          if (size) options.size = Math.round(size * 1.5);
        }
      }
      const run = new docx.TextRun({ ...options, text: child.text });
      children.push(
        href
          ? new docx.ExternalHyperlink({
              link: href,
              children: [new docx.TextRun({ ...options, text: child.text, style: 'Hyperlink' })],
            })
          : run,
      );
    }
    return children;
  };

  type Block = InstanceType<typeof docx.Paragraph> | InstanceType<typeof docx.Table>;
  const paragraphs: Block[] = [];
  /** Dónde se añaden los bloques: el cuerpo, o la celda de tabla que se está exportando. */
  let target: Block[] = paragraphs;
  const add = (options: IParagraphOptions) => target.push(new docx.Paragraph(options));

  const image = async (node: RichNode, extra: IParagraphOptions = {}) => {
    const hash = assetHashOf(node.attrs?.['src']);
    const found = hash ? await options.image(hash) : null;
    if (!found) return;
    const scale = Math.min(1, CONTENT_WIDTH_PX / Math.max(found.width, 1));
    add({
      ...extra,
      children: [
        new docx.ImageRun({
          type: found.type,
          data: found.data,
          transformation: {
            width: Math.round(found.width * scale),
            height: Math.round(found.height * scale),
          },
          altText: {
            name: String(node.attrs?.['alt'] ?? ''),
            description: String(node.attrs?.['alt'] ?? ''),
            title: String(node.attrs?.['title'] ?? ''),
          },
        }),
      ],
    });
  };

  const block = async (node: RichNode, context: { list?: 'bullets' | 'numbers' | undefined; level: number; quote: boolean }) => {
    const quote: IParagraphOptions = context.quote
      ? {
          indent: { left: 567 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'B8B2A4', space: 8 } },
        }
      : {};
    switch (node.type) {
      case 'paragraph':
        add({
          ...quote,
          children: runs(node, context.quote ? { italics: true } : {}),
          ...(alignment(node) ? { alignment: alignment(node)! } : {}),
          ...(context.list ? { numbering: { reference: context.list, level: context.level } } : {}),
        });
        return;
      case 'heading': {
        const level = Number(node.attrs?.['level']) || 1;
        add({
          children: runs(node),
          heading:
            level === 1
              ? HeadingLevel.HEADING_1
              : level === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3,
          ...(alignment(node) ? { alignment: alignment(node)! } : {}),
        });
        return;
      }
      case 'codeBlock':
        for (const line of (node.content ?? []).map((c) => c.text ?? '').join('').split('\n')) {
          add({
            ...quote,
            children: [new docx.TextRun({ text: line, font: MONO_FONT, size: 20 })],
            shading: { type: docx.ShadingType.CLEAR, fill: 'F2EFE6', color: 'auto' },
          });
        }
        return;
      case 'blockquote':
        for (const child of node.content ?? []) await block(child, { ...context, quote: true });
        return;
      case 'bulletList':
      case 'orderedList':
        for (const item of node.content ?? []) {
          for (const child of item.content ?? []) {
            const nested = child.type === 'bulletList' || child.type === 'orderedList';
            await block(child, {
              ...context,
              list: nested ? context.list : node.type === 'bulletList' ? 'bullets' : 'numbers',
              level: nested ? context.level + 1 : context.level,
            });
          }
        }
        return;
      case 'horizontalRule':
        add({
          children: [],
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'B8B2A4', space: 1 } },
        });
        return;
      case 'image':
        await image(node, { alignment: AlignmentType.CENTER });
        return;
      case 'table': {
        // Tablas (plan 9.7): la primera fila es encabezado si sus celdas lo son.
        const rows: InstanceType<typeof docx.TableRow>[] = [];
        for (const row of node.content ?? []) {
          const cells: InstanceType<typeof docx.TableCell>[] = [];
          for (const cell of row.content ?? []) {
            const outer = target;
            const children: Block[] = [];
            target = children;
            for (const child of cell.content ?? []) await block(child, { level: 0, quote: false });
            target = outer;
            cells.push(
              new docx.TableCell({
                children: children.length ? children : [new docx.Paragraph({ children: [] })],
                ...(cell.type === 'tableHeader'
                  ? { shading: { type: docx.ShadingType.CLEAR, fill: 'F2EFE6', color: 'auto' } }
                  : {}),
              }),
            );
          }
          const header = (row.content ?? []).every((c) => c.type === 'tableHeader');
          rows.push(new docx.TableRow({ children: cells, tableHeader: header && rows.length === 0 }));
        }
        if (rows.length) {
          target.push(
            new docx.Table({ rows, width: { size: 100, type: docx.WidthType.PERCENTAGE } }),
          );
          add({ children: [] }); // Word necesita un párrafo entre dos tablas seguidas.
        }
        return;
      }
      default:
        // Nodo desconocido (de una versión posterior): su texto, para no perder nada.
        if (node.content) for (const child of node.content) await block(child, context);
    }
  };

  // Con varias pestañas, cada una empieza en página nueva con su título (como en Google Docs).
  const tabs = docTabs(doc);
  for (const [index, tab] of tabs.entries()) {
    if (tabs.length > 1) {
      add({
        heading: docx.HeadingLevel.TITLE,
        pageBreakBefore: index > 0,
        children: [new docx.TextRun({ text: tab.title || options.tabLabel(index + 1) })],
      });
    }
    for (const node of tab.content.content ?? []) await block(node, { level: 0, quote: false });
  }

  const levels = (format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (i: number) => string) =>
    Array.from({ length: 6 }, (_, level) => ({
      level,
      format,
      text: text(level),
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
    }));

  return new docx.Document({
    title: options.title,
    creator: 'aline',
    styles: { default: { document: { run: { font: DEFAULT_FONT, size: 24 } } } },
    numbering: {
      config: [
        { reference: 'bullets', levels: levels(LevelFormat.BULLET, (l) => ['•', '◦', '▪'][l % 3]!) },
        { reference: 'numbers', levels: levels(LevelFormat.DECIMAL, (l) => `%${l + 1}.`) },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.side, right: PAGE.side },
          },
        },
        children: paragraphs.length ? paragraphs : [new docx.Paragraph({ children: [] })],
      },
    ],
  });
}

/** Empaqueta el documento de Word como archivo para descargar. */
export async function docxBlob(doc: RichDocData, options: DocxOptions): Promise<Blob> {
  const { Packer } = await import('docx');
  return Packer.toBlob(await buildDocx(doc, options));
}

/**
 * Imagen del almacén lista para Word, en el navegador: dimensiones reales y, si es WebP (que
 * Word no admite), convertida a PNG.
 */
export async function browserDocxImage(asset: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<DocxImage | null> {
  const blob = new Blob([asset.bytes.slice()], { type: asset.mimeType });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  const { width, height } = bitmap;
  const type = asset.mimeType === 'image/jpeg' ? 'jpg' : asset.mimeType === 'image/gif' ? 'gif' : 'png';
  if (asset.mimeType !== 'image/webp') {
    bitmap.close();
    return { data: asset.bytes, type, width, height };
  }
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await canvas.convertToBlob({ type: 'image/png' });
  return { data: new Uint8Array(await png.arrayBuffer()), type: 'png', width, height };
}
