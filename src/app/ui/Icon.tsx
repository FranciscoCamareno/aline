import type { RevisionKind } from '../../domain/revision.ts';

/**
 * Iconos de interfaz del sistema de diseño (docs/DESIGN.md §7.4). Los SVG viven en
 * `brand/icons/ui/` y se incrustan en línea para que el trazo tome `currentColor`
 * y la capa de acento (`class="ac"`) responda a `--icon-accent`. Son archivos propios y
 * revisados (sin scripts ni referencias externas); no se usan iconos de otras librerías.
 */
const ui = import.meta.glob<string>('../../../brand/icons/ui/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Se quitan las medidas fijas del <svg> raíz: el tamaño lo decide el CSS (`.icon`). */
function index(files: Record<string, string>): Map<string, string> {
  return new Map(
    Object.entries(files).map(([path, svg]) => [
      path.slice(path.lastIndexOf('/') + 1, -'.svg'.length),
      svg.replace(/^<svg[^>]*>/, (tag) => tag.replace(/\s(width|height)="\d+"/g, '')),
    ]),
  );
}
const ICONS = index(ui);

export type IconName =
  | 'ajustes'
  | 'biblioteca'
  | 'calendario'
  | 'calendario-hoy'
  | 'evento-mas'
  | 'repetir'
  | 'ayuda'
  | 'usuario'
  | 'chevron-izq'
  | 'mas-opciones'
  | 'panel-lateral'
  | 'sticker'
  | 'tema-sistema'
  | 'volver'
  | 'aviso'
  | 'buscar'
  | 'carpeta'
  | 'carpeta-abierta'
  | 'cerrar'
  | 'check'
  | 'chevron-abajo'
  | 'chevron-der'
  | 'descargar'
  | 'dispositivo'
  | 'editar'
  | 'eliminar'
  | 'enlace'
  | 'error'
  | 'etiqueta'
  | 'exito'
  | 'historial'
  | 'idioma'
  | 'imagen'
  | 'info'
  | 'lienzo'
  | 'mas'
  | 'menu'
  | 'nota'
  | 'documento'
  | 'documento-md'
  | 'alinear-izq'
  | 'alinear-centro'
  | 'alinear-der'
  | 'lista'
  | 'lista-numerada'
  | 'cita'
  | 'deshacer'
  | 'rehacer'
  | 'nube'
  | 'nube-off'
  | 'nube-ok'
  | 'restaurar'
  | 'sincronizar'
  | 'subir'
  | 'tema-claro'
  | 'tema-oscuro'
  | 'candado';

interface Props {
  name: IconName;
  /** Tamaño en px: 16 en listas, 18–20 en menús, 20 en el encabezado (§7.3). */
  size?: number;
  /** Activa la capa de acento (ítem activo, favorito marcado…). */
  on?: boolean;
  className?: string;
}

/** Icono decorativo: el nombre accesible lo pone siempre el control que lo contiene. */
export function Icon({ name, size = 20, on = false, className }: Props) {
  const svg = ICONS.get(name);
  if (!svg) throw new Error(`Icono desconocido: ${name}`);
  return (
    <span
      className={`icon${on ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Icono del tipo de documento, igual en la biblioteca, la búsqueda y los enlaces. */
export function KindIcon({
  kind,
  size = 16,
  on = false,
}: {
  kind: RevisionKind;
  size?: number;
  on?: boolean;
}) {
  const name: IconName = KIND_ICONS[kind];
  return <Icon name={name} size={size} on={on} className={`kind-icon kind-${kind}`} />;
}

const KIND_ICONS: Record<RevisionKind, IconName> = {
  canvas: 'lienzo',
  note: 'nota',
  folder: 'carpeta',
  calendar: 'calendario',
  template: 'biblioteca',
  doc: 'documento',
  mddoc: 'documento-md',
  docfolder: 'carpeta',
};
