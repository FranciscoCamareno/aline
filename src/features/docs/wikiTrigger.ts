/**
 * `[[` en los editores ProseMirror (plan 9.4): al escribir el segundo `[` se quitan los dos y se
 * abre el selector de enlaces en esa posición, como hace Ctrl/⌘+K. Es la misma lógica para
 * Tiptap y Milkdown; cada editor la llama desde su `handleTextInput` con su propia copia de
 * ProseMirror, así que aquí solo hay tipos estructurales.
 */
export interface WikiTriggerState {
  doc: { textBetween(from: number, to: number): string };
  selection: { empty: boolean; $from: { parent: { type: { spec: { code?: boolean } } } } };
}

/** Posición del primer `[` si el texto escrito completa un `[[`; null si no. */
export function wikiTriggerAt(
  state: WikiTriggerState,
  from: number,
  to: number,
  text: string,
): number | null {
  if (text !== '[' || from !== to || from < 1 || !state.selection.empty) return null;
  // En un bloque de código los corchetes son texto.
  if (state.selection.$from.parent.type.spec.code) return null;
  return state.doc.textBetween(from - 1, from) === '[' ? from - 1 : null;
}
