import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '../../app/ui/Icon.tsx';

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
