import { notImplemented } from '../../domain/errors.ts';
import type { RemoteAuth } from '../../ports/RemoteAuth.ts';

/**
 * PENDIENTE — Google Identity Services, token model (diseño §13, [S3]).
 * El access token vive solo en memoria; sin refresh tokens ni client_secret en el cliente.
 * Si el token vence, el estado pasa a «Necesita autorización» sin bloquear la edición local.
 */
export class GoogleAuth implements RemoteAuth {
  private token: string | null = null;

  async connect(_options: { acknowledgedUnencryptedContent: true }): Promise<void> {
    return notImplemented('Drive: autorización con Google Identity Services');
  }

  getAccessToken(): string | null {
    return this.token;
  }

  disconnect(): Promise<void> {
    // Revocar o cambiar de cuenta no elimina el almacén local.
    this.token = null;
    return Promise.resolve();
  }
}
