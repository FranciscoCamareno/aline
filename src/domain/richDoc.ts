import { z } from './zod.ts';
import { ProjectionBuilder, type TextProjection } from './anchors.ts';
import type { ReadOnlyReason } from './compat.ts';

/**
 * Documento de texto enriquecido (kind `doc`, desde el 15/10/2026): un documento con formato
 * libre, editado con Tiptap. El cuerpo es JSON con el árbol de ProseMirror que produce el editor
 * (`content`, nodo raíz `doc`). El dominio no conoce el esquema del editor: solo comprueba la
 * forma general del árbol; el editor valida los nodos y marcas al cargarlo.
 */
export const RICH_DOC_SCHEMA_VERSION = 1 as const;

/** Nodo de ProseMirror en JSON: `type` y, según el caso, atributos, hijos, marcas o texto. */
export interface RichNode {
  type: string;
  attrs?: Record<string, unknown> | undefined;
  content?: RichNode[] | undefined;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> | undefined }> | undefined;
  text?: string | undefined;
  [key: string]: unknown;
}

const markSchema = z.looseObject({
  type: z.string().min(1).max(100),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

const nodeSchema: z.ZodType<RichNode> = z.lazy(() =>
  z.looseObject({
    type: z.string().min(1).max(100),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(nodeSchema).max(100_000).optional(),
    marks: z.array(markSchema).max(100).optional(),
    text: z.string().optional(),
  }),
);

/** Id de un comentario: el de la marca `comment` que señala su texto. */
const commentIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const commentReplySchema = z.looseObject({
  id: commentIdSchema,
  text: z.string().max(10_000),
  createdAt: z.iso.datetime(),
});

/**
 * Comentario de un documento con formato (desde el 17/10/2026): un hilo con su texto, sus
 * respuestas y si está resuelto. El fragmento comentado lleva la marca `comment` con su `id`;
 * si ese texto se borra, el hilo se conserva hasta que se elimine (formato §2.5.3).
 */
export const docCommentSchema = z.looseObject({
  id: commentIdSchema,
  text: z.string().max(10_000),
  createdAt: z.iso.datetime(),
  resolved: z.boolean().optional(),
  replies: z.array(commentReplySchema).max(500).optional(),
});
export type DocComment = z.infer<typeof docCommentSchema>;

const docContentSchema = z.looseObject({
  type: z.literal('doc'),
  content: z.array(nodeSchema).max(100_000).optional(),
});

/**
 * Pestaña de un documento con formato (desde el 17/10/2026, como las de Google Docs). La lista
 * da el orden y los títulos; exactamente una pestaña no lleva `content`: es la principal y su
 * contenido es el `content` raíz del documento (así un documento sin pestañas no cambia y las
 * versiones anteriores de la aplicación siguen leyéndolo). Formato §2.5.3.
 */
export const docTabSchema = z.looseObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  title: z.string().max(200),
  content: docContentSchema.optional(),
});

export const richDocSchema = z
  .looseObject({
    schemaVersion: z.literal(RICH_DOC_SCHEMA_VERSION),
    content: docContentSchema,
    /** Comentarios (opcional; sin comentarios, la clave no se escribe). */
    comments: z.array(docCommentSchema).max(2_000).optional(),
    /** Pestañas (opcional; con una sola pestaña sin título, la clave no se escribe). */
    tabs: z.array(docTabSchema).min(1).max(100).optional(),
  })
  .refine(
    (doc) =>
      !doc.tabs ||
      (doc.tabs.filter((t) => !t.content).length === 1 &&
        new Set(doc.tabs.map((t) => t.id)).size === doc.tabs.length),
    { message: 'Las pestañas necesitan ids únicos y exactamente una principal (sin contenido)' },
  );
export type RichDocData = z.infer<typeof richDocSchema>;

export function emptyRichDoc(): RichDocData {
  return {
    schemaVersion: RICH_DOC_SCHEMA_VERSION,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  };
}

/**
 * Lectura tolerante (diseño §5, compatibilidad): una versión posterior o un contenido inválido
 * se muestran en solo lectura y nunca se reescriben.
 */
export function parseRichDoc(value: unknown): {
  doc: RichDocData;
  readOnly: ReadOnlyReason | null;
} {
  const version =
    value && typeof value === 'object' ? (value as { schemaVersion?: unknown }).schemaVersion : 0;
  if (typeof version === 'number' && version > RICH_DOC_SCHEMA_VERSION) {
    const content = docContentSchema.safeParse((value as { content?: unknown }).content);
    return {
      doc: content.success ? { ...emptyRichDoc(), content: content.data } : emptyRichDoc(),
      readOnly: 'unsupported-version',
    };
  }
  const parsed = richDocSchema.safeParse(value);
  return parsed.success
    ? { doc: parsed.data, readOnly: null }
    : { doc: emptyRichDoc(), readOnly: 'invalid-content' };
}

/** Id de la pestaña principal de un documento que nunca tuvo pestañas. */
export const MAIN_TAB_ID = 'main';

export interface ResolvedTab {
  id: string;
  /** Título escrito por el usuario; vacío = «Pestaña N» en la interfaz. */
  title: string;
  content: RichDocData['content'];
  /** La principal: su contenido es el `content` raíz. */
  main: boolean;
}

/** Pestañas del documento en orden, cada una con su contenido. */
export function docTabs(doc: RichDocData): ResolvedTab[] {
  if (!doc.tabs?.length) {
    return [{ id: MAIN_TAB_ID, title: '', content: doc.content, main: true }];
  }
  return doc.tabs.map((tab) =>
    tab.content
      ? { id: tab.id, title: tab.title, content: tab.content, main: false }
      : { id: tab.id, title: tab.title, content: doc.content, main: true },
  );
}

/**
 * Documento a guardar a partir de sus pestañas: la principal va al `content` raíz y las demás
 * en `tabs`. Sin pestañas extra ni título, ni comentarios, esas claves no se escriben. Conserva
 * las demás claves de `base` (desconocidas, de una versión posterior).
 */
export function assembleRichDoc(
  base: RichDocData,
  tabs: ReadonlyArray<{ id: string; title: string; content: RichDocData['content'] }>,
  mainId: string,
  comments: DocComment[],
): RichDocData {
  const main = tabs.find((t) => t.id === mainId) ?? tabs[0];
  const result: RichDocData = { ...base, content: main?.content ?? base.content };
  delete result.tabs;
  delete result.comments;
  const single = tabs.length <= 1 && (!main || (main.id === MAIN_TAB_ID && !main.title));
  if (!single) {
    result.tabs = tabs.map((t) =>
      t.id === main?.id
        ? { id: t.id, title: t.title }
        : { id: t.id, title: t.title, content: t.content },
    );
  }
  if (comments.length) result.comments = comments;
  return result;
}

/** Nodos que separan bloques al extraer el texto (párrafos, títulos, elementos de lista…). */
const INLINE_TYPES = new Set(['text', 'hardBreak']);

/** Texto plano del documento, un bloque por línea (vistas previas del historial). */
export function richDocText(doc: RichDocData): string {
  const lines: string[] = [];
  let line = '';
  const walk = (node: RichNode): void => {
    if (node.type === 'text') line += node.text ?? '';
    else if (node.type === 'hardBreak') line += '\n';
    for (const child of node.content ?? []) walk(child);
    if (!INLINE_TYPES.has(node.type) && node.type !== 'doc' && line) {
      lines.push(line);
      line = '';
    }
  };
  for (const tab of docTabs(doc)) walk(tab.content);
  if (line) lines.push(line);
  return lines.join('\n');
}

/** Nodos hoja (tamaño 1 en ProseMirror); el resto abre y cierra, aunque esté vacío. */
const LEAF_TYPES = new Set(['hardBreak', 'horizontalRule', 'image']);
/** Bloques de texto: lo que se puede anclar con `attrs.anchor` (formato §2.5.3). */
const TEXTBLOCK_TYPES = new Set(['paragraph', 'heading', 'codeBlock']);

/**
 * Texto mostrado del documento para las anclas de texto (`domain/anchors.ts`): un bloque por
 * párrafo, título o bloque de código, con su ancla si la tiene, y la posición de ProseMirror de
 * cada tramo de texto (el contenido de `doc` empieza en la posición 0).
 */
export function richDocProjection(doc: RichDocData): TextProjection {
  const builder = new ProjectionBuilder();
  // Con pestañas, el texto de todas (para el índice); las posiciones de cada una empiezan en 0.
  for (const tab of docTabs(doc)) projectContent(tab.content, builder);
  return builder.build();
}

/** Proyección de un solo contenido (una pestaña), con sus posiciones de ProseMirror. */
export function contentProjection(content: RichDocData['content']): TextProjection {
  const builder = new ProjectionBuilder();
  projectContent(content, builder);
  return builder.build();
}

function projectContent(content: RichDocData['content'], builder: ProjectionBuilder): void {
  let pos = 0;
  const walk = (node: RichNode): void => {
    if (node.type === 'text') {
      const text = node.text ?? '';
      builder.append(text, pos, pos + text.length);
      pos += text.length;
      return;
    }
    if (LEAF_TYPES.has(node.type)) {
      if (node.type === 'hardBreak') builder.append(' ', pos, pos + 1);
      pos += 1;
      return;
    }
    const textblock = TEXTBLOCK_TYPES.has(node.type);
    if (textblock) {
      const anchor = node.attrs?.['anchor'];
      builder.startBlock(typeof anchor === 'string' && anchor ? anchor : null);
    }
    pos += 1;
    for (const child of node.content ?? []) walk(child);
    pos += 1;
    if (textblock) builder.endBlock();
  };
  for (const child of content.content ?? []) walk(child);
}
