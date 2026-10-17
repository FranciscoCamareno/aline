import type { ReactNode } from 'react';
import googleG from '../../../brand/third-party/google-g.svg';

/**
 * Botón con la marca de Google para conectar Google Drive, según sus normas para botones de
 * inicio de sesión: logotipo «G» multicolor sin modificar, fondo neutro claro u oscuro y borde
 * fino. El logotipo es un archivo local (`brand/third-party/`): mostrar el botón no contacta con
 * Google; eso solo ocurre al confirmar (diseño §13).
 */
export function GoogleButton({
  children,
  disabled,
  testId,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="google-button"
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
    >
      <img src={googleG} alt="" width={18} height={18} />
      <span>{children}</span>
    </button>
  );
}
