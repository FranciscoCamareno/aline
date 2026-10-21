import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  newElementWith,
} from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { markdownProjection } from '../../application/knowledge.ts';
import { parseNoteMarkdown } from '../../domain/frontmatter.ts';
import { internalLink } from '../../domain/links.ts';

/**
 * Tarjetas de nota en el lienzo (diseño §9.3, plan 9.24; RF-18). Una tarjeta es un rectángulo con
 * su texto ligado (título y extracto), elementos nativos que se exportan tal cual. Referencia la
 * nota por UUID: el rectángulo lleva el enlace interno (abrirlo lleva a la nota) y el sidecar
 * (`noteEmbeds`) dice qué elementos son de cada tarjeta. El texto no es una copia editable: se
 * reconstruye desde la nota al abrir el lienzo y cuando la nota cambia.
 */
export interface NoteEmbed {
  documentId: string;
  /** Rectángulo de la tarjeta. */
  elementId: string;
  /** Texto ligado al rectángulo (título y extracto). */
  textId: string;
}

const CARD = { width: 260, height: 150 };
/** Caracteres del extracto. */
const EXCERPT = 160;

/** Lee las tarjetas del sidecar (lo que no tenga la forma esperada se ignora). */
export function noteEmbedsOf(raw: readonly unknown[]): NoteEmbed[] {
  return raw.filter(
    (e): e is NoteEmbed =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as NoteEmbed).documentId === 'string' &&
      typeof (e as NoteEmbed).elementId === 'string' &&
      typeof (e as NoteEmbed).textId === 'string',
  );
}

/** Título y extracto del texto mostrado de una nota (sin marcas de Markdown). */
export function cardText(title: string, markdown: string): string {
  let body = markdownProjection(parseNoteMarkdown(markdown).body).text.replace(/\s+/g, ' ').trim();
  // Si la nota empieza con su propio título (el encabezado de una nota nueva), no se repite.
  if (body.toLocaleLowerCase().startsWith(title.trim().toLocaleLowerCase())) {
    body = body.slice(title.trim().length).trim();
  }
  const excerpt = body.length > EXCERPT ? `${body.slice(0, EXCERPT - 1).trimEnd()}…` : body;
  return excerpt ? `${title}\n\n${excerpt}` : title;
}

/**
 * Inserta una tarjeta de la nota en el centro de la vista (un solo paso de deshacer). Devuelve
 * la entrada del sidecar.
 */
export function insertNoteCard(
  api: ExcalidrawImperativeAPI,
  note: { id: string; title: string },
  text: string,
): NoteEmbed | null {
  const appState = api.getAppState();
  const zoom = appState.zoom.value;
  const x = appState.width / 2 / zoom - appState.scrollX - CARD.width / 2;
  const y = appState.height / 2 / zoom - appState.scrollY - CARD.height / 2;
  const created = convertToExcalidrawElements([
    {
      type: 'rectangle',
      x,
      y,
      width: CARD.width,
      height: CARD.height,
      strokeColor: '#262118',
      backgroundColor: '#FFFDF4',
      fillStyle: 'solid',
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3 },
      link: internalLink(note.id),
      label: { text, fontSize: 16, textAlign: 'left', verticalAlign: 'top' },
    },
  ]);
  const card = created.find((e) => e.type === 'rectangle');
  const label = created.find((e) => e.type === 'text');
  if (!card || !label) return null;
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...created],
    appState: { selectedElementIds: { [card.id]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return { documentId: note.id, elementId: card.id, textId: label.id };
}

/**
 * Pone al día el texto de las tarjetas con su nota (diseño §9.3: «cambiar la nota actualiza su
 * proyección sin modificar su identidad»). `texts` da el texto actual de cada nota; las tarjetas
 * cuya nota ya no existe se quedan como están. Solo toca la escena si algo cambió, sin entrar en
 * el historial de deshacer (no es una acción del usuario).
 */
export function refreshNoteCards(
  api: ExcalidrawImperativeAPI,
  embeds: readonly NoteEmbed[],
  texts: ReadonlyMap<string, string>,
): boolean {
  const elements = api.getSceneElementsIncludingDeleted();
  const byId = new Map(elements.map((e) => [e.id, e]));
  const patches = new Map<string, string>();
  for (const embed of embeds) {
    const text = texts.get(embed.documentId);
    const label = byId.get(embed.textId);
    if (text === undefined || !label || label.isDeleted || label.type !== 'text') continue;
    if (label.originalText !== text) patches.set(label.id, text);
  }
  if (!patches.size) return false;
  api.updateScene({
    elements: elements.map((e): ExcalidrawElement => {
      const text = patches.get(e.id);
      // El motor vuelve a ajustar el texto a su rectángulo con `originalText`.
      return text !== undefined && e.type === 'text'
        ? newElementWith(e, { text, originalText: text })
        : e;
    }),
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return true;
}
