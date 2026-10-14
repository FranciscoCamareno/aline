/**
 * Autorización remota (diseño §13 y §14.3).
 * Token en memoria; sin client_secret ni refresh tokens en JavaScript; scope drive.file.
 */
export interface RemoteAuth {
  /**
   * Carga la librería del proveedor sin abrir ventanas. Solo se llama después de que el
   * propietario elige conectar Drive, elige si cifra y acepta el aviso de ese modo.
   */
  prepare(): Promise<void>;
  /** Abre la ventana de autorización; debe llamarse desde un gesto del usuario. */
  connect(): Promise<void>;
  getAccessToken(): string | null;
  /**
   * Olvida el token y revoca el permiso en el proveedor. Rechaza si el proveedor no confirma la
   * revocación (o no hay sesión con la que pedirla); el token local se olvida igualmente.
   */
  disconnect(): Promise<void>;
}
