import type {
  DirHandleLike,
  FileHandleLike,
  WritableLike,
} from '../../src/adapters/filesystem/FolderRemoteStore.ts';

/** Directorio en memoria con la forma de File System Access, para probar la carpeta en Node. */
let clock = 1;

class MemoryFile implements FileHandleLike {
  readonly kind = 'file' as const;
  readonly name: string;
  bytes = new Uint8Array();
  lastModified = 0;

  constructor(name: string) {
    this.name = name;
  }

  async getFile() {
    const bytes = this.bytes;
    return {
      lastModified: this.lastModified,
      arrayBuffer: async () => bytes.slice().buffer,
    };
  }

  async createWritable(): Promise<WritableLike> {
    const chunks: Uint8Array[] = [];
    return {
      write: async (data) => void chunks.push(data.slice()),
      close: async () => {
        const total = chunks.reduce((n, c) => n + c.byteLength, 0);
        const out = new Uint8Array(total);
        let at = 0;
        for (const c of chunks) {
          out.set(c, at);
          at += c.byteLength;
        }
        this.bytes = out;
        this.lastModified = clock++;
      },
    };
  }
}

const notFound = (name: string) => new DOMException(`No existe: ${name}`, 'NotFoundError');

export class MemoryDirectory implements DirHandleLike {
  readonly kind = 'directory' as const;
  readonly name: string;
  readonly entries = new Map<string, MemoryDirectory | MemoryFile>();

  constructor(name = 'carpeta') {
    this.name = name;
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandleLike> {
    const entry = this.entries.get(name);
    if (entry instanceof MemoryDirectory) return entry;
    if (entry) throw new DOMException('Es un archivo', 'TypeMismatchError');
    if (!options?.create) throw notFound(name);
    const dir = new MemoryDirectory(name);
    this.entries.set(name, dir);
    return dir;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike> {
    const entry = this.entries.get(name);
    if (entry instanceof MemoryFile) return entry;
    if (entry) throw new DOMException('Es un directorio', 'TypeMismatchError');
    if (!options?.create) throw notFound(name);
    const file = new MemoryFile(name);
    this.entries.set(name, file);
    return file;
  }

  async *values(): AsyncIterable<DirHandleLike | FileHandleLike> {
    for (const entry of this.entries.values()) yield entry;
  }

  /** Atajos para las pruebas. */
  file(path: string): MemoryFile | undefined {
    return findFile(this, path.split('/'));
  }

  list(folder: string): string[] {
    const dir = this.entries.get(folder);
    return dir instanceof MemoryDirectory ? [...dir.entries.keys()].sort() : [];
  }

  async writeFile(path: string, bytes: Uint8Array): Promise<void> {
    const parts = path.split('/');
    const dir = await ensureDir(this, parts.slice(0, -1));
    const w = await (await dir.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
    await w.write(bytes);
    await w.close();
  }
}

function findFile(dir: MemoryDirectory, parts: string[]): MemoryFile | undefined {
  const [head, ...rest] = parts;
  const entry = head === undefined ? undefined : dir.entries.get(head);
  if (!rest.length) return entry instanceof MemoryFile ? entry : undefined;
  return entry instanceof MemoryDirectory ? findFile(entry, rest) : undefined;
}

async function ensureDir(dir: DirHandleLike, parts: string[]): Promise<DirHandleLike> {
  if (!parts.length) return dir;
  return ensureDir(await dir.getDirectoryHandle(parts[0]!, { create: true }), parts.slice(1));
}
