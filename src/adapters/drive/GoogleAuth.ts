import type { RemoteAuth } from '../../ports/RemoteAuth.ts';
import { RemoteError } from '../../ports/RemoteStore.ts';

export const GIS_SRC = 'https://accounts.google.com/gsi/client';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
/** Margen para no usar un token a punto de vencer. */
const EXPIRY_MARGIN_MS = 60_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
  requestAccessToken(overrides?: { prompt?: string }): void;
}
interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }): TokenClient;
  revoke(token: string, done?: () => void): void;
  hasGrantedAllScopes(response: TokenResponse, scope: string): boolean;
}
type GoogleGlobal = { accounts: { oauth2: GoogleOAuth2 } };

let loading: Promise<GoogleOAuth2> | null = null;

/** Carga GIS una sola vez y solo cuando se llama (nunca al arrancar la aplicación). */
function loadGis(): Promise<GoogleOAuth2> {
  const existing = (window as unknown as { google?: GoogleGlobal }).google;
  if (existing?.accounts?.oauth2) return Promise.resolve(existing.accounts.oauth2);
  loading ??= new Promise<GoogleOAuth2>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      const google = (window as unknown as { google?: GoogleGlobal }).google;
      if (google?.accounts?.oauth2) resolve(google.accounts.oauth2);
      else reject(new RemoteError('offline', 'Google Identity Services no se cargó'));
    };
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new RemoteError('offline', 'No se pudo cargar Google Identity Services'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Google Identity Services, modelo de token (diseño §13, [S3]). El token de acceso vive solo en
 * memoria con su caducidad; no hay refresh tokens ni client_secret. Cuando vence, el estado
 * pasa a «Necesita autorización» y se renueva con un gesto del usuario (`connect`).
 */
export class GoogleAuth implements RemoteAuth {
  private readonly clientId: string;
  private token: string | null = null;
  private expiresAt = 0;
  private client: TokenClient | null = null;
  private oauth: GoogleOAuth2 | null = null;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  async prepare(): Promise<void> {
    this.oauth ??= await loadGis();
  }

  /**
   * Debe llamarse desde un gesto del usuario (abre la ventana de Google). Conviene haber
   * llamado antes a `prepare`: así la ventana se abre sin esperas y el navegador no la bloquea.
   */
  async connect(_options: { acknowledgedUnencryptedContent: true }): Promise<void> {
    this.oauth ??= await loadGis();
    const oauth = this.oauth;
    const response = await new Promise<TokenResponse>((resolve, reject) => {
      const fail = (error: { type?: string; message?: string }) =>
        reject(
          new RemoteError(
            'auth',
            error.type === 'popup_failed_to_open'
              ? 'El navegador bloqueó la ventana de Google; vuelve a pulsar el botón'
              : error.type === 'popup_closed'
                ? 'Se cerró la ventana de Google sin autorizar'
                : (error.message ?? 'Google no concedió la autorización'),
          ),
        );
      this.client ??= oauth.initTokenClient({
        client_id: this.clientId,
        scope: DRIVE_SCOPE,
        callback: () => undefined,
      });
      this.client.callback = resolve;
      this.client.error_callback = fail;
      // Sin consentimiento repetido si ya se concedió; Google lo pide la primera vez.
      this.client.requestAccessToken({ prompt: '' });
    });
    if (response.error || !response.access_token) {
      throw new RemoteError('auth', response.error_description ?? response.error ?? 'Sin token');
    }
    if (!oauth.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
      throw new RemoteError('permission', 'No se concedió el permiso de archivos de Drive');
    }
    this.token = response.access_token;
    this.expiresAt = Date.now() + Number(response.expires_in ?? 3600) * 1000;
  }

  getAccessToken(): string | null {
    if (!this.token || Date.now() > this.expiresAt - EXPIRY_MARGIN_MS) return null;
    return this.token;
  }

  /** Revoca el permiso; cambiar de cuenta o desconectar no elimina el almacén local (§8.4). */
  async disconnect(): Promise<void> {
    const token = this.token;
    this.token = null;
    this.expiresAt = 0;
    if (token && this.oauth) {
      const oauth = this.oauth;
      await new Promise<void>((resolve) => oauth.revoke(token, resolve));
    }
  }
}
