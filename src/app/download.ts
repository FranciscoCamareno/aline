/** Entrega un archivo al usuario tras una acción explícita suya (sin envío a ningún servicio). */
export function downloadText(filename: string, text: string, mimeType = 'application/json'): void {
  downloadBlob(filename, new Blob([text], { type: mimeType }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Marca de tiempo apta para nombres de archivo: 2026-10-12T10-30-00Z. */
export function fileTimestamp(date = new Date()): string {
  return date
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replaceAll(':', '-');
}
