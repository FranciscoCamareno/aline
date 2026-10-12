/**
 * Agrupa cambios con espera (debounce) y un límite máximo durante edición continua
 * (diseño §7.1: 500 ms y 2 s). `flush` fuerza el guardado pendiente, p. ej. al cambiar de
 * documento o en visibilitychange.
 */
export interface Coalescer<T> {
  push(value: T): void;
  flush(): Promise<void>;
  cancel(): void;
  readonly pending: boolean;
}

export function createCoalescer<T>(
  run: (value: T) => Promise<void>,
  { waitMs = 500, maxWaitMs = 2000 }: { waitMs?: number; maxWaitMs?: number } = {},
): Coalescer<T> {
  let latest: { value: T } | null = null;
  let firstPushAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> = Promise.resolve();

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const fire = (): Promise<void> => {
    clear();
    if (!latest) return running;
    const { value } = latest;
    latest = null;
    firstPushAt = null;
    // Serializa las ejecuciones para que dos guardados no se crucen.
    running = running.catch(() => undefined).then(() => run(value));
    return running;
  };

  return {
    push(value) {
      latest = { value };
      const now = Date.now();
      firstPushAt ??= now;
      clear();
      const remainingMax = maxWaitMs - (now - firstPushAt);
      timer = setTimeout(
        () => void fire().catch(() => undefined),
        Math.max(0, Math.min(waitMs, remainingMax)),
      );
    },
    flush: fire,
    cancel() {
      clear();
      latest = null;
      firstPushAt = null;
    },
    get pending() {
      return latest !== null;
    },
  };
}
