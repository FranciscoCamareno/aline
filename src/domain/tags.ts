/**
 * Etiquetas (diseño §5): NFC + trim para la etiqueta visible; minúsculas para la unicidad.
 */
export function normalizeTagLabel(label: string): string {
  return label.normalize('NFC').trim();
}

export function tagKey(label: string): string {
  return normalizeTagLabel(label).toLowerCase();
}

/** Elimina vacías y duplicados (por clave), conservando la primera etiqueta visible. */
export function dedupeTags(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of labels) {
    const label = normalizeTagLabel(raw);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}
