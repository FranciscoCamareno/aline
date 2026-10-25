import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KindIcon } from '../../app/ui/Icon.tsx';
import type { CanvasLinkTarget } from '../../application/canvasTargets.ts';
import { normalizeForSearch } from '../../application/searchIndex.ts';
import type { VaultService } from '../../application/VaultService.ts';
import { internalLink } from '../../domain/links.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import { CanvasPreview, useCanvasSnapshot } from '../canvas/CanvasPreview.tsx';
import type { LinkPick } from './LinkPicker.tsx';

/** Texto de un elemento en la lista: su etiqueta, o su tipo si no tiene texto. */
export function useTargetLabel() {
  const { t } = useTranslation();
  return (target: CanvasLinkTarget) =>
    target.label.replace(/\s+/g, ' ').trim() || t(`links.elementKind.${target.kind}`);
}

/**
 * Segundo paso con un lienzo (plan 10.6): el lienzo entero o uno de sus elementos, elegido en la
 * lista (con búsqueda y teclado) o pulsándolo en la vista previa. Pasar por uno lo resalta.
 */
export function CanvasStep({
  canvas,
  service,
  onPick,
  onBack,
}: {
  canvas: DocumentRecord;
  service: VaultService;
  onPick: (pick: LinkPick) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const snapshot = useCanvasSnapshot(canvas.id, service);
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const labelOf = useTargetLabel();

  const ready = snapshot && snapshot !== 'error' ? snapshot : null;
  const q = normalizeForSearch(query.trim());
  const shown = (ready?.targets ?? []).filter(
    (target) => !q || normalizeForSearch(labelOf(target)).includes(q),
  );
  const pickElement = (target: CanvasLinkTarget) =>
    onPick({
      url: internalLink(canvas.id, { elementId: target.elementId }),
      title: target.label.replace(/\s+/g, ' ').trim() || canvas.title,
    });

  return (
    <>
      <p className="picker-step">
        <button type="button" onClick={onBack} data-testid="link-back">
          {t('links.back')}
        </button>{' '}
        <strong>{canvas.title}</strong>
      </p>
      <div className="canvas-step">
        <div className="canvas-step-list">
          <input
            name="link-element-search"
            autoFocus
            value={query}
            placeholder={t('links.searchElements')}
            aria-label={t('links.searchElements')}
            data-testid="link-element-search"
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="picker-list" aria-busy={snapshot === null}>
            <li>
              <button
                type="button"
                className="link-button"
                data-testid="link-whole-canvas"
                onClick={() => onPick({ url: internalLink(canvas.id), title: canvas.title })}
              >
                <KindIcon kind="canvas" /> {t('links.wholeCanvas')}
              </button>
            </li>
            {shown.map((target) => (
              <li key={target.elementId}>
                <button
                  type="button"
                  className={`link-button${hovered === target.elementId ? ' is-current' : ''}`}
                  data-testid="link-canvas-element"
                  data-element-id={target.elementId}
                  onMouseEnter={() => setHovered(target.elementId)}
                  onFocus={() => setHovered(target.elementId)}
                  onClick={() => pickElement(target)}
                >
                  {/* El tipo delante solo si hay texto: sin texto, el tipo ya es la etiqueta. */}
                  {target.label.trim() && (
                    <span className="muted small canvas-step-kind">
                      {t(`links.elementKind.${target.kind}`)}
                    </span>
                  )}{' '}
                  {labelOf(target)}
                </button>
              </li>
            ))}
          </ul>
          {snapshot === 'error' && <p className="muted small">{t('links.canvasError')}</p>}
          {ready && ready.targets.length === 0 && (
            <p className="muted small">{t('links.noElements')}</p>
          )}
        </div>
        {ready && (
          <CanvasPreview
            snapshot={ready}
            highlight={hovered}
            onHover={setHovered}
            onPick={pickElement}
            className="canvas-step-shot"
          />
        )}
      </div>
    </>
  );
}
