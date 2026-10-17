import { internalLink } from '../../domain/links.ts';

/** Enlaces Markdown que insertan el autocompletado `[[` y «Enlazar selección» (diseño §5.1). */

/** Texto plano (un título) como texto de enlace: se escapan los corchetes y la barra invertida. */
function escapeTitle(title: string): string {
  return title.replace(/[\\[\]]/g, (c) => `\\${c}`);
}

/** Destino de un enlace Markdown; entre `<>` si lleva espacios o paréntesis (web). */
function destination(url: string): string {
  return /[\s()<>]/.test(url) ? `<${url.replace(/[<>]/g, encodeURIComponent)}>` : url;
}

/** Texto de enlace Markdown seguro hacia un documento. */
export function markdownLink(target: { id: string; title: string }): string {
  return `[${escapeTitle(target.title)}](${internalLink(target.id)})`;
}

/**
 * Cambio que enlaza la selección `[from, to)` del Markdown fuente: la envuelve en
 * `[selección](url)`. La selección ya es Markdown, así que solo se escapan sus corchetes sueltos.
 * Sin texto, o si cruza párrafos (un enlace no puede), se inserta `[título](url)` al final.
 */
export function markdownLinkChange(
  source: string,
  range: { from: number; to: number },
  pick: { url: string; title: string },
): { from: number; to: number; insert: string } {
  let from = Math.min(range.from, source.length);
  let to = Math.min(range.to, source.length);
  const selected = source.slice(from, to);
  if (selected.trim() && !/\n\s*\n/.test(selected)) {
    from += selected.length - selected.trimStart().length;
    to -= selected.length - selected.trimEnd().length;
    const label = selected.trim().replace(/(?<!\\)[[\]]/g, (c) => `\\${c}`);
    return { from, to, insert: `[${label}](${destination(pick.url)})` };
  }
  return { from: to, to, insert: `[${escapeTitle(pick.title)}](${destination(pick.url)})` };
}
