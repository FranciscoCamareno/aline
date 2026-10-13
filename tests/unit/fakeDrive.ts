import type { DriveFile } from '../../src/adapters/drive/driveApi.ts';

interface StoredFile extends DriveFile {
  bytes: Uint8Array;
}

type Hook = (method: string, url: URL) => Response | null;

/**
 * Simulación en memoria de la parte de Google Drive API v3 que usa el adaptador: files.list
 * con el subconjunto de `q` que genera, descargas, subidas multipart/reanudables/media y el feed
 * de cambios. Sirve a varios «dispositivos» a la vez; no sustituye una prueba con Drive real.
 */
export class FakeDrive {
  readonly files = new Map<string, StoredFile>();
  private readonly changeLog: string[] = [];
  private readonly sessions = new Map<string, Omit<StoredFile, 'bytes' | 'id'>>();
  private nextId = 1;
  requests: Array<{ method: string; path: string }> = [];
  /** Permite inyectar fallos (p. ej. 429 o perder una respuesta). */
  hook: Hook | null = null;
  token = 'token-de-prueba';

  readonly fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    this.requests.push({ method, path: url.pathname });
    const headers = new Headers(init.headers);
    if (headers.get('Authorization') !== `Bearer ${this.token}`) {
      return error(401, 'authError', 'Invalid Credentials');
    }
    const hooked = this.hook?.(method, url);
    if (hooked) return hooked;
    const body = init.body ? new Uint8Array(await new Response(init.body).arrayBuffer()) : null;
    return this.route(method, url, headers, body);
  };

  private route(method: string, url: URL, headers: Headers, body: Uint8Array | null): Response {
    const path = url.pathname;
    if (method === 'GET' && path === '/drive/v3/changes/startPageToken') {
      return json({ startPageToken: String(this.changeLog.length) });
    }
    if (method === 'GET' && path === '/drive/v3/changes') {
      const from = Number(url.searchParams.get('pageToken'));
      if (!Number.isInteger(from) || from > this.changeLog.length) {
        return error(404, 'notFound', 'Invalid page token');
      }
      const ids = [...new Set(this.changeLog.slice(from))];
      return json({
        changes: ids.map((fileId) => ({
          fileId,
          removed: false,
          file: this.meta(this.files.get(fileId)!),
        })),
        newStartPageToken: String(this.changeLog.length),
      });
    }
    if (method === 'GET' && path === '/drive/v3/files') {
      const q = url.searchParams.get('q') ?? '';
      const all = [...this.files.values()].filter((f) => matches(f, q));
      const size = Number(url.searchParams.get('pageSize') ?? 100);
      const start = Number(url.searchParams.get('pageToken') ?? 0);
      // Páginas pequeñas a propósito para probar la paginación.
      const pageSize = Math.min(size, 3);
      const page = all.slice(start, start + pageSize);
      return json({
        files: page.map((f) => this.meta(f)),
        ...(start + pageSize < all.length ? { nextPageToken: String(start + pageSize) } : {}),
      });
    }
    const fileMatch = /^\/drive\/v3\/files\/([^/]+)$/.exec(path);
    if (method === 'GET' && fileMatch && url.searchParams.get('alt') === 'media') {
      const file = this.files.get(decodeURIComponent(fileMatch[1]!));
      if (!file || file.trashed) return error(404, 'notFound', 'File not found');
      return new Response(file.bytes.slice() as Uint8Array<ArrayBuffer>, { status: 200 });
    }
    // Metadatos: como en Drive, un archivo en la papelera se devuelve con trashed = true.
    if (method === 'GET' && fileMatch) {
      const file = this.files.get(decodeURIComponent(fileMatch[1]!));
      if (!file) return error(404, 'notFound', 'File not found');
      return json(this.meta(file));
    }
    if (method === 'PATCH' && fileMatch) {
      const file = this.files.get(decodeURIComponent(fileMatch[1]!));
      if (!file) return error(404, 'notFound', 'File not found');
      const patch = JSON.parse(text(body)) as Partial<DriveFile>;
      if (patch.appProperties) {
        file.appProperties = { ...file.appProperties, ...patch.appProperties };
      }
      if (patch.trashed !== undefined) file.trashed = patch.trashed;
      this.changeLog.push(file.id);
      return json(this.meta(file));
    }
    if (method === 'POST' && path === '/drive/v3/files') {
      const meta = JSON.parse(text(body)) as Omit<DriveFile, 'id'>;
      return json(this.meta(this.create(meta, new Uint8Array())));
    }
    if (method === 'POST' && path === '/upload/drive/v3/files') {
      const type = url.searchParams.get('uploadType');
      if (type === 'multipart') {
        const boundary = /boundary=(.+)$/.exec(headers.get('Content-Type') ?? '')![1]!;
        const { meta, content } = parseMultipart(body!, boundary);
        return json(this.meta(this.create(meta, content)));
      }
      if (type === 'resumable') {
        const session = `https://www.googleapis.com/upload/drive/v3/files?upload_id=${this.nextId++}`;
        this.sessions.set(session, JSON.parse(text(body)) as Omit<DriveFile, 'id'>);
        return new Response(null, { status: 200, headers: { Location: session } });
      }
    }
    if (method === 'PUT' && this.sessions.has(url.toString())) {
      const meta = this.sessions.get(url.toString())!;
      this.sessions.delete(url.toString());
      return json(this.meta(this.create(meta, body ?? new Uint8Array())));
    }
    const uploadMatch = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(path);
    if (method === 'PATCH' && uploadMatch) {
      const file = this.files.get(decodeURIComponent(uploadMatch[1]!));
      if (!file) return error(404, 'notFound', 'File not found');
      this.edit(file.id, body ?? new Uint8Array());
      return json(this.meta(file));
    }
    return error(400, 'badRequest', `Ruta no simulada: ${method} ${path}`);
  }

  /** Simula una edición externa conservando el archivo (Drive para ordenador). */
  edit(fileId: string, bytes: Uint8Array): void {
    const file = this.files.get(fileId)!;
    file.bytes = bytes;
    file.modifiedTime = new Date(Date.parse(file.modifiedTime!) + 1000).toISOString();
    this.changeLog.push(fileId);
  }

  byProperty(key: string, value: string): StoredFile[] {
    return [...this.files.values()].filter((f) => f.appProperties?.[key] === value);
  }

  private create(meta: Omit<DriveFile, 'id'>, bytes: Uint8Array): StoredFile {
    const id = `f${this.nextId++}`;
    const file: StoredFile = {
      id,
      name: meta.name,
      mimeType: meta.mimeType ?? 'application/octet-stream',
      parents: meta.parents ?? ['root'],
      trashed: false,
      appProperties: meta.appProperties ?? {},
      modifiedTime: new Date(1_800_000_000_000 + this.nextId * 1000).toISOString(),
      bytes,
    };
    this.files.set(id, file);
    this.changeLog.push(id);
    return file;
  }

  private meta(file: StoredFile): DriveFile {
    const meta: Partial<StoredFile> = structuredClone(file);
    delete meta.bytes;
    return meta as DriveFile;
  }
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function error(
  status: number,
  reason: string,
  message: string,
  retryAfter?: number,
): Response {
  return new Response(JSON.stringify({ error: { message, errors: [{ reason }] } }), {
    status,
    headers: retryAfter ? { 'Retry-After': String(retryAfter) } : {},
  });
}

function text(bytes: Uint8Array | null): string {
  return new TextDecoder().decode(bytes ?? new Uint8Array());
}

function unquote(s: string): string {
  return s.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

/** Evalúa la conjunción de cláusulas que genera el adaptador; cualquier otra cosa falla. */
function matches(file: StoredFile, q: string): boolean {
  const str = String.raw`'(?:[^'\\]|\\.)*'`;
  const clause = new RegExp(
    String.raw`^\s*(?:appProperties has \{ key=(${str}) and value=(${str}) \}|trashed = false|mimeType = (${str})|(${str}) in parents|name = (${str}))\s*(?:and|$)`,
  );
  let rest = q;
  while (rest.trim()) {
    const m = clause.exec(rest);
    if (!m) throw new Error(`Consulta no simulada: ${rest}`);
    rest = rest.slice(m[0].length);
    if (m[1] && file.appProperties?.[unquote(m[1])] !== unquote(m[2]!)) return false;
    if (m[0].includes('trashed = false') && file.trashed) return false;
    if (m[3] && file.mimeType !== unquote(m[3])) return false;
    if (m[4] && !file.parents?.includes(unquote(m[4]))) return false;
    if (m[5] && file.name !== unquote(m[5])) return false;
  }
  return true;
}

function parseMultipart(body: Uint8Array, boundary: string) {
  // Las cabeceras y los metadatos son ASCII/UTF-8; el contenido se recorta por bytes.
  const latin = Array.from(body, (b) => String.fromCharCode(b)).join('');
  const parts = latin.split(`--${boundary}`);
  const metaPart = parts[1]!;
  const metaJson = new TextDecoder().decode(
    Uint8Array.from(metaPart.slice(metaPart.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''), (c) =>
      c.charCodeAt(0),
    ),
  );
  const contentPart = parts[2]!;
  const raw = contentPart.slice(contentPart.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '');
  return {
    meta: JSON.parse(metaJson) as Omit<DriveFile, 'id'>,
    content: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
  };
}
