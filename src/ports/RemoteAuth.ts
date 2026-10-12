/**
 * Autorización remota (diseño §13 y §14.3).
 * Token en memoria; sin client_secret ni refresh tokens en JavaScript; scope drive.file.
 */
export interface RemoteAuth {
  /**
   * Carga la librería del proveedor sin abrir ventanas. Solo se llama después de que el
   * propietario elige conectar Drive y acepta el aviso RN-12.
   */
  prepare(): Promise<void>;
  /** Abre la ventana de autorización; debe llamarse desde un gesto del usuario. */
  connect(options: { acknowledgedUnencryptedContent: true }): Promise<void>;
  getAccessToken(): string | null;
  disconnect(): Promise<void>;
}
