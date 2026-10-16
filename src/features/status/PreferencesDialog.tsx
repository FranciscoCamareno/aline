import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type AppLanguage } from '../../app/i18n.ts';
import {
  DARK_SCHEMES,
  LIGHT_SCHEMES,
  SCHEME_PAIR,
  schemePreview,
  type Scheme,
} from '../../app/schemes.ts';
import { setScheme, setThemePreference, useTheme } from '../../app/theme.ts';
import { Icon } from '../../app/ui/Icon.tsx';

interface Props {
  onClose: () => void;
}

/**
 * Preferencias de este navegador (se abren desde Perfil): idioma, «Seguir al sistema» y los
 * esquemas de color (DESIGN.md §2.5). Se elige un esquema claro y uno oscuro; el interruptor de
 * la cabecera alterna entre ellos. Nada de esto es contenido ni se sincroniza.
 */
export function PreferencesDialog({ onClose }: Props) {
  const { t, i18n } = useTranslation();
  const { theme, preference, lightScheme, darkScheme } = useTheme();
  const dialogRef = useRef<HTMLDivElement>(null);

  // El foco entra en el diálogo; al cerrarlo vuelve a quien lo abrió.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('button, input, select')?.focus();
    return () => opener?.focus?.();
  }, []);

  const group = (mode: 'light' | 'dark', schemes: readonly Scheme[], selected: Scheme) => (
    <section className="scheme-group" aria-labelledby={`scheme-${mode}-title`}>
      <h3 id={`scheme-${mode}-title`} className="section-title">
        {t(mode === 'light' ? 'preferences.lightSchemes' : 'preferences.darkSchemes')}
      </h3>
      <div className="scheme-grid" role="radiogroup" aria-labelledby={`scheme-${mode}-title`}>
        {schemes.map((scheme) => (
          <button
            key={scheme}
            type="button"
            role="radio"
            aria-checked={selected === scheme}
            className={`scheme-card${selected === scheme ? ' is-selected' : ''}`}
            data-testid={`scheme-${scheme}`}
            onClick={() => setScheme(scheme)}
          >
            <img src={schemePreview(scheme)} alt="" width={300} height={188} loading="lazy" />
            <span className="scheme-name">
              {t(`schemes.${scheme}.name`)}
              {selected === scheme && <Icon name="check" size={16} />}
            </span>
            <span className="scheme-note">
              {t(`schemes.${scheme}.note`)} ·{' '}
              {t('preferences.pair', { scheme: t(`schemes.${SCHEME_PAIR[scheme]}.name`) })}
            </span>
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="dialog preferences-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-title"
        data-testid="preferences"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <header className="dialog-head">
          <Icon name="ajustes" size={20} />
          <h2 id="preferences-title">{t('preferences.title')}</h2>
          <span className="topbar-spacer" />
          <button
            type="button"
            className="icon-button"
            aria-label={t('statusPanel.close')}
            data-testid="preferences-close"
            onClick={onClose}
          >
            <Icon name="cerrar" size={18} />
          </button>
        </header>

        <label className="preference-row">
          <Icon name="idioma" size={18} />
          <span>{t('app.language')}</span>
          <select
            aria-label={t('app.language')}
            value={i18n.language.startsWith('en') ? 'en' : 'es'}
            onChange={(e) => setLanguage(e.target.value as AppLanguage)}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        {/* «Seguir al sistema» vive aquí; el interruptor de la cabecera pasa a modo manual. */}
        <label className="preference-row">
          <Icon name="tema-sistema" size={18} />
          <span>
            {t('preferences.followSystem')}
            <small className="muted">{t('preferences.followSystemHint')}</small>
          </span>
          <input
            type="checkbox"
            checked={preference === 'system'}
            data-testid="theme-system"
            onChange={(e) => setThemePreference(e.target.checked ? 'system' : theme)}
          />
        </label>

        {group('light', LIGHT_SCHEMES, lightScheme)}
        {group('dark', DARK_SCHEMES, darkScheme)}
      </div>
    </div>
  );
}
