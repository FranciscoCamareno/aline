import { exportToSvg, getCommonBounds } from '@excalidraw/excalidraw';
import type { NonDeletedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BinaryFiles } from '@excalidraw/excalidraw/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { excalidrawCanvasAdapter } from '../../adapters/excalidraw/sceneCodec.ts';
import {
  canvasLinkTargets,
  elementBounds,
  hiddenElementIds,
  type Bounds,
  type CanvasLinkTarget,
} from '../../application/canvasTargets.ts';
import type { VaultService } from '../../application/VaultService.ts';

/** Margen de la vista previa, en unidades de la escena (el mismo para el SVG y las cajas). */
const PADDING = 12;

export interface CanvasSnapshot {
  /** Lo que se ve: sin borrados ni lo oculto por ramas plegadas. */
  elements: NonDeletedExcalidrawElement[];
  files: BinaryFiles;
  targets: CanvasLinkTarget[];
}

/**
 * Escena guardada de un lienzo para el selector de enlaces y las vistas previas (planes 10.5 y
 * 10.6), leída sin sesión de edición. `null` mientras carga; `'error'` si no se pudo leer.
 */
export function useCanvasSnapshot(
  documentId: string,
  service: VaultService,
): CanvasSnapshot | 'error' | null {
  const [state, setState] = useState<{ id: string; value: CanvasSnapshot | 'error' } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { sceneJson, extensions } = await service.readCanvas(documentId);
      const hidden = hiddenElementIds(extensions);
      const scene = sceneJson
        ? await excalidrawCanvasAdapter.deserialize(sceneJson, (hash) => service.loadAsset(hash))
        : { elements: [], files: {} };
      const elements = scene.elements.filter(
        (e): e is NonDeletedExcalidrawElement => !e.isDeleted && !hidden.has(e.id),
      );
      return { elements, files: scene.files, targets: canvasLinkTargets(sceneJson, extensions) };
    })().then(
      (value) => !cancelled && setState({ id: documentId, value }),
      () => !cancelled && setState({ id: documentId, value: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [documentId, service]);
  return state?.id === documentId ? state.value : null;
}

/** Caja de un destino o, si no es uno de la lista (un miembro de grupo), del propio elemento. */
function boundsOf(snapshot: CanvasSnapshot, elementId: string): Bounds | null {
  const target = snapshot.targets.find((t) => t.elementId === elementId);
  if (target) return target.bounds;
  const element = snapshot.elements.find((e) => e.id === elementId);
  return element ? elementBounds(element as unknown as Parameters<typeof elementBounds>[0]) : null;
}

/**
 * Vista previa de un lienzo dibujada con la exportación del motor, sobre papel claro como las
 * miniaturas de plantillas. Encima, una capa con las cajas de los destinos: resalta `highlight` y,
 * con `onPick`, deja elegir un elemento pulsándolo (el teclado usa la lista del selector).
 */
export function CanvasPreview({
  snapshot,
  highlight = null,
  onPick,
  onHover,
  className = '',
}: {
  snapshot: CanvasSnapshot;
  highlight?: string | null;
  onPick?: (target: CanvasLinkTarget) => void;
  onHover?: (elementId: string | null) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const empty = snapshot.elements.length === 0;

  // El SVG del motor ocupa la caja común de los elementos más el margen: la capa usa la misma.
  const viewBox = useMemo(() => {
    if (empty) return null;
    const [minX, minY, maxX, maxY] = getCommonBounds(snapshot.elements);
    return {
      x: minX - PADDING,
      y: minY - PADDING,
      width: maxX - minX + PADDING * 2,
      height: maxY - minY + PADDING * 2,
    };
  }, [snapshot, empty]);

  useEffect(() => {
    const el = host.current;
    if (!el || empty) return;
    let cancelled = false;
    void exportToSvg({
      elements: snapshot.elements,
      appState: { exportBackground: false, exportPadding: PADDING },
      files: snapshot.files,
    }).then(
      (svg: SVGSVGElement) => {
        if (cancelled) return;
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        el.replaceChildren(svg);
      },
      () => {
        // Sin dibujo: la lista sigue sirviendo para elegir.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [snapshot, empty]);

  const highlighted = highlight ? boundsOf(snapshot, highlight) : null;

  return (
    <div className={`canvas-shot ${className}`} data-testid="canvas-preview">
      {empty ? (
        <p className="muted small canvas-shot-empty">{t('links.canvasEmpty')}</p>
      ) : (
        <>
          <div ref={host} className="canvas-shot-drawing" aria-hidden="true" />
          {viewBox && (
            <svg
              className="canvas-shot-overlay"
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
              onMouseLeave={() => onHover?.(null)}
            >
              {onPick &&
                snapshot.targets.map((target) => (
                  <rect
                    key={target.elementId}
                    className="canvas-shot-target"
                    data-element-id={target.elementId}
                    x={target.bounds.x - 4}
                    y={target.bounds.y - 4}
                    width={target.bounds.width + 8}
                    height={target.bounds.height + 8}
                    onMouseEnter={() => onHover?.(target.elementId)}
                    onClick={() => onPick(target)}
                  />
                ))}
              {highlighted && (
                <rect
                  className="canvas-shot-highlight"
                  data-testid="canvas-shot-highlight"
                  x={highlighted.x - 6}
                  y={highlighted.y - 6}
                  width={highlighted.width + 12}
                  height={highlighted.height + 12}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
          )}
        </>
      )}
    </div>
  );
}
