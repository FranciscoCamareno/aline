import { isUuid } from './ids.ts';

/**
 * Enlaces internos (diseño §10, formato §2.3.1): `aline://document/<uuid>[#fragmento]`. Apuntan
 * siempre al identificador, nunca al título. Los enlaces escritos antes del 16/10/2026 usan el
 * esquema `mindnote://`; se siguen leyendo para siempre y nunca se reescriben.
 *
 * Fragmento:
 * - `#<elementId>` (sin `=`): elemento de un lienzo; es la forma original y se sigue escribiendo.
 * - `#clave=valor[&clave=valor…]`, con las claves
 *   - `b=<id>`: bloque de un documento con formato (`attrs.anchor` del bloque),
 *   - `ev=<uuid>`: evento de un calendario,
 *   - `t=[prefijo-,]inicio[,fin][,-sufijo]`: cita textual, con la misma gramática que los
 *     fragmentos de texto de los navegadores. `fin` aparece en citas largas: la cita va desde
 *     `inicio` hasta `fin`, ambos incluidos. Prefijo y sufijo desempatan entre apariciones.
 *   Varias claves se combinan (`b=…&t=…`: se busca la cita en el bloque y, si no está, en todo
 *   el documento). Las claves desconocidas o mal formadas se ignoran.
 */
export const INTERNAL_PREFIX = 'aline://document/';
/** Prefijo de los enlaces escritos antes del cambio de nombre: solo se lee. */
export const LEGACY_INTERNAL_PREFIX = 'mindnote://document/';

export interface TextSelector {
  /** Contexto antes de la cita (vacío si no hay). */
  prefix: string;
  /** La cita completa o, en citas largas, su comienzo. */
  start: string;
  /** Final de una cita larga; vacío si `start` es la cita completa. */
  end: string;
  /** Contexto después de la cita (vacío si no hay). */
  suffix: string;
}

export interface LinkFragment {
  elementId: string | null;
  blockId: string | null;
  eventId: string | null;
  text: TextSelector | null;
}

export interface InternalTarget extends LinkFragment {
  documentId: string;
}

const BLOCK_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Límite de cada parte de una cita, ya decodificada. */
const MAX_PART = 1000;

/** ¿Usa el esquema interno (actual o anterior), sea válido o no? Para marcar enlaces rotos. */
export function hasInternalScheme(url: string): boolean {
  return /^(aline|mindnote):/i.test(url);
}

/** `aline://document/<uuid>[#fragmento]` (o `mindnote://…`) → destino; null si no es válido. */
export function parseInternalLink(url: string): InternalTarget | null {
  const prefix = [INTERNAL_PREFIX, LEGACY_INTERNAL_PREFIX].find((p) => url.startsWith(p));
  if (!prefix) return null;
  const rest = url.slice(prefix.length);
  const hash = rest.indexOf('#');
  const documentId = hash < 0 ? rest : rest.slice(0, hash);
  if (!isUuid(documentId)) return null;
  return { documentId, ...parseLinkFragment(hash < 0 ? '' : rest.slice(hash + 1)) };
}

export function internalLink(documentId: string, fragment?: Partial<LinkFragment> | null): string {
  const value = fragment ? formatLinkFragment(fragment) : '';
  return `${INTERNAL_PREFIX}${documentId}${value ? `#${value}` : ''}`;
}

function emptyFragment(): LinkFragment {
  return { elementId: null, blockId: null, eventId: null, text: null };
}

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Codifica una parte del fragmento: además de lo habitual, `-` (separa prefijo y sufijo) y los
 * paréntesis, para que el enlace sea un destino válido dentro de un enlace Markdown.
 */
function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[-()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Fragmento (lo que va tras `#`) → ancla; vacío o desconocido → sin ancla. */
export function parseLinkFragment(raw: string): LinkFragment {
  const fragment = emptyFragment();
  if (!raw) return fragment;
  if (!raw.includes('=')) {
    // Forma original: el id de elemento codificado entero (no puede contener un `=` sin codificar).
    fragment.elementId = decode(raw) || null;
    return fragment;
  }
  for (const pair of raw.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (key === 'b') {
      const id = decode(value);
      if (id && BLOCK_ID.test(id)) fragment.blockId = id;
    } else if (key === 'ev') {
      const id = decode(value);
      if (isUuid(id)) fragment.eventId = id;
    } else if (key === 't') {
      fragment.text = parseTextSelector(value);
    }
  }
  return fragment;
}

function parseTextSelector(value: string): TextSelector | null {
  const parts = value.split(',');
  let prefix = '';
  let suffix = '';
  if (parts.length > 1 && parts[0]!.endsWith('-')) prefix = parts.shift()!.slice(0, -1);
  if (parts.length > 1 && parts.at(-1)!.startsWith('-')) suffix = parts.pop()!.slice(1);
  if (parts.length < 1 || parts.length > 2) return null;
  const decoded = [prefix, parts[0]!, parts[1] ?? '', suffix].map(decode);
  if (decoded.some((p) => p === null || p.length > MAX_PART)) return null;
  const [p, start, end, s] = decoded as [string, string, string, string];
  return start.trim() ? { prefix: p, start, end, suffix: s } : null;
}

/** Ancla → fragmento (sin `#`); vacío si no hay ancla. */
export function formatLinkFragment(fragment: Partial<LinkFragment>): string {
  // Un elemento de lienzo no se combina con otras claves: se escribe en la forma original, que
  // también entienden las versiones anteriores de la aplicación.
  if (fragment.elementId) return encodeURIComponent(fragment.elementId);
  const pairs: string[] = [];
  if (fragment.blockId) pairs.push(`b=${encode(fragment.blockId)}`);
  if (fragment.eventId) pairs.push(`ev=${encode(fragment.eventId)}`);
  const text = fragment.text;
  if (text?.start) {
    const parts = [
      ...(text.prefix ? [`${encode(text.prefix)}-`] : []),
      encode(text.start),
      ...(text.end ? [encode(text.end)] : []),
      ...(text.suffix ? [`-${encode(text.suffix)}`] : []),
    ];
    pairs.push(`t=${parts.join(',')}`);
  }
  return pairs.join('&');
}
