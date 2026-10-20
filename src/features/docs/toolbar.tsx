import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '../../app/ui/Icon.tsx';
import { Menu, type MenuItem } from '../../app/ui/Menu.tsx';

/**
 * Piezas de la barra de formato que comparten los dos editores de «Documentos» (Tiptap y
 * Milkdown): botones con icono, botones de carácter (B, I, U, S) y el estilo de párrafo.
 */
export type BlockStyle = 'paragraph' | 'h1' | 'h2' | 'h3';

interface ButtonProps {
  id: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onRun: () => void;
}

export function ToolIconButton({
  id,
  icon,
  label,
  active = false,
  disabled = false,
  onRun,
}: ButtonProps & { icon: IconName }) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      data-testid={`doc-${id}`}
      disabled={disabled}
      // Sin robar el foco al editor: la selección sigue donde estaba.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

/** Formato de carácter con su letra (sin iconos propios todavía). */
export function ToolMarkButton({
  id,
  letter,
  label,
  active = false,
  disabled = false,
  onRun,
}: ButtonProps & { letter: string }) {
  return (
    <button
      type="button"
      className={`icon-button doc-mark doc-mark-${id}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      data-testid={`doc-${id}`}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
    >
      <span aria-hidden="true">{letter}</span>
    </button>
  );
}

export function BlockStyleSelect({
  value,
  disabled,
  onChange,
}: {
  value: BlockStyle;
  disabled: boolean;
  onChange: (style: BlockStyle) => void;
}) {
  const { t } = useTranslation();
  return (
    <select
      className="doc-block-style"
      aria-label={t('docs.blockStyle')}
      data-testid="doc-block-style"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as BlockStyle)}
    >
      <option value="paragraph">{t('docs.paragraph')}</option>
      <option value="h1">{t('docs.heading', { level: 1 })}</option>
      <option value="h2">{t('docs.heading', { level: 2 })}</option>
      <option value="h3">{t('docs.heading', { level: 3 })}</option>
    </select>
  );
}

/** Acciones del menú «Tabla» (plan 9.7); cada editor las traduce a sus propios comandos. */
export type TableAction =
  | 'insert'
  | 'row-before'
  | 'row-after'
  | 'col-before'
  | 'col-after'
  | 'delete-row'
  | 'delete-col'
  | 'delete-table';

/** Fuera de una tabla, insertar una de 3 × 3 con encabezado; dentro, editar filas y columnas. */
export function TableMenu({
  inTable,
  inHeaderRow = false,
  disabled,
  onAction,
}: {
  inTable: boolean;
  /**
   * El cursor está en la fila de encabezado de una tabla Markdown (GFM): esa fila no se puede
   * quitar ni tener otra encima, así que esas dos acciones se desactivan.
   */
  inHeaderRow?: boolean;
  disabled: boolean;
  onAction: (action: TableAction) => void;
}) {
  const { t } = useTranslation();
  const item = (action: TableAction, label: string, extra: Partial<MenuItem> = {}): MenuItem => ({
    id: `doc-table-${action}`,
    label,
    disabled,
    onSelect: () => onAction(action),
    ...extra,
  });
  const items: MenuItem[] = inTable
    ? [
        item('row-before', t('docs.table.rowBefore'), { disabled: disabled || inHeaderRow }),
        item('row-after', t('docs.table.rowAfter')),
        item('col-before', t('docs.table.colBefore'), { separated: true }),
        item('col-after', t('docs.table.colAfter')),
        item('delete-row', t('docs.table.deleteRow'), {
          separated: true,
          disabled: disabled || inHeaderRow,
        }),
        item('delete-col', t('docs.table.deleteCol')),
        item('delete-table', t('docs.table.deleteTable'), { danger: true }),
      ]
    : [item('insert', t('docs.table.insert'))];
  return (
    <Menu
      trigger={
        <>
          <Icon name="tabla" size={18} />
          <Icon name="chevron-abajo" size={12} />
        </>
      }
      label={t('docs.table.label')}
      triggerClassName="icon-button doc-align-trigger"
      testId="doc-table"
      placement="bottom-start"
      items={items}
    />
  );
}
