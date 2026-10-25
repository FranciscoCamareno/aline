import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '../../app/ui/Icon.tsx';
import {
  clampCrop,
  cropFromRotated,
  cropToRotated,
  MIN_CROP,
  type ImageCrop,
  type ImageRotation,
} from '../../domain/imageEdit.ts';

export interface ImageBarAction {
  id: string;
  label: string;
  /** Con icono es un botón cuadrado; sin él, se muestra el texto (los tamaños en %). */
  icon?: IconName;
  disabled?: boolean;
  onRun: () => void;
}

/**
 * Barra de la imagen seleccionada (plan 10.8): sobre la imagen, en una capa de `<body>` para que
 * no la recorte el desplazamiento de la hoja; se recoloca al desplazar o cambiar el tamaño.
 */
export function ImageBar({
  target,
  actions,
}: {
  target: HTMLElement | null;
  actions: Array<ImageBarAction | 'separator'>;
}) {
  const { t } = useTranslation();
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!target) return;
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        const height = bar.current?.offsetHeight ?? 40;
        const width = bar.current?.offsetWidth ?? 320;
        const top = rect.top - height - 10 >= 8 ? rect.top - height - 10 : rect.bottom + 10;
        const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
        setPosition({ top, left });
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const observer = new ResizeObserver(place);
    observer.observe(target);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      observer.disconnect();
    };
  }, [target]);

  if (!target) return null;
  return createPortal(
    <div
      ref={bar}
      className="image-bar"
      role="toolbar"
      aria-label={t('docs.image.toolbar')}
      data-testid="image-bar"
      style={position ?? { visibility: 'hidden', top: 0, left: 0 }}
      // Sin robar el foco al editor: la imagen sigue seleccionada.
      onMouseDown={(e) => e.preventDefault()}
    >
      {actions.map((action, i) =>
        action === 'separator' ? (
          <span key={`sep-${i}`} className="image-bar-separator" aria-hidden="true" />
        ) : (
          <button
            key={action.id}
            type="button"
            className={action.icon ? 'icon-button' : 'image-bar-text'}
            aria-label={action.label}
            title={action.label}
            data-testid={`image-${action.id}`}
            disabled={action.disabled}
            onClick={action.onRun}
          >
            {action.icon ? <Icon name={action.icon} size={18} /> : action.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const WHOLE: ImageCrop = { x: 0, y: 0, width: 1, height: 1 };

/** Mueve o estira el rectángulo (en fracciones de la imagen girada) sin salir de ella. */
function dragRect(start: ImageCrop, handle: Handle, dx: number, dy: number): ImageCrop {
  if (handle === 'move') {
    return {
      ...start,
      x: Math.min(1 - start.width, Math.max(0, start.x + dx)),
      y: Math.min(1 - start.height, Math.max(0, start.y + dy)),
    };
  }
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes('w')) left = Math.min(right - MIN_CROP, Math.max(0, left + dx));
  if (handle.includes('e')) right = Math.max(left + MIN_CROP, Math.min(1, right + dx));
  if (handle.includes('n')) top = Math.min(bottom - MIN_CROP, Math.max(0, top + dy));
  if (handle.includes('s')) bottom = Math.max(top + MIN_CROP, Math.min(1, bottom + dy));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * «Recortar» (plan 10.8): la imagen entera, girada como se ve en el documento, con un marco de
 * ocho tiradores que se arrastra; dentro del marco se mueve el recorte. Se guarda en fracciones
 * del original (`cropFromRotated`). Intro aplica; Escape cancela; las flechas mueven el marco.
 */
export function ImageCropDialog({
  url,
  rotation,
  crop,
  onApply,
  onCancel,
}: {
  url: string;
  rotation: ImageRotation;
  crop: ImageCrop | null;
  onApply: (crop: ImageCrop | null) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [rect, setRect] = useState<ImageCrop>(() => (crop ? cropToRotated(crop, rotation) : WHOLE));
  const drag = useRef<{ handle: Handle; x: number; y: number; start: ImageCrop } | null>(null);

  // La imagen girada, dibujada una vez al tamaño que cabe en el diálogo.
  useEffect(() => {
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      const swap = rotation === 90 || rotation === 270;
      const w = swap ? image.naturalHeight : image.naturalWidth;
      const h = swap ? image.naturalWidth : image.naturalHeight;
      const fit = Math.min(1, Math.min(640, window.innerWidth - 80) / w, Math.min(460, window.innerHeight - 240) / h);
      const width = Math.max(1, Math.round(w * fit));
      const height = Math.max(1, Math.round(h * fit));
      setSize({ width, height });
      requestAnimationFrame(() => {
        const context = canvas.current?.getContext('2d');
        if (!context) return;
        context.translate(width / 2, height / 2);
        context.rotate((rotation * Math.PI) / 180);
        const dw = swap ? height : width;
        const dh = swap ? width : height;
        context.drawImage(image, -dw / 2, -dh / 2, dw, dh);
        frame.current?.focus();
      });
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, rotation]);

  /** Empieza a arrastrar el marco o el tirador indicado en su `data-handle`. */
  const start = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = (event.currentTarget.dataset['handle'] ?? 'move') as Handle;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { handle, x: event.clientX, y: event.clientY, start: rect };
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || !size) return;
    const dx = (event.clientX - current.x) / size.width;
    const dy = (event.clientY - current.y) / size.height;
    setRect(dragRect(current.start, current.handle, dx, dy));
  };
  const end = () => {
    drag.current = null;
  };

  const apply = () => onApply(clampCrop(cropFromRotated(rect, rotation)));
  const onKeyDown = (event: ReactKeyboardEvent) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = arrows[event.key];
    if (delta) {
      event.preventDefault();
      setRect((r) => dragRect(r, 'move', delta[0], delta[1]));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      apply();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  return createPortal(
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog image-crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-crop-title"
        data-testid="image-crop-dialog"
        onKeyDown={onKeyDown}
      >
        <h2 id="image-crop-title">{t('docs.image.crop')}</h2>
        <p className="muted small">{t('docs.image.cropHint')}</p>
        <div
          className="image-crop-stage"
          style={size ? { width: size.width, height: size.height } : { minHeight: 120 }}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <canvas ref={canvas} width={size?.width ?? 0} height={size?.height ?? 0} />
          {/* Lo que queda fuera del recorte, oscurecido (cuatro bandas alrededor del marco). */}
          {size &&
            [
              { left: 0, top: 0, width: size.width, height: rect.y * size.height },
              {
                left: 0,
                top: (rect.y + rect.height) * size.height,
                width: size.width,
                height: (1 - rect.y - rect.height) * size.height,
              },
              {
                left: 0,
                top: rect.y * size.height,
                width: rect.x * size.width,
                height: rect.height * size.height,
              },
              {
                left: (rect.x + rect.width) * size.width,
                top: rect.y * size.height,
                width: (1 - rect.x - rect.width) * size.width,
                height: rect.height * size.height,
              },
            ].map((style, i) => <span key={i} className="image-crop-shade" style={style} />)}
          {size && (
            <div
              ref={frame}
              className="image-crop-frame"
              tabIndex={0}
              aria-label={t('docs.image.cropFrame')}
              data-testid="image-crop-frame"
              style={{
                left: rect.x * size.width,
                top: rect.y * size.height,
                width: rect.width * size.width,
                height: rect.height * size.height,
              }}
              data-handle="move"
              onPointerDown={start}
            >
              {HANDLES.map((handle) => (
                <span
                  key={handle}
                  className={`image-crop-handle image-crop-handle--${handle}`}
                  data-testid={`image-crop-handle-${handle}`}
                  data-handle={handle}
                  onPointerDown={start}
                />
              ))}
            </div>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" data-testid="image-crop-reset" onClick={() => setRect(WHOLE)}>
            {t('docs.image.cropRemove')}
          </button>
          <span className="topbar-spacer" />
          <button type="button" onClick={onCancel}>
            {t('docs.image.cancel')}
          </button>
          <button type="button" className="primary" data-testid="image-crop-apply" onClick={apply}>
            {t('docs.image.apply')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
