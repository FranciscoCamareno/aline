import { useTranslation } from 'react-i18next';

interface Props {
  message: string;
  onRetry: () => void;
  onTemporary: () => void;
}

/**
 * FA-01b: el almacén no se puede abrir. Se avisa sin descartar nada y se ofrece reintentar o
 * trabajar en un almacén temporal. Abrir otro almacén llegará con varios almacenes (plan 2.2).
 */
export function StartupError({ message, onRetry, onTemporary }: Props) {
  const { t } = useTranslation();
  return (
    <div className="startup-error" role="alert" data-testid="startup-error">
      <h1>{t('startup.title')}</h1>
      <p>{t('startup.explanation')}</p>
      <p className="mono muted">{message}</p>
      <div className="startup-actions">
        <button type="button" onClick={onRetry}>
          {t('startup.retry')}
        </button>
        <button type="button" onClick={onTemporary} data-testid="startup-temporary">
          {t('startup.temporary')}
        </button>
      </div>
    </div>
  );
}
