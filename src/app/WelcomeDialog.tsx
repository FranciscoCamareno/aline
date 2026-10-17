import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppearanceSettings, LanguageSettings } from '../features/status/SettingsDialog.tsx';

/**
 * Bienvenida de la primera apertura: elegir idioma y tema, con los mismos selectores que
 * Configuración → Apariencia e Idioma. Es una preferencia de este navegador (como ambas
 * elecciones), así que la marca de «ya mostrado» vive en `localStorage` y no forma parte del
 * contenido. Si el almacenamiento no está disponible no se muestra, para no repetirse.
 */
const STORAGE_KEY = 'mindnote.welcome';

export function shouldShowWelcome(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === null;
  } catch {
    return false;
  }
}

function markWelcomeSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Sin almacenamiento no se puede recordar; shouldShowWelcome() ya devuelve false.
  }
}

export function WelcomeDialog({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('select')?.focus();
  }, []);

  const finish = () => {
    markWelcomeSeen();
    onDone();
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="dialog welcome-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        data-testid="welcome-dialog"
      >
        <h2 id="welcome-title">{t('welcome.title')}</h2>
        <p className="muted">{t('welcome.lead')}</p>
        <LanguageSettings />
        <AppearanceSettings />
        <p className="muted">{t('welcome.hint')}</p>
        <div className="dialog-actions">
          <button type="button" className="primary" data-testid="welcome-continue" onClick={finish}>
            {t('welcome.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
