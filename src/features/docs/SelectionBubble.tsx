import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../../app/ui/Icon.tsx';

/**
 * Burbuja flotante al seleccionar texto en los documentos (como la de Google Docs): acciones
 * sobre la selección, junto a su final. Aparece al soltar el ratón o al terminar de seleccionar
 * con el teclado, y se oculta con la selección vacía o fuera del editor.
 */

/** Lo que se usa de una vista de ProseMirror (Tiptap y Milkdown traen cada uno la suya). */
interface SelectionView {
  readonly state: { readonly selection: { readonly from: number; readonly to: number; readonly empty: boolean } };
  readonly dom: Element;
  hasFocus(): boolean;
  coordsAtPos(pos: number): { top: number; bottom: number; left: number; right: number };
}

export interface BubbleAction {
  id: string;
  label: string;
  icon: IconName;
  onRun: () => void;
}

const WIDTH_GUESS = 96;

export function SelectionBubble({
  getView,
  actions,
  disabled,
}: {
  getView: () => SelectionView | null;
  actions: BubbleAction[];
  disabled: boolean;
}) {
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const pointerDown = useRef(false);

  useEffect(() => {
    if (disabled) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const view = getView();
        const inBubble = bubble.current?.contains(document.activeElement) ?? false;
        if (!view || pointerDown.current || (!view.hasFocus() && !inBubble)) {
          if (!inBubble) setPosition(null);
          return;
        }
        const { from, to, empty } = view.state.selection;
        if (empty) {
          setPosition(null);
          return;
        }
        let end: { top: number; right: number };
        try {
          end = view.coordsAtPos(to);
          view.coordsAtPos(from);
        } catch {
          setPosition(null);
          return;
        }
        setPosition({
          position: 'fixed',
          top: Math.max(8, end.top - 44),
          left: Math.max(8, Math.min(end.right - WIDTH_GUESS / 2, window.innerWidth - WIDTH_GUESS - 8)),
        });
      });
    };
    const down = (e: PointerEvent) => {
      if (bubble.current?.contains(e.target as Node)) return;
      pointerDown.current = true;
      setPosition(null);
    };
    const up = () => {
      pointerDown.current = false;
      update();
    };
    document.addEventListener('selectionchange', update);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('keyup', update, true);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('keyup', update, true);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [disabled, getView]);

  if (disabled || !position) return null;
  return createPortal(
    <div
      ref={bubble}
      className="doc-bubble"
      style={position}
      role="toolbar"
      data-testid="doc-bubble"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="icon-button"
          aria-label={action.label}
          title={action.label}
          data-testid={`doc-bubble-${action.id}`}
          // Sin robar el foco al editor: la selección sigue donde estaba.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setPosition(null);
            action.onRun();
          }}
        >
          <Icon name={action.icon} size={18} />
        </button>
      ))}
    </div>,
    document.body,
  );
}
