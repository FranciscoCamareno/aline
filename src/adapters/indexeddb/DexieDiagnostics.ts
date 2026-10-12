import type { DiagnosticLevel, DiagnosticRecord, Diagnostics } from '../../ports/Diagnostics.ts';
import type { VaultDatabase } from './db.ts';

/** Límites de rotación: con 400 entradas de 600 caracteres el registro queda por debajo de 250 KB. */
export const MAX_DIAGNOSTIC_ENTRIES = 400;
export const MAX_MESSAGE_LENGTH = 600;

export class DexieDiagnostics implements Diagnostics {
  private readonly db: VaultDatabase;
  private readonly now: () => Date;
  private queue: Promise<void> = Promise.resolve();

  constructor(db: VaultDatabase, now: () => Date = () => new Date()) {
    this.db = db;
    this.now = now;
  }

  /** No bloquea a quien registra; un fallo del registro nunca rompe la aplicación. */
  record(level: DiagnosticLevel, code: string, message: string): void {
    const entry = {
      at: this.now().toISOString(),
      level,
      code: code.slice(0, 64),
      message: message.slice(0, MAX_MESSAGE_LENGTH),
    };
    this.queue = this.queue.then(() => this.write(entry)).catch(() => undefined);
  }

  /** Espera a que se escriban las entradas pendientes (pruebas y exportación). */
  flush(): Promise<void> {
    return this.queue;
  }

  async list(limit = MAX_DIAGNOSTIC_ENTRIES): Promise<DiagnosticRecord[]> {
    await this.flush();
    const rows = await this.db.diagnostics.orderBy('id').reverse().limit(limit).toArray();
    return rows.map(({ at, level, code, message }) => ({ at, level, code, message }));
  }

  private async write(entry: DiagnosticRecord): Promise<void> {
    await this.db.transaction('rw', this.db.diagnostics, async () => {
      await this.db.diagnostics.add(entry);
      const excess = (await this.db.diagnostics.count()) - MAX_DIAGNOSTIC_ENTRIES;
      if (excess > 0) {
        const oldest = await this.db.diagnostics.orderBy('id').limit(excess).primaryKeys();
        await this.db.diagnostics.bulkDelete(oldest);
      }
    });
  }
}
