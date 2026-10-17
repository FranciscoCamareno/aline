/**
 * Orden manual de la barra lateral (desde el 17/10/2026): claves fraccionales que se comparan
 * como texto. Mover un elemento entre dos vecinos solo cambia su clave, así que solo él recibe
 * una revisión nueva. Dígitos en orden ASCII; ninguna clave termina en el dígito menor.
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? DIGITS[0]) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const low = a ? DIGITS.indexOf(a[0]!) : 0;
  const high = b !== null ? DIGITS.indexOf(b[0]!) : DIGITS.length;
  if (high - low > 1) return DIGITS[Math.round((low + high) / 2)]!;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[low]! + midpoint(a.slice(1), null);
}

/** Clave estrictamente entre `before` y `after` (null = sin vecino por ese lado). */
export function keyBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) {
    throw new RangeError('Las claves de orden deben ser crecientes');
  }
  return midpoint(before ?? '', after);
}

/**
 * Hermanos en el orden de la barra: primero los que tienen clave (por clave), después los demás
 * en su orden por defecto (`fallback`).
 */
export function sortByKey<T extends { sortKey?: string }>(
  items: readonly T[],
  fallback: (a: T, b: T) => number,
): T[] {
  return [...items].sort((a, b) => {
    if (a.sortKey && b.sortKey) return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0;
    if (a.sortKey) return -1;
    if (b.sortKey) return 1;
    return fallback(a, b);
  });
}

/**
 * Claves nuevas para colocar `movingId` en la posición `index` de `siblings` (ya ordenados y sin
 * el que se mueve). Si los hermanos tienen claves crecientes, solo cambia la del que se mueve; si
 * no (nunca se ordenaron a mano), se numeran todos en el orden que se ve. Devuelve solo los que
 * cambian.
 */
export function planReorder<T extends { id: string; sortKey?: string }>(
  siblings: readonly T[],
  movingId: string,
  index: number,
): Map<string, string> {
  const others = siblings.filter((s) => s.id !== movingId);
  const at = Math.max(0, Math.min(index, others.length));
  const keyed = others.every(
    (s, i) => s.sortKey && (i === 0 || others[i - 1]!.sortKey! < s.sortKey),
  );
  if (keyed) {
    const before = others[at - 1]?.sortKey ?? null;
    const after = others[at]?.sortKey ?? null;
    return new Map([[movingId, keyBetween(before, after)]]);
  }
  const order = [...others.map((s) => s.id)];
  order.splice(at, 0, movingId);
  const current = new Map(siblings.map((s) => [s.id, s.sortKey]));
  const changes = new Map<string, string>();
  let previous: string | null = null;
  for (const id of order) {
    const key = keyBetween(previous, null);
    if (current.get(id) !== key) changes.set(id, key);
    previous = key;
  }
  return changes;
}
