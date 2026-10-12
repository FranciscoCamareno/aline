import { exportToSvg } from '@excalidraw/excalidraw';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { excalidrawCanvasAdapter } from '../../adapters/excalidraw/sceneCodec.ts';
import type { RevisionPreview as Preview, VaultService } from '../../application/VaultService.ts';
import { renderMarkdownPreview } from '../notes/markdown.ts';

interface Props {
  revisionId: string;
  service: VaultService;
  /** Para comparar notas en un conflicto. */
  onLoaded?: (preview: Preview) => void;
}

/**
 * Vista previa de solo lectura de una revisión (FP-06, paso 2). Las escenas se pintan como SVG
 * con las utilidades del motor; las notas con la misma vista previa saneada que el editor.
 */
export function RevisionPreview({ revisionId, service, onLoaded }: Props) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const svgHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    service.previewRevision(revisionId).then(
      (p) => {
        if (cancelled) return;
        setPreview(p);
        onLoaded?.(p);
      },
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
    };
    // onLoaded solo informa al padre; no debe repetir la carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisionId, service]);

  useEffect(() => {
    const host = svgHost.current;
    if (!host || preview?.kind !== 'canvas') return;
    let cancelled = false;
    (async () => {
      const scene = await excalidrawCanvasAdapter.deserialize(preview.sceneJson ?? '{}', (hash) =>
        service.loadAsset(hash),
      );
      const svg = await exportToSvg({
        elements: scene.elements.filter((e) => !e.isDeleted),
        appState: { ...scene.appState, exportBackground: true },
        files: scene.files,
      });
      if (cancelled) return;
      svg.setAttribute('width', '100%');
      svg.removeAttribute('height');
      host.replaceChildren(svg);
    })().catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [preview, service]);

  const html = useMemo(
    () => (preview?.kind === 'note' ? renderMarkdownPreview(preview.body) : ''),
    [preview],
  );

  if (error) return <p className="notice">{error}</p>;
  if (!preview) return <p className="muted">{t('app.loading')}</p>;
  if (preview.kind === 'note') {
    return (
      <div
        className="markdown-preview revision-preview"
        data-testid="revision-preview"
        // HTML saneado con rehype-sanitize; HTML crudo desactivado en el parser.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <div className="revision-preview canvas-preview" data-testid="revision-preview" ref={svgHost} />
  );
}
