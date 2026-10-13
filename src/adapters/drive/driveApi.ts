import { RemoteError } from '../../ports/RemoteStore.ts';

/**
 * Cliente mínimo de Google Drive API v3 (diseño §8.2, [S14], [S15]). Solo pide los campos que
 * usa, pagina todas las listas y clasifica los errores para el motor de sincronización.
 */
export const DRIVE_API = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
/** Por encima de este tamaño se usa subida reanudable en vez de multipart. */
export const RESUMABLE_THRESHOLD = 5 * 1024 * 1024;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  parents?: string[];
  trashed?: boolean;
  appProperties?: Record<string, string>;
}

export interface DriveChange {
  fileId: string;
  removed?: boolean;
  file?: DriveFile;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const FILE_FIELDS = 'id,name,mimeType,modifiedTime,parents,trashed,appProperties';

/** Escapa un valor para una consulta `q` de Drive. */
export function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function hasProperty(key: string, value: string): string {
  return `appProperties has { key=${quote(key)} and value=${quote(value)} }`;
}

export class DriveClient {
  private readonly fetchImpl: FetchLike;
  private readonly getToken: () => string | null;

  constructor(fetchImpl: FetchLike, getToken: () => string | null) {
    this.fetchImpl = fetchImpl;
    this.getToken = getToken;
  }

  /** Petición autenticada; los fallos se convierten en RemoteError (§8.2). */
  async request(
    method: string,
    url: string,
    init: { body?: BodyInit; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const token = this.getToken();
    if (!token) throw new RemoteError('auth', 'Necesita autorización de Google');
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        ...(init.body !== undefined ? { body: init.body } : {}),
        headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      });
    } catch (error) {
      throw new RemoteError(
        'offline',
        error instanceof Error ? error.message : 'Sin conexión con Google Drive',
      );
    }
    if (response.ok) return response;
    const retryAfter = Number(response.headers.get('Retry-After')) || null;
    let reason = '';
    let message = `Google Drive respondió ${response.status}`;
    try {
      const body = (await response.json()) as {
        error?: { message?: string; errors?: Array<{ reason?: string }> };
      };
      reason = body.error?.errors?.[0]?.reason ?? '';
      message = body.error?.message ?? message;
    } catch {
      // Cuerpo sin JSON: basta con el código.
    }
    if (response.status === 401) throw new RemoteError('auth', message);
    if (response.status === 404) throw new RemoteError('not-found', message);
    if (response.status === 429 || response.status >= 500)
      throw new RemoteError('transient', message, retryAfter);
    if (response.status === 403) {
      if (/rateLimitExceeded|userRateLimitExceeded/.test(reason)) {
        throw new RemoteError('transient', message, retryAfter);
      }
      if (/storageQuotaExceeded|quotaExceeded/.test(reason))
        throw new RemoteError('quota', message);
      throw new RemoteError('permission', message);
    }
    throw new RemoteError('permission', message);
  }

  /** files.list con paginación completa. */
  async list(q: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q,
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        pageSize: '1000',
        spaces: 'drive',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const res = (await (await this.request('GET', `${DRIVE_API}/files?${params}`)).json()) as {
        files?: DriveFile[];
        nextPageToken?: string;
      };
      files.push(...(res.files ?? []));
      pageToken = res.nextPageToken;
    } while (pageToken);
    return files;
  }

  async download(fileId: string): Promise<Uint8Array> {
    const res = await this.request(
      'GET',
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
    );
    return new Uint8Array(await res.arrayBuffer());
  }

  async createFolder(
    name: string,
    parent: string | null,
    appProperties: Record<string, string>,
  ): Promise<DriveFile> {
    const res = await this.request('POST', `${DRIVE_API}/files?fields=${FILE_FIELDS}`, {
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parent ? { parents: [parent] } : {}),
        appProperties,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    return (await res.json()) as DriveFile;
  }

  /** Crea un archivo: multipart si es pequeño, reanudable si es grande ([S15]). */
  async createFile(
    metadata: {
      name: string;
      parents: string[];
      mimeType: string;
      appProperties: Record<string, string>;
    },
    bytes: Uint8Array,
  ): Promise<DriveFile> {
    if (bytes.byteLength > RESUMABLE_THRESHOLD) return this.createResumable(metadata, bytes);
    const boundary = `mindnote-${crypto.randomUUID()}`;
    const head = new TextEncoder().encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`,
    );
    const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.byteLength + bytes.byteLength + tail.byteLength);
    body.set(head, 0);
    body.set(bytes, head.byteLength);
    body.set(tail, head.byteLength + bytes.byteLength);
    const res = await this.request(
      'POST',
      `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`,
      {
        body: body as Uint8Array<ArrayBuffer>,
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      },
    );
    return (await res.json()) as DriveFile;
  }

  private async createResumable(
    metadata: {
      name: string;
      parents: string[];
      mimeType: string;
      appProperties: Record<string, string>;
    },
    bytes: Uint8Array,
  ): Promise<DriveFile> {
    const start = await this.request(
      'POST',
      `${DRIVE_UPLOAD}/files?uploadType=resumable&fields=${FILE_FIELDS}`,
      {
        body: JSON.stringify(metadata),
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': metadata.mimeType,
          'X-Upload-Content-Length': String(bytes.byteLength),
        },
      },
    );
    const session = start.headers.get('Location');
    if (!session) throw new RemoteError('transient', 'Drive no devolvió la sesión de subida');
    const res = await this.request('PUT', session, {
      body: bytes as Uint8Array<ArrayBuffer>,
      headers: { 'Content-Type': metadata.mimeType },
    });
    return (await res.json()) as DriveFile;
  }

  async getFile(fileId: string): Promise<DriveFile> {
    const res = await this.request(
      'GET',
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`,
    );
    return (await res.json()) as DriveFile;
  }

  /**
   * Cambia metadatos (propiedades, papelera). Las appProperties enviadas se fusionan con las
   * existentes; nunca se usa para el contenido.
   */
  async updateMetadata(
    fileId: string,
    metadata: { appProperties?: Record<string, string>; trashed?: boolean },
  ): Promise<void> {
    await this.request('PATCH', `${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
      body: JSON.stringify(metadata),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /** Sustituye el contenido de un archivo (solo índices aceleradores; nunca objetos ni revisiones). */
  async updateMedia(fileId: string, bytes: Uint8Array, mimeType: string): Promise<void> {
    await this.request(
      'PATCH',
      `${DRIVE_UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media`,
      {
        body: bytes as Uint8Array<ArrayBuffer>,
        headers: { 'Content-Type': mimeType },
      },
    );
  }

  async startPageToken(): Promise<string> {
    const res = (await (
      await this.request('GET', `${DRIVE_API}/changes/startPageToken`)
    ).json()) as {
      startPageToken: string;
    };
    return res.startPageToken;
  }

  /** changes.list completo desde un cursor ([S14]); devuelve el cursor nuevo. */
  async changes(pageToken: string): Promise<{ changes: DriveChange[]; newStartPageToken: string }> {
    const changes: DriveChange[] = [];
    let token: string | undefined = pageToken;
    for (;;) {
      const params = new URLSearchParams({
        pageToken: token,
        fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FILE_FIELDS}))`,
        pageSize: '1000',
        spaces: 'drive',
      });
      const res = (await (await this.request('GET', `${DRIVE_API}/changes?${params}`)).json()) as {
        changes?: DriveChange[];
        nextPageToken?: string;
        newStartPageToken?: string;
      };
      changes.push(...(res.changes ?? []));
      if (res.newStartPageToken) return { changes, newStartPageToken: res.newStartPageToken };
      if (!res.nextPageToken) throw new RemoteError('transient', 'Feed de cambios incompleto');
      token = res.nextPageToken;
    }
  }
}
