import { Dexie, type EntityTable } from 'dexie';
import { newId } from '../../domain/ids.ts';
import { DB_NAME } from './db.ts';

/**
 * Registro de almacenes de este navegador (plan 2.2). Cada almacén vive en su propia base
 * IndexedDB; restaurar una copia crea uno nuevo, nunca escribe encima del activo (§12.2).
 */
export interface VaultEntry {
  dbName: string;
  /** Se conoce al abrir el almacén por primera vez. */
  vaultId: string | null;
  name: string;
  origin: 'default' | 'created' | 'restored';
  createdAt: string;
  lastOpenedAt: string | null;
}

interface SettingEntry {
  key: string;
  value: string;
}

const ACTIVE_KEY = 'active';

class RegistryDatabase extends Dexie {
  vaults!: EntityTable<VaultEntry, 'dbName'>;
  settings!: EntityTable<SettingEntry, 'key'>;

  constructor() {
    super('mindnote-registry');
    this.version(1).stores({ vaults: 'dbName, createdAt', settings: 'key' });
  }
}

export class VaultRegistry {
  private readonly db = new RegistryDatabase();
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  /** El almacén original («mindnote-vault») siempre está registrado. */
  async ensureDefault(defaultName: string): Promise<void> {
    if (!(await this.db.vaults.get(DB_NAME))) {
      await this.db.vaults.put({
        dbName: DB_NAME,
        vaultId: null,
        name: defaultName,
        origin: 'default',
        createdAt: this.now().toISOString(),
        lastOpenedAt: null,
      });
    }
  }

  list(): Promise<VaultEntry[]> {
    return this.db.vaults.orderBy('createdAt').toArray();
  }

  async active(): Promise<string> {
    const stored = (await this.db.settings.get(ACTIVE_KEY))?.value;
    return stored && (await this.db.vaults.get(stored)) ? stored : DB_NAME;
  }

  async setActive(dbName: string): Promise<void> {
    await this.db.settings.put({ key: ACTIVE_KEY, value: dbName });
  }

  /** Reserva una base nueva para un almacén creado o restaurado. */
  async register(name: string, origin: 'created' | 'restored'): Promise<VaultEntry> {
    const entry: VaultEntry = {
      dbName: `mindnote-vault-${newId()}`,
      vaultId: null,
      name,
      origin,
      createdAt: this.now().toISOString(),
      lastOpenedAt: null,
    };
    await this.db.vaults.put(entry);
    return entry;
  }

  /** Registra el almacén abierto; el nombre visible se conserva (p. ej. «… (restaurado …)»). */
  async touch(dbName: string, vaultId: string): Promise<void> {
    await this.db.vaults.update(dbName, { vaultId, lastOpenedAt: this.now().toISOString() });
  }

  /** Quita del registro una entrada cuya base no llegó a crearse (p. ej. restauración fallida). */
  async forget(dbName: string): Promise<void> {
    await this.db.vaults.delete(dbName);
    await Dexie.delete(dbName);
  }
}
