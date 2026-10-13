import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  exportExcalidraw,
  exportPdf,
  exportPng,
  exportRasterSize,
  exportSvg,
  type ExportScene,
} from '../../adapters/excalidraw/exporters.ts';
import { downloadBlob } from '../../app/download.ts';
import { logDiagnostic } from '../../app/runtime.ts';
import {
  EXPORT_PIXEL_BUDGET,
  excalidrawExportLosses,
  maxScale,
  safeFilename,
  type ExportSize,
} from '../../application/portability.ts';
import { describeError } from '../../ports/Diagnostics.ts';

type Format = 'png' | 'svg' | 'pdf' | 'excalidraw';
const SCALES = [1, 2, 3] as const;

/**
 * Exportar el lienzo (RF-33, RF-45, CA-13, CA-30, FA-05a): PNG, SVG, PDF y .excalidraw con
 * fondo, escala y selección. Si el raster no cabe en memoria se ofrece bajar la escala,
 * exportar la selección o, en PDF, paginar; nunca se recorta en silencio.
 */
export function ExportDialog({
  api,
  title,
  onClose,
}: {
  api: ExcalidrawImperativeAPI;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<Format>('png');
  const [background, setBackground] = useState(true);
  const [scale, setScale] = useState(2);
  const [onlySelected, setOnlySelected] = useState(false);
  const [pdfMode, setPdfMode] = useState<'fit' | 'paginate'>('fit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scene: ExportScene = useMemo(
    () => ({
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles(),
    }),
    [api],
  );
  const hasSelection = Object.values(scene.appState.selectedElementIds ?? {}).some(Boolean);
  const visibleCount = scene.elements.filter((e) => !e.isDeleted).length;
  const options = { background, scale, onlySelected: onlySelected && hasSelection };
  const raster = exportRasterSize(scene, options);
  const rasterized = format === 'png' || format === 'pdf';
  const tooBig = rasterized && raster.width * raster.height > EXPORT_PIXEL_BUDGET;
  const bounds: ExportSize = {
    width: raster.width / scale,
    height: raster.height / scale,
  };
  const losses = excalidrawExportLosses(scene.elements);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      let blob: Blob;
      let ext: string = format;
      if (format === 'png') blob = await exportPng(scene, options);
      else if (format === 'svg') blob = await exportSvg(scene, options);
      else if (format === 'pdf')
        blob = await exportPdf(scene, { ...options, mode: pdfMode, title });
      else {
        blob = exportExcalidraw(scene);
        ext = 'excalidraw';
      }
      downloadBlob(safeFilename(title, ext), blob);
      onClose();
    } catch (e) {
      logDiagnostic('error', 'export-failed', `${format} ${describeError(e)}`);
      setError(t('export.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        data-testid="export-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <h2 id="export-title">{t('export.title')}</h2>
        <fieldset>
          <legend>{t('export.format')}</legend>
          {(['png', 'svg', 'pdf', 'excalidraw'] as const).map((f) => (
            <label key={f} className="inline-option">
              <input
                type="radio"
                name="export-format"
                value={f}
                data-testid={`export-format-${f}`}
                checked={format === f}
                onChange={() => setFormat(f)}
              />
              {t(`export.formats.${f}`)}
            </label>
          ))}
        </fieldset>

        {format !== 'excalidraw' && (
          <>
            <label className="inline-option">
              <input
                type="checkbox"
                checked={background}
                onChange={(e) => setBackground(e.target.checked)}
              />
              {t('export.background')}
            </label>
            <label className="inline-option">
              {t('export.scale')}
              <select
                value={scale}
                data-testid="export-scale"
                onChange={(e) => setScale(Number(e.target.value))}
              >
                {SCALES.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
                {!SCALES.includes(scale as 1) && <option value={scale}>{scale}×</option>}
              </select>
            </label>
            <label className="inline-option">
              <input
                type="checkbox"
                disabled={!hasSelection}
                checked={onlySelected && hasSelection}
                data-testid="export-only-selected"
                onChange={(e) => setOnlySelected(e.target.checked)}
              />
              {t('export.onlySelected')}
            </label>
          </>
        )}

        {format === 'pdf' && (
          <fieldset>
            <legend>{t('export.pdfLayout')}</legend>
            {(['fit', 'paginate'] as const).map((m) => (
              <label key={m} className="inline-option">
                <input
                  type="radio"
                  name="pdf-mode"
                  checked={pdfMode === m}
                  data-testid={`export-pdf-${m}`}
                  onChange={() => setPdfMode(m)}
                />
                {t(`export.pdf.${m}`)}
              </label>
            ))}
          </fieldset>
        )}

        {rasterized && (
          <p className="muted small" data-testid="export-size">
            {t('export.size', { width: raster.width, height: raster.height })}
          </p>
        )}
        {tooBig && (
          <div className="notice small" role="alert" data-testid="export-too-big">
            <p>{t('export.tooBig', { max: maxScale(bounds) })}</p>
            <div className="startup-actions">
              {maxScale(bounds) >= 0.1 && (
                <button type="button" onClick={() => setScale(maxScale(bounds))}>
                  {t('export.useScale', { scale: maxScale(bounds) })}
                </button>
              )}
            </div>
          </div>
        )}
        {format === 'excalidraw' && (
          <div className="notice small" data-testid="export-losses">
            <p>{t('export.lossesTitle')}</p>
            <ul>
              {losses.map((l) => (
                <li key={l.loss}>{t(`export.losses.${l.loss}`, { count: l.count })}</li>
              ))}
            </ul>
          </div>
        )}
        {visibleCount === 0 && <p className="notice small">{t('export.empty')}</p>}
        {error && (
          <p className="notice small" role="alert">
            {error}
          </p>
        )}
        <div className="startup-actions">
          <button
            type="button"
            data-testid="export-run"
            disabled={busy || tooBig || visibleCount === 0}
            onClick={() => void run()}
          >
            {busy ? t('export.working') : t('export.run')}
          </button>
          <button type="button" onClick={onClose}>
            {t('title.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
