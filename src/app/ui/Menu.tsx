import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon.tsx';

export interface MenuItem {
  /** Identificador estable; también es el `data-testid` del elemento. */
  id: string;
  label: string;
  icon?: IconName;
  /** Texto secundario a la derecha (atajo, recuento…). */
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  /** Divisor antes de este elemento. */
  separated?: boolean;
  onSelect: () => void;
}

interface Props {
  /** Contenido del botón que abre el menú. */
  trigger: ReactNode;
  /** Nombre accesible del botón (obligatorio si el botón solo tiene icono). */
  label: string;
  items: readonly MenuItem[];
  triggerClassName?: string;
  testId?: string;
  /** Hacia dónde se abre y a qué borde del botón se alinea. */
  placement?: 'bottom-start' | 'bottom-end' | 'top-start';
  className?: string;
}

/**
 * Menú desplegable (DESIGN.md §6, popovers): botón con `aria-haspopup="menu"` y lista de
 * `menuitem`. Se abre con clic, Intro, Espacio o flecha abajo (el foco va al primer elemento),
 * se recorre con flechas, Inicio y Fin, y se cierra con Escape (el foco vuelve al botón), al
 * elegir o al pulsar fuera.
 *
 * El menú se coloca con `position: fixed` junto a su botón, para que no lo recorte un contenedor
 * con desplazamiento (la lista de la biblioteca); si no cabe debajo, se abre hacia arriba. Al
 * desplazar o cambiar el tamaño de la ventana se cierra.
 */
export function Menu({
  trigger,
  label,
  items,
  triggerClassName,
  testId,
  placement = 'bottom-start',
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onViewportChange = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', onViewportChange);
    document.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onViewportChange);
      document.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open]);

  /** Posición fija junto al botón; la altura se estima para decidir si cabe debajo. */
  const place = (): CSSProperties => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return {};
    const estimated = 14 + items.length * 36 + items.filter((i) => i.separated).length * 9;
    const below = placement !== 'top-start' && rect.bottom + 6 + estimated <= window.innerHeight;
    const vertical = below
      ? { top: rect.bottom + 6 }
      : { bottom: window.innerHeight - rect.top + 6 };
    const horizontal =
      placement === 'bottom-end'
        ? { right: document.documentElement.clientWidth - rect.right }
        : { left: rect.left };
    return { ...vertical, ...horizontal, minWidth: Math.max(220, rect.width) };
  };

  const enabledItems = () => [
    ...(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ??
      []),
  ];

  const openMenu = (focus: 'first' | 'last' | null) => {
    setPosition(place());
    setOpen(true);
    if (focus)
      requestAnimationFrame(() => {
        const list = enabledItems();
        (focus === 'first' ? list[0] : list[list.length - 1])?.focus();
      });
  };
  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu('first');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu('last');
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = enabledItems();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => list[(to + list.length) % list.length]?.focus();
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      move(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      move(list.length - 1);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className={`menu-root${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={triggerClassName}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid={testId}
        onClick={() => (open ? close(false) : openMenu(null))}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger}
      </button>
      {open && (
        <div
          className="menu"
          style={position}
          role="menu"
          id={menuId}
          aria-label={label}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => (
            <div key={item.id} className="menu-entry">
              {item.separated && <hr className="menu-separator" />}
              <button
                type="button"
                role="menuitem"
                className={`menu-item${item.danger ? ' danger' : ''}`}
                disabled={item.disabled}
                data-testid={item.id}
                onClick={() => {
                  close(false);
                  item.onSelect();
                }}
              >
                {item.icon ? <Icon name={item.icon} size={18} /> : <span className="menu-gap" />}
                <span className="menu-label">{item.label}</span>
                {item.hint && <span className="menu-hint">{item.hint}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
