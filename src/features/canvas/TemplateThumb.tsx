import { exportToSvg } from '@excalidraw/excalidraw';
import { useEffect, useRef } from 'react';
import { excalidrawCanvasAdapter } from '../../adapters/excalidraw/sceneCodec.ts';
import type { VaultService } from '../../application/VaultService.ts';

/** Miniaturas ya dibujadas, por plantilla y versión: abrir el panel otra vez no vuelve a pintarlas. */
const cache = new Map<string, SVGSVGElement>();

/** El motor no escala una escena enorme a una miniatura: se deja al SVG ajustarse al marco. */
function fit(svg: SVGSVGElement): SVGSVGElement {
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return svg;
}

/**
 * Miniatura de una plantilla (DESIGN.md §8 bis): la escena guardada, dibujada con las utilidades
 * de exportación del motor sobre papel claro. Es solo de lectura; no cambia el documento.
 */
export function TemplateThumb({
  documentId,
  revisionKey,
  service,
}: {
  documentId: string;
  revisionKey: string;
  service: VaultService;
}) {
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const key = `${documentId}:${revisionKey}`;
    const known = cache.get(key);
    if (known) {
      el.replaceChildren(known.cloneNode(true));
      return;
    }
    let cancelled = false;
    void (async () => {
      const opened = await service.openTemplate(documentId);
      const scene = await excalidrawCanvasAdapter.deserialize(opened.sceneJson, (hash) =>
        service.loadAsset(hash),
      );
      const elements = scene.elements.filter((e) => !e.isDeleted);
      if (elements.length === 0) return;
      const svg = fit(
        await exportToSvg({
          elements,
          appState: { exportBackground: false, exportPadding: 6 },
          files: scene.files,
        }),
      );
      cache.set(key, svg);
      if (!cancelled) el.replaceChildren(svg.cloneNode(true));
    })().catch(() => {
      // Sin miniatura: la fila sigue siendo usable con su icono de fondo.
    });
    return () => {
      cancelled = true;
    };
  }, [documentId, revisionKey, service]);

  return (
    <span ref={host} className="template-thumb" aria-hidden="true" data-testid="template-thumb" />
  );
}
