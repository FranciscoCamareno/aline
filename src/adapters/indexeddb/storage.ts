/** Persistencia y cuota del navegador (diseño §7.1). No sustituye una copia de seguridad. */
export interface StorageReport {
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

export async function requestPersistentStorage(): Promise<StorageReport> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!storage) return { persisted: null, usage: null, quota: null };
  let persisted: boolean | null;
  try {
    persisted = await storage.persisted();
    if (!persisted) persisted = await storage.persist();
  } catch {
    persisted = null;
  }
  try {
    const estimate = await storage.estimate();
    return { persisted, usage: estimate.usage ?? null, quota: estimate.quota ?? null };
  } catch {
    return { persisted, usage: null, quota: null };
  }
}
