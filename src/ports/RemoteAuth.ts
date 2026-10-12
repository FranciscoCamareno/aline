/**
 * Autorización remota (diseño §13 y §14.3). PENDIENTE.
 * Token en memoria; sin client_secret ni refresh tokens en JavaScript; scope drive.file.
 */
export interface RemoteAuth {
  /** Carga GIS solo después de que el propietario elige conectar Drive. */
  connect(options: { acknowledgedUnencryptedContent: true }): Promise<void>;
  getAccessToken(): string | null;
  disconnect(): Promise<void>;
}
