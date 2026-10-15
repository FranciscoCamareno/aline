import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StorageReport } from '../../adapters/indexeddb/storage.ts';
import { exportDiagnostics, runEmergencyExport } from '../../app/emergency.ts';
import type { AppServices } from '../../app/services.ts';
import type { DiagnosticRecord } from '../../ports/Diagnostics.ts';
import { VaultsSection } from './VaultsSection.tsx';

/** Umbral de aviso de cuota alta (diseño §7.1). */
export const QUOTA_WARNING_RATIO = 0.8;

export function quotaRatio(report: StorageReport): number | null {
  return report.usage !== null && report.quota ? report.usage / report.quota : null;
}

function formatBytes(bytes: number | null, unknown: string): string {
  if (bytes === null) return unknown;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

interface Props {
  services: AppServices;
  onClose: () => void;
  onError: (error: unknown) => void;
}

/** Estado del almacén y del navegador, exportación de emergencia y registro de diagnóstico. */
export function StatusPanel({ services, onClose, onError }: Props) {
  const { t } = useTranslation();
  const [report, setReport] = useState<StorageReport | null>(null);
  const [entries, setEntries] = useState<DiagnosticRecord[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void services.storage.then((r) => !cancelled && setReport(r));
    void services.diagnostics.list(50).then((e) => !cancelled && setEntries(e));
    return () => {
      cancelled = true;
    };
  }, [services]);

  const ratio = report ? quotaRatio(report) : null;
  const persisted =
    report?.persisted === true
      ? t('statusPanel.persistedYes')
      : report?.persisted === false
        ? t('statusPanel.persistedNo')
        : t('statusPanel.persistedUnknown');

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="status-panel" aria-label={t('statusPanel.title')} data-testid="status-panel">
      <header>
        <h2>{t('statusPanel.title')}</h2>
        <button type="button" onClick={onClose}>
          {t('statusPanel.close')}
        </button>
      </header>

      <section>
        <h3>{t('statusPanel.vault')}</h3>
        <dl>
          <dt>{t('statusPanel.vault')}</dt>
          <dd>
            {services.vault.name}
            {services.temporary && ` · ${t('statusPanel.temporary')}`}
          </dd>
          <dt>{t('statusPanel.vaultId')}</dt>
          <dd className="mono">{services.vault.id}</dd>
          <dt>{t('statusPanel.format')}</dt>
          <dd>{services.vault.formatVersion}</dd>
          <dt>{t('statusPanel.device')}</dt>
          <dd className="mono">{services.device.deviceId}</dd>
          <dt>{t('statusPanel.appVersion')}</dt>
          <dd>{__APP_VERSION__}</dd>
        </dl>
      </section>

      <VaultsSection services={services} onError={onError} />

      <section>
        <h3>{t('statusPanel.storage')}</h3>
        <dl>
          <dt>{t('statusPanel.persisted')}</dt>
          <dd data-testid="storage-persisted">{persisted}</dd>
          <dt>{t('statusPanel.usage')}</dt>
          <dd>
            {report && ratio !== null
              ? t('statusPanel.usageValue', {
                  usage: formatBytes(report.usage, t('statusPanel.unknown')),
                  quota: formatBytes(report.quota, t('statusPanel.unknown')),
                  percent: (ratio * 100).toFixed(1),
                })
              : t('statusPanel.unknown')}
          </dd>
        </dl>
        {ratio !== null && ratio >= QUOTA_WARNING_RATIO && (
          <p className="notice" role="alert">
            {t('statusPanel.quotaHigh')}
          </p>
        )}
        <p className="muted">{t('statusPanel.backupNote')}</p>
        <button
          type="button"
          disabled={busy}
          data-testid="emergency-export"
          onClick={() => void run(() => runEmergencyExport(services))}
        >
          {t('statusPanel.emergencyExport')}
        </button>
        <p className="muted">{t('statusPanel.emergencyExportHint')}</p>
      </section>

      <section>
        <h3>{t('statusPanel.diagnostics')}</h3>
        <p className="muted">{t('statusPanel.diagnosticsHint')}</p>
        <button
          type="button"
          disabled={busy}
          data-testid="export-diagnostics"
          onClick={() => void run(() => exportDiagnostics(services))}
        >
          {t('statusPanel.exportDiagnostics')}
        </button>
        {entries && entries.length === 0 && (
          <p className="muted">{t('statusPanel.diagnosticsEmpty')}</p>
        )}
        {entries && entries.length > 0 && (
          <ol className="diagnostics-list" data-testid="diagnostics-list">
            {entries.map((e, i) => (
              <li key={`${e.at}-${i}`} className={`diag-${e.level}`}>
                <time>{e.at.replace('T', ' ').slice(0, 19)}</time> <strong>{e.code}</strong>{' '}
                <span>{e.message}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3>{t('statusPanel.licenses')}</h3>
        <p className="muted">{t('statusPanel.licensesHint')}</p>
        <ul className="link-list">
          <li>
            <a href={`${import.meta.env.BASE_URL}LICENSE.txt`} target="_blank" rel="noopener">
              {t('statusPanel.ownLicense')}
            </a>
          </li>
          <li>
            <a
              href={`${import.meta.env.BASE_URL}THIRD-PARTY-NOTICES.txt`}
              target="_blank"
              rel="noopener"
              data-testid="third-party-notices"
            >
              {t('statusPanel.thirdParty')}
            </a>
          </li>
        </ul>
      </section>
    </aside>
  );
}
