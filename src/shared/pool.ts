/**
 * Ejecuta `task` sobre cada elemento con como mucho `limit` tareas a la vez. Si una falla, no
 * se empiezan más, se espera a las que ya corrían y se lanza el primer error.
 */
export async function forEachLimited<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  let failure: { error: unknown } | null = null;
  const worker = async () => {
    while (!failure && next < items.length) {
      const item = items[next++]!;
      try {
        await task(item);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw (failure as { error: unknown }).error;
}

/**
 * Memoriza una tarea asíncrona por clave mientras está en curso o tuvo éxito, para que dos
 * llamadas simultáneas con la misma clave compartan el mismo trabajo. Un fallo se olvida, así
 * que se puede reintentar.
 */
export function onceByKey<T>(): (key: string, task: () => Promise<T>) => Promise<T> {
  const running = new Map<string, Promise<T>>();
  return (key, task) => {
    let pending = running.get(key);
    if (!pending) {
      pending = task();
      running.set(key, pending);
      pending.catch(() => running.delete(key));
    }
    return pending;
  };
}
