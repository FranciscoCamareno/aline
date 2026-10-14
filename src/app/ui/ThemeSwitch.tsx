import { useTranslation } from 'react-i18next';
import { setThemePreference, useTheme } from '../theme.ts';
import { Icon } from './Icon.tsx';

/**
 * Interruptor de tema (DESIGN.md, «Interruptor de tema»): carril de 72 × 36 con un pomo de 30 px
 * que se desliza hacia el tema activo; el icono del otro tema queda en el carril como pista.
 * Tocarlo pasa a modo manual; «Seguir al sistema» está en Preferencias.
 */
export function ThemeSwitch() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={t('app.darkTheme')}
      title={t('app.darkTheme')}
      className="theme-switch"
      data-testid="theme-switch"
      onClick={() => setThemePreference(dark ? 'light' : 'dark')}
    >
      <span className="theme-switch-track" aria-hidden="true">
        <span className="theme-switch-hint theme-switch-hint-sun">
          <Icon name="tema-claro" size={18} />
        </span>
        <span className="theme-switch-hint theme-switch-hint-moon">
          <Icon name="tema-oscuro" size={18} />
        </span>
        <span className="theme-switch-knob">
          <Icon name={dark ? 'tema-oscuro' : 'tema-claro'} size={20} on />
        </span>
      </span>
    </button>
  );
}
