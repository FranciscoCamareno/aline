import { describeError } from '../ports/Diagnostics.ts';
import { downloadText, fileTimestamp } from './download.ts';
import { logDiagnostic } from './runtime.ts';
import type { AppServices } from './services.ts';

/**
 * Exportación de emergencia (diseño §7.1): guarda lo pendiente y descarga todo el contenido
 * local. Sirve sin espacio libre, en el almacén temporal y antes de borrar datos del navegador.
 */
export async function runEmergencyExport({ service, vault }: AppServices): Promise<void> {
  try {
    const data = await service.exportEmergency();
    downloadText(
      `mindnote-emergencia-${vault.id.slice(0, 8)}-${fileTimestamp()}.json`,
      JSON.stringify(data),
    );
    logDiagnostic(
      'info',
      'emergency-export',
      `documentos=${data.snapshot.documents.length} blobs=${data.blobs.length} ausentes=${data.missingBlobs.length}`,
    );
  } catch (error) {
    logDiagnostic('error', 'emergency-export-failed', describeError(error));
    throw error;
  }
}

export async function exportDiagnostics({
  diagnostics,
  vault,
  device,
}: AppServices): Promise<void> {
  const entries = await diagnostics.list();
  downloadText(
    `mindnote-diagnostico-${fileTimestamp()}.json`,
    JSON.stringify(
      { appVersion: __APP_VERSION__, vaultId: vault.id, deviceId: device.deviceId, entries },
      null,
      2,
    ),
  );
}
