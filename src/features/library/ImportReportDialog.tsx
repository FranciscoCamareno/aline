import { useTranslation } from 'react-i18next';
import type { ImportReport } from '../../app/importExport.ts';

/** Resultado de una importación: lo creado y, por archivo, lo no soportado (CA-18). */
export function ImportReportDialog({
  report,
  onClose,
}: {
  report: ImportReport;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const created = report.created.filter((d) => d.kind !== 'folder');
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-report-title"
        data-testid="import-report"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <h2 id="import-report-title">{t('import.title')}</h2>
        <p>{t('import.created', { count: created.length })}</p>
        {report.problems.length > 0 && (
          <>
            <p>{t('import.problemsTitle')}</p>
            <ul data-testid="import-problems">
              {report.problems.map((p, i) => (
                <li key={i}>
                  <strong>{p.file}</strong>: {t(p.key, p.params ?? {})}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="startup-actions">
          <button type="button" autoFocus onClick={onClose}>
            {t('import.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
